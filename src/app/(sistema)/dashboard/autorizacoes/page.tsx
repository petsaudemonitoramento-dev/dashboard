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
  usuario_id: string;
  nome_completo: string;
  email: string;
  cargo_funcao: string | null;
  perfil_solicitado: string | null;
  ubs_solicitada_id: string | null;
  ubs_solicitada_nome: string | null;
  solicitado_em: string | Date;
  origem_cadastro: string;
  credencial_id: string | null;
  conselho: string | null;
  uf: string | null;
  numero_registro: string | null;
  categoria: string | null;
  credencial_situacao: string | null;
  credencial_submetida_em: string | Date | null;
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
      select *
      from private.listar_solicitacoes_perfil_v22(${context.user.id}::uuid)
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
    id: row.usuario_id,
    nomeCompleto: row.nome_completo,
    email: row.email,
    perfilSolicitado: row.perfil_solicitado ?? "aluno",
    ubsSolicitadaId: row.ubs_solicitada_id,
    ubsSolicitadaNome: row.ubs_solicitada_nome,
    solicitadoEm: toIso(row.solicitado_em),
    origemCadastro: row.origem_cadastro,
    cargoFuncao: row.cargo_funcao,
    credencialId: row.credencial_id,
    conselho: row.conselho,
    conselhoUf: row.uf,
    numeroRegistro: row.numero_registro,
    categoriaConselho: row.categoria,
    credencialSituacao: row.credencial_situacao,
    credencialSubmetidaEm: row.credencial_submetida_em
      ? toIso(row.credencial_submetida_em)
      : null,
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
