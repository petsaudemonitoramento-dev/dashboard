import { NextResponse } from "next/server";
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

    const body = await readJsonObject(request, 24 * 1024);
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

    const { data: existing, error: profileError } = await supabase
      .from("perfis")
      .select("aprovacao_status, perfil_excluido_em, ativo")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (
      existing?.aprovacao_status === "desativado" ||
      existing?.perfil_excluido_em ||
      existing?.ativo === false
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

    const { data: ubs, error: ubsError } = await supabase
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

    const { error: completionError } = await supabase.rpc(
      "profissionais_completar_perfil_v30",
      {
        p_nome_completo: nomeCompleto,
        p_data_nascimento: dataNascimento,
        p_ubs_id: ubsId,
      }
    );

    if (completionError) {
      throw completionError;
    }

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
