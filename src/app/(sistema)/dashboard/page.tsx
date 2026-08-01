import { redirect } from "next/navigation";
import {
  HomeDashboard,
  type HomeData,
} from "@/components/home/home-dashboard";
import { getPostgresClient } from "@/lib/db/postgres";
import { getActiveProfileContext } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ResultRow = {
  dados: HomeData;
};

export default async function DashboardPage() {
  const context = await getActiveProfileContext();

  if (!context) {
    redirect("/login");
  }

  const { profile, user } = context;

  if (profile.perfil === "administrador") {
    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Administração técnica</h1>
          <span>
            Acesse configurações, unidades, integrações e diagnóstico. Dados
            clínicos e rotinas de gestão de usuários não ficam disponíveis
            para este perfil.
          </span>
        </section>

        <div className="pec-empty">
          O perfil técnico não consulta indicadores, prontuários, importações
          PEC ou lixeira clínica.
        </div>
      </>
    );
  }

  const sql = getPostgresClient();

  let data: HomeData | null = null;
  let loadError: unknown;

  try {
    const resultRows = await sql<ResultRow[]>`
      select private.obter_inicio_v21(${user.id}::uuid) as dados
    `;

    data = resultRows[0]?.dados ?? null;

    if (!data) {
      throw new Error("Não foi possível montar o resumo inicial.");
    }

  } catch (error) {
    console.error("Erro ao carregar início V21:", error);
    loadError = error;
  }

  if (!data) {
    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Início</h1>
          <span>Não foi possível montar o resumo operacional.</span>
        </section>

        <div className="pec-error">
          {loadError instanceof Error
            ? loadError.message
            : "Erro desconhecido ao consultar a página inicial."}
        </div>
      </>
    );
  }

  return (
    <HomeDashboard
      canManageNotices={data.perfil === "gestao_municipal"}
      data={data}
    />
  );
}
