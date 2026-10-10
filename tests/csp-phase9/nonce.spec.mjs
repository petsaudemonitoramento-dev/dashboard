import { expect, test } from "@playwright/test";

test("nonce por request: SSR/hidratação no login sem quebrar CSP ativa", async ({ page }) => {
  await page.addInitScript(() => {
    window.__phase9ViolationCounts = {};
    document.addEventListener("securitypolicyviolation", (event) => {
      if (event.disposition !== "report") return;
      const key = event.effectiveDirective.replace(/[^a-z-]/g, "");
      if (key) window.__phase9ViolationCounts[key] =
        (window.__phase9ViolationCounts[key] ?? 0) + 1;
    });
  });

  const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(response.status()).toBe(200);
  const active = response.headers()["content-security-policy"];
  const candidate = response.headers()["content-security-policy-report-only"];
  expect(active).toContain("script-src 'self' 'unsafe-inline'");
  expect(candidate).toContain("strict-dynamic");
  expect(candidate).toContain("style-src-attr 'none'");
  expect(candidate).not.toContain("'unsafe-inline'");
  const nonce = candidate.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();

  // Next 16 deve nonciar seus próprios scripts se o HTML for renderizado
  // dinamicamente e a CSP enviada à renderização pelo proxy.
  const scriptCount = await page.locator("script[nonce]").count();
  expect(scriptCount).toBeGreaterThan(0);
  const matchingNonceCount = await page.locator("script[nonce]").evaluateAll((scripts, expected) =>
    scripts.filter((script) => script.nonce === expected).length, nonce);
  expect(matchingNonceCount).toBe(scriptCount);

  // Hidratação real sem usar uma conta ou chamar dados clínicos.
  await expect(page.getByRole("main")).toBeVisible();
  const passwordInput = page.locator("#password");
  await expect(passwordInput).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar senha" }).click();
  await expect(passwordInput).toHaveAttribute("type", "password");

  // Registrar apenas contagens e metadados agregados, sem URLs nem PII.
  await page.waitForTimeout(800);
  const counts = await page.evaluate(() => window.__phase9ViolationCounts);
  process.stdout.write("PHASE9_NONCE_COUNTS=" + JSON.stringify({
    nonceScripts: scriptCount, ...counts,
  }) + "\n");

  // Não permitir o uso de nonce reutilizado entre respostas.
  const next = await page.reload({ waitUntil: "domcontentloaded" });
  const secondNonce = next.headers()["content-security-policy-report-only"]
    ?.match(/'nonce-([^']+)'/)?.[1];
  expect(secondNonce).toBeTruthy();
  expect(secondNonce).not.toBe(nonce);
});

test("nonce experimental nunca é fornecido em rotas fora do login", async ({ request }) => {
  const response = await request.get("/recuperar-senha");
  expect(response.status()).toBeLessThan(400);
  expect(response.headers()["content-security-policy-report-only"]).toBeUndefined();
  expect(response.headers()["content-security-policy"]).toContain("'unsafe-inline'");
});
