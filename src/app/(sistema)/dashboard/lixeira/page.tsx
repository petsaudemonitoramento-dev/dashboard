import { redirect } from "next/navigation";
import {
  TrashBin,
  type TrashItem,
} from "@/components/lixeira/trash-bin";
import { createClient } from "@/lib/supabase/server";
import { logServerFailure } from "@/lib/security/request";

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
    .select(
      "perfil, status, ativo, cadastro_completo, aprovacao_status, perfil_excluido_em"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.perfil !== "equipe_ubs" ||
    profile.status !== "ativo" ||
    !profile.ativo ||
    profile.cadastro_completo !== true ||
    profile.aprovacao_status !== "aprovado" ||
    profile.perfil_excluido_em
  ) {
    redirect("/aguardando-aprovacao");
  }

  let items: TrashItem[] = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await supabase.rpc(
      "profissionais_listar_lixeira_v30",
      { p_exibir_identidade: true }
    );

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as DatabaseRow[];
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
    logServerFailure("trash-page-load", error);
    loadError = "Não foi possível consultar os registros removidos.";
  }

  if (loadError) {
    return (
      <>
        <section className="heading">
          <p>PET-Saúde UFCG</p>
          <h1>Lixeira</h1>
          <span>{loadError}</span>
        </section>
        <div className="pec-error">{loadError}</div>
      </>
    );
  }

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Lixeira</h1>
        <span>
          Aqui aparecem somente cadastros removidos sob sua
          responsabilidade.
        </span>
      </section>

      <TrashBin items={items} />
    </>
  );
}
