import { NextResponse } from "next/server";
import { getManagementContext } from "@/lib/auth/guards";
import { isUuid } from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set(["deactivate", "reactivate"]);

export async function POST(request: Request) {
  try {
    const context = await getManagementContext();

    if (!context) {
      return NextResponse.json(
        { error: "Apenas a gestão municipal pode alterar perfis." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = String(body.action ?? "");
    const targetId = String(body.targetId ?? "");

    if (!ALLOWED_ACTIONS.has(action) || !isUuid(targetId)) {
      return NextResponse.json(
        { error: "Operação inválida." },
        { status: 400 }
      );
    }

    if (targetId === context.user.id) {
      return NextResponse.json(
        { error: "Você não pode alterar o próprio acesso." },
        { status: 400 }
      );
    }

    await context.sql.begin(async (transaction) => {
      const beforeRows = await transaction`
        select
          p.id,
          p.perfil::text as perfil,
          p.perfil_solicitado,
          p.aprovacao_status,
          p.status,
          p.ativo,
          p.ubs_id,
          p.microarea_id
        from public.perfis p
        where p.id = ${targetId}::uuid
        for update
      `;
      const before = beforeRows[0];

      if (!before) {
        throw new Error("Perfil não encontrado.");
      }

      if (!["equipe_ubs", "acs", "aluno"].includes(String(before.perfil))) {
        throw new Error(
          "Este perfil não pertence ao fluxo de gestão operacional."
        );
      }

      if (action === "deactivate") {
        if (before.aprovacao_status !== "aprovado") {
          throw new Error("Somente um acesso aprovado pode ser desativado.");
        }

        await transaction`
          update public.perfis
          set
            aprovacao_status = 'desativado',
            ativo = false,
            perfil_excluido_em = now(),
            perfil_excluido_por = ${context.user.id}::uuid
          where id = ${targetId}::uuid
        `;
      } else {
        if (!['rejeitado', 'desativado'].includes(String(before.aprovacao_status))) {
          throw new Error("Este acesso não pode ser reativado para análise.");
        }

        await transaction`
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

      const afterRows = await transaction`
        select
          p.perfil::text as perfil,
          p.perfil_solicitado,
          p.aprovacao_status,
          p.status,
          p.ativo,
          p.ubs_id,
          p.microarea_id
        from public.perfis p
        where p.id = ${targetId}::uuid
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
          ${context.user.id}::uuid,
          ${targetId}::uuid,
          ${action},
          ${context.sql.json(before)},
          ${context.sql.json(afterRows[0] ?? {})}
        )
      `;
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar o perfil.",
      },
      { status: 500 }
    );
  }
}
