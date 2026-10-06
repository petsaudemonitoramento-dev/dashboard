import { NextResponse } from "next/server";
import {
  isUuid,
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { sanitizeClinicalPayload } from "@/lib/validation/clinical-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CLINICAL_BODY = 1024 * 1024;

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: MAX_CLINICAL_BODY,
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
        { error: "Sessão expirada. Entre novamente." },
        { status: 401 }
      );
    }

    if (
      !(await consumeRateLimit({
        scope: "clinical-save",
        actorKey: user.id,
        limit: 120,
        windowSeconds: 300,
      }))
    ) {
      return NextResponse.json(
        { error: "Muitas alterações em pouco tempo. Tente novamente em alguns minutos." },
        { status: 429 }
      );
    }

    const rawPayload = await readJsonObject(request);
    if (!rawPayload) {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    let payload: ReturnType<typeof sanitizeClinicalPayload>;
    try {
      payload = sanitizeClinicalPayload(rawPayload);
    } catch {
      return NextResponse.json(
        { error: "Revise os campos do cadastro clínico." },
        { status: 400 }
      );
    }

    const existingId =
      typeof payload.id === "string" ? payload.id : null;

    if (existingId && !isUuid(existingId)) {
      return NextResponse.json(
        { error: "Identificador de gestante inválido." },
        { status: 400 }
      );
    }

    if (existingId) {
      const { data: existing, error: accessError } =
        await supabase
          .from("pec_gestantes")
          .select("id")
          .eq("id", existingId)
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
        "profissionais_salvar_gestante_clinica_v30",
        { p_payload: payload }
      );

    if (saveError) {
      throw saveError;
    }

    return NextResponse.json(resultado ?? {}, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "";

    const duplicateMatch = message.match(
      /GESTANTE_DUPLICADA:([0-9a-f-]{36})/i
    );

    if (duplicateMatch && isUuid(duplicateMatch[1])) {
      return NextResponse.json(
        {
          error:
            "Já existe uma gestante com os mesmos identificadores nesta UBS.",
          existingId: duplicateMatch[1],
        },
        { status: 409 }
      );
    }

    logServerFailure("clinical-save", error);
    return NextResponse.json(
      { error: "Não foi possível salvar o cadastro clínico." },
      { status: 500 }
    );
  }
}
