import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import {
  isUuid,
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRiskPayload } from "@/lib/validation/clinical-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RISK_BODY = 256 * 1024;

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: MAX_RISK_BODY,
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

    const rawPayload = await readJsonObject(request);
    if (!rawPayload) {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = sanitizeRiskPayload(rawPayload);
    } catch {
      return NextResponse.json(
        { error: "Revise os campos da classificação." },
        { status: 400 }
      );
    }

    const gestanteId =
      typeof payload.gestanteId === "string"
        ? payload.gestanteId
        : null;

    if (gestanteId && !isUuid(gestanteId)) {
      return NextResponse.json(
        { error: "Identificador de gestante inválido." },
        { status: 400 }
      );
    }

    const sql = getPostgresClient();

    if (gestanteId) {
      const accessRows = await sql<{ autorizado: boolean }[]>`
        select exists (
          select 1
          from public.pec_gestantes g
          join public.perfis p on p.id = ${user.id}::uuid
          where g.id = ${gestanteId}::uuid
            and g.excluida_em is null
            and g.profissional_responsavel_id = p.id
            and g.ubs_id = p.ubs_id
            and p.perfil = 'equipe_ubs'::public.perfil_usuario
            and p.cadastro_completo = true
            and p.aprovacao_status = 'aprovado'
            and p.status = 'ativo'::public.status_usuario
            and p.ativo = true
            and p.perfil_excluido_em is null
        ) as autorizado
      `;

      if (!accessRows[0]?.autorizado) {
        return NextResponse.json(
          { error: "Cadastro não encontrado." },
          { status: 404 }
        );
      }
    }

    const rows = await sql<{
      resultado: Record<string, unknown>;
    }[]>`
      select private.salvar_classificacao_risco_v30(
        ${user.id}::uuid,
        ${sql.json(payload)}
      ) as resultado
    `;

    return NextResponse.json(rows[0]?.resultado ?? {}, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerFailure("risk-classification-save", error);
    return NextResponse.json(
      { error: "Não foi possível salvar a classificação." },
      { status: 500 }
    );
  }
}
