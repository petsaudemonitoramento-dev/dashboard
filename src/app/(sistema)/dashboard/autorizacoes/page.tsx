import { redirect } from "next/navigation";
import {
  AuthorizationList,
  type AuthorizationMicroarea,
  type AuthorizationRow,
  type AuthorizationUbs,
} from "@/components/admin/authorization-list";
import { getManagementContext } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DatabaseAuthorization = {
  id: string;
  nome_completo: string;
  email: string;
  perfil_solicitado: string | null;
  ubs_solicitada_id: string | null;
  ubs_solicitada_nome: string | null;
  solicitado_em: string | Date;
  origem_cadastro: string;
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export default async function AutorizacoesPage() {
  const context = await getManagementContext();

  if (!context) {
    redirect("/dashboard");
  }

  const { sql } = context;

  const [rows, ubsRows, microareaRows] = await Promise.all([
    sql<DatabaseAuthorization[]>`
      select
        p.id,
        p.nome_completo,
        p.email,
        p.perfil_solicitado,
        p.ubs_solicitada_id,
        u.nome as ubs_solicitada_nome,
        p.solicitado_em,
        p.origem_cadastro
      from public.perfis p
      left join public.ubs u
        on u.id = p.ubs_solicitada_id
      where p.aprovacao_status = 'pendente'
        and p.perfil_excluido_em is null
        and p.perfil_solicitado in ('equipe_ubs', 'acs', 'aluno')
      order by p.solicitado_em, p.nome_completo
    `,
    sql<AuthorizationUbs[]>`
      select id, nome
      from public.ubs
      where ativa = true
      order by nome
    `,
    sql<
      Array<{
        id: string;
        ubs_id: string;
        codigo: string;
        nome: string | null;
      }>
    >`
      select id, ubs_id, codigo, nome
      from public.microareas
      where ativa = true
      order by ubs_id, codigo
    `,
  ]);

  const authorizations: AuthorizationRow[] = rows.map((row) => ({
    id: row.id,
    nomeCompleto: row.nome_completo,
    email: row.email,
    perfilSolicitado: row.perfil_solicitado ?? "aluno",
    ubsSolicitadaId: row.ubs_solicitada_id,
    ubsSolicitadaNome: row.ubs_solicitada_nome,
    solicitadoEm: toIso(row.solicitado_em),
    origemCadastro: row.origem_cadastro,
  }));

  const microareas: AuthorizationMicroarea[] = microareaRows.map((row) => ({
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
          Libere novos cadastros individualmente ou em lote, com vínculo
          territorial definido.
        </span>
      </section>

      <AuthorizationList
        microareas={microareas}
        rows={authorizations}
        ubsOptions={ubsRows}
      />
    </>
  );
}
