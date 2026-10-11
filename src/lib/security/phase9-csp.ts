/**
 * Fase 9 — CSP experimental para CI descartável.
 *
 * Não usar em preview Vercel, em produção nem com Supabase hospedado.
 * A política está limitada a documentos HTML já renderizados dinamicamente.
 * Páginas estáticas continuam com os headers originais (estratégia híbrida).
 */
import type { NextRequest } from "next/server";

function originFromEnv(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const htmlRoutes = new Set([
  "/cadastro",
  "/completar-cadastro",
  "/aguardando-aprovacao",
]);

export function phase9CiNoncePolicy(request: NextRequest): string | null {
  // Fail closed: o gate não existe em deploys Vercel, nem em CI que
  // tenha sido configurado para usar o Supabase de um projeto real.
  if (
    process.env.CSP_PHASE9_STAGING_ENFORCE !== "1" ||
    process.env.CI !== "true" ||
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321"
  ) {
    return null;
  }

  const pathname = request.nextUrl.pathname;
  if (
    !(htmlRoutes.has(pathname) || pathname.startsWith("/dashboard")) ||
    request.method !== "GET" ||
    !(request.headers.get("accept") ?? "").includes("text/html") ||
    request.headers.has("rsc") ||
    request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch"
  ) {
    return null;
  }

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16)))
    .toString("base64");

  const supabaseOrigin = originFromEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const connectSources = [
    "'self'",
    supabaseOrigin,
    supabaseOrigin?.replace(/^https:/, "wss:"),
  ].filter(Boolean).join(" ");
  const metabaseOrigin = originFromEnv(process.env.METABASE_SITE_URL);
  const frameSources = ["'self'", metabaseOrigin].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // CSS é uma migração distinta: estilos inline existentes ainda precisam
    // de compatibilidade. A exceção NÃO se estende a scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    `frame-src ${frameSources}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
