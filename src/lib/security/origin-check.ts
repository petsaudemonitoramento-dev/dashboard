export function originMatchesRequest(
  request: Request,
  requestUrl: URL,
  origin: string
): boolean {
  const originUrl = new URL(origin);
  if (originUrl.origin === requestUrl.origin) return true;

  // Next.js may expose an internal request URL behind a reverse proxy. The Host
  // header remains the browser's actual request target and cannot be set by
  // cross-site JavaScript. Do not trust X-Forwarded-Host here.
  const rawHost = request.headers.get("host")?.trim();
  if (
    !rawHost ||
    rawHost.length > 255 ||
    /[\s,\/@]/.test(rawHost)
  ) {
    return false;
  }

  const hostUrl = new URL(`http://${rawHost}`);
  if (
    hostUrl.pathname !== "/" ||
    hostUrl.search ||
    hostUrl.hash
  ) {
    return false;
  }

  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : requestUrl.protocol.slice(0, -1);

  return originUrl.origin === `${protocol}://${hostUrl.host}`;
}

