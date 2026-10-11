import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { phase9CiNoncePolicy } from "../src/lib/security/phase9-csp.ts";

const managedKeys = [
  "CI",
  "CSP_PHASE9_STAGING_ENFORCE",
  "CSP_PHASE9_STAGING_GIT_REF",
  "CSP_PHASE9_STAGING_HOST",
  "CSP_PHASE9_STAGING_SUPABASE_ORIGIN",
  "CSP_PHASE9_STAGING_TARGET_ENV",
  "CSP_PHASE9_STAGING_VERCEL_PROJECT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_PROJECT_ID",
  "VERCEL_TARGET_ENV",
];
const originalEnv = Object.fromEntries(
  managedKeys.map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const key of managedKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function request({
  pathname = "/cadastro",
  hostname = "staging.maeaps.test",
  method = "GET",
  headers = { accept: "text/html" },
} = {}) {
  return {
    method,
    nextUrl: { pathname, hostname },
    headers: new Headers(headers),
  };
}

function clearManagedEnv() {
  for (const key of managedKeys) delete process.env[key];
}

function configureLocalCi() {
  clearManagedEnv();
  Object.assign(process.env, {
    CI: "true",
    CSP_PHASE9_STAGING_ENFORCE: "1",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  });
}

function configureVercelStaging() {
  clearManagedEnv();
  Object.assign(process.env, {
    CSP_PHASE9_STAGING_ENFORCE: "1",
    CSP_PHASE9_STAGING_GIT_REF: "audit/fase9-release-gate-v30",
    CSP_PHASE9_STAGING_HOST: "staging.maeaps.test",
    CSP_PHASE9_STAGING_SUPABASE_ORIGIN:
      "https://synthetic-stage.supabase.co",
    CSP_PHASE9_STAGING_TARGET_ENV: "preview",
    CSP_PHASE9_STAGING_VERCEL_PROJECT_ID: "prj_isolated_maeaps_stage",
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic-stage.supabase.co",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "audit/fase9-release-gate-v30",
    VERCEL_PROJECT_ID: "prj_isolated_maeaps_stage",
    VERCEL_TARGET_ENV: "preview",
  });
}

test("CI local usa nonce de 128 bits unico e websocket local", () => {
  configureLocalCi();
  const nonces = new Set();
  for (let index = 0; index < 32; index += 1) {
    const policy = phase9CiNoncePolicy(request());
    assert.ok(policy);
    assert.match(policy, /script-src-attr 'none'/);
    assert.match(policy, /connect-src 'self' http:\/\/127\.0\.0\.1:54321 ws:\/\/127\.0\.0\.1:54321/);
    assert.doesNotMatch(policy, /upgrade-insecure-requests/);
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce);
    assert.equal(Buffer.from(nonce, "base64").length, 16);
    nonces.add(nonce);
  }
  assert.equal(nonces.size, 32);
});

test("staging Vercel exato habilita policy e upgrade HTTPS", () => {
  configureVercelStaging();
  const policy = phase9CiNoncePolicy(request());
  assert.ok(policy);
  assert.match(policy, /strict-dynamic/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.match(policy, /upgrade-insecure-requests/);
});

test("staging Vercel falha fechado em toda divergencia de identidade", async (t) => {
  const cases = [
    ["Production", "VERCEL_ENV", "production"],
    ["target", "VERCEL_TARGET_ENV", "production"],
    ["project", "VERCEL_PROJECT_ID", "prj_wrong"],
    ["branch", "VERCEL_GIT_COMMIT_REF", "main"],
    ["flag", "CSP_PHASE9_STAGING_ENFORCE", "0"],
    ["backend", "NEXT_PUBLIC_SUPABASE_URL", "https://other.supabase.co"],
  ];
  for (const [name, key, value] of cases) {
    await t.test(name, () => {
      configureVercelStaging();
      process.env[key] = value;
      assert.equal(phase9CiNoncePolicy(request()), null);
    });
  }
  await t.test("host", () => {
    configureVercelStaging();
    assert.equal(
      phase9CiNoncePolicy(request({ hostname: "other.maeaps.test" })),
      null
    );
  });
  await t.test("host configurado com wildcard", () => {
    configureVercelStaging();
    process.env.CSP_PHASE9_STAGING_HOST = "*.maeaps.test";
    assert.equal(phase9CiNoncePolicy(request()), null);
  });
  await t.test("Supabase oficial conhecido", () => {
    configureVercelStaging();
    const official = "https://bhkyfcnuxcvjgvusgpgm.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_URL = official;
    process.env.CSP_PHASE9_STAGING_SUPABASE_ORIGIN = official;
    assert.equal(phase9CiNoncePolicy(request()), null);
  });
});

test("somente documento HTML GET normal recebe nonce", async (t) => {
  configureLocalCi();
  const cases = [
    ["API", { pathname: "/api/health" }],
    ["POST", { method: "POST" }],
    ["JSON", { headers: { accept: "application/json" } }],
    ["RSC", { headers: { accept: "text/html", rsc: "1" } }],
    ["prefetch header", { headers: { accept: "text/html", "next-router-prefetch": "1" } }],
    ["purpose prefetch", { headers: { accept: "text/html", purpose: "prefetch" } }],
    ["rota estatica", { pathname: "/login" }],
  ];
  for (const [name, options] of cases) {
    await t.test(name, () => {
      assert.equal(phase9CiNoncePolicy(request(options)), null);
    });
  }
});