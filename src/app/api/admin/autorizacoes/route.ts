import { NextResponse } from "next/server";
import { getManagementContext } from "@/lib/auth/guards";
import { isPublicRequestableProfile } from "@/lib/auth/roles";
import { isUuid } from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApprovalRequest = {
  targetId: string;
  perfil: string;
  ubsId: string;
  microareaId?: string | null;
};

export async function POST(request: Request) {
  try {
    const context = await getManagementContext();

    if (!context) {
      return NextResponse.json(
        { error: "Apenas a gestão municipal pode autorizar perfis." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = String(body.action ?? "approve");
    const items = Array.isArray(body.items)
      ? (body.items as ApprovalRequest[])
      : [];

    if (!new Set(["approve", "reject"]).has(action)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
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

      if (
        !isUuid(targetId) ||
        uniqueIds.has(targetId) ||
        targetId === context.user.id
      ) {
        return NextResponse.json(
          { error: "Existe uma solicitação inválida, repetida ou própria." },
          { status: 400 }
        );
      }

      uniqueIds.add(targetId);

      if (action === "approve") {
        const perfil = String(item.perfil ?? "").trim();
        const ubsId = String(item.ubsId ?? "").trim();
        const microareaId = String(item.microareaId ?? "").trim();

        if (!isPublicRequestableProfile(perfil) || !isUuid(ubsId)) {
          return NextResponse.json(
            { error: "Revise o perfil e a UBS das solicitações." },
            { status: 400 }
          );
        }

        if (perfil === "equipe_ubs") {
          return NextResponse.json(
            {
              error:
                "A aprovação da equipe UBS depende da validação de CRM ou COREN.",
            },
            { status: 400 }
          );
        }

        if (perfil === "acs" && !isUuid(microareaId)) {
          return NextResponse.json(
            { error: "Toda ACS precisa receber uma microárea." },
            { status: 400 }
          );
        }
      }
    }

    await context.sql.begin(async (transaction) => {
      for (const item of items) {
        const targetId = String(item.targetId).trim();
        const beforeRows = await transaction`
          select
            p.perfil_solicitado,
            jsonb_build_object(
              'perfil', p.perfil::text,
              'perfilSolicitado', p.perfil_solicitado,
              'aprovacaoStatus', p.aprovacao_status,
              'ativo', p.ativo,
              'ubsId', p.ubs_id,
              'ubsSolicitadaId', p.ubs_solicitada_id,
              'microareaId', p.microarea_id
            ) as dados
          from public.perfis p
          where p.id = ${targetId}::uuid
            and p.aprovacao_status = 'pendente'
            and p.status = 'ativo'
            and p.ativo = true
            and p.cadastro_completo = true
            and p.perfil_solicitado in ('equipe_ubs', 'acs', 'aluno')
          for update
        `;
        const before = beforeRows[0];

        if (!before) {
          throw new Error(
            "Uma solicitação não está mais pendente. Atualize a página."
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
              aprovado_por = ${context.user.id}::uuid
            where id = ${targetId}::uuid
          `;
        } else {
          const perfil = String(item.perfil).trim();
          const ubsId = String(item.ubsId).trim();
          const microareaId = String(item.microareaId ?? "").trim();

          if (before.perfil_solicitado !== perfil) {
            throw new Error(
              "O perfil solicitado mudou. Atualize a página antes de decidir."
            );
          }

          const ubsRows = await transaction`
            select id
            from public.ubs
            where id = ${ubsId}::uuid
              and ativa = true
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
            `;

            if (!microRows[0]) {
              throw new Error("A microárea não pertence à UBS da ACS.");
            }
          }

          await transaction`
            update public.perfis
            set
              perfil = ${perfil}::public.perfil_usuario,
              ubs_id = ${ubsId}::uuid,
              ubs_solicitada_id = ${ubsId}::uuid,
              microarea_id = ${perfil === "acs" ? microareaId : null}::uuid,
              aprovacao_status = 'aprovado',
              aprovado_em = now(),
              aprovado_por = ${context.user.id}::uuid,
              perfil_excluido_em = null,
              perfil_excluido_por = null
            where id = ${targetId}::uuid
          `;
        }

        const afterRows = await transaction`
          select jsonb_build_object(
            'perfil', p.perfil::text,
            'perfilSolicitado', p.perfil_solicitado,
            'aprovacaoStatus', p.aprovacao_status,
            'ativo', p.ativo,
            'ubsId', p.ubs_id,
            'ubsSolicitadaId', p.ubs_solicitada_id,
            'microareaId', p.microarea_id
          ) as dados
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
            ${action === "approve" ? "aprovar_lote_v21" : "rejeitar_lote_v21"},
            ${context.sql.json(before.dados)},
            ${context.sql.json(afterRows[0]?.dados ?? {})}
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
