import { NextResponse } from "next/server";
import {
  isUuid,
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrashAction =
  | "trash"
  | "restore"
  | "delete_permanently";

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: 16 * 1024,
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
        { error: "Sessão expirada. Entre novamente." },
        { status: 401 }
      );
    }

    if (
      !(await consumeRateLimit({
        scope: "clinical-trash",
        actorKey: user.id,
        limit: 30,
        windowSeconds: 300,
      }))
    ) {
      return NextResponse.json(
        { error: "Muitas operações em pouco tempo. Tente novamente em alguns minutos." },
        { status: 429 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("perfis")
      .select(
        "perfil, status, ativo, cadastro_completo, aprovacao_status, perfil_excluido_em"
      )
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.perfil !== "equipe_ubs" ||
      profile.status !== "ativo" ||
      !profile.ativo ||
      profile.cadastro_completo !== true ||
      profile.aprovacao_status !== "aprovado" ||
      profile.perfil_excluido_em !== null
    ) {
      return NextResponse.json(
        { error: "Perfil profissional não autorizado." },
        { status: 403 }
      );
    }

    const body = await readJsonObject(request, 16 * 1024);
    if (!body) {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    const action =
      typeof body.action === "string"
        ? (body.action as TrashAction)
        : null;
    const gestanteId =
      typeof body.gestanteId === "string"
        ? body.gestanteId.trim()
        : "";

    if (
      !["trash", "restore", "delete_permanently"].includes(
        action ?? ""
      ) ||
      !isUuid(gestanteId)
    ) {
      return NextResponse.json(
        { error: "Operação inválida." },
        { status: 400 }
      );
    }

    if (action === "trash") {
      const { data: resultado, error: operationError } =
        await supabase.rpc(
          "profissionais_mover_gestante_lixeira_v30",
          { p_gestante_id: gestanteId }
        );

      if (operationError) throw operationError;

      return NextResponse.json(
        resultado ?? { ok: true },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (action === "restore") {
      const { data: resultado, error: operationError } =
        await supabase.rpc(
          "profissionais_restaurar_gestante_v30",
          { p_gestante_id: gestanteId }
        );

      if (operationError) throw operationError;

      return NextResponse.json(
        resultado ?? { ok: true },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (body.confirmed !== true) {
      return NextResponse.json(
        { error: "A confirmação da exclusão definitiva é obrigatória." },
        { status: 400 }
      );
    }

    const { data: resultado, error: operationError } =
      await supabase.rpc(
        "profissionais_excluir_gestante_definitivamente_v30",
        {
          p_gestante_id: gestanteId,
          p_confirmed: true,
        }
      );

    if (operationError) throw operationError;

    return NextResponse.json(
      resultado ?? { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logServerFailure("clinical-trash", error);
    return NextResponse.json(
      { error: "Não foi possível concluir a operação." },
      { status: 500 }
    );
  }
}
