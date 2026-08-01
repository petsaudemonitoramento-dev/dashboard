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
      const perfil = String(item.perfil ?? "").trim();
      const ubsId = String(item.ubsId ?? "").trim();
      const microareaId = String(item.microareaId ?? "").trim();

      if (
        !isUuid(targetId) ||
        uniqueIds.has(targetId) ||
        targetId === context.user.id ||
        !isPublicRequestableProfile(perfil)
      ) {
        return NextResponse.json(
          { error: "Existe uma solicitação inválida, repetida ou própria." },
          { status: 400 }
        );
      }

      uniqueIds.add(targetId);

      if (action === "approve") {
        if (!isUuid(ubsId)) {
          return NextResponse.json(
            { error: "Revise a UBS das solicitações." },
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
        await transaction`
          select private.processar_solicitacao_perfil_v22(
            ${context.user.id}::uuid,
            ${String(item.targetId).trim()}::uuid,
            ${action === "approve" ? "aprovar" : "rejeitar"},
            ${action === "approve" ? String(item.ubsId).trim() : null}::uuid,
            ${
              action === "approve" && item.perfil === "acs"
                ? String(item.microareaId).trim()
                : null
            }::uuid,
            ${String(item.perfil).trim()}
          )
        `;
      }
    });

    return NextResponse.json({ ok: true, processed: items.length, action });
  } catch {
    console.error("Erro ao processar autorizações de perfil.");
    return NextResponse.json(
      {
        error:
          "A decisão não pôde ser concluída. Atualize a página e verifique a elegibilidade.",
      },
      { status: 409 }
    );
  }
}
