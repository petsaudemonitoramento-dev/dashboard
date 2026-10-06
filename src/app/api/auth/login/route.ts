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

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json(
      { error: "Dados de acesso inválidos." },
      { status: 400 }
    );
  }

  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
  const password =
    typeof body.password === "string"
      ? body.password
      : "";

  if (
    email.length < 3 ||
    email.length > 254 ||
    !email.includes("@") ||
    password.length < 1 ||
    password.length > 128
  ) {
    return NextResponse.json(
      { error: "E-mail ou senha inválidos." },
      { status: 400 }
    );
  }

  try {
    const actorKey = `${clientKey(request)}:${email}`;
    const allowed = await consumeRateLimit({
      scope: "password-login",
      actorKey,
      limit: 8,
      windowSeconds: 900,
    });

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.",
        },
        { status: 429 }
      );
    }

    const supabase = await createClient();
    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logServerFailure("password-login", error);
    return NextResponse.json(
      { error: "Não foi possível realizar o login." },
      { status: 500 }
    );
  }
}
