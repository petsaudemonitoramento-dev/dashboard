import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/profile-input";

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

    const body = await request.json();
    const action = String(body.action ?? "");
    const sql = getPostgresClient();

    if (action === "visita" || action === "nao_encontrada") {
      const gestanteId = String(body.gestanteId ?? "").trim();

      if (!isUuid(gestanteId)) {
        return NextResponse.json(
          { error: "Gestante inválida." },
          { status: 400 }
        );
      }

      const rows = await sql`
        select private.registrar_acao_acs_v21(
          ${user.id}::uuid,
          ${gestanteId}::uuid,
          ${action}
        ) as resultado
      `;

      return NextResponse.json(rows[0]?.resultado ?? { ok: true });
    }

    if (action === "complementar") {
      const visitaId = String(body.visitaId ?? "").trim();

      if (!isUuid(visitaId)) {
        return NextResponse.json(
          { error: "Registro de visita inválido." },
          { status: 400 }
        );
      }

      const payload = {
        data: String(body.data ?? ""),
        motivo: String(body.motivo ?? ""),
        orientacoes: Array.isArray(body.orientacoes)
          ? body.orientacoes.map(String)
          : [],
        sinaisAlerta: Boolean(body.sinaisAlerta),
        observacao: String(body.observacao ?? ""),
      };

      const rows = await sql`
        select private.complementar_acao_acs_v21(
          ${user.id}::uuid,
          ${visitaId}::uuid,
          ${sql.json(payload)}
        ) as resultado
      `;

      return NextResponse.json(rows[0]?.resultado ?? { ok: true });
    }

    return NextResponse.json(
      { error: "Ação inválida." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Erro no painel ACS V21:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível registrar a ação.",
      },
      { status: 500 }
    );
  }
}
