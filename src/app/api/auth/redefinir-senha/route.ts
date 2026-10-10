import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import {
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

  const password =
    typeof body.password === "string" ? body.password : "";

  if (
    password.length < 10 ||
    password.length > 128 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return NextResponse.json(
      {
        error:
          "A senha deve ter de 10 a 128 caracteres, com letras e números.",
      },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error:
            "O link de redefinição expirou ou não é mais válido.",
        },
        { status: 401 }
      );
    }

    const allowed = await consumeRateLimit({
      scope: "password-update",
      actorKey: user.id,
      limit: 5,
      windowSeconds: 900,
    });

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        },
        { status: 429 }
      );
    }

    const { error: updateError } =
      await supabase.auth.updateUser({ password });

    if (updateError) {
      logServerFailure("password-update", updateError);
      return NextResponse.json(
        { error: "Não foi possível atualizar a senha." },
        { status: 400 }
      );
    }

    await supabase.auth.signOut();

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logServerFailure("password-update", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a senha." },
      { status: 500 }
    );
  }
}
