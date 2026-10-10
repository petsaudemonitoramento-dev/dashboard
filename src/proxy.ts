import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();

  // Fase 9: NONCE APENAS NO CI DESCARTÁVEL, jamais em produção/Preview.
  // Restrito à navegação HTML do login, sem credenciais de backend.
  const phase9NoncePoC =
    process.env.CSP_PHASE9_NONCE_POC === "1" &&
    process.env.CI === "true" &&
    process.env.VERCEL_ENV !== "production" &&
    request.nextUrl.pathname === "/login" &&
    (request.headers.get("accept") ?? "").includes("text/html");

  const nonce = phase9NoncePoC
    ? Buffer.from(crypto.randomUUID()).toString("base64")
    : null;
  const reportOnlyPolicy = nonce
    ? [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        `style-src 'self' 'nonce-${nonce}'`,
        "style-src-attr 'none'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' http://127.0.0.1:54321",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; ")
    : null;

  const createResponse = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-request-id", requestId);
    // Next.js aplica nonce no HTML SSR quando encontra CSP no request.
    if (nonce && reportOnlyPolicy) {
      requestHeaders.set("x-nonce", nonce);
      requestHeaders.set("Content-Security-Policy", reportOnlyPolicy);
    }

    const nextResponse = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    nextResponse.headers.set("x-request-id", requestId);
    // Somente observação. A CSP original do next.config.ts continua ativa.
    if (reportOnlyPolicy) {
      nextResponse.headers.set("Content-Security-Policy-Report-Only", reportOnlyPolicy);
    }
    return nextResponse;
  };

  let response = createResponse();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return response;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = createResponse();

        cookiesToSet.forEach(
          ({ name, value, options }) => {
            response.cookies.set(name, value, options);
          }
        );
      },
    },
  });

  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
