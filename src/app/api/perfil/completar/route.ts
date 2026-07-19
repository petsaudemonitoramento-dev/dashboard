import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";
import {
  isUuid,
  normalizeBirthDate,
} from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PROFILES = new Set([
  "administrador",
  "profissional_ubs",
  "acs",
  "aluno",
]);

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json(
        { error: "Sessão expirada. Entre novamente." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const nomeCompleto = String(body.nomeCompleto ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const dataNascimento = normalizeBirthDate(body.dataNascimento);
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

    if (!ALLOWED_PROFILES.has(perfilSolicitado)) {
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
        ${user.id}::uuid,
        ${nomeCompleto},
        ${user.email.toLowerCase()},
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
        'google',
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
        origem_cadastro = 'google',
        solicitado_em = now(),
        aprovado_em = null,
        aprovado_por = null,
        perfil_excluido_em = null,
        perfil_excluido_por = null,
        microarea_id = null
    `;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;

    if (url && secret) {
      const admin = createAdminClient(url, secret, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          nome_completo: nomeCompleto,
          perfil_solicitado: perfilSolicitado,
          ubs_solicitada_id: ubsId,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao completar perfil:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível completar o perfil.",
      },
      { status: 500 }
    );
  }
}
