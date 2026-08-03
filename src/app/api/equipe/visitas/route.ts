import { NextResponse } from "next/server";
import { getClinicalTeamContext } from "@/lib/auth/guards";
import { isUuid } from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "acompanhamento",
  "encaminhamento",
  "contato_acs",
  "resolvido",
]);

export async function POST(request: Request) {
  try {
    const context = await getClinicalTeamContext();

    if (!context) {
      return NextResponse.json(
        { error: "Acesso clínico não autorizado." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const gestanteId = String(body.gestanteId ?? "").trim();
    const visitaId = body.visitaId
      ? String(body.visitaId).trim()
      : null;
    const tipo = String(body.tipo ?? "").trim();
    const observacao = String(body.observacao ?? "").trim();

    if (!isUuid(gestanteId)) {
      return NextResponse.json(
        { error: "Gestante inválida." },
        { status: 400 }
      );
    }

    if (visitaId && !isUuid(visitaId)) {
      return NextResponse.json(
        { error: "Registro de visita inválido." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(tipo)) {
      return NextResponse.json(
        { error: "Tipo de acompanhamento inválido." },
        { status: 400 }
      );
    }

    if (observacao.length < 3 || observacao.length > 500) {
      return NextResponse.json(
        { error: "Informe um registro objetivo de 3 a 500 caracteres." },
        { status: 400 }
      );
    }

    const rows = await context.sql`
      select private.registrar_acompanhamento_visita_v29_1(
        ${context.user.id}::uuid,
        ${gestanteId}::uuid,
        ${visitaId}::uuid,
        ${tipo},
        ${observacao}
      ) as resultado
    `;

    return NextResponse.json(rows[0]?.resultado ?? { ok: true });
  } catch (error) {
    console.error("Erro no acompanhamento de visitas da equipe V29.1:", error);

    return NextResponse.json(
      { error: "Não foi possível registrar o acompanhamento." },
      { status: 500 }
    );
  }
}
