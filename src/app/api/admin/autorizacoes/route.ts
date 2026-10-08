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

type ApprovalRequest = {
  targetId: string;
  perfil?: string;
  ubsId?: string;
};

type AuditSnapshot = {
  perfil: string;
  status: string;
  ativo: boolean;
  cadastroCompleto: boolean;
  aprovacaoStatus: string;
  ubsId: string | null;
  ubsSolicitadaId: string | null;
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
    excluido: Boolean(row.perfil_excluido_em),
  };
}

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: 256 * 1024,
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
    const permission = await sql<{ autorizado: boolean }[]>`
      select private.usuario_admin_v20(
        ${user.id}::uuid
      ) as autorizado
    `;

    if (!permission[0]?.autorizado) {
      return NextResponse.json(
        {
          error:
            "Apenas o administrador técnico pode autorizar perfis.",
        },
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

    const action = String(body.action ?? "approve");
    const items = Array.isArray(body.items)
      ? (body.items as ApprovalRequest[])
      : [];

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Ação inválida." },
        { status: 400 }
      );
    }

    if (items.length === 0 || items.length > 100) {
      return NextResponse.json(
        { error: "Selecione entre 1 e 100 solicitações." },
        { status: 400 }
      );
    }

    const uniqueIds = new Set<string>();

    for (const item of items) {
      const targetId = String(item.targetId ?? "").trim();

      if (!isUuid(targetId) || uniqueIds.has(targetId)) {
        return NextResponse.json(
          {
            error:
              "Existe uma solicitação inválida ou repetida.",
          },
          { status: 400 }
        );
      }

      uniqueIds.add(targetId);

      if (targetId === user.id) {
        return NextResponse.json(
          {
            error:
              "A própria conta administrativa não pode ser processada neste lote.",
          },
          { status: 400 }
        );
      }

      if (action === "approve") {
        const perfil = String(item.perfil ?? "").trim();
        const ubsId = String(item.ubsId ?? "").trim();

        if (perfil !== "equipe_ubs" || !isUuid(ubsId)) {
          return NextResponse.json(
            {
              error:
                "Toda aprovação deve ser para Profissional da UBS com uma UBS válida.",
            },
            { status: 400 }
          );
        }
      }
    }

    await sql.begin(async (tx) => {
      for (const item of items) {
        const targetId = String(item.targetId).trim();

        const beforeRows =
          await tx<Record<string, unknown>[]>`
            select
              perfil::text,
              status::text,
              ativo,
              cadastro_completo,
              aprovacao_status,
              ubs_id::text,
              ubs_solicitada_id::text,
              perfil_excluido_em
            from public.perfis
            where id = ${targetId}::uuid
              and aprovacao_status = 'pendente'
            for update
          `;

        const before = beforeRows[0];

        if (!before) {
          throw new Error("REQUEST_NOT_PENDING");
        }

        if (String(before.perfil) === "administrador") {
          throw new Error("ADMIN_TARGET_FORBIDDEN");
        }

        if (action === "reject") {
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
        } else {
          const ubsId = String(item.ubsId).trim();

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
        }

        const afterRows =
          await tx<Record<string, unknown>[]>`
            select
              perfil::text,
              status::text,
              ativo,
              cadastro_completo,
              aprovacao_status,
              ubs_id::text,
              ubs_solicitada_id::text,
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
            ${
              action === "approve"
                ? "aprovar_lote_profissionais_v30"
                : "rejeitar_lote_profissionais_v30"
            },
            ${sql.json(snapshot(before))},
            ${sql.json(snapshot(afterRows[0] ?? {}))}
          )
        `;
      }
    });

    return NextResponse.json(
      {
        ok: true,
        processed: items.length,
        action,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "";

    if (code === "REQUEST_NOT_PENDING") {
      return NextResponse.json(
        {
          error:
            "Uma das solicitações não está mais pendente. Atualize a página.",
        },
        { status: 409 }
      );
    }

    if (code === "ADMIN_TARGET_FORBIDDEN") {
      return NextResponse.json(
        {
          error:
            "Conta administrativa não pode ser processada nesta rotina.",
        },
        { status: 403 }
      );
    }

    if (code === "UBS_INACTIVE") {
      return NextResponse.json(
        { error: "Uma das UBS selecionadas está desativada." },
        { status: 400 }
      );
    }

    logServerFailure("admin-approvals", error);
    return NextResponse.json(
      { error: "Não foi possível processar as autorizações." },
      { status: 500 }
    );
  }
}
