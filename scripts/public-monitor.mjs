#!/usr/bin/env node
// Monitor público de baixíssimo custo: nenhum secret, dado clínico ou dependência npm.
const base = "https://painelprenatal.vercel.app";
const timeoutMs = 12000;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function probe(path, expectedStatus, method = "GET") {
  const started = performance.now();
  const response = await fetch(base + path, {
    method,
    redirect: "manual",
    cache: "no-store",
    headers: { "user-agent": "profissionais-v30-github-health-monitor/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const ms = Math.round(performance.now() - started);
  check(response.status === expectedStatus,
    `${method} ${path}: esperado HTTP ${expectedStatus}; recebido HTTP ${response.status}`);
  check(ms < timeoutMs, `${path}: timeout acima do limite`);
  return { response, ms, path, method };
}

try {
  const health = await probe("/api/health", 200);
  const payload = await health.response.json();
  check(payload.status === "ok", "/api/health: status interno não está ok");
  const requestId = health.response.headers.get("x-request-id");
  check(!!requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId),
    "/api/health: x-request-id ausente ou inválido");
  check(payload.requestId === requestId, "/api/health: correlação inconsistente");

  const login = await probe("/login", 200);
  const headers = login.response.headers;
  const csp = headers.get("content-security-policy") || "";
  check(csp.includes("frame-ancestors 'none'"), "/login: frame-ancestors não bloqueia iframe");
  check(csp.includes("object-src 'none'"), "/login: object-src não bloqueia plugins");
  check(csp.includes("upgrade-insecure-requests"), "/login: falta upgrade-insecure-requests");
  check(!csp.includes("'unsafe-eval'"), "/login: CSP de produção permite unsafe-eval");
  check((headers.get("strict-transport-security") || "").includes("max-age="), "/login: HSTS ausente");
  check(headers.get("x-content-type-options") === "nosniff", "/login: nosniff ausente");
  check((headers.get("x-frame-options") || "").toUpperCase() === "DENY", "/login: X-Frame-Options != DENY");
  check(!!headers.get("referrer-policy"), "/login: Referrer-Policy ausente");
  check(!!headers.get("permissions-policy"), "/login: Permissions-Policy ausente");
  check(!!headers.get("x-request-id"), "/login: x-request-id ausente");

  const acs = await probe("/api/acs/visitas", 404, "POST");
  const unauthorized = await probe("/api/gestantes/clinico", 401, "POST");

  const rows = [health, login, acs, unauthorized]
    .map(({ method, path, ms }) => `| ${method} ${path} | OK | ${ms} ms |`)
    .join("\n");
  const summary = [
    "## Monitor público V30",
    "",
    "| Verificação | Resultado | Tempo |",
    "| --- | --- | ---: |",
    rows,
    "",
    "CSP, HSTS, headers de segurança, correlation ID e bloqueios de superfície legada/autenticação validados.",
    "Sem secrets, payloads clínicos ou dados de usuário.",
    "",
  ].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  }
} catch (error) {
  console.error("Monitor público V30 falhou:", error instanceof Error ? error.message : "falha desconhecida");
  process.exitCode = 1;
}
