/**
 * Fase 9 — CSP híbrida para CI descartável e staging Vercel isolado.
 *
 * Production é sempre rejeitada. A ativação em Vercel requer coincidência
 * exata de ambiente, projeto, branch, host e backend sintético configurados.
 * Páginas estáticas continuam com os headers originais (estratégia híbrida).
 */
import type { NextRequest } from "next/server";

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const FORBIDDEN_PRODUCTION_SUPABASE_ORIGIN =
  "https://bhkyfcnuxcvjgvusgpgm.supabase.co";

type EnforcementMode = "local-ci" | "vercel-staging";

function originFromEnv(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function exactHostname(value: string | undefined): string | null {
  const candidate = value?.trim().toLowerCase();
  if (!candidate) return null;
  try {
    const parsed = new URL(`https://${candidate}`);
    if (
      parsed.hostname !== candidate ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/"
    ) {
      return null;
    }
    return parsed.hostname;
  } catch {
    return null;
  }
}

const htmlRoutes = new Set([
  "/cadastro",
  "/completar-cadastro",
  "/aguardando-aprovacao",
]);

function enforcementMode(request: NextRequest): EnforcementMode | null {
  if (process.env.CSP_PHASE9_STAGING_ENFORCE !== "1") return null;

  const supabaseOrigin = originFromEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  if (
    !supabaseOrigin ||
    supabaseOrigin === FORBIDDEN_PRODUCTION_SUPABASE_ORIGIN
  ) {
    return null;
  }

  if (
    process.env.CI === "true" &&
    process.env.VERCEL !== "1" &&
    !process.env.VERCEL_ENV &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === LOCAL_SUPABASE_URL
  ) {
    return "local-ci";
  }

  const expectedProjectId =
    process.env.CSP_PHASE9_STAGING_VERCEL_PROJECT_ID;
  const expectedGitRef = process.env.CSP_PHASE9_STAGING_GIT_REF;
  const expectedTargetEnv =
    process.env.CSP_PHASE9_STAGING_TARGET_ENV;
  const expectedHost = exactHostname(
    process.env.CSP_PHASE9_STAGING_HOST
  );
  const expectedSupabaseOrigin = originFromEnv(
    process.env.CSP_PHASE9_STAGING_SUPABASE_ORIGIN
  );

  if (
    process.env.VERCEL === "1" &&
    process.env.VERCEL_ENV === "preview" &&
    expectedProjectId &&
    process.env.VERCEL_PROJECT_ID === expectedProjectId &&
    expectedGitRef &&
    process.env.VERCEL_GIT_COMMIT_REF === expectedGitRef &&
    expectedTargetEnv &&
    process.env.VERCEL_TARGET_ENV === expectedTargetEnv &&
    expectedHost &&
    request.nextUrl.hostname.toLowerCase() === expectedHost &&
    expectedSupabaseOrigin &&
    expectedSupabaseOrigin !== FORBIDDEN_PRODUCTION_SUPABASE_ORIGIN &&
    supabaseOrigin === expectedSupabaseOrigin
  ) {
    return "vercel-staging";
  }

  return null;
}

export function phase9CiNoncePolicy(request: NextRequest): string | null {
  const mode = enforcementMode(request);
  if (!mode) return null;

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
  const realtimeOrigin = supabaseOrigin?.startsWith("https:")
    ? supabaseOrigin.replace(/^https:/, "wss:")
    : supabaseOrigin?.replace(/^http:/, "ws:");
  const connectSources = ["'self'", supabaseOrigin, realtimeOrigin]
    .filter(Boolean)
    .join(" ");
  const metabaseOrigin = originFromEnv(process.env.METABASE_SITE_URL);
  const frameSources = ["'self'", metabaseOrigin].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "script-src-attr 'none'",
    // CSS é uma migração distinta: estilos inline existentes ainda precisam
    // de compatibilidade. A exceção NÃO se estende a scripts.
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    `frame-src ${frameSources}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(mode === "vercel-staging" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}