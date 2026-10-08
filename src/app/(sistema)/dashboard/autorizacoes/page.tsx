import { redirect } from "next/navigation";
import {
  AuthorizationList,
  type AuthorizationMicroarea,
  type AuthorizationRow,
  type AuthorizationUbs,
} from "@/components/admin/authorization-list";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PendingPayload = {
  rows: Array<{
    id: string;
    nome_completo: string;
    email: string;
    data_nascimento: string | null;
    perfil_solicitado: string | null;
    ubs_solicitada_id: string | null;
    ubs_solicitada_nome: string | null;
    solicitado_em: string;
    origem_cadastro: string;
  }>;
  ubs: AuthorizationUbs[];
  microareas: Array<{
    id: string;
    ubs_id: string;
    codigo: string;
    nome: string | null;
  }>;
};

export default async function AutorizacoesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc(
    "profissionais_admin_listar_pendentes_v30"
  );

  if (error || !data) {
    redirect("/dashboard");
  }

  const payload = data as PendingPayload;

  const rows: AuthorizationRow[] = payload.rows.map((row) => ({
    id: row.id,
    nomeCompleto: row.nome_completo,
    email: row.email,
    dataNascimento: row.data_nascimento,
    perfilSolicitado: row.perfil_solicitado ?? "equipe_ubs",
    ubsSolicitadaId: row.ubs_solicitada_id,
    ubsSolicitadaNome: row.ubs_solicitada_nome,
    solicitadoEm: row.solicitado_em,
    origemCadastro: row.origem_cadastro,
  }));

  const microareas: AuthorizationMicroarea[] =
    payload.microareas.map((row) => ({
      id: row.id,
      ubsId: row.ubs_id,
      codigo: row.codigo,
      nome: row.nome,
    }));

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Autorizações</h1>
        <span>
          Libere novos cadastros profissionais com vínculo de UBS
          definido.
        </span>
      </section>

      <AuthorizationList
        microareas={microareas}
        rows={rows}
        ubsOptions={payload.ubs}
      />
    </>
  );
}
