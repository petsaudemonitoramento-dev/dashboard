import { NextResponse } from "next/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function mutationRequestError(
  request: Request,
  options: {
    maxBytes?: number;
    contentTypes?: string[];
    requireContentLength?: boolean;
  } = {}
): NextResponse | null {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (
    fetchSite &&
    !["same-origin", "same-site", "none"].includes(fetchSite)
  ) {
    return NextResponse.json(
      { error: "Origem da requisição não autorizada." },
      { status: 403 }
    );
  }

  if (origin) {
    try {
      if (new URL(origin).origin !== requestUrl.origin) {
        return NextResponse.json(
          { error: "Origem da requisição não autorizada." },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Origem da requisição inválida." },
        { status: 403 }
      );
    }
  }

  const allowedTypes = options.contentTypes;
  if (allowedTypes?.length) {
    const contentType =
      request.headers.get("content-type")?.toLowerCase() ?? "";

    if (!allowedTypes.some((type) => contentType.startsWith(type))) {
      return NextResponse.json(
        { error: "Tipo de conteúdo não suportado." },
        { status: 415 }
      );
    }
  }

  const maxBytes = options.maxBytes;
  const rawLength = request.headers.get("content-length");

  if (options.requireContentLength && !rawLength) {
    return NextResponse.json(
      { error: "Tamanho da requisição não informado." },
      { status: 411 }
    );
  }

  if (maxBytes && rawLength) {
    const length = Number(rawLength);
    if (!Number.isFinite(length) || length < 0 || length > maxBytes) {
      return NextResponse.json(
        { error: "Requisição maior que o limite permitido." },
        { status: 413 }
      );
    }
  }

  return null;
}

export function logServerFailure(
  context: string,
  error?: unknown
): void {
  const safeCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code.slice(0, 32)
      : undefined;

  console.error(
    safeCode
      ? `[api] ${context} failed (code=${safeCode})`
      : `[api] ${context} failed`
  );
}

export async function readJsonObject(
  request: Request,
  maxBytes = 256 * 1024
): Promise<Record<string, unknown> | null> {
  try {
    if (!request.body) {
      return null;
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }

    if (total === 0) {
      return null;
    }

    const bytes = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    );

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return null;
    }

    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
