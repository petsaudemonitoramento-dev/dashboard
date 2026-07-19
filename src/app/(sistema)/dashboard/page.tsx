import { redirect } from "next/navigation";
import {
  HomeDashboard,
  type HomeData,
} from "@/components/home/home-dashboard";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ResultRow = {
  dados: HomeData;
};

type UbsOption = {
  id: string;
  nome: string;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sql = getPostgresClient();

  try {
    const [resultRows, ubsRows] = await Promise.all([
      sql<ResultRow[]>`
        select private.obter_inicio_v21(${user.id}::uuid) as dados
      `,
      sql<UbsOption[]>`
        select id, nome
        from public.ubs
        where ativa = true
        order by nome
      `,
    ]);

    const data = resultRows[0]?.dados;

    if (!data) {
      throw new Error("Não foi possível montar o resumo inicial.");
    }

    return (
      <HomeDashboard
        canManageNotices={data.perfil === "administrador"}
        data={data}
        ubsOptions={ubsRows}
      />
    );
  } catch (error) {
    console.error("Erro ao carregar início V21:", error);

    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Início</h1>
          <span>Não foi possível montar o resumo operacional.</span>
        </section>

        <div className="pec-error">
          {error instanceof Error
            ? error.message
            : "Erro desconhecido ao consultar a página inicial."}
        </div>
      </>
    );
  }
}
