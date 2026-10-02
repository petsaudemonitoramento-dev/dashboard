import { redirect } from "next/navigation";
import {
  IndicatorsDashboard,
  type IndicatorData,
} from "@/components/indicadores/indicators-dashboard";
import { getPostgresClient } from "@/lib/db/postgres";
import { buildMetabaseViewConfig } from "@/lib/metabase/embed";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ProfileRow = {
  id: string;
  nome_completo: string;
  perfil: string;
  ubs_id: string | null;
};

type IndicatorRow = {
  dados: IndicatorData;
};

export default async function IndicadoresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sql = getPostgresClient();

  const profileRows = await sql<ProfileRow[]>`
    select
      p.id,
      p.nome_completo,
      p.perfil::text as perfil,
      p.ubs_id
    from public.perfis p
    where p.id = ${user.id}::uuid
      and p.ativo = true
      and p.status = 'ativo'
    limit 1
  `;

  const profile = profileRows[0];

  if (!profile) {
    redirect("/login");
  }

  if (profile.perfil === "acs") {
    redirect("/dashboard/territorio");
  }

  if (!["administrador", "profissional_ubs", "equipe_ubs", "aluno"].includes(profile.perfil)) {
    redirect("/dashboard");
  }

  let ubsData: IndicatorData | undefined;
  let professionalData: IndicatorData | undefined;
  let metabase: Parameters<typeof IndicatorsDashboard>[0]["metabase"] | undefined;
  let loadError: string | null = null;

  try {
      const [ubsRows, professionalRows] = await Promise.all([
        sql<IndicatorRow[]>`
          select private.obter_indicadores_v21(
            ${user.id}::uuid,
            'ubs'
          ) as dados
        `,
        sql<IndicatorRow[]>`
          select private.obter_indicadores_v21(
            ${user.id}::uuid,
            'profissional'
          ) as dados
        `,
      ]);

      ubsData = ubsRows[0]?.dados;
      professionalData = professionalRows[0]?.dados;

      if (!ubsData || !professionalData) {
        throw new Error("Os indicadores não foram retornados pelo banco.");
      }

      const allowMetabase = profile.perfil !== "aluno";

      metabase = {
        ubs: allowMetabase
          ? buildMetabaseViewConfig({
              scope: "ubs",
              userId: user.id,
              ubsId: profile.ubs_id,
            })
          : {
              configured: false,
              embedUrl: null,
              externalUrl: null,
              dashboardId: null,
              missing: ["Acesso restrito para o perfil aluno"],
            },
        profissional: allowMetabase
          ? buildMetabaseViewConfig({
              scope: "profissional",
              userId: user.id,
              ubsId: profile.ubs_id,
            })
          : {
              configured: false,
              embedUrl: null,
              externalUrl: null,
              dashboardId: null,
              missing: ["Acesso restrito para o perfil aluno"],
            },
      };
  } catch {
      console.error("Erro ao carregar indicadores V21.");
      loadError = "Não foi possível montar os indicadores neste momento.";
  }

  if (loadError || !ubsData || !professionalData || !metabase) {
    const message = loadError ?? "Não foi possível montar os indicadores neste momento.";
    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Indicadores de acompanhamento</h1>
          <span>{message}</span>
        </section>
        <div className="pec-error">{message}</div>
      </>
    );
  }

return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Indicadores de acompanhamento</h1>
        <span>
          Métricas agregadas da UBS e visão exclusiva das gestantes sob
          sua responsabilidade.
        </span>
      </section>

      <IndicatorsDashboard
        metabase={metabase}
        professionalData={professionalData}
        profile={profile.perfil}
        ubsData={ubsData}
      />
    </>
  );
}
