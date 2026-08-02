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
    const { sql, user } = context;
    const gestanteId =
      typeof payload?.gestanteId === "string" && payload.gestanteId
        ? payload.gestanteId
        : null;

    if (gestanteId) {
      const accessRows = await sql<{ autorizado: boolean }[]>`
        select exists (
          select 1
          from public.pec_gestantes g
          join public.perfis p on p.id = ${user.id}::uuid
          where g.id = ${gestanteId}::uuid
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
      resultado: Record<string, unknown>;
    }[]>`
      select private.salvar_classificacao_risco_v17(
        ${user.id}::uuid,
        ${sql.json(payload)}
      ) as resultado
    `;

    return NextResponse.json(rows[0]?.resultado ?? {});
  } catch (error) {
    console.error("Erro ao salvar classificação:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar a classificação.",
      },
      { status: 500 }
    );
  }
}
