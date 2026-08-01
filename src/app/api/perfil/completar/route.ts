import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { isPublicRequestableProfile } from "@/lib/auth/roles";
import {
  parseProfessionalCredential,
  type ProfessionalCredentialInput,
} from "@/lib/auth/professional-credentials";
import { createClient } from "@/lib/supabase/server";
import {
  isUuid,
  normalizeBirthDate,
} from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const userEmail = user.email.toLowerCase();

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

    if (!isPublicRequestableProfile(perfilSolicitado)) {
      return NextResponse.json(
        { error: "Perfil solicitado inválido." },
        { status: 400 }
      );
    }

    let credential: ProfessionalCredentialInput | null;

    try {
      credential = parseProfessionalCredential(body, perfilSolicitado);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Credencial profissional inválida.",
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

    await sql.begin(async (transaction) => {
      await transaction`
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
          microarea_id,
          cargo_funcao
        )
        values (
        ${user.id}::uuid,
        ${nomeCompleto},
        ${userEmail},
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
          null,
          ${credential?.cargoFuncao ?? null}
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
          microarea_id = null,
          cargo_funcao = excluded.cargo_funcao
      `;

      if (credential) {
        await transaction`
          select private.submeter_credencial_profissional_v22(
            ${user.id}::uuid,
            ${credential.cargoFuncao},
            ${credential.conselho},
            ${credential.uf},
            ${credential.numeroRegistro},
            ${credential.categoria}
          )
        `;
      }
    });

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
  } catch {
    console.error("Erro ao completar perfil pendente.");

    return NextResponse.json(
      {
        error: "Não foi possível completar o perfil.",
      },
      { status: 500 }
    );
  }
}
