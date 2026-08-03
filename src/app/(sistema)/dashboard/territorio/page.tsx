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
  let data: AcsDashboardData | null = null;

  try {
    const rows = await sql<ResultRow[]>`
      select private.obter_painel_acs_v21(
        ${user.id}::uuid
      ) as dados
    `;

    data = rows[0]?.dados ?? null;

    if (!data) {
      throw new Error("O painel territorial não retornou dados.");
    }
  } catch (error) {
    console.error("Erro ao carregar território ACS V21:", error);
  }

  if (!data) {
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
          Não foi possível carregar o território neste momento.
        </div>
      </>
    );
  }

  return <AcsDashboard data={data} />;
}
