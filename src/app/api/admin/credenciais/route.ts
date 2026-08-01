import { NextResponse } from "next/server";
import { getManagementContext } from "@/lib/auth/guards";
import { isUuid } from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["validate", "reject", "expire"]);
const SOURCES = new Set(["portal_cfm", "consulta_cofen"]);

export async function POST(request: Request) {
  try {
    const context = await getManagementContext();

    if (!context) {
      return NextResponse.json(
        { error: "Apenas a gestão municipal pode validar credenciais." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = String(body.action ?? "").trim();
    const credentialId = String(body.credentialId ?? "").trim();
    const source = String(body.source ?? "").trim();
    const reason = String(body.reason ?? "").replace(/\s+/g, " ").trim();

    if (
      !ACTIONS.has(action) ||
      !isUuid(credentialId) ||
      !SOURCES.has(source)
    ) {
      return NextResponse.json(
        { error: "Decisão ou fonte de validação inválida." },
        { status: 400 }
      );
    }

    if (action !== "validate" && (reason.length < 3 || reason.length > 500)) {
      return NextResponse.json(
        { error: "Informe um motivo controlado entre 3 e 500 caracteres." },
        { status: 400 }
      );
    }

    if (/\d{11}/.test(reason)) {
      return NextResponse.json(
        { error: "O motivo não pode conter CPF ou outro número pessoal." },
        { status: 400 }
      );
    }

    const decision =
      action === "validate"
        ? "validar"
        : action === "expire"
          ? "expirar"
          : "rejeitar";
    const rows = await context.sql`
      select private.decidir_credencial_profissional_v22(
        ${context.user.id}::uuid,
        ${credentialId}::uuid,
        ${decision},
        ${source},
        ${reason || null}
      ) as resultado
    `;

    return NextResponse.json({ ok: true, credential: rows[0]?.resultado });
  } catch {
    console.error("Erro ao processar credencial profissional.");
    return NextResponse.json(
      { error: "Não foi possível processar a credencial profissional." },
      { status: 409 }
    );
  }
}
