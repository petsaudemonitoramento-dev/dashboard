import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostgresClient } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  action?: "trash" | "restore" | "delete_permanently";
  gestanteId?: string;
  confirmed?: boolean;
};

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

    const body = (await request.json()) as RequestBody;
    const action = body.action;
    const gestanteId = String(body.gestanteId ?? "").trim();

    if (!gestanteId) {
      return NextResponse.json(
        { error: "Gestante não informada." },
        { status: 400 }
      );
    }

    const sql = getPostgresClient();

    if (action === "trash") {
      const rows = await sql`
        select private.mover_gestante_lixeira_v19(
          ${user.id}::uuid,
          ${gestanteId}::uuid,
          'Exclusão solicitada pela profissional'
        ) as resultado
      `;
      return NextResponse.json(rows[0]?.resultado ?? { ok: true });
    }

    if (action === "restore") {
      const rows = await sql`
        select private.restaurar_gestante_v19(
          ${user.id}::uuid,
          ${gestanteId}::uuid
        ) as resultado
      `;
      return NextResponse.json(rows[0]?.resultado ?? { ok: true });
    }

    if (action === "delete_permanently") {
      if (body.confirmed !== true) {
        return NextResponse.json(
          { error: "A confirmação da exclusão definitiva é obrigatória." },
          { status: 400 }
        );
      }

      const rows = await sql`
        select private.excluir_gestante_definitivamente_v19(
          ${user.id}::uuid,
          ${gestanteId}::uuid,
          true
        ) as resultado
      `;
      return NextResponse.json(rows[0]?.resultado ?? { ok: true });
    }

    return NextResponse.json(
      { error: "Ação inválida." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Erro na lixeira de gestantes:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível concluir a operação.",
      },
      { status: 500 }
    );
  }
}
