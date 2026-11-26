export const GESTARIO_PUBLIC_ORIGIN = "https://gestarioaps.vercel.app";

// Hosted confirmation links must never contain a protected deployment hostname
// or an origin supplied by request headers. Only explicit local development
// and test runs may retain a loopback origin.
export function confirmationRedirectUrl(
  requestUrl: string,
  env: { NODE_ENV?: string; VERCEL?: string } = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL },
): string {
  let origin = GESTARIO_PUBLIC_ORIGIN;
  if (!env.VERCEL && (env.NODE_ENV === "development" || env.NODE_ENV === "test")) {
    const url = new URL(requestUrl);
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      origin = url.origin;
    }
  }
  return new URL("/login?email_confirmed=1", origin).toString();
}
