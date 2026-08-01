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

  if (!["gestao_municipal", "equipe_ubs", "aluno"].includes(profile.perfil)) {
    redirect("/dashboard");
  }

  let payload: Pick<
    Parameters<typeof IndicatorsDashboard>[0],
    "ubsData" | "professionalData" | "metabase"
  > | null = null;
  let loadError: unknown;

  try {
    const ubsRows = await sql<IndicatorRow[]>`
      select private.obter_indicadores_v21(
        ${user.id}::uuid,
        'ubs'
      ) as dados
    `;
    const professionalRows =
      profile.perfil === "equipe_ubs"
        ? await sql<IndicatorRow[]>`
        select private.obter_indicadores_v21(
          ${user.id}::uuid,
          'profissional'
        ) as dados
      `
        : ubsRows;

    const ubsData = ubsRows[0]?.dados;
    const professionalData = professionalRows[0]?.dados;

    if (!ubsData || !professionalData) {
      throw new Error("Os indicadores não foram retornados pelo banco.");
    }

    const allowMetabase = profile.perfil === "equipe_ubs";

    const metabase = {
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

    payload = { metabase, professionalData, ubsData };
  } catch (error) {
    console.error("Erro ao carregar indicadores V21:", error);
    loadError = error;
  }

  if (!payload) {
    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Indicadores de acompanhamento</h1>
          <span>Não foi possível montar os indicadores neste momento.</span>
        </section>

        <div className="pec-error">
          {loadError instanceof Error
            ? loadError.message
            : "Erro desconhecido ao consultar os indicadores."}
        </div>
      </>
    );
  }

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Indicadores de acompanhamento</h1>
        <span>
          Indicadores compatíveis com o escopo autorizado para este perfil.
        </span>
      </section>

      <IndicatorsDashboard
        metabase={payload.metabase}
        professionalData={payload.professionalData}
        profile={profile.perfil}
        ubsData={payload.ubsData}
      />
    </>
  );
}
