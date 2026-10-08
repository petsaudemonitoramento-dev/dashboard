import { NextResponse } from "next/server";
import {
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set([
  "approve",
  "reject",
  "deactivate",
  "reactivate",
]);

function statusFromRpcError(message: string): number {
  if (message.includes("ADMIN_FORBIDDEN")) return 403;
  if (message.includes("ADMIN_TARGET_FORBIDDEN")) return 403;
  if (message.includes("PROFILE_NOT_FOUND")) return 404;
  if (message.includes("UBS_INACTIVE")) return 400;
  if (message.includes("INVALID_OPERATION")) return 400;
  return 500;
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

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    const action = String(body.action ?? "");
    const targetId = String(body.targetId ?? "").trim();
    const ubsId = String(body.ubsId ?? "").trim();

    if (
      !ALLOWED_ACTIONS.has(action) ||
      !isUuid(targetId) ||
      (action === "approve" && !isUuid(ubsId))
    ) {
      return NextResponse.json(
        { error: "Operação inválida." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "profissionais_admin_processar_perfil_v30",
      {
        p_action: action,
        p_target_id: targetId,
        p_ubs_id: action === "approve" ? ubsId : null,
      }
    );

    if (error) {
      const status = statusFromRpcError(error.message);
      if (status === 500) {
        logServerFailure("admin-profile-update", error);
      }

      return NextResponse.json(
        {
          error:
            status === 403
              ? "Ação administrativa não autorizada."
              : status === 404
                ? "Perfil não encontrado."
                : status === 400
                  ? "Não foi possível validar a operação."
                  : "Não foi possível atualizar o perfil.",
        },
        { status }
      );
    }

    return NextResponse.json(data ?? { ok: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerFailure("admin-profile-update", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar o perfil." },
      { status: 500 }
    );
  }
}
