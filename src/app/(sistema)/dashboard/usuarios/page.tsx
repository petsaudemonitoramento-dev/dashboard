import { redirect } from "next/navigation";
import {
  AdminProfiles,
  type AdminProfileRow,
} from "@/components/admin/admin-profiles";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DatabaseProfile = {
  id: string;
  nome_completo: string;
  email: string;
  data_nascimento: string | Date | null;
  perfil_atual: string;
  perfil_solicitado: string | null;
  aprovacao_status: string;
  ativo: boolean;
  ubs_id: string | null;
  ubs_nome: string | null;
  ubs_solicitada_id: string | null;
  ubs_solicitada_nome: string | null;
  origem_cadastro: string;
  solicitado_em: string | Date;
  perfil_excluido_em: string | Date | null;
};

function toIsoDate(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function toIso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export default async function UsuariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const sql = getPostgresClient();
  const allowed = await sql`
    select private.usuario_admin_v20(${user.id}::uuid) as autorizado
  `;

  if (!allowed[0]?.autorizado) {
    redirect("/dashboard");
  }

  const [rows, ubsOptions] = await Promise.all([
    sql<DatabaseProfile[]>`
      select
        p.id,
        p.nome_completo,
        p.email,
        p.data_nascimento,
        p.perfil::text as perfil_atual,
        p.perfil_solicitado,
        p.aprovacao_status,
        p.ativo,
        p.ubs_id,
        u.nome as ubs_nome,
        p.ubs_solicitada_id,
        us.nome as ubs_solicitada_nome,
        p.origem_cadastro,
        p.solicitado_em,
        p.perfil_excluido_em
      from public.perfis p
      left join public.ubs u on u.id = p.ubs_id
      left join public.ubs us on us.id = p.ubs_solicitada_id
      where p.aprovacao_status <> 'pendente'
      order by
        case when p.aprovacao_status = 'pendente' then 0 else 1 end,
        p.solicitado_em desc,
        p.nome_completo
    `,
    sql<{ id: string; nome: string }[]>`
      select id, nome
      from public.ubs
      where ativa = true
      order by nome
    `,
  ]);

  const profiles: AdminProfileRow[] = rows.map((row) => ({
    id: row.id,
    nomeCompleto: row.nome_completo,
    email: row.email,
    dataNascimento: toIsoDate(row.data_nascimento),
    perfilAtual: row.perfil_atual,
    perfilSolicitado: row.perfil_solicitado,
    aprovacaoStatus: row.aprovacao_status,
    ativo: row.ativo,
    ubsId: row.ubs_id,
    ubsNome: row.ubs_nome,
    ubsSolicitadaId: row.ubs_solicitada_id,
    ubsSolicitadaNome: row.ubs_solicitada_nome,
    origemCadastro: row.origem_cadastro,
    solicitadoEm: toIso(row.solicitado_em) ?? "",
    perfilExcluidoEm: toIso(row.perfil_excluido_em),
  }));

  return (
    <>
      <section className="heading">
        <p>PET-Saúde UFCG</p>
        <h1>Usuários e acessos</h1>
        <span>
          Perfis aprovados, desativados ou rejeitados. Novas solicitações ficam na aba Autorizações.
        </span>
      </section>

      <AdminProfiles
        currentUserId={user.id}
        profiles={profiles}
        ubsOptions={ubsOptions}
      />
    </>
  );
}
