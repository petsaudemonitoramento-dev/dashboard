import { expect, test } from "@playwright/test";

const nonceFrom = (header) => header?.match(/'nonce-([^']+)'/)?.[1];
const publicAuthPaths = [
  "/login",
  "/recuperar-senha",
  "/redefinir-senha",
];

test("paginas publicas de autenticacao usam nonce por resposta", async ({ request }) => {
  const seen = new Set();
  for (const path of publicAuthPaths) {
    const result = await request.get(path, {
      headers: { accept: "text/html" },
    });
    expect(result.status()).toBe(200);
    const header = result.headers()["content-security-policy"];
    expect(header).toContain("strict-dynamic");
    expect(header).toContain("script-src-attr 'none'");
    expect(header).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(result.headers()["cache-control"]).toMatch(/no-store/);
    const nonce = nonceFrom(header);
    expect(nonce).toBeTruthy();
    expect(seen.has(nonce)).toBe(false);
    seen.add(nonce);
    expect(await result.text()).toContain(`nonce="${nonce}"`);
  }
});

test("login e recuperacao hidratam com controles funcionais", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.name));

  let response = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(nonceFrom(response?.headers()["content-security-policy"])).toBeTruthy();
  await page.locator("#identifier").fill("profissional.a@example.test");
  await page.locator("#password").fill("Senha-Sintetica-123");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");

  response = await page.goto("/recuperar-senha", {
    waitUntil: "domcontentloaded",
  });
  expect(nonceFrom(response?.headers()["content-security-policy"])).toBeTruthy();
  await page.locator("#recuperar-email").fill("pessoa@example.test");
  await expect(page.locator("#recuperar-email")).toHaveValue(
    "pessoa@example.test"
  );

  response = await page.goto("/redefinir-senha", {
    waitUntil: "domcontentloaded",
  });
  expect(nonceFrom(response?.headers()["content-security-policy"])).toBeTruthy();
  await page.locator("#nova-senha").fill("Nova-Senha-Sintetica-123");
  await page
    .locator("#confirmar-nova-senha")
    .fill("Nova-Senha-Sintetica-123");
  expect(errors).toHaveLength(0);
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
  expect(first).toContain("script-src-attr 'none'");
  expect(first).toContain("style-src 'self' 'unsafe-inline'");
  expect(first).toContain("style-src-attr 'unsafe-inline'");
  expect(nonceFrom(first)).toBeTruthy();
  expect(nonceFrom(second)).toBeTruthy();
  expect(nonceFrom(first)).not.toBe(nonceFrom(second));
  expect(a.headers()["cache-control"]).toMatch(/no-store/);
  const html = await a.text();
  expect(html).toContain('nonce="' + nonceFrom(first) + '"');
});

test("cadastro hidrata e CSP bloqueia script e handler inseridos", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.name));

  const source = await page.goto("/cadastro", { waitUntil: "domcontentloaded" });
  expect(source?.status()).toBe(200);
  const csp = source.headers()["content-security-policy"];
  const nonce = nonceFrom(csp);
  expect(nonce).toBeTruthy();
  await expect(page.getByRole("main")).toBeVisible();
  const scriptCount = await page.locator("script[nonce]").count();
  expect(scriptCount).toBeGreaterThan(0);
  const matching = await page.locator("script[nonce]").evaluateAll(
    (elements, expected) =>
      elements.filter((element) => element.nonce === expected).length,
    nonce
  );
  expect(matching).toBe(scriptCount);
  await page.locator("#nomeCompleto").fill("Pessoa Fictícia de Teste");
  await expect(page.locator("#nomeCompleto")).toHaveValue(
    "Pessoa Fictícia de Teste"
  );
  expect(errors).toHaveLength(0);

  await page.route(/\/cadastro(?:\?.*)?$/, async (route) => {
    const original = await route.fetch();
    const originalHtml = await original.text();
    const alteredHtml = originalHtml.replace(
      /<head([^>]*)>/i,
      '<head$1><script>window.__phase9Unauthorized=1</script><img id="phase9-event-probe" src="/missing-phase9.png" onerror="window.__phase9EventHandler=1">'
    );
    expect(alteredHtml).not.toBe(originalHtml);
    await route.fulfill({ response: original, body: alteredHtml });
  });

  const guarded = await page.goto("/cadastro", { waitUntil: "domcontentloaded" });
  expect(guarded.status()).toBe(200);
  await expect(page.locator("#nomeCompleto")).toBeVisible();
  await page.locator("#nomeCompleto").fill("Outra Pessoa Sintética");
  await expect(page.locator("#nomeCompleto")).toHaveValue(
    "Outra Pessoa Sintética"
  );
  expect(await page.evaluate(() => window.__phase9Unauthorized === 1)).toBe(false);
  await expect(page.locator("#phase9-event-probe")).toBeAttached();
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__phase9EventHandler === 1)).toBe(false);
  process.stdout.write(
    "PHASE9_STAGING=" +
      JSON.stringify({
        scriptedInlineBlocked: true,
        inlineEventBlocked: true,
        hydrationWorks: true,
        nonceScriptCount: scriptCount,
        pageErrors: errors.length,
      }) +
      "\n"
  );
});

test("query string e redirecionamento nao reabrem execucao inline", async ({ page, request }) => {
  const marker = encodeURIComponent(
    '<script id="phase9-query-probe">window.__phase9Query=1</script>'
  );
  const response = await page.goto(`/cadastro?next=${marker}`, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  expect(nonceFrom(response?.headers()["content-security-policy"])).toBeTruthy();
  expect(await page.locator("#phase9-query-probe").count()).toBe(0);
  expect(await page.evaluate(() => window.__phase9Query === 1)).toBe(false);

  const redirect = await request.get("/dashboard", {
    headers: { accept: "text/html" },
    maxRedirects: 0,
  });
  expect([302, 303, 307, 308]).toContain(redirect.status());
  expect(nonceFrom(redirect.headers()["content-security-policy"])).toBeTruthy();
  expect(redirect.headers()["cache-control"]).toMatch(/no-store/);
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