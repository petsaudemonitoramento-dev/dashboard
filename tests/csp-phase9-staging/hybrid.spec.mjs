import { expect, test } from "@playwright/test";

const nonceFrom = (header) => header?.match(/'nonce-([^']+)'/)?.[1];

test("rotas estaticas mantem politica anterior e nonce ausente", async ({ request }) => {
  for (const path of ["/login", "/recuperar-senha", "/redefinir-senha"]) {
    const result = await request.get(path, { headers: { accept: "text/html" } });
    expect(result.status()).toBe(200);
    const header = result.headers()["content-security-policy"];
    expect(header).toContain("script-src 'self' 'unsafe-inline'");
    expect(nonceFrom(header)).toBeUndefined();
  }
});

test("cadastro dinamico recebe CSP aplicada e nonce unico", async ({ request }) => {
  const headers = { accept: "text/html" };
  const a = await request.get("/cadastro", { headers });
  const b = await request.get("/cadastro", { headers });
  expect(a.status()).toBe(200);
  expect(b.status()).toBe(200);

  const first = a.headers()["content-security-policy"];
  const second = b.headers()["content-security-policy"];
  expect(first).toContain("strict-dynamic");
  expect(first).toContain("object-src 'none'");
  expect(first).toContain("frame-ancestors 'none'");
  expect(first).not.toContain("script-src 'self' 'unsafe-inline'");
  expect(first).toContain("style-src 'self' 'unsafe-inline'");
  expect(nonceFrom(first)).toBeTruthy();
  expect(nonceFrom(second)).toBeTruthy();
  expect(nonceFrom(first)).not.toBe(nonceFrom(second));
  expect(a.headers()["cache-control"]).toMatch(/no-store/);
  // O Next deve usar o mesmo nonce que chegou em CSP no request.
  const html = await a.text();
  expect(html).toContain('nonce="' + nonceFrom(first) + '"');
});

test("cadastro hidrata e CSP efetivamente bloqueia script inserido", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.name));

  const source = await page.goto("/cadastro", { waitUntil: "domcontentloaded" });
  expect(source?.status()).toBe(200);
  const csp = source.headers()["content-security-policy"];
  const nonce = nonceFrom(csp);
  expect(nonce).toBeTruthy();
  await expect(page.getByRole("main")).toBeVisible();
  const scriptCount = await page.locator("script[nonce]").count();
  expect(scriptCount).toBeGreaterThan(0);
  const matching = await page.locator("script[nonce]").evaluateAll(
    (elements, expected) => elements.filter((element) => element.nonce === expected).length,
    nonce
  );
  expect(matching).toBe(scriptCount);
  await page.locator("#nomeCompleto").fill("Pessoa Fictícia de Teste");
  await expect(page.locator("#nomeCompleto")).toHaveValue("Pessoa Fictícia de Teste");
  // Não submeter formulário: não criar usuário, não enviar e-mail nem tocar dados reais.
  expect(errors).toHaveLength(0);

  await page.route(/\/cadastro(?:\?.*)?$/, async (route) => {
    const original = await route.fetch();
    const originalHtml = await original.text();
    const alteredHtml = originalHtml.replace(
      /<head([^>]*)>/i,
      '<head$1><script>window.__phase9Unauthorized=1</script>'
    );
    expect(alteredHtml).not.toBe(originalHtml);
    await route.fulfill({ response: original, body: alteredHtml });
  });

  const guarded = await page.goto("/cadastro", { waitUntil: "domcontentloaded" });
  expect(guarded.status()).toBe(200);
  await expect(page.locator("#nomeCompleto")).toBeVisible();
  await page.locator("#nomeCompleto").fill("Outra Pessoa Sintética");
  await expect(page.locator("#nomeCompleto")).toHaveValue("Outra Pessoa Sintética");
  const ran = await page.evaluate(() => window.__phase9Unauthorized === 1);
  expect(ran).toBe(false);
  process.stdout.write("PHASE9_STAGING=" + JSON.stringify({
    scriptedInlineBlocked: true,
    hydrationWorks: true,
    nonceScriptCount: scriptCount,
    pageErrors: errors.length,
  }) + "\n");
});

test("sem acesso autenticado o dashboard redireciona ao login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.locator("#password")).toBeVisible();
});

test("rotas API e recursos nao recebem nonce de HTML", async ({ request }) => {
  const api = await request.get("/api/health");
  expect(api.status()).toBe(200);
  expect(nonceFrom(api.headers()["content-security-policy"])).toBeUndefined();
});

test("amostra indicativa de latencia local (nao equivale a benchmark Vercel)", async ({ request }) => {
  const sample = async (path) => {
    const ms = [];
    for (let index = 0; index < 12; index += 1) {
      const start = performance.now();
      const result = await request.get(path, { headers: { accept: "text/html" } });
      expect(result.status()).toBe(200);
      ms.push(performance.now() - start);
    }
    ms.sort((a, b) => a - b);
    return {
      p50ms: Math.round(ms[Math.ceil(ms.length * 0.5) - 1]),
      p95ms: Math.round(ms[Math.ceil(ms.length * 0.95) - 1]),
    };
  };
  const staticLogin = await sample("/login");
  const dynamicRegister = await sample("/cadastro");
  process.stdout.write("PHASE9_LOCAL_LATENCY=" + JSON.stringify({
    staticLogin,
    dynamicRegister,
    samplePerRoute: 12,
    caveat: "Local synthetic CI timing; different routes; not causal nor production benchmark",
  }) + "\n");
});
