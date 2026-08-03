import { redirect } from "next/navigation";
import { IndicatorsDashboard } from "@/components/indicadores/indicators-dashboard";
import { getActiveProfileContext } from "@/lib/auth/guards";
import { loadAnalyticsDashboard } from "@/lib/analytics/load-dashboard";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function IndicadoresPage() {
  const context = await getActiveProfileContext();

  if (!context) {
    redirect("/login");
  }

  const { profile, sql } = context;

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

  let data: AnalyticsDashboardData | null = null;

  try {
    data = await loadAnalyticsDashboard({
      sql,
      profile: profile.perfil,
      ubsId: profile.ubs_id,
    });
  } catch (error) {
    console.error("Erro ao carregar Analytics V28:", error);
  }

  if (!data) {
    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Indicadores de acompanhamento</h1>
          <span>Não foi possível carregar a camada analítica segura.</span>
        </section>
        <div className="pec-error">
          Tente novamente em alguns instantes. Se o problema persistir,
          comunique à equipe técnica.
        </div>
      </>
    );
  }

  return <IndicatorsDashboard data={data} />;
}
