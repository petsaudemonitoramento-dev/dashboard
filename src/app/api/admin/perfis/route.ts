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

type AuditSnapshot = {
  perfil: string;
  status: string;
  ativo: boolean;
  cadastroCompleto: boolean;
  aprovacaoStatus: string;
  ubsId: string | null;
  ubsSolicitadaId: string | null;
  microareaId: string | null;
  excluido: boolean;
};

function snapshot(row: Record<string, unknown>): AuditSnapshot {
  return {
    perfil: String(row.perfil ?? ""),
    status: String(row.status ?? ""),
    ativo: row.ativo === true,
    cadastroCompleto: row.cadastro_completo === true,
    aprovacaoStatus: String(row.aprovacao_status ?? ""),
    ubsId:
      typeof row.ubs_id === "string" ? row.ubs_id : null,
    ubsSolicitadaId:
      typeof row.ubs_solicitada_id === "string"
        ? row.ubs_solicitada_id
        : null,
    microareaId:
      typeof row.microarea_id === "string"
        ? row.microarea_id
        : null,
    excluido: Boolean(row.perfil_excluido_em),
  };
}

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
    const adminRows = await sql<{ autorizado: boolean }[]>`
      select private.usuario_admin_v20(
        ${user.id}::uuid
      ) as autorizado
    `;

    if (!adminRows[0]?.autorizado) {
      return NextResponse.json(
        { error: "Apenas o administrador técnico pode alterar perfis." },
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
    const targetId = String(body.targetId ?? "").trim();
    const perfil = String(body.perfil ?? "").trim();
    const ubsId = String(body.ubsId ?? "").trim();

    if (!ALLOWED_ACTIONS.has(action) || !isUuid(targetId)) {
      return NextResponse.json(
        { error: "Operação inválida." },
        { status: 400 }
      );
    }

    if (targetId === user.id) {
      return NextResponse.json(
        {
          error:
            "Esta rota não permite alterar o próprio acesso administrativo.",
        },
        { status: 400 }
      );
    }

    if (
      action === "approve" &&
      (!ALLOWED_PROFILES.has(perfil) || !isUuid(ubsId))
    ) {
      return NextResponse.json(
        { error: "Selecione um perfil e uma UBS válidos." },
        { status: 400 }
      );
    }

    await sql.begin(async (tx) => {
      const beforeRows = await tx<Record<string, unknown>[]>`
        select
          perfil::text,
          status::text,
          ativo,
          cadastro_completo,
          aprovacao_status,
          ubs_id::text,
          ubs_solicitada_id::text,
          microarea_id::text,
          perfil_excluido_em
        from public.perfis
        where id = ${targetId}::uuid
        for update
      `;

      const before = beforeRows[0];

      if (!before) {
        throw new Error("PROFILE_NOT_FOUND");
      }

      if (String(before.perfil) === "administrador") {
        throw new Error("ADMIN_TARGET_FORBIDDEN");
      }

      if (action === "approve") {
        const ubsRows = await tx<{ id: string }[]>`
          select id
          from public.ubs
          where id = ${ubsId}::uuid
            and ativa = true
          limit 1
        `;

        if (!ubsRows[0]) {
          throw new Error("UBS_INACTIVE");
        }

        await tx`
          update public.perfis
          set
            perfil = 'equipe_ubs'::public.perfil_usuario,
            perfil_solicitado = 'equipe_ubs',
            ubs_id = ${ubsId}::uuid,
            ubs_solicitada_id = ${ubsId}::uuid,
            microarea_id = null,
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
        await tx`
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
        await tx`
          update public.perfis
          set
            aprovacao_status = 'desativado',
            ativo = false,
            perfil_excluido_em = now(),
            perfil_excluido_por = ${user.id}::uuid
          where id = ${targetId}::uuid
        `;
      } else {
        await tx`
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

      const afterRows = await tx<Record<string, unknown>[]>`
        select
          perfil::text,
          status::text,
          ativo,
          cadastro_completo,
          aprovacao_status,
          ubs_id::text,
          ubs_solicitada_id::text,
          microarea_id::text,
          perfil_excluido_em
        from public.perfis
        where id = ${targetId}::uuid
        limit 1
      `;

      await tx`
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
          ${sql.json(snapshot(before))},
          ${sql.json(snapshot(afterRows[0] ?? {}))}
        )
      `;
    });

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "";

    if (code === "PROFILE_NOT_FOUND") {
      return NextResponse.json(
        { error: "Perfil não encontrado." },
        { status: 404 }
      );
    }

    if (code === "ADMIN_TARGET_FORBIDDEN") {
      return NextResponse.json(
        {
          error:
            "Contas administrativas não podem ser alteradas por esta rota.",
        },
        { status: 403 }
      );
    }

    if (code === "UBS_INACTIVE") {
      return NextResponse.json(
        { error: "A UBS selecionada não está ativa." },
        { status: 400 }
      );
    }

    logServerFailure("admin-profile-update", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar o perfil." },
      { status: 500 }
    );
  }
}
