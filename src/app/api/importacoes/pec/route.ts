import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { ParsedPecFile } from "@/lib/pec/columns";
import type { PecContainer, PecExtension } from "@/lib/pec/limits";
import {
  isEligiblePecImporter,
  PecRequestError,
  readLimitedMultipartFormData,
  validateContentLength,
  validateUploadFile,
} from "@/lib/pec/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthenticatedImporter = { userId: string; ubsId: string };
type PersistInput = {
  ubsId: string;
  userId: string;
  filename: string;
  hash: string;
  parsed: ParsedPecFile;
};

export type PecRouteDependencies = {
  authenticate: () => Promise<AuthenticatedImporter>;
  parse: (
    buffer: Buffer,
    filename: string,
    extension: PecExtension,
    container: PecContainer
  ) => Promise<ParsedPecFile>;
  persist: (input: PersistInput) => Promise<Record<string, unknown>>;
  logError: (event: { event: "pec_import_failed"; code: string }) => void;
};

async function authenticateImporter(): Promise<AuthenticatedImporter> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new PecRequestError(401, "Sessão expirada. Entre novamente.", "UNAUTHENTICATED");
  }

  const { data: profile, error } = await supabase
    .from("perfis")
    .select("perfil, ubs_id, status, ativo, cadastro_completo, aprovacao_status")
    .eq("id", user.id)
    .single();

  if (error || !isEligiblePecImporter(profile)) {
    throw new PecRequestError(
      403,
      "Usuário sem permissão para importar arquivos PEC.",
      "IMPORT_FORBIDDEN"
    );
  }

  return { userId: user.id, ubsId: profile.ubs_id };
}

async function parseInWorker(
  buffer: Buffer,
  filename: string,
  extension: PecExtension,
  container: PecContainer
): Promise<ParsedPecFile> {
  const { parsePecFile } = await import("@/lib/pec/columns");
  return await parsePecFile(buffer, filename, extension, container);
}

async function persistImport(input: PersistInput): Promise<Record<string, unknown>> {
  const { getPostgresClient } = await import("@/lib/db/postgres");
  const sql = getPostgresClient();
  const result = await sql`
    select private.importar_pec(
      ${input.ubsId}::uuid,
      ${input.userId}::uuid,
      ${input.filename},
      ${input.hash},
      ${input.parsed.headerRow},
      ${sql.json(input.parsed.mapping)},
      ${sql.json(input.parsed.rows)},
      ${sql.json(input.parsed.warnings)}
    ) as resultado
  `;
  return (result[0]?.resultado ?? {}) as Record<string, unknown>;
}

const defaultDependencies: PecRouteDependencies = {
  authenticate: authenticateImporter,
  parse: parseInWorker,
  persist: persistImport,
  logError: ({ event, code }) => console.error(event, code),
};

function previewOf(parsed: ParsedPecFile) {
  return parsed.rows.slice(0, 8).map((row) => ({
    linha: row.linha,
    microarea: row.canonical.microarea ?? "-",
    idade: row.canonical.idade_texto ?? "-",
    risco: row.canonical.risco_gestacional ?? "-",
    dpp: row.canonical.dpp_dum ?? row.canonical.dpp_ecografia ?? "-",
    camposExtras: Object.keys(row.extras),
  }));
}

function safeErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.replace(/[^A-Z0-9_]/gi, "_").slice(0, 64);
  }
  return error instanceof Error ? error.name.slice(0, 64) : "UNKNOWN_ERROR";
}

export async function handlePecPost(
  request: Request,
  dependencies: PecRouteDependencies = defaultDependencies
): Promise<NextResponse> {
  try {
    validateContentLength(request.headers.get("content-length"));
    const importer = await dependencies.authenticate();
    const formData = await readLimitedMultipartFormData(request);
    const file = formData.get("file");
    const mode = String(formData.get("mode") ?? "preview");

    if (!(file instanceof File)) {
      throw new PecRequestError(
        400,
        "Selecione um arquivo CSV, XLSX ou XLS.",
        "FILE_MISSING"
      );
    }
    if (mode !== "preview" && mode !== "import") {
      throw new PecRequestError(400, "Modo de operação inválido.", "INVALID_MODE");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { extension, container } = validateUploadFile(file, buffer);
    const parsed = await dependencies.parse(buffer, file.name, extension, container);
    const preview = previewOf(parsed);

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

    const result = await dependencies.persist({
      ubsId: importer.ubsId,
      userId: importer.userId,
      filename: file.name,
      hash: createHash("sha256").update(buffer).digest("hex"),
      parsed,
    });

    return NextResponse.json({
      ...result,
      headerRow: parsed.headerRow,
      mapping: parsed.mapping,
      warnings: parsed.warnings,
    });
  } catch (error) {
    if (error instanceof PecRequestError) {
      return NextResponse.json({ error: error.clientMessage }, { status: error.status });
    }

    const code = safeErrorCode(error);
    dependencies.logError({ event: "pec_import_failed", code });
    const isParserError =
      error instanceof Error && error.name === "PecParseError";
    return NextResponse.json(
      {
        error: isParserError
          ? "O arquivo é inválido, inseguro ou não suportado."
          : "Não foi possível processar o arquivo.",
      },
      { status: isParserError ? 400 : 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return await handlePecPost(request);
}
