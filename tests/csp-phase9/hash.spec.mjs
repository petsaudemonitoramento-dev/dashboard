import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const scriptHashes = (html) => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((body) => body.length > 0)
  .map((body) => "sha256-" + createHash("sha256").update(body, "utf8").digest("base64"));

test("hashes CSP por resposta: compatibilidade de login estático e variação", async ({ page }) => {
  const snapshots = [];
  let enforceInBrowserOnly = false;
  const browserErrors = [];
  page.on("pageerror", () => browserErrors.push(1));

  await page.addInitScript(() => {
    window.__phase9HashViolations = {};
    document.addEventListener("securitypolicyviolation", (event) => {
      if (event.disposition !== "report") return;
      const name = event.effectiveDirective.replace(/[^a-z-]/g, "");
      if (name) window.__phase9HashViolations[name] =
        (window.__phase9HashViolations[name] ?? 0) + 1;
    });
  });

  // Interceptação APENAS no navegador Playwright; não muda o site, proxy,
  // headers da plataforma ou aplicação. O teste usa somente HTML público.
  await page.route(/\/login(?:\?.*)?$/, async (route) => {
    const original = await route.fetch();
    const body = await original.text();
    const hashes = scriptHashes(body);
    const candidate = [
      "default-src 'self'",
      "script-src 'self' " + hashes.map((hash) => "'" + hash + "'").join(" "),
      "style-src 'self' 'unsafe-inline'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; ");
    snapshots.push({ count: hashes.length, hashes, headerBytes: Buffer.byteLength(candidate) });
    // HTML adulterado apenas dentro do Chromium: simular uma inserção
    // parser-inserted não autorizada pelos hashes e verificar bloqueio.
    const servedHtml = enforceInBrowserOnly
      ? body.replace(
          /<head([^>]*)>/i,
          '<head$1><script>window.__phase9UnauthorizedHashProbe = 1</script>'
        )
      : body;
    await route.fulfill({
      response: original,
      body: servedHtml,
      headers: {
        ...original.headers(),
        "content-security-policy-report-only": candidate,
        ...(enforceInBrowserOnly ? { "content-security-policy": candidate } : {}),
      },
    });
  });

  const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain("'unsafe-inline'");
  expect(response.headers()["content-security-policy-report-only"]).toContain("sha256-");
  expect(response.headers()["content-security-policy-report-only"]).not.toContain("script-src 'self' 'unsafe-inline'");
  expect(snapshots[0].count).toBeGreaterThan(0);
  await expect(page.getByRole("main")).toBeVisible();
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await page.waitForTimeout(600);
  const violation1 = await page.evaluate(() => window.__phase9HashViolations);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const violation2 = await page.evaluate(() => window.__phase9HashViolations);
  expect(snapshots).toHaveLength(2);
  const sameWithinBuild = JSON.stringify(snapshots[0].hashes) === JSON.stringify(snapshots[1].hashes);

  // Não expor conteúdo, URLs nem valores. Expor somente contagens e custo do cabeçalho.
  process.stdout.write("PHASE9_HASH_ASSESSMENT=" + JSON.stringify({
    inlineScriptsFirst: snapshots[0].count,
    inlineScriptsSecond: snapshots[1].count,
    hashesStableWithinSameBuild: sameWithinBuild,
    headerBytes: snapshots[0].headerBytes,
    cspViolationCountsFirst: violation1,
    cspViolationCountsSecond: violation2,
  }) + "\n");

  // Terceira navegação: enforcement estrito SOMENTE no browser de teste.
  // Os cabeçalhos originais do serviço e as configurações Vercel não mudam.
  enforceInBrowserOnly = true;
  const enforced = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(enforced.status()).toBe(200);
  const enforcedHeader = enforced.headers()["content-security-policy"];
  expect(enforcedHeader).toContain("sha256-");
  expect(enforcedHeader).not.toContain("script-src 'self' 'unsafe-inline'");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  expect(browserErrors).toHaveLength(0);
  const unauthorizedExecuted = await page.evaluate(
    () => window.__phase9UnauthorizedHashProbe === 1
  );
  expect(unauthorizedExecuted).toBe(false);
  process.stdout.write("PHASE9_HASH_ENFORCEMENT=" + JSON.stringify({
    browserOnly: true, loginInteractive: true, unauthorizedInlineBlocked: true, pageErrors: browserErrors.length,
  }) + "\n");

  // Comparar os mesmos scripts públicos entre DOIS builds limpos no mesmo runner.
  // Armazenar somente digests/contagens, nunca HTML ou conteúdo.
  const summaryFile = process.env.PHASE9_HASH_SUMMARY_FILE;
  if (summaryFile) {
    const current = snapshots[0].hashes;
    if (!existsSync(summaryFile)) {
      writeFileSync(summaryFile, JSON.stringify(current), "utf8");
      process.stdout.write("PHASE9_HASH_BUILD_BASELINE=recorded\n");
    } else {
      const previous = JSON.parse(readFileSync(summaryFile, "utf8"));
      const stableAcrossBuilds = JSON.stringify(previous) === JSON.stringify(current);
      process.stdout.write("PHASE9_HASH_BUILD_COMPARISON=" + JSON.stringify({
        stableAcrossBuilds,
        previousScriptCount: previous.length,
        currentScriptCount: current.length,
      }) + "\n");
    }
  }

});
