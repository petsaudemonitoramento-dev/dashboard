import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";
import {
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { isUuid } from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set([
  "approve",
  "reject",
  "deactivate",
  "reactivate",
]);

const ALLOWED_PROFILES = new Set(["equipe_ubs"]);


export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: 32 * 1024,
    contentTypes: ["application/json"],
  });
  if (requestError) return requestError;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Sessão expirada." },
        { status: 401 }
      );
    }

    const sql = getPostgresClient();
    const adminRows = await sql`
      select private.usuario_admin_v20(${user.id}::uuid) as autorizado
    `;

    if (!adminRows[0]?.autorizado) {
      return NextResponse.json(
        { error: "Apenas a gestão pode alterar perfis." },
        { status: 403 }
      );
    }

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }
    const action = String(body.action ?? "");
    const targetId = String(body.targetId ?? "");
    const perfil = String(body.perfil ?? "");
    const ubsId = String(body.ubsId ?? "");

    if (!ALLOWED_ACTIONS.has(action) || !isUuid(targetId)) {
      return NextResponse.json(
        { error: "Operação inválida." },
        { status: 400 }
      );
    }

    if (action === "deactivate" && targetId === user.id) {
      return NextResponse.json(
        { error: "Você não pode excluir o próprio acesso." },
        { status: 400 }
      );
    }

    const beforeRows = await sql`
      select to_jsonb(p.*) as dados
      from public.perfis p
      where p.id = ${targetId}::uuid
      limit 1
    `;

    if (!beforeRows[0]) {
      return NextResponse.json(
        { error: "Perfil não encontrado." },
        { status: 404 }
      );
    }

    if (action === "approve") {
      if (!ALLOWED_PROFILES.has(perfil) || !isUuid(ubsId)) {
        return NextResponse.json(
          { error: "Selecione um perfil e uma UBS válidos." },
          { status: 400 }
        );
      }

      const ubsRows = await sql`
        select id
        from public.ubs
        where id = ${ubsId}::uuid
          and ativa = true
        limit 1
      `;

      if (!ubsRows[0]) {
        return NextResponse.json(
          { error: "A UBS selecionada não está ativa." },
          { status: 400 }
        );
      }

      await sql`
        update public.perfis
        set
          perfil = ${perfil}::public.perfil_usuario,
          perfil_solicitado = ${perfil},
          ubs_id = ${ubsId}::uuid,
          ubs_solicitada_id = ${ubsId}::uuid,
          aprovacao_status = 'aprovado',
          cadastro_completo = true,
          status = 'ativo',
          ativo = true,
          aprovado_em = now(),
          aprovado_por = ${user.id}::uuid,
          perfil_excluido_em = null,
          perfil_excluido_por = null
        where id = ${targetId}::uuid
      `;
    } else if (action === "reject") {
      await sql`
        update public.perfis
        set
          perfil = 'aluno'::public.perfil_usuario,
          ubs_id = null,
          microarea_id = null,
          aprovacao_status = 'rejeitado',
          aprovado_em = null,
          aprovado_por = ${user.id}::uuid
        where id = ${targetId}::uuid
      `;
    } else if (action === "deactivate") {
      await sql`
        update public.perfis
        set
          aprovacao_status = 'desativado',
          ativo = false,
          perfil_excluido_em = now(),
          perfil_excluido_por = ${user.id}::uuid
        where id = ${targetId}::uuid
      `;
    } else {
      await sql`
        update public.perfis
        set
          perfil = 'aluno'::public.perfil_usuario,
          ubs_id = null,
          microarea_id = null,
          aprovacao_status = 'pendente',
          ativo = true,
          status = 'ativo',
          perfil_excluido_em = null,
          perfil_excluido_por = null,
          solicitado_em = now()
        where id = ${targetId}::uuid
      `;
    }

    const afterRows = await sql`
      select to_jsonb(p.*) as dados
      from public.perfis p
      where p.id = ${targetId}::uuid
      limit 1
    `;

    await sql`
      insert into private.auditoria_perfis_v20 (
        administrador_id,
        perfil_alvo_id,
        acao,
        antes,
        depois
      )
      values (
        ${user.id}::uuid,
        ${targetId}::uuid,
        ${action},
        ${sql.json(beforeRows[0].dados)},
        ${sql.json(afterRows[0]?.dados ?? {})}
      )
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerFailure("admin-profile-update", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar o perfil." },
      { status: 500 }
    );
  }
}
