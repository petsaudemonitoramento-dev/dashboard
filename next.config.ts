import type { NextConfig } from "next";

function originFromEnv(value: string | undefined): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const supabaseOrigin = originFromEnv(
  process.env.NEXT_PUBLIC_SUPABASE_URL
);
const metabaseOrigin = originFromEnv(
  process.env.METABASE_SITE_URL
);
const production = process.env.VERCEL_ENV === "production";

const connectSources = [
  "'self'",
  supabaseOrigin,
  supabaseOrigin?.replace(/^https:/, "wss:"),
]
  .filter(Boolean)
  .join(" ");

const frameSources = ["'self'", metabaseOrigin]
  .filter(Boolean)
  .join(" ");

const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(production ? [] : ["'unsafe-eval'"]),
].join(" ");

const csp = [
  "default-src 'self'",
  `script-src ${scriptSources}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSources}`,
  `frame-src ${frameSources}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(production ? ["upgrade-insecure-requests"] : []),
].join("; ");


/**
 * Fase 9 / PoC isolada: política estrita APENAS de observação.
 * Nunca habilitar na produção; não troca a CSP ativa nem gera relatórios de
 * possíveis URLs clínicas para serviços externos.
 * Ative exclusivamente no CI ou Preview com CSP_PHASE9_REPORT_ONLY=1.
 */
const phase9ReportOnly =
  process.env.CSP_PHASE9_REPORT_ONLY === "1" &&
  process.env.VERCEL_ENV !== "production" &&
  (process.env.VERCEL_ENV === "preview" || process.env.CI === "true");

const phase9CandidateCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSources}`,
  `frame-src ${frameSources}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  ...(phase9ReportOnly
    ? [
        {
          key: "Content-Security-Policy-Report-Only",
          value: phase9CandidateCsp,
        },
      ]
    : []),
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  ...(production
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
