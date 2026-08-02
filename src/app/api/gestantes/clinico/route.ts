import { NextResponse } from "next/server";
import { getClinicalTeamContext } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await getClinicalTeamContext();
    if (!context) {
      return NextResponse.json(
        { error: "Acesso clínico permitido somente à equipe elegível da UBS." },
        { status: 403 }
      );
    }

    const payload = await request.json();

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    const { sql, user } = context;
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
            and g.ubs_id = p.ubs_id
            and private.usuario_equipe_clinica_elegivel_v23(p.id, g.ubs_id)
        ) as autorizado
      `;

      if (!accessRows[0]?.autorizado) {
        return NextResponse.json(
          {
            error:
              "Esta gestante não pertence à UBS autorizada.",
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
      select private.salvar_gestante_clinica(
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
