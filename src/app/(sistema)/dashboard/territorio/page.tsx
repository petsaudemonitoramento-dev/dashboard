import { redirect } from "next/navigation";
import {
  AcsDashboard,
  type AcsDashboardData,
} from "@/components/acs/acs-dashboard";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ResultRow = {
  dados: AcsDashboardData;
};

export default async function TerritorioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sql = getPostgresClient();

  try {
    const rows = await sql<ResultRow[]>`
      select private.obter_painel_acs_v21(
        ${user.id}::uuid
      ) as dados
    `;

    const data = rows[0]?.dados;

    if (!data) {
      throw new Error("O painel territorial não retornou dados.");
    }

    return <AcsDashboard data={data} />;
  } catch (error) {
    console.error("Erro ao carregar território ACS V21:", error);

    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Território ACS</h1>
          <span>
            O perfil precisa estar aprovado com UBS e microárea vinculadas.
          </span>
        </section>

        <div className="pec-error">
          {error instanceof Error
            ? error.message
            : "Não foi possível carregar o território."}
        </div>
      </>
    );
  }
}
