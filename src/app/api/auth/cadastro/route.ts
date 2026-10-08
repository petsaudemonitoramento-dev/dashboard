import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import {
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import {
  isUuid,
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
    const body = await readJsonObject(request);
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
    const ubsId = String(body.ubsId ?? "").trim();

    if (nomeCompleto.length < 5 || nomeCompleto.length > 160) {
      return NextResponse.json(
        { error: "Informe o nome completo." },
        { status: 400 }
      );
    }

    if (!dataNascimento) {
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

    if (!isUuid(ubsId)) {
      return NextResponse.json(
        { error: "Selecione uma UBS válida." },
        { status: 400 }
      );
    }

    const allowed = await consumeRateLimit({
      scope: "public-signup-api",
      actorKey: `${clientKey(request)}:${email}`,
      limit: 10,
      windowSeconds: 3600,
    });

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Muitas tentativas de cadastro. Tente novamente mais tarde.",
        },
        { status: 429 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;

    if (!url || !secret) {
      logServerFailure("signup-config");
      return NextResponse.json(
        { error: "Cadastro temporariamente indisponível." },
        { status: 503 }
      );
    }

    const sql = getPostgresClient();
    const ubsRows = await sql`
      select id
      from public.ubs
      where id = ${ubsId}::uuid
        and ativa = true
      limit 1
    `;

    if (!ubsRows[0]) {
      return NextResponse.json(
        {
          error:
            "A UBS selecionada não foi encontrada ou está desativada.",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient(url, secret, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      const normalizedMessage = error?.message?.toLowerCase() ?? "";
      const duplicate =
        normalizedMessage.includes("already") ||
        normalizedMessage.includes("registered");

      return NextResponse.json(
        {
          error: duplicate
            ? "Já existe uma conta com este e-mail."
            : "Não foi possível criar a conta.",
        },
        { status: duplicate ? 409 : 400 }
      );
    }

    createdUserId = data.user.id;

    await sql`
      insert into public.perfis (
        id,
        nome_completo,
        email,
        perfil,
        status,
        ativo,
        primeiro_acesso,
        data_nascimento,
        cadastro_completo,
        aprovacao_status,
        perfil_solicitado,
        ubs_id,
        ubs_solicitada_id,
        origem_cadastro,
        solicitado_em,
        microarea_id
      )
      values (
        ${data.user.id}::uuid,
        ${nomeCompleto},
        ${email},
        'aluno'::public.perfil_usuario,
        'ativo',
        true,
        false,
        ${dataNascimento}::date,
        true,
        'pendente',
        ${REQUESTED_PROFILE},
        null,
        ${ubsId}::uuid,
        'email',
        now(),
        null
      )
      on conflict (id)
      do update set
        nome_completo = excluded.nome_completo,
        email = excluded.email,
        perfil = 'aluno'::public.perfil_usuario,
        status = 'ativo',
        ativo = true,
        primeiro_acesso = false,
        data_nascimento = excluded.data_nascimento,
        cadastro_completo = true,
        aprovacao_status = 'pendente',
        perfil_solicitado = ${REQUESTED_PROFILE},
        ubs_id = null,
        ubs_solicitada_id = excluded.ubs_solicitada_id,
        origem_cadastro = 'email',
        solicitado_em = now(),
        aprovado_em = null,
        aprovado_por = null,
        perfil_excluido_em = null,
        perfil_excluido_por = null,
        microarea_id = null
    `;

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
