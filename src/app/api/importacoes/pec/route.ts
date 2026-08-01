import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { parsePecFile } from "@/lib/pec/columns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 1024 * 1024;

const ALLOWED_MIME_TYPES: Record<string, ReadonlySet<string>> = {
  csv: new Set([
    "text/csv",
    "application/csv",
    "text/plain",
    "application/vnd.ms-excel",
  ]),
  xlsx: new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]),
  xls: new Set(["application/vnd.ms-excel"]),
};

function hasExpectedSignature(buffer: Buffer, extension: string) {
  if (extension === "xlsx") {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }

  if (extension === "xls") {
    const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    return (
      buffer.length >= oleSignature.length &&
      oleSignature.every((byte, index) => buffer[index] === byte)
    );
  }

  return !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0x00);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("multipart/form-data")) {
      return NextResponse.json(
        { error: "Envie o arquivo como formulário multipart." },
        { status: 415 }
      );
    }

    const contentLengthHeader = request.headers.get("content-length");
    const contentLength = contentLengthHeader
      ? Number.parseInt(contentLengthHeader, 10)
      : null;

    if (
      contentLength !== null &&
      (!Number.isFinite(contentLength) ||
        contentLength < 0 ||
        contentLength > MAX_REQUEST_SIZE)
    ) {
      return NextResponse.json(
        { error: "A requisição ultrapassa o limite permitido." },
        { status: 413 }
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
      .select(
        "perfil, ubs_id, status, ativo, cadastro_completo, aprovacao_status"
      )
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !profile.ativo ||
      profile.status !== "ativo" ||
      !profile.cadastro_completo ||
      profile.aprovacao_status !== "aprovado" ||
      profile.perfil !== "equipe_ubs"
    ) {
      return NextResponse.json(
        { error: "Usuário sem permissão para importar arquivos PEC." },
        { status: 403 }
      );
    }

    const ubsId = profile.ubs_id;

    if (!ubsId) {
      return NextResponse.json(
        { error: "O usuário não está vinculado a uma UBS." },
        { status: 403 }
      );
    }

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
        { status: 413 }
      );
    }

    const extension = file.name.toLowerCase().split(".").pop();

    if (!extension || !["csv", "xlsx", "xls"].includes(extension)) {
      return NextResponse.json(
        { error: "Formato não suportado. Use CSV, XLSX ou XLS." },
        { status: 400 }
      );
    }

    const normalizedMime = file.type.toLowerCase();
    const allowedMimeTypes = ALLOWED_MIME_TYPES[extension];
    if (
      normalizedMime &&
      normalizedMime !== "application/octet-stream" &&
      !allowedMimeTypes.has(normalizedMime)
    ) {
      return NextResponse.json(
        { error: "O tipo do arquivo não corresponde ao formato informado." },
        { status: 400 }
      );
    }

    if (mode !== "preview" && mode !== "import") {
      return NextResponse.json(
        { error: "Modo de operação inválido." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasExpectedSignature(buffer, extension)) {
      return NextResponse.json(
        { error: "O conteúdo do arquivo não corresponde ao formato informado." },
        { status: 400 }
      );
    }

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

    const hash = createHash("sha256").update(buffer).digest("hex");
    const sql = getPostgresClient();

    const result = await sql`
      select private.importar_pec(
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
    console.error(
      "Erro ao importar PEC:",
      error instanceof Error ? error.name : "erro desconhecido"
    );

    return NextResponse.json(
      { error: "Não foi possível processar o arquivo." },
      { status: 500 }
    );
  }
}
