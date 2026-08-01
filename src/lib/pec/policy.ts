import { PEC_LIMITS, PecContainer, PecExtension } from "./limits";

export type PecImporterProfile = {
  perfil: string;
  ubs_id: string | null;
  status: string;
  ativo: boolean;
  cadastro_completo: boolean;
  aprovacao_status: string;
};

export class PecRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly clientMessage: string,
    public readonly code: string
  ) {
    super(code);
    this.name = "PecRequestError";
  }
}

const ALLOWED_MIME_TYPES: Record<PecExtension, ReadonlySet<string>> = {
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

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function isEligiblePecImporter(
  profile: PecImporterProfile | null | undefined
): profile is PecImporterProfile & { ubs_id: string } {
  return Boolean(
    profile &&
      profile.perfil === "equipe_ubs" &&
      profile.ativo === true &&
      profile.status === "ativo" &&
      profile.cadastro_completo === true &&
      profile.aprovacao_status === "aprovado" &&
      profile.ubs_id
  );
}

export function validateContentLength(value: string | null): void {
  if (value === null) return;

  const length = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (
    !Number.isFinite(length) ||
    length < 0 ||
    length > PEC_LIMITS.maxRequestBytes
  ) {
    throw new PecRequestError(
      413,
      "A requisição ultrapassa o limite permitido.",
      "REQUEST_TOO_LARGE"
    );
  }
}

export async function readLimitedMultipartFormData(
  request: Request
): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new PecRequestError(
      415,
      "Envie o arquivo como formulário multipart.",
      "INVALID_CONTENT_TYPE"
    );
  }

  if (!request.body) {
    throw new PecRequestError(400, "Formulário inválido.", "EMPTY_BODY");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > PEC_LIMITS.maxRequestBytes) {
        await reader.cancel();
        throw new PecRequestError(
          413,
          "A requisição ultrapassa o limite permitido.",
          "REQUEST_TOO_LARGE"
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Response(body, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new PecRequestError(400, "Formulário inválido.", "INVALID_FORM");
  }
}

function startsWith(buffer: Buffer, signature: readonly number[]): boolean {
  return (
    buffer.length >= signature.length &&
    signature.every((byte, index) => buffer[index] === byte)
  );
}

export function detectContainer(buffer: Buffer): PecContainer {
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  if (startsWith(buffer, CFB_SIGNATURE)) return "cfb";
  return "text";
}

export function validateUploadFile(file: File, buffer: Buffer): {
  extension: PecExtension;
  container: PecContainer;
} {
  if (file.size > PEC_LIMITS.maxFileBytes || buffer.length > PEC_LIMITS.maxFileBytes) {
    throw new PecRequestError(
      413,
      "O arquivo ultrapassa o limite de 20 MB.",
      "FILE_TOO_LARGE"
    );
  }

  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "csv" && extension !== "xls" && extension !== "xlsx") {
    throw new PecRequestError(
      400,
      "Formato não suportado. Use CSV, XLSX ou XLS.",
      "INVALID_EXTENSION"
    );
  }

  const normalizedMime = file.type.toLowerCase();
  if (
    normalizedMime &&
    normalizedMime !== "application/octet-stream" &&
    !ALLOWED_MIME_TYPES[extension].has(normalizedMime)
  ) {
    throw new PecRequestError(
      400,
      "O tipo do arquivo não corresponde ao formato informado.",
      "MIME_MISMATCH"
    );
  }

  const container = detectContainer(buffer);
  const hasNullByte = buffer
    .subarray(0, Math.min(buffer.length, 4096))
    .includes(0x00);
  const signatureMatches =
    (extension === "csv" && container === "text" && !hasNullByte) ||
    (extension === "xls" && container === "cfb") ||
    (extension === "xlsx" && (container === "zip" || container === "cfb"));

  if (!signatureMatches) {
    throw new PecRequestError(
      400,
      "O conteúdo do arquivo não corresponde ao formato informado.",
      "SIGNATURE_MISMATCH"
    );
  }

  return { extension, container };
}
