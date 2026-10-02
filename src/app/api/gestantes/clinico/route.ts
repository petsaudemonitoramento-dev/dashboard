import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import {
  isUuid,
  logServerFailure,
  mutationRequestError,
  readJsonObject,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { sanitizeClinicalPayload } from "@/lib/validation/clinical-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CLINICAL_BODY = 1024 * 1024;

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: MAX_CLINICAL_BODY,
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
        scope: "clinical-save",
        actorKey: user.id,
        limit: 120,
        windowSeconds: 300,
      }))
    ) {
      return NextResponse.json(
        { error: "Muitas alterações em pouco tempo. Tente novamente em alguns minutos." },
        { status: 429 }
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
      payload = sanitizeClinicalPayload(rawPayload);
    } catch {
      return NextResponse.json(
        { error: "Revise os campos do cadastro clínico." },
        { status: 400 }
      );
    }

    const existingId =
      typeof payload.id === "string" ? payload.id : null;

    if (existingId && !isUuid(existingId)) {
      return NextResponse.json(
        { error: "Identificador de gestante inválido." },
        { status: 400 }
      );
    }

    const sql = getPostgresClient();

    if (existingId) {
      const accessRows = await sql<{ autorizado: boolean }[]>`
        select exists (
          select 1
          from public.pec_gestantes g
          join public.perfis p
            on p.id = ${user.id}::uuid
          where g.id = ${existingId}::uuid
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
      resultado: {
        id: string;
        codigo: string;
        acao: string;
      };
    }[]>`
      select private.salvar_gestante_clinica_v30(
        ${user.id}::uuid,
        ${sql.json(payload)}
      ) as resultado
    `;

    return NextResponse.json(rows[0]?.resultado ?? {}, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "";

    const duplicateMatch = message.match(
      /GESTANTE_DUPLICADA:([0-9a-f-]{36})/i
    );

    if (duplicateMatch && isUuid(duplicateMatch[1])) {
      return NextResponse.json(
        {
          error:
            "Já existe uma gestante com os mesmos identificadores nesta UBS.",
          existingId: duplicateMatch[1],
        },
        { status: 409 }
      );
    }

    logServerFailure("clinical-save", error);
    return NextResponse.json(
      { error: "Não foi possível salvar o cadastro clínico." },
      { status: 500 }
    );
  }
}
