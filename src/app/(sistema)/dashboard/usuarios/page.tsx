import { redirect } from "next/navigation";
import {
  AdminProfiles,
  type AdminProfileRow,
} from "@/components/admin/admin-profiles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProfilesPayload = {
  rows: Array<{
    id: string;
    nome_completo: string;
    email: string;
    data_nascimento: string | null;
    perfil_atual: string;
    perfil_solicitado: string | null;
    aprovacao_status: string;
    ativo: boolean;
    ubs_id: string | null;
    ubs_nome: string | null;
    ubs_solicitada_id: string | null;
    ubs_solicitada_nome: string | null;
    origem_cadastro: string;
    solicitado_em: string;
    perfil_excluido_em: string | null;
  }>;
  ubs: Array<{ id: string; nome: string }>;
};

export default async function UsuariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc(
    "profissionais_admin_listar_perfis_v30"
  );

  if (error || !data) {
    redirect("/dashboard");
  }

  const payload = data as ProfilesPayload;
  // The existing admin RPC is the access gate. Keep administrator profiles
  // read-only here; never pass them to the professional mutation controls.
  const { data: administrators, error: administratorsError } = await supabase
    .from("perfis")
    .select("id,nome_completo,email,ativo,status,aprovacao_status")
    .eq("perfil", "administrador")
    .is("perfil_excluido_em", null)
    .order("nome_completo");

  const profiles: AdminProfileRow[] = payload.rows.map((row) => ({
    id: row.id,
    nomeCompleto: row.nome_completo,
    email: row.email,
    dataNascimento: row.data_nascimento,
    perfilAtual: row.perfil_atual,
    perfilSolicitado: row.perfil_solicitado,
    aprovacaoStatus: row.aprovacao_status,
    ativo: row.ativo,
    ubsId: row.ubs_id,
    ubsNome: row.ubs_nome,
    ubsSolicitadaId: row.ubs_solicitada_id,
    ubsSolicitadaNome: row.ubs_solicitada_nome,
    origemCadastro: row.origem_cadastro,
    solicitadoEm: row.solicitado_em,
    perfilExcluidoEm: row.perfil_excluido_em,
  }));

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Usuários e acessos</h1>
        <span>
          Perfis profissionais e contas administrativas.
        </span>
      </section>

      <section className="v20-admin-card" style={{ marginBottom: 24 }}>
        <div className="v20-page-heading">
          <div>
            <h2>Administradores ({administratorsError ? "—" : administrators?.length ?? 0})</h2>
            <p>Consulta de acessos administrativos. Alterações não são feitas por esta lista.</p>
          </div>
        </div>
        {administratorsError ? (
          <p role="alert">Não foi possível consultar os administradores.</p>
        ) : (
          <div className="v20-admin-table-wrap">
            <table className="v20-admin-table">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Situação</th></tr></thead>
              <tbody>
                {(administrators ?? []).map((admin) => (
                  <tr key={admin.id}>
                    <td>{admin.nome_completo}{admin.id === user.id ? " (você)" : ""}</td>
                    <td>{admin.email}</td>
                    <td>{admin.ativo && admin.status === "ativo" && admin.aprovacao_status === "aprovado" ? "Ativo e aprovado" : admin.aprovacao_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdminProfiles
        currentUserId={user.id}
        profiles={profiles}
        ubsOptions={payload.ubs}
      />
    </>
  );
}
