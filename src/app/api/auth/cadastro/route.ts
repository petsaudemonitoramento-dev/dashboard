import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { isPublicRequestableProfile } from "@/lib/auth/roles";
import {
  isUuid,
  normalizeBirthDate,
} from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let createdUserId: string | null = null;

  try {
    const body = await request.json();
    const nomeCompleto = String(body.nomeCompleto ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const dataNascimento = normalizeBirthDate(body.dataNascimento);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const perfilSolicitado = String(body.perfilSolicitado ?? "").trim();
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

    if (!email.includes("@") || email.length > 254) {
      return NextResponse.json(
        { error: "Informe um e-mail válido." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "A senha precisa ter pelo menos 8 caracteres." },
        { status: 400 }
      );
    }

    if (!isPublicRequestableProfile(perfilSolicitado)) {
      return NextResponse.json(
        { error: "Perfil solicitado inválido." },
        { status: 400 }
      );
    }

    if (!isUuid(ubsId)) {
      return NextResponse.json(
        { error: "Selecione uma UBS válida." },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;

    if (!url || !secret) {
      throw new Error("As credenciais administrativas não estão configuradas.");
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
      user_metadata: {
        nome_completo: nomeCompleto,
        perfil_solicitado: perfilSolicitado,
        ubs_solicitada_id: ubsId,
      },
    });

    if (error || !data.user) {
      const normalizedMessage = error?.message?.toLowerCase() ?? "";
      const message =
        normalizedMessage.includes("already") ||
        normalizedMessage.includes("registered")
          ? "Já existe uma conta com este e-mail."
          : error?.message ?? "Não foi possível criar a conta.";

      return NextResponse.json({ error: message }, { status: 400 });
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
        ${perfilSolicitado},
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
        perfil_solicitado = excluded.perfil_solicitado,
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao criar conta:", error);

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
        console.error("Erro ao desfazer usuário incompleto:", cleanupError);
      }
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível criar a conta.",
      },
      { status: 500 }
    );
  }
}
