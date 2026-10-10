import { NextResponse } from "next/server";
import {
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set([
  "create_ubs",
  "update_ubs",
  "toggle_ubs",
  "create_microarea",
  "update_microarea",
  "toggle_microarea",
]);

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

    const body = await readJsonObject(request, 32 * 1024);
    if (!body) {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    const action = String(body.action ?? "");
    if (!ACTIONS.has(action)) {
      return NextResponse.json(
        { error: "Operação inválida." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "profissionais_admin_gerenciar_ubs_v30",
      {
        p_action: action,
        p_payload: body,
      }
    );

    if (error) {
      if (error.message.includes("DUPLICATE_RECORD")) {
        return NextResponse.json(
          { error: "Já existe uma UBS ou microárea com estes dados." },
          { status: 409 }
        );
      }

      if (error.message.includes("ADMIN_FORBIDDEN")) {
        return NextResponse.json(
          { error: "Ação administrativa não autorizada." },
          { status: 403 }
        );
      }

      if (error.message.includes("INVALID_OPERATION")) {
        return NextResponse.json(
          { error: "Dados da operação inválidos." },
          { status: 400 }
        );
      }

      logServerFailure("admin-ubs", error);
      return NextResponse.json(
        { error: "Não foi possível concluir a operação." },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? { ok: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerFailure("admin-ubs", error);
    return NextResponse.json(
      { error: "Não foi possível concluir a operação." },
      { status: 500 }
    );
  }
}
