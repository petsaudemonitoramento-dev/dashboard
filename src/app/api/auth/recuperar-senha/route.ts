import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import {
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";

  return ip.slice(0, 128);
}

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: 16 * 1024,
    contentTypes: ["application/json"],
  });
  if (requestError) return requestError;

  const body = await readJsonObject(request, 16 * 1024);
  if (!body) {
    return NextResponse.json(
      { error: "Dados inválidos." },
      { status: 400 }
    );
  }

  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";

  if (
    email.length < 3 ||
    email.length > 254 ||
    !email.includes("@")
  ) {
    return NextResponse.json(
      {
        ok: true,
        message:
          "Se o e-mail estiver cadastrado, enviaremos as instruções.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const [emailAllowed, networkAllowed] = await Promise.all([
      consumeRateLimit({
        scope: "password-recovery-email",
        actorKey: email,
        limit: 3,
        windowSeconds: 3600,
      }),
      consumeRateLimit({
        scope: "password-recovery-network",
        actorKey: clientKey(request),
        limit: 20,
        windowSeconds: 3600,
      }),
    ]);

    if (!emailAllowed || !networkAllowed) {
      return NextResponse.json(
        {
          error:
            "Muitas solicitações. Aguarde e tente novamente mais tarde.",
        },
        { status: 429 }
      );
    }

    const supabase = await createClient();
    const origin = new URL(request.url).origin;
    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo:
          `${origin}/auth/callback?next=/redefinir-senha`,
      }
    );

    if (error) {
      // Não diferencia conta existente de inexistente.
      logServerFailure("password-recovery", error);
    }

    return NextResponse.json(
      {
        ok: true,
        message:
          "Se o e-mail estiver cadastrado, enviaremos as instruções.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logServerFailure("password-recovery", error);

    // Mantém resposta genérica para evitar enumeração de contas.
    return NextResponse.json(
      {
        ok: true,
        message:
          "Se o e-mail estiver cadastrado, enviaremos as instruções.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
