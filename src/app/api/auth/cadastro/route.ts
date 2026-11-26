import { confirmationRedirectUrl } from "@/lib/auth/confirmation-origin";
import { isValidNewPassword, PASSWORD_REQUIREMENTS } from "@/lib/validation/password-policy";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseUbsChoice } from "@/lib/validation/ubs-choice";
import { isDeclaredProfession } from "@/lib/validation/demo-onboarding";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import {
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import {
  normalizeBirthDate,
} from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUESTED_PROFILE = "equipe_ubs";

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
    maxBytes: 32 * 1024,
    contentTypes: ["application/json"],
  });
  if (requestError) return requestError;

  let createdUserId: string | null = null;

  try {
    const body = await readJsonObject(request, 32 * 1024);
    if (!body) {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    const nomeCompleto = String(body.nomeCompleto ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const dataNascimento = normalizeBirthDate(body.dataNascimento);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password =
      typeof body.password === "string" ? body.password : "";
    const selfService = process.env.GESTARIO_SELF_SERVICE_CLINICAL === "1";
    const autonomous = !selfService && process.env.GESTARIO_AUTONOMOUS_SIGNUP === "1";
    const optionalUbs=!selfService&&(autonomous||process.env.GESTARIO_UBS_OPTIONAL==="1");
    const ubsId=parseUbsChoice(body.ubsId,optionalUbs,autonomous);
    const profession = String(body.profissao ?? "");

    if (nomeCompleto.length < 5 || nomeCompleto.length > 160) {
      return NextResponse.json(
        { error: "Informe o nome completo." },
        { status: 400 }
      );
    }

    if (selfService && body.workspaceNoticeAccepted !== true) {
      return NextResponse.json({ error: "Confirme as condições de uso do seu espaço individual." }, { status: 400 });
    }
    if (autonomous && !isDeclaredProfession(profession)) {
      return NextResponse.json({ error: "Selecione uma profissão válida." }, { status: 400 });
    }
    if (!autonomous && !dataNascimento) {
      return NextResponse.json(
        {
          error:
            "Informe uma data de nascimento válida no formato DD/MM/AAAA.",
        },
        { status: 400 }
      );
    }

    if (
      email.length < 3 ||
      email.length > 254 ||
      !email.includes("@")
    ) {
      return NextResponse.json(
        { error: "Informe um e-mail válido." },
        { status: 400 }
      );
    }

    if (
      !isValidNewPassword(password)
    ) {
      return NextResponse.json(
        {
          error:
            PASSWORD_REQUIREMENTS,
        },
        { status: 400 }
      );
    }

    if (ubsId === undefined) {
      return NextResponse.json(
        { error: "Selecione uma UBS válida." },
        { status: 400 }
      );
    }

    const [emailAllowed, networkAllowed] =
      await Promise.all([
        consumeRateLimit({
          scope: "public-signup-email",
          actorKey: email,
          limit: 3,
          windowSeconds: 3600,
        }),
        consumeRateLimit({
          scope: "public-signup-network",
          actorKey: clientKey(request),
          limit: 20,
          windowSeconds: 3600,
        }),
      ]);

    if (!emailAllowed || !networkAllowed) {
      return NextResponse.json(
        {
          error:
            "Muitas tentativas de cadastro. Tente novamente mais tarde.",
        },
        { status: 429 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const secret = process.env.SUPABASE_SECRET_KEY;

    // Preview uses public signup, never a copied administrative credential.
    const publicPreviewSignup = process.env.VERCEL_ENV === "preview" && !secret;
    if ((selfService || autonomous || publicPreviewSignup) && url && publishableKey) {
      const auth = createAdminClient(url, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      if (ubsId) {
        const { data: ubs, error: ubsError } = await auth.from("ubs").select("id").eq("id", ubsId).eq("ativa", true).maybeSingle();
        if (ubsError) throw ubsError;
        if (!ubs) return NextResponse.json({ error: "Selecione uma UBS ativa." }, { status: 400 });
      }
      // Metadata is only a prefill hint, never proof of authorization or term acceptance.
      const { data: signupData, error } = await auth.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: confirmationRedirectUrl(request.url),
          data: { full_name: nomeCompleto, ...(autonomous ? { profissao_declarada: profession } : { data_nascimento_declarada: dataNascimento, cadastro_email_v1: true, workspace_notice_v32: selfService && body.workspaceNoticeAccepted === true }), ubs_declarada: ubsId ?? "" },
        },
      });
      if (error) {
        if (error.status === 429) return NextResponse.json({ error: "Muitas tentativas. Tente mais tarde." }, { status: 429 });
        if (!["user_already_exists", "email_exists"].includes(error.code ?? "")) {
          logServerFailure("signup-public", error);
          return NextResponse.json({ error: "Não foi possível concluir o cadastro." }, { status: 400 });
        }
      }
      if (signupData.session) {
        await auth.auth.signOut();
        logServerFailure("signup-confirmation-config");
        return NextResponse.json({ error: "Confirmação de e-mail indisponível. Procure o suporte." }, { status: 503 });
      }
      return NextResponse.json({ ok: true, completeAfterConfirmation: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (selfService || !url || !publishableKey || !secret) {
      logServerFailure("signup-config");
      return NextResponse.json(
        { error: "Cadastro temporariamente indisponível." },
        { status: 503 }
      );
    }

    const admin = createAdminClient(url, secret, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const publicAuth = createAdminClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    if (ubsId !== null) {
    const { data: ubs, error: ubsError } = await publicAuth
      .from("ubs")
      .select("id")
      .eq("id", ubsId)
      .eq("ativa", true)
      .maybeSingle();

    if (ubsError) {
      throw ubsError;
    }

    if (!ubs) {
      return NextResponse.json(
        {
          error:
            "A UBS selecionada não foi encontrada ou está desativada.",
        },
        { status: 400 }
      );
    }

    }
    const confirmationRedirect =
      confirmationRedirectUrl(request.url);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    });

    if (error || !data.user) {
      const normalizedMessage = error?.message?.toLowerCase() ?? "";
      const duplicate =
        normalizedMessage.includes("already") ||
        normalizedMessage.includes("registered");

      if (duplicate) {
        // Mantém resposta neutra e, se a conta ainda estiver sem
        // confirmação, permite que o Supabase reenvie o link.
        await publicAuth.auth.resend({
          type: "signup",
          email,
          options: {
            emailRedirectTo: confirmationRedirect,
          },
        });

        return NextResponse.json(
          { ok: true },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      return NextResponse.json(
        { error: "Não foi possível criar a conta." },
        { status: 400 }
      );
    }

    createdUserId = data.user.id;

    const { error: confirmationError } =
      await publicAuth.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: confirmationRedirect,
        },
      });

    if (confirmationError) {
      throw confirmationError;
    }

    const { error: profileError } = await admin
      .from("perfis")
      .upsert(
        {
          id: data.user.id,
          nome_completo: nomeCompleto,
          email,
          perfil: "aluno",
          status: "ativo",
          ativo: true,
          primeiro_acesso: false,
          data_nascimento: dataNascimento,
          cadastro_completo: true,
          aprovacao_status: "pendente",
          perfil_solicitado: REQUESTED_PROFILE,
          ubs_id: null,
          ubs_solicitada_id: ubsId,
          origem_cadastro: "email",
          solicitado_em: new Date().toISOString(),
          microarea_id: null,
          aprovado_em: null,
          aprovado_por: null,
          perfil_excluido_em: null,
          perfil_excluido_por: null,
        },
        { onConflict: "id" }
      );

    if (profileError) {
      throw profileError;
    }

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (createdUserId) {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const secret = process.env.SUPABASE_SECRET_KEY;

        if (url && secret) {
          const admin = createAdminClient(url, secret, {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          });

          await admin.auth.admin.deleteUser(createdUserId);
        }
      } catch (cleanupError) {
        logServerFailure("signup-cleanup", cleanupError);
      }
    }

    logServerFailure("signup", error);
    return NextResponse.json(
      { error: "Não foi possível criar a conta." },
      { status: 500 }
    );
  }
}
