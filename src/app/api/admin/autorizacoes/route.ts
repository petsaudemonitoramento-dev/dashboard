import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PROFILES = new Set([
  "administrador",
  "profissional_ubs",
  "acs",
  "aluno",
]);

type ApprovalRequest = {
  targetId: string;
  perfil: string;
  ubsId: string;
  microareaId?: string | null;
};

export async function POST(request: Request) {
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
    const permission = await sql`
      select private.usuario_admin_v20(${user.id}::uuid) as autorizado
    `;

    if (!permission[0]?.autorizado) {
      return NextResponse.json(
        { error: "Apenas a gestão pode autorizar perfis." },
        { status: 403 }
      );
    }

    const body = await request.json();
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
          { error: "Existe uma solicitação inválida ou repetida." },
          { status: 400 }
        );
      }

      uniqueIds.add(targetId);

      if (action === "approve") {
        const perfil = String(item.perfil ?? "").trim();
        const ubsId = String(item.ubsId ?? "").trim();
        const microareaId = String(item.microareaId ?? "").trim();

        if (!ALLOWED_PROFILES.has(perfil) || !isUuid(ubsId)) {
          return NextResponse.json(
            { error: "Revise o perfil e a UBS das solicitações." },
            { status: 400 }
          );
        }

        if (perfil === "acs" && !isUuid(microareaId)) {
          return NextResponse.json(
            {
              error:
                "Toda ACS precisa receber uma microárea antes da aprovação.",
            },
            { status: 400 }
          );
        }
      }
    }

    await sql.begin(async (transaction) => {
      for (const item of items) {
        const targetId = String(item.targetId).trim();
        const beforeRows = await transaction`
          select to_jsonb(p.*) as dados
          from public.perfis p
          where p.id = ${targetId}::uuid
            and p.aprovacao_status = 'pendente'
          limit 1
        `;

        if (!beforeRows[0]) {
          throw new Error(
            "Uma das solicitações não está mais pendente. Atualize a página."
          );
        }

        if (action === "reject") {
          await transaction`
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
          const perfil = String(item.perfil).trim();
          const ubsId = String(item.ubsId).trim();
          const microareaId = String(item.microareaId ?? "").trim();

          const ubsRows = await transaction`
            select id
            from public.ubs
            where id = ${ubsId}::uuid
              and ativa = true
            limit 1
          `;

          if (!ubsRows[0]) {
            throw new Error("Uma das UBS selecionadas está desativada.");
          }

          if (perfil === "acs") {
            const microRows = await transaction`
              select id
              from public.microareas
              where id = ${microareaId}::uuid
                and ubs_id = ${ubsId}::uuid
                and ativa = true
              limit 1
            `;

            if (!microRows[0]) {
              throw new Error(
                "A microárea escolhida não pertence à UBS da ACS."
              );
            }
          }

          await transaction`
            update public.perfis
            set
              perfil = ${perfil}::public.perfil_usuario,
              perfil_solicitado = ${perfil},
              ubs_id = ${ubsId}::uuid,
              ubs_solicitada_id = ${ubsId}::uuid,
              microarea_id = ${
                perfil === "acs" ? microareaId : null
              }::uuid,
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

        const afterRows = await transaction`
          select to_jsonb(p.*) as dados
          from public.perfis p
          where p.id = ${targetId}::uuid
          limit 1
        `;

        await transaction`
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
            ${action === "approve" ? "aprovar_lote_v21" : "rejeitar_lote_v21"},
            ${sql.json(beforeRows[0].dados)},
            ${sql.json(afterRows[0]?.dados ?? {})}
          )
        `;
      }
    });

    return NextResponse.json({
      ok: true,
      processed: items.length,
      action,
    });
  } catch (error) {
    console.error("Erro nas autorizações V21:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível processar as autorizações.",
      },
      { status: 500 }
    );
  }
}
