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

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
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
