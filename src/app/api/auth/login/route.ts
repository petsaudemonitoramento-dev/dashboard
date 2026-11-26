import { NextResponse } from "next/server";
import { activateIndividualWorkspace } from "@/lib/auth/individual-workspace";
import { normalizeBirthDate } from "@/lib/validation/profile-input";
import { parseUbsChoice } from "@/lib/validation/ubs-choice";
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
    const [accountAllowed, networkAllowed] =
      await Promise.all([
        consumeRateLimit({
          scope: "password-login-account",
          actorKey: email,
          limit: 8,
          windowSeconds: 900,
        }),
        consumeRateLimit({
          scope: "password-login-network",
          actorKey: clientKey(request),
          limit: 60,
          windowSeconds: 900,
        }),
      ]);

    if (!accountAllowed || !networkAllowed) {
      return NextResponse.json(
        {
          error:
            "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.",
        },
        { status: 429 }
      );
    }

    const supabase = await createClient();
    const { data: loginData, error } =
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

    // Metadata is a self-declared prefill only. The existing authenticated RPC
    // creates a pending profile, never an approved clinical role.
    const user = loginData.user;
    const metadata = user?.user_metadata ?? {};
    if (process.env.GESTARIO_SELF_SERVICE_CLINICAL === "1") {
      await activateIndividualWorkspace(supabase,user);
    } else if (user?.email_confirmed_at && metadata.cadastro_email_v1 === true && process.env.GESTARIO_AUTONOMOUS_SIGNUP !== "1") {
      const nome = String(metadata.full_name ?? "").replace(/\s+/g, " ").trim();
      const nascimento = normalizeBirthDate(metadata.data_nascimento_declarada);
      const ubs = parseUbsChoice(metadata.ubs_declarada, false);
      if (nome.length >= 5 && nome.length <= 160 && nascimento && typeof ubs === "string") {
        const { data: profile, error: profileError } = await supabase.from("perfis").select("cadastro_completo, aprovacao_status, ativo, perfil_excluido_em").eq("id", user.id).maybeSingle();
        if (!profileError && !profile?.cadastro_completo && profile?.aprovacao_status !== "aprovado" && profile?.aprovacao_status !== "desativado" && profile?.ativo !== false && !profile?.perfil_excluido_em) {
          const { data: activeUbs, error: ubsError } = await supabase.from("ubs").select("id").eq("id", ubs).eq("ativa", true).maybeSingle();
          if (!ubsError && activeUbs) {
            const { error: completionError } = await supabase.rpc("profissionais_completar_perfil_v30", { p_nome_completo: nome, p_data_nascimento: nascimento, p_ubs_id: ubs });
            if (completionError) logServerFailure("signup-profile-prefill", completionError);
          }
        }
      }
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
