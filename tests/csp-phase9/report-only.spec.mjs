import { expect, test } from "@playwright/test";

// Coleta SOMENTE contagens por diretiva (sem URL, email, nomes ou campos clínicos).
test("Fase 9: CSP estrita observa violações sem bloquear o login", async ({ page }) => {
  await page.addInitScript(() => {
    window.__phase9Counts = {};
    document.addEventListener("securitypolicyviolation", (event) => {
      if (event.disposition !== "report") return;
      const directive = event.effectiveDirective.replace(/[^a-z-]/g, "");
      if (!directive) return;
      window.__phase9Counts[directive] =
        (window.__phase9Counts[directive] ?? 0) + 1;
    });
  });

  const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response.status()).toBeLessThan(400);

  const enforced = response.headers()["content-security-policy"];
  const candidate = response.headers()["content-security-policy-report-only"];
  expect(enforced).toContain("script-src 'self' 'unsafe-inline'");
  expect(enforced).toContain("style-src 'self' 'unsafe-inline'");
  expect(candidate).toContain("script-src 'self'");
  expect(candidate).toContain("style-src 'self'");
  expect(candidate).not.toContain("'unsafe-inline'");
  expect(candidate).not.toContain("'unsafe-eval'");

  await expect(page.getByRole("main")).toBeVisible();
  // Sonda sintética: a CSP ativa deve permitir o script inofensivo,
  // enquanto a política de observação deve registrar a tentativa.
  const ran = await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__phase9Probe = 1;";
    document.head.appendChild(script);
    script.remove();
    return window.__phase9Probe === 1;
  });
  expect(ran).toBe(true);

  await page.waitForTimeout(1200);
  const counts = await page.evaluate(() => window.__phase9Counts ?? {});
  const reportedScript =
    (counts["script-src"] ?? 0) + (counts["script-src-elem"] ?? 0);
  expect(reportedScript).toBeGreaterThan(0);
  // O número depende da versão do Next.js; nunca falhar pela mera existência
  // de violações no modo observação, nem registrar valores das páginas.
  process.stdout.write("PHASE9_CSP_DIRECTIVE_COUNTS=" + JSON.stringify(counts) + "\n");
});
