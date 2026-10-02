import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";
import {
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { isUuid } from "@/lib/validation/profile-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const ACTIONS = new Set([
  "create_ubs",
  "update_ubs",
  "toggle_ubs",
  "create_microarea",
  "update_microarea",
  "toggle_microarea",
]);

function clean(value: unknown, max = 160): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: 32 * 1024,
    contentTypes: ["application/json"],
  });
  if (requestError) return requestError;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Sessão expirada." },
        { status: 401 }
      );
    }

    const sql = getPostgresClient();
    const adminRows = await sql`
      select private.usuario_admin_v20(${user.id}::uuid) as autorizado
    `;

    if (!adminRows[0]?.autorizado) {
      return NextResponse.json(
        { error: "Apenas a gestão pode alterar UBS e microáreas." },
        { status: 403 }
      );
    }

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }
    const action = String(body.action ?? "");

    if (!ACTIONS.has(action)) {
      return NextResponse.json(
        { error: "Operação inválida." },
        { status: 400 }
      );
    }

    if (action === "create_ubs") {
      const nome = clean(body.nome);

      if (nome.length < 3) {
        return NextResponse.json(
          { error: "Informe o nome da UBS." },
          { status: 400 }
        );
      }

      await sql`
        insert into public.ubs (nome, ativa)
        values (${nome}, true)
      `;
    }

    if (action === "update_ubs") {
      const id = String(body.id ?? "");
      const nome = clean(body.nome);

      if (!isUuid(id) || nome.length < 3) {
        return NextResponse.json(
          { error: "Dados da UBS inválidos." },
          { status: 400 }
        );
      }

      await sql`
        update public.ubs
        set nome = ${nome}
        where id = ${id}::uuid
      `;
    }

    if (action === "toggle_ubs") {
      const id = String(body.id ?? "");

      if (!isUuid(id)) {
        return NextResponse.json(
          { error: "UBS inválida." },
          { status: 400 }
        );
      }

      await sql`
        update public.ubs
        set ativa = ${body.ativa === true}
        where id = ${id}::uuid
      `;
    }

    if (action === "create_microarea") {
      const ubsId = String(body.ubsId ?? "");
      const codigo = clean(body.codigo, 30);
      const nome = clean(body.nome, 120);

      if (!isUuid(ubsId) || !codigo) {
        return NextResponse.json(
          { error: "Informe a UBS e o código da microárea." },
          { status: 400 }
        );
      }

      await sql`
        insert into public.microareas (
          ubs_id,
          codigo,
          nome,
          ativa
        )
        values (
          ${ubsId}::uuid,
          ${codigo},
          ${nome || null},
          true
        )
      `;
    }

    if (action === "update_microarea") {
      const id = String(body.id ?? "");
      const codigo = clean(body.codigo, 30);
      const nome = clean(body.nome, 120);

      if (!isUuid(id) || !codigo) {
        return NextResponse.json(
          { error: "Dados da microárea inválidos." },
          { status: 400 }
        );
      }

      await sql`
        update public.microareas
        set
          codigo = ${codigo},
          nome = ${nome || null}
        where id = ${id}::uuid
      `;
    }

    if (action === "toggle_microarea") {
      const id = String(body.id ?? "");

      if (!isUuid(id)) {
        return NextResponse.json(
          { error: "Microárea inválida." },
          { status: 400 }
        );
      }

      await sql`
        update public.microareas
        set ativa = ${body.ativa === true}
        where id = ${id}::uuid
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const duplicate =
      error instanceof Error &&
      error.message.toLowerCase().includes("unique");

    if (duplicate) {
      return NextResponse.json(
        { error: "Já existe uma UBS ou microárea com estes dados." },
        { status: 409 }
      );
    }

    logServerFailure("admin-ubs", error);
    return NextResponse.json(
      { error: "Não foi possível concluir a operação." },
      { status: 500 }
    );
  }
}
