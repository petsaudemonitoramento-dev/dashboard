import { redirect } from "next/navigation";
import {
  AcsDashboard,
  type AcsDashboardData,
} from "@/components/acs/acs-dashboard";
import { TeamVisitsDashboard } from "@/components/visitas/team-visits-dashboard";
import type { TeamVisitsData } from "@/components/visitas/types";
import { getActiveProfileContext } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type AcsResultRow = { dados: AcsDashboardData };
type TeamResultRow = { dados: TeamVisitsData };

export default async function VisitsPage() {
  const context = await getActiveProfileContext();

  if (!context) {
    redirect("/login");
  }

  const { profile, user, sql } = context;

  if (profile.perfil === "acs") {
    let data: AcsDashboardData | null = null;

    try {
      const rows = await sql<AcsResultRow[]>`
        select private.obter_painel_visitas_acs_v29_1(
          ${user.id}::uuid
        ) as dados
      `;
      data = rows[0]?.dados ?? null;
    } catch (error) {
      console.error("Erro ao carregar visitas ACS V29.1:", error);
    }

    if (!data) {
      return (
        <>
          <section className="heading">
            <p>Acompanhamento territorial</p>
            <h1>Visitas</h1>
            <span>
              O perfil precisa estar aprovado com UBS e microárea vinculadas.
            </span>
          </section>
          <div className="pec-error">
            Não foi possível carregar as visitas neste momento.
          </div>
        </>
      );
    }

    return <AcsDashboard data={data} />;
  }

  if (profile.perfil === "equipe_ubs") {
    let data: TeamVisitsData | null = null;

    try {
      const rows = await sql<TeamResultRow[]>`
        select private.obter_painel_visitas_equipe_v29_1(
          ${user.id}::uuid
        ) as dados
      `;
      data = rows[0]?.dados ?? null;
    } catch (error) {
      console.error("Erro ao carregar visitas da equipe UBS V29.1:", error);
    }

    if (!data) {
      return (
        <>
          <section className="heading">
            <p>Cuidado clínico</p>
            <h1>Visitas</h1>
            <span>
              O acesso exige equipe UBS ativa, credencial válida e vínculo com
              a unidade.
            </span>
          </section>
          <div className="pec-error">
            Não foi possível carregar o acompanhamento da UBS.
          </div>
        </>
      );
    }

    return <TeamVisitsDashboard data={data} />;
  }

  redirect("/dashboard");
}
