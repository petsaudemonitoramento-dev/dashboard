import { redirect } from "next/navigation";
import {
  TrashBin,
  type TrashItem,
} from "@/components/lixeira/trash-bin";
import { getClinicalTeamContext } from "@/lib/auth/guards";

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
  const context = await getClinicalTeamContext();
  if (!context) redirect("/dashboard");

  const { sql, user } = context;
  let items: TrashItem[] | null = null;
  let loadError: unknown;

  try {
    await sql`select private.esvaziar_lixeira_v19(${user.id}::uuid)`;

    const rows = await sql<DatabaseRow[]>`
      select *
      from private.listar_lixeira_gestantes_v19(
        ${user.id}::uuid,
        true
      )
    `;

    items = rows.map((row) => ({
      id: row.gestante_id,
      codigo: row.codigo,
      nomeVisual: row.nome_visual,
      ubsNome: row.ubs_nome,
      microarea: row.microarea_codigo,
      excluidaEm: toIso(row.excluida_em),
      excluirEm: toIso(row.excluir_em),
      motivo: row.exclusao_motivo,
    }));

  } catch (error) {
    console.error("Erro ao carregar lixeira:", error);
    loadError = error;
  }

  if (!items) {
    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Lixeira</h1>
          <span>Não foi possível consultar os registros removidos.</span>
        </section>
        <div className="pec-error">
          {loadError instanceof Error
            ? loadError.message
            : "Erro desconhecido ao consultar a lixeira."}
        </div>
      </>
    );
  }

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
}
