import { NextResponse } from "next/server";
import {
  isUuid,
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_AUDIENCES = new Set([
  "todos",
  "profissionais",
  "acs",
  "gestao",
]);

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

    if (!user) {
      return NextResponse.json(
        { error: "Sessão expirada." },
        { status: 401 }
      );
    }

    const body = await readJsonObject(request, 24 * 1024);
    if (!body) {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    const titulo = String(body.titulo ?? "").trim();
    const mensagem = String(body.mensagem ?? "").trim();
    const tipo = String(body.tipo ?? "informativo").trim();
    const publico = String(body.publico ?? "todos").trim();
    const ubsId = String(body.ubsId ?? "").trim();

    if (
      titulo.length < 1 ||
      titulo.length > 120 ||
      mensagem.length < 1 ||
      mensagem.length > 1500 ||
      !["informativo", "alerta", "sucesso"].includes(tipo) ||
      !ALLOWED_AUDIENCES.has(publico) ||
      !isUuid(ubsId)
    ) {
      return NextResponse.json(
        { error: "Dados do aviso inválidos." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "profissionais_admin_publicar_aviso_v30",
      {
        p_ubs_id: ubsId,
        p_titulo: titulo,
        p_mensagem: mensagem,
        p_tipo: tipo,
        p_publico: publico,
      }
    );

    if (error) {
      if (error.message.includes("ADMIN_FORBIDDEN")) {
        return NextResponse.json(
          { error: "Ação administrativa não autorizada." },
          { status: 403 }
        );
      }

      if (error.message.includes("INVALID_NOTICE")) {
        return NextResponse.json(
          { error: "Dados do aviso inválidos." },
          { status: 400 }
        );
      }

      logServerFailure("notice-create", error);
      return NextResponse.json(
        { error: "Não foi possível publicar o aviso." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, id: data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logServerFailure("notice-create", error);
    return NextResponse.json(
      { error: "Não foi possível publicar o aviso." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const requestError = mutationRequestError(request);
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

    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: "Aviso inválido." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "profissionais_admin_remover_aviso_v30",
      { p_aviso_id: id }
    );

    if (error) {
      if (error.message.includes("ADMIN_FORBIDDEN")) {
        return NextResponse.json(
          { error: "Ação administrativa não autorizada." },
          { status: 403 }
        );
      }

      logServerFailure("notice-delete", error);
      return NextResponse.json(
        { error: "Não foi possível remover o aviso." },
        { status: 500 }
      );
    }

    if (data !== true) {
      return NextResponse.json(
        { error: "Aviso não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logServerFailure("notice-delete", error);
    return NextResponse.json(
      { error: "Não foi possível remover o aviso." },
      { status: 500 }
    );
  }
}
