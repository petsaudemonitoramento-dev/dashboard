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

type ApprovalRequest = {
  targetId: string;
  perfil?: string;
  ubsId?: string;
};

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

    if (
      !["approve", "reject"].includes(action) ||
      items.length < 1 ||
      items.length > 100
    ) {
      return NextResponse.json(
        { error: "Operação inválida." },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    const sanitized: ApprovalRequest[] = [];

    for (const item of items) {
      const targetId = String(item.targetId ?? "").trim();
      const ubsId = String(item.ubsId ?? "").trim();

      if (!isUuid(targetId) || seen.has(targetId)) {
        return NextResponse.json(
          { error: "Solicitação inválida ou repetida." },
          { status: 400 }
        );
      }

      seen.add(targetId);

      if (action === "approve") {
        if (
          item.perfil !== "equipe_ubs" ||
          !isUuid(ubsId)
        ) {
          return NextResponse.json(
            {
              error:
                "Toda aprovação deve vincular Profissional da UBS a uma UBS válida.",
            },
            { status: 400 }
          );
        }

        sanitized.push({
          targetId,
          perfil: "equipe_ubs",
          ubsId,
        });
      } else {
        sanitized.push({ targetId });
      }
    }

    const { data, error } = await supabase.rpc(
      "profissionais_admin_processar_lote_v30",
      {
        p_action: action,
        p_items: sanitized,
      }
    );

    if (error) {
      const message = error.message;
      const forbidden =
        message.includes("ADMIN_FORBIDDEN") ||
        message.includes("ADMIN_TARGET_FORBIDDEN");

      if (!forbidden) {
        logServerFailure("admin-approvals", error);
      }

      return NextResponse.json(
        {
          error: forbidden
            ? "Ação administrativa não autorizada."
            : message.includes("REQUEST_NOT_PENDING")
              ? "Uma das solicitações não está mais pendente."
              : "Não foi possível processar as autorizações.",
        },
        {
          status: forbidden
            ? 403
            : message.includes("REQUEST_NOT_PENDING")
              ? 409
              : 500,
        }
      );
    }

    return NextResponse.json(data ?? { ok: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerFailure("admin-approvals", error);
    return NextResponse.json(
      { error: "Não foi possível processar as autorizações." },
      { status: 500 }
    );
  }
}
