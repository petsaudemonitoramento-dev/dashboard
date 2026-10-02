import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

    const payload = await request.json();

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    const sql = getPostgresClient();
    const existingId =
      typeof payload.id === "string" && payload.id
        ? payload.id
        : null;

    if (existingId) {
      const accessRows = await sql<{ autorizado: boolean }[]>`
        select exists (
          select 1
          from public.pec_gestantes g
          join public.perfis p on p.id = ${user.id}::uuid
          where g.id = ${existingId}::uuid
            and g.excluida_em is null
            and p.ativo = true
            and p.status = 'ativo'
            and (
              p.perfil = 'administrador'
              or (
                g.ubs_id = p.ubs_id
                and g.profissional_responsavel_id = p.id
              )
            )
        ) as autorizado
      `;

      if (!accessRows[0]?.autorizado) {
        return NextResponse.json(
          {
            error:
              "Esta gestante não está vinculada à sua responsabilidade profissional.",
          },
          { status: 403 }
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

    return NextResponse.json(rows[0]?.resultado ?? {});
  } catch (error) {
    console.error("Erro ao salvar cadastro clínico:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível salvar o cadastro clínico.";

    const duplicateMatch = message.match(
      /GESTANTE_DUPLICADA:([0-9a-f-]{36})/i
    );

    if (duplicateMatch) {
      return NextResponse.json(
        {
          error:
            "Já existe uma gestante com os mesmos identificadores nesta UBS.",
          existingId: duplicateMatch[1],
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
