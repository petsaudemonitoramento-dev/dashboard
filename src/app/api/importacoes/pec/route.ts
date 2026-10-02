import { createHash } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { getPostgresClient } from "@/lib/db/postgres";
import { parsePecFile } from "@/lib/pec/columns";
import {
  logServerFailure,
  mutationRequestError,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_REQUEST_SIZE = 22 * 1024 * 1024;
const MAX_ROWS = 10_000;

const MIME_BY_EXTENSION: Record<string, Set<string>> = {
  csv: new Set([
    "",
    "text/csv",
    "application/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/octet-stream",
  ]),
  xlsx: new Set([
    "",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ]),
  xls: new Set([
    "",
    "application/vnd.ms-excel",
    "application/octet-stream",
  ]),
};

export async function POST(request: Request) {
  const requestError = mutationRequestError(request, {
    maxBytes: MAX_REQUEST_SIZE,
    contentTypes: ["multipart/form-data"],
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
        scope: "pec-import",
        actorKey: user.id,
        limit: 10,
        windowSeconds: 900,
      }))
    ) {
      return NextResponse.json(
        { error: "Limite temporário de importações atingido. Tente novamente mais tarde." },
        { status: 429 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("perfis")
      .select(
        "perfil, ubs_id, status, ativo, cadastro_completo, aprovacao_status, perfil_excluido_em"
      )
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.perfil !== "equipe_ubs" ||
      !profile.ubs_id ||
      !profile.ativo ||
      profile.status !== "ativo" ||
      profile.cadastro_completo !== true ||
      profile.aprovacao_status !== "aprovado" ||
      profile.perfil_excluido_em !== null
    ) {
      return NextResponse.json(
        { error: "Perfil profissional não autorizado." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") ?? "preview");

    if (!["preview", "import"].includes(mode)) {
      return NextResponse.json(
        { error: "Modo de operação inválido." },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Selecione um arquivo CSV, XLSX ou XLS." },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "O arquivo deve ter até 20 MB." },
        { status: 400 }
      );
    }

    const originalName = path.basename(file.name).slice(0, 180);
    const extension = originalName.toLowerCase().split(".").pop();

    if (
      !extension ||
      !Object.prototype.hasOwnProperty.call(
        MIME_BY_EXTENSION,
        extension
      )
    ) {
      return NextResponse.json(
        { error: "Formato não suportado. Use CSV, XLSX ou XLS." },
        { status: 400 }
      );
    }

    const normalizedMime = file.type.toLowerCase().trim();
    if (!MIME_BY_EXTENSION[extension].has(normalizedMime)) {
      return NextResponse.json(
        { error: "O tipo do arquivo não corresponde ao formato informado." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength !== file.size) {
      return NextResponse.json(
        { error: "Não foi possível validar o arquivo enviado." },
        { status: 400 }
      );
    }

    const parsed = parsePecFile(buffer, originalName);

    if (parsed.rows.length > MAX_ROWS) {
      return NextResponse.json(
        {
          error:
            "O arquivo contém linhas demais para uma única importação. Divida-o em lotes menores.",
        },
        { status: 413 }
      );
    }

    const preview = parsed.rows.slice(0, 8).map((row) => ({
      linha: row.linha,
      microarea: row.canonical.microarea ?? "-",
      idade: row.canonical.idade_texto ?? "-",
      risco: row.canonical.risco_gestacional ?? "-",
      dpp:
        row.canonical.dpp_dum ??
        row.canonical.dpp_ecografia ??
        "-",
      camposExtras: Object.keys(row.extras).slice(0, 80),
    }));

    if (mode === "preview") {
      return NextResponse.json(
        {
          sheetName: parsed.sheetName,
          headerRow: parsed.headerRow,
          totalRows: parsed.rows.length,
          mapping: parsed.mapping,
          warnings: parsed.warnings.slice(0, 100),
          preview,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const hash = createHash("sha256").update(buffer).digest("hex");
    const sql = getPostgresClient();

    const result = await sql`
      select private.importar_pec_v30(
        ${profile.ubs_id}::uuid,
        ${user.id}::uuid,
        ${originalName},
        ${hash},
        ${parsed.headerRow},
        ${sql.json(parsed.mapping)},
        ${sql.json(parsed.rows)},
        ${sql.json(parsed.warnings.slice(0, 100))}
      ) as resultado
    `;

    return NextResponse.json(
      {
        ...result[0]?.resultado,
        headerRow: parsed.headerRow,
        mapping: parsed.mapping,
        warnings: parsed.warnings.slice(0, 100),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes(
        "gestante já vinculada a outro profissional"
      )
    ) {
      return NextResponse.json(
        {
          error:
            "O arquivo contém cadastro já vinculado a outro profissional.",
        },
        { status: 409 }
      );
    }

    logServerFailure("pec-import", error);
    return NextResponse.json(
      { error: "Não foi possível processar o arquivo." },
      { status: 500 }
    );
  }
}
