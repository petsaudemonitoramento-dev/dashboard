import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { parsePecFile } from "@/lib/pec/columns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") ?? "preview");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Selecione um arquivo CSV, XLSX ou XLS." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "O arquivo ultrapassa o limite de 20 MB." },
        { status: 400 }
      );
    }

    const extension = file.name.toLowerCase().split(".").pop();

    if (!extension || !["csv", "xlsx", "xls"].includes(extension)) {
      return NextResponse.json(
        { error: "Formato não suportado. Use CSV, XLSX ou XLS." },
        { status: 400 }
      );
    }

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

    const { data: profile, error: profileError } = await supabase
      .from("perfis")
      .select("perfil, ubs_id, status, ativo")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !profile.ativo ||
      profile.status !== "ativo"
    ) {
      return NextResponse.json(
        { error: "Perfil inativo ou não encontrado." },
        { status: 403 }
      );
    }

    const requestedUbsId = String(formData.get("ubs_id") ?? "");
    const ubsId =
      profile.perfil === "administrador" && requestedUbsId
        ? requestedUbsId
        : profile.ubs_id;

    if (!ubsId) {
      return NextResponse.json(
        { error: "O usuário não está vinculado a uma UBS." },
        { status: 403 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parsePecFile(buffer, file.name);

    const preview = parsed.rows.slice(0, 8).map((row) => ({
      linha: row.linha,
      microarea: row.canonical.microarea ?? "-",
      idade: row.canonical.idade_texto ?? "-",
      risco: row.canonical.risco_gestacional ?? "-",
      dpp:
        row.canonical.dpp_dum ??
        row.canonical.dpp_ecografia ??
        "-",
      camposExtras: Object.keys(row.extras),
    }));

    if (mode === "preview") {
      return NextResponse.json({
        sheetName: parsed.sheetName,
        headerRow: parsed.headerRow,
        totalRows: parsed.rows.length,
        mapping: parsed.mapping,
        warnings: parsed.warnings,
        preview,
      });
    }

    if (mode !== "import") {
      return NextResponse.json(
        { error: "Modo de operação inválido." },
        { status: 400 }
      );
    }

    const hash = createHash("sha256").update(buffer).digest("hex");
    const sql = getPostgresClient();

    const result = await sql`
      select private.importar_pec_v30(
        ${ubsId}::uuid,
        ${user.id}::uuid,
        ${file.name},
        ${hash},
        ${parsed.headerRow},
        ${sql.json(parsed.mapping)},
        ${sql.json(parsed.rows)},
        ${sql.json(parsed.warnings)}
      ) as resultado
    `;

    return NextResponse.json({
      ...result[0]?.resultado,
      headerRow: parsed.headerRow,
      mapping: parsed.mapping,
      warnings: parsed.warnings,
    });
  } catch (error) {
    console.error("Erro ao importar PEC:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível processar o arquivo.",
      },
      { status: 500 }
    );
  }
}
