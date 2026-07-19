import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_AUDIENCES = new Set([
  "todos",
  "profissionais",
  "acs",
  "gestao",
]);

async function authenticatedAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const sql = getPostgresClient();
  const rows = await sql`
    select private.usuario_admin_v20(${user.id}::uuid) as autorizado
  `;

  return rows[0]?.autorizado ? { user, sql } : null;
}

export async function POST(request: Request) {
  try {
    const context = await authenticatedAdmin();

    if (!context) {
      return NextResponse.json(
        { error: "Apenas a gestão pode publicar avisos." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const titulo = String(body.titulo ?? "").trim();
    const mensagem = String(body.mensagem ?? "").trim();
    const tipo = String(body.tipo ?? "informativo").trim();
    const publico = String(body.publico ?? "todos").trim();
    const ubsId = String(body.ubsId ?? "").trim();

    if (!titulo || titulo.length > 120) {
      return NextResponse.json(
        { error: "Informe um título com até 120 caracteres." },
        { status: 400 }
      );
    }

    if (!mensagem || mensagem.length > 1500) {
      return NextResponse.json(
        { error: "Informe uma mensagem com até 1.500 caracteres." },
        { status: 400 }
      );
    }

    if (!["informativo", "alerta", "sucesso"].includes(tipo)) {
      return NextResponse.json(
        { error: "Tipo de aviso inválido." },
        { status: 400 }
      );
    }

    if (!ALLOWED_AUDIENCES.has(publico)) {
      return NextResponse.json(
        { error: "Público do aviso inválido." },
        { status: 400 }
      );
    }

    if (!isUuid(ubsId)) {
      return NextResponse.json(
        { error: "Selecione uma UBS válida." },
        { status: 400 }
      );
    }

    const ubsRows = await context.sql`
      select id
      from public.ubs
      where id = ${ubsId}::uuid
        and ativa = true
      limit 1
    `;

    if (!ubsRows[0]) {
      return NextResponse.json(
        { error: "A UBS selecionada não está ativa." },
        { status: 400 }
      );
    }

    const rows = await context.sql`
      insert into public.avisos_ubs (
        ubs_id,
        titulo,
        mensagem,
        tipo,
        publico,
        criado_por
      )
      values (
        ${ubsId}::uuid,
        ${titulo},
        ${mensagem},
        ${tipo},
        ${publico},
        ${context.user.id}::uuid
      )
      returning id
    `;

    await context.sql`
      insert into private.auditoria_avisos_v20 (
        aviso_id,
        usuario_id,
        acao,
        metadados
      )
      values (
        ${rows[0].id}::uuid,
        ${context.user.id}::uuid,
        'publicar_v21',
        ${context.sql.json({ ubsId, tipo, publico })}
      )
    `;

    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch (error) {
    console.error("Erro ao publicar aviso:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível publicar o aviso.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await authenticatedAdmin();

    if (!context) {
      return NextResponse.json(
        { error: "Apenas a gestão pode remover avisos." },
        { status: 403 }
      );
    }

    const id = new URL(request.url).searchParams.get("id") ?? "";

    if (!isUuid(id)) {
      return NextResponse.json(
        { error: "Aviso inválido." },
        { status: 400 }
      );
    }

    const rows = await context.sql`
      update public.avisos_ubs
      set
        removido_em = now(),
        removido_por = ${context.user.id}::uuid
      where id = ${id}::uuid
        and removido_em is null
      returning id
    `;

    if (!rows[0]) {
      return NextResponse.json(
        { error: "Aviso não encontrado." },
        { status: 404 }
      );
    }

    await context.sql`
      insert into private.auditoria_avisos_v20 (
        aviso_id,
        usuario_id,
        acao
      )
      values (
        ${id}::uuid,
        ${context.user.id}::uuid,
        'remover'
      )
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao remover aviso:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível remover o aviso.",
      },
      { status: 500 }
    );
  }
}
