import { redirect } from "next/navigation";
import {
  TrashBin,
  type TrashItem,
} from "@/components/lixeira/trash-bin";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type DatabaseRow = {
  gestante_id: string;
  codigo: string;
  nome_visual: string;
  ubs_nome: string;
  microarea_codigo: string | null;
  excluida_em: string | Date;
  excluir_em: string | Date;
  exclusao_motivo: string | null;
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export default async function LixeiraPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("perfis")
    .select("perfil, status, ativo")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.ativo || profile.status !== "ativo") {
    redirect("/login");
  }

  const canShowIdentity = [
    "administrador",
    "profissional_ubs",
    "equipe_ubs",
  ].includes(String(profile.perfil));

  try {
    const sql = getPostgresClient();

    await sql`select private.esvaziar_lixeira_v19()`;

    const rows = await sql<DatabaseRow[]>`
      select *
      from private.listar_lixeira_gestantes_v19(
        ${user.id}::uuid,
        ${canShowIdentity}
      )
    `;

    const items: TrashItem[] = rows.map((row) => ({
      id: row.gestante_id,
      codigo: row.codigo,
      nomeVisual: row.nome_visual,
      ubsNome: row.ubs_nome,
      microarea: row.microarea_codigo,
      excluidaEm: toIso(row.excluida_em),
      excluirEm: toIso(row.excluir_em),
      motivo: row.exclusao_motivo,
    }));

    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Lixeira</h1>
          <span>
            Cadastros removidos ficam disponíveis por 10 dias antes da
            exclusão definitiva.
          </span>
        </section>

        <TrashBin items={items} />
      </>
    );
  } catch (error) {
    console.error("Erro ao carregar lixeira:", error);

    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Lixeira</h1>
          <span>Não foi possível consultar os registros removidos.</span>
        </section>
        <div className="pec-error">
          {error instanceof Error
            ? error.message
            : "Erro desconhecido ao consultar a lixeira."}
        </div>
      </>
    );
  }
}
