import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import {
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";
import {
  isUuid,
  normalizeBirthDate,
} from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUESTED_PROFILE = "equipe_ubs";

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: 24 * 1024,
    contentTypes: ["application/json"],
  });
  if (requestError) return requestError;

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

    if (!isUuid(ubsId)) {
      return NextResponse.json(
        { error: "Selecione uma UBS válida." },
        { status: 400 }
      );
    }

    const sql = getPostgresClient();

    const existingRows = await sql`
      select
        aprovacao_status,
        perfil_excluido_em
      from public.perfis
      where id = ${user.id}::uuid
      limit 1
    `;
    const existing = existingRows[0];

    if (
      existing?.aprovacao_status === "desativado" ||
      existing?.perfil_excluido_em
    ) {
      return NextResponse.json(
        { error: "Este acesso está desativado." },
        { status: 403 }
      );
    }

    if (existing?.aprovacao_status === "aprovado") {
      return NextResponse.json(
        { error: "O cadastro já está aprovado." },
        { status: 409 }
      );
    }

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
        ${REQUESTED_PROFILE},
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
        perfil_solicitado = ${REQUESTED_PROFILE},
        ubs_id = null,
        ubs_solicitada_id = excluded.ubs_solicitada_id,
        origem_cadastro = 'google',
        solicitado_em = now(),
        aprovado_em = null,
        aprovado_por = null,
        microarea_id = null
    `;

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logServerFailure("profile-completion", error);
    return NextResponse.json(
      { error: "Não foi possível completar o perfil." },
      { status: 500 }
    );
  }
}
