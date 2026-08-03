import { redirect } from "next/navigation";
import { IndicatorsDashboard } from "@/components/indicadores/indicators-dashboard";
import type { IndicatorData } from "@/components/indicadores/types";
import { getActiveProfileContext } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type IndicatorRow = {
  dados: IndicatorData;
};

export default async function IndicadoresPage() {
  const context = await getActiveProfileContext();

  if (!context) {
    redirect("/login");
  }

  const { profile, sql, user } = context;

  if (profile.perfil === "acs") {
    redirect("/dashboard/territorio");
  }

  if (
    !["gestao_municipal", "equipe_ubs", "aluno"].includes(
      profile.perfil
    )
  ) {
    redirect("/dashboard");
  }

  let data: IndicatorData | null = null;

  try {
    const rows = await sql<IndicatorRow[]>`
      select private.obter_indicadores_v21(
        ${user.id}::uuid,
        'ubs'
      ) as dados
    `;

    data = rows[0]?.dados ?? null;

    if (!data) {
      throw new Error("Resposta vazia ao consultar indicadores.");
    }
  } catch (error) {
    console.error(
      "Erro ao carregar a visão geral de indicadores:",
      error
    );
  }

  if (!data) {
    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Indicadores de acompanhamento</h1>
          <span>
            Não foi possível montar os indicadores neste momento.
          </span>
        </section>

        <div className="pec-error">
          Tente novamente em alguns instantes. Se o problema persistir,
          comunique à equipe técnica.
        </div>
      </>
    );
  }

  return (
    <IndicatorsDashboard
      data={data}
      profile={profile.perfil}
    />
  );
}
