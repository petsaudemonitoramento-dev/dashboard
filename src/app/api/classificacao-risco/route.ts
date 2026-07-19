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
        { error: "Sessão expirada." },
        { status: 401 }
      );
    }

    const payload = await request.json();
    const sql = getPostgresClient();
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
