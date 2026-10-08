import { NextResponse } from "next/server";
import {
  isUuid,
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRiskPayload } from "@/lib/validation/clinical-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RISK_BODY = 256 * 1024;

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: MAX_RISK_BODY,
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

    if (
      !(await consumeRateLimit({
        scope: "risk-save",
        actorKey: user.id,
        limit: 60,
        windowSeconds: 300,
      }))
    ) {
      return NextResponse.json(
        { error: "Muitas classificações em pouco tempo. Tente novamente em alguns minutos." },
        { status: 429 }
      );
    }

    const rawPayload = await readJsonObject(request, 256 * 1024);
    if (!rawPayload) {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    let payload: ReturnType<typeof sanitizeRiskPayload>;
    try {
      payload = sanitizeRiskPayload(rawPayload);
    } catch {
      return NextResponse.json(
        { error: "Revise os campos da classificação." },
        { status: 400 }
      );
    }

    const gestanteId =
      typeof payload.gestanteId === "string"
        ? payload.gestanteId
        : null;

    if (gestanteId && !isUuid(gestanteId)) {
      return NextResponse.json(
        { error: "Identificador de gestante inválido." },
        { status: 400 }
      );
    }

    if (gestanteId) {
      const { data: existing, error: accessError } =
        await supabase
          .from("pec_gestantes")
          .select("id")
          .eq("id", gestanteId)
          .maybeSingle();

      if (accessError || !existing) {
        return NextResponse.json(
          { error: "Cadastro não encontrado." },
          { status: 404 }
        );
      }
    }

    const { data: resultado, error: saveError } =
      await supabase.rpc(
        "profissionais_salvar_classificacao_risco_v30",
        { p_payload: payload }
      );

    if (saveError) {
      throw saveError;
    }

    return NextResponse.json(resultado ?? {}, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerFailure("risk-classification-save", error);
    return NextResponse.json(
      { error: "Não foi possível salvar a classificação." },
      { status: 500 }
    );
  }
}
