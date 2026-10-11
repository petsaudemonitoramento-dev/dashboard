import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const host = "127.0.0.1";
const port = 3103;
const origin = `http://${host}:${port}`;

async function startServer(enforce) {
  const child = spawn("npm", ["run", "start", "--", "--hostname", host, "--port", String(port)], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      CI: "true",
      CSP_PHASE9_STAGING_ENFORCE: enforce ? "1" : "0",
      VERCEL: "",
      VERCEL_ENV: "",
    },
  });
  child.unref();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/login`, {
        headers: { accept: "text/html" },
        redirect: "manual",
      });
      if (response.status === 200) {
        await response.arrayBuffer();
        return child;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become ready on ${origin}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await Promise.race([
    once(child, "exit").catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
  }
}

async function inspectSurface() {
  const login = await fetch(`${origin}/login`, {
    headers: { accept: "text/html" },
    redirect: "manual",
  });
  await login.arrayBuffer();
  if (login.status !== 200) throw new Error(`unexpected login status ${login.status}`);

  const protectedRoute = await fetch(`${origin}/dashboard`, {
    headers: { accept: "text/html" },
    redirect: "manual",
  });
  await protectedRoute.arrayBuffer();
  const location = protectedRoute.headers.get("location") ?? "";
  if (![301, 302, 303, 307, 308].includes(protectedRoute.status) || !location.includes("/login")) {
    throw new Error(`protected route changed during drill: ${protectedRoute.status} ${location}`);
  }

  const policy = login.headers.get("content-security-policy") ?? "";
  return {
    policy,
    nonce: policy.match(/'nonce-([^']+)'/)?.[1] ?? null,
    cacheControl: login.headers.get("cache-control"),
    protectedStatus: protectedRoute.status,
    protectedLocation: location,
  };
}

let candidateServer;
let rollbackServer;
try {
  candidateServer = await startServer(true);
  const candidate = await inspectSurface();
  if (!candidate.nonce || !candidate.policy.includes("script-src-attr 'none'")) {
    throw new Error("candidate CSP was not active before rollback");
  }

  const rollbackStartedAt = performance.now();
  await stopServer(candidateServer);
  candidateServer = undefined;
  rollbackServer = await startServer(false);
  const rollback = await inspectSurface();
  const rollbackMs = performance.now() - rollbackStartedAt;

  if (rollback.nonce) throw new Error("rollback still emitted nonce CSP");
  if (!rollback.policy.includes("script-src 'self' 'unsafe-inline'")) {
    throw new Error("rollback did not restore the baseline script policy");
  }
  if (rollback.protectedStatus !== candidate.protectedStatus || rollback.protectedLocation !== candidate.protectedLocation) {
    throw new Error("protected-route behavior changed after rollback");
  }

  const result = {
    environment: "GitHub-hosted disposable runner; same production build",
    candidateNonce: true,
    rollbackNonce: false,
    rollbackMs: Number(rollbackMs.toFixed(2)),
    protectedRoutePreserved: true,
    candidateCacheControl: candidate.cacheControl,
    rollbackCacheControl: rollback.cacheControl,
    caveat: "Component rollback only; Vercel CDN/cache, authenticated session continuity and production promotion were not exercised",
  };
  process.stdout.write(`PHASE9_ROLLBACK_DRILL=${JSON.stringify(result)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Phase 9 disposable rollback drill\n\n\`${JSON.stringify(result)}\`\n`);
  }
} finally {
  await stopServer(candidateServer);
  await stopServer(rollbackServer);
}