import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import postgres from "postgres";

const PASSWORD = "Phase9-CI-Only-123!";
const EMAIL_A = "phase9-a@ci.invalid";
const EMAIL_PENDING = "phase9-pending@ci.invalid";
const EMAIL_ADMIN = "phase9-admin@ci.invalid";
const EMAIL_NO_PROFILE = "phase9-no-profile@ci.invalid";
const EMAIL_REVOCABLE = "phase9-revocable@ci.invalid";
const GESTANTE_A = "29000000-0000-4000-8000-000000000001";
const GESTANTE_B = "29000000-0000-4000-8000-000000000002";
const CLASSIFICATION_A = "39000000-0000-4000-8000-000000000001";
const CLASSIFICATION_B = "39000000-0000-4000-8000-000000000002";

const mutationHeaders = {
  origin: "http://127.0.0.1:3000",
  "sec-fetch-site": "same-origin",
};

function nonceFrom(header) {
  return header?.match(/'nonce-([^']+)'/)?.[1];
}

async function login(page, email, destination) {
  const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(nonceFrom(response?.headers()["content-security-policy"])).toBeTruthy();
  await page.locator("#identifier").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(destination, { timeout: 20_000 });
}

async function expectNoSeriousAxeViolations(page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical"
  );
  expect(
    blocking,
    blocking.map((item) => `${item.id}: ${item.nodes.flatMap((node) => node.target).join(", ")}`).join("\n")
  ).toEqual([]);
}

async function withEphemeralDatabase(callback) {
  const databaseUrl = process.env.PHASE9_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing ephemeral database URL");
  const parsed = new URL(databaseUrl);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "54322") {
    throw new Error("Refusing non-ephemeral database mutation");
  }
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    return await callback(sql);
  } finally {
    await sql.end();
  }
}

test("cadastro ignora tentativa de solicitar perfil privilegiado", async ({ page, request }) => {
  const email = "phase9-mass-assignment@ci.invalid";
  const payload = {
    nomeCompleto: "Pessoa Sintética Phase 9",
    dataNascimento: "01/01/1990",
    email,
    password: PASSWORD,
    ubsId: "00000000-0000-4000-8000-000000000101",
    perfil: "administrador",
    perfil_solicitado: "administrador",
    role: "service_role",
    ativo: true,
  };

  const crossSite = await request.post("/api/auth/cadastro", {
    headers: {
      origin: "https://cross-site.invalid",
      "sec-fetch-site": "cross-site",
    },
    data: payload,
  });
  expect(crossSite.status()).toBe(403);

  await page.goto("/cadastro", { waitUntil: "domcontentloaded" });
  const response = await page.evaluate(async (body) => {
    const result = await fetch("/api/auth/cadastro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: result.status,
      body: await result.json(),
    };
  }, payload);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const row = await withEphemeralDatabase(async (sql) => {
    const [profile] = await sql`
      select perfil::text, perfil_solicitado, aprovacao_status, ubs_id, ubs_solicitada_id
      from public.perfis
      where email = ${email}
    `;
    return profile;
  });
  expect(row).toMatchObject({
    perfil: "aluno",
    perfil_solicitado: "equipe_ubs",
    aprovacao_status: "pendente",
    ubs_id: null,
    ubs_solicitada_id: "00000000-0000-4000-8000-000000000101",
  });
});

test("profissional autenticado preserva CSP, sessão, responsividade e isolamento", async ({ page }) => {
  await login(page, EMAIL_A, /\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Profissional A Phase 9");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);

  for (const [path, heading] of [
    ["/dashboard", /Profissional A Phase 9/],
    ["/dashboard/gestantes", "Gestantes monitoradas"],
    ["/dashboard/alertas", "Alertas"],
    ["/dashboard/atendimentos", "Atendimentos"],
    ["/dashboard/perfil", "Perfil"],
  ]) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const csp = response?.headers()["content-security-policy"];
    expect(csp).toContain("strict-dynamic");
    expect(csp).toContain("script-src-attr 'none'");
    expect(nonceFrom(csp)).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  }

  const gestantesHtml = await page.goto("/dashboard/gestantes", { waitUntil: "domcontentloaded" }).then(() => page.content());
  expect(gestantesHtml).toContain("GST-PHASE9-A");
  expect(gestantesHtml).not.toContain("GST-PHASE9-B");
  expect(gestantesHtml).not.toContain(GESTANTE_B);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("main")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expectNoSeriousAxeViolations(page);
});

test("IDOR clínico, PDF e lixeira negam recurso do profissional B da mesma UBS", async ({ page }) => {
  await login(page, EMAIL_A, /\/dashboard$/);
  await page.goto(`/dashboard/cadastro-clinico?gestante=${GESTANTE_B}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page).toHaveURL(/\/dashboard\/gestantes$/);

  const api = page.context().request;
  const ownPdf = await api.get(`/api/classificacao-risco/${CLASSIFICATION_A}/pdf`);
  expect(ownPdf.status()).toBe(200);
  expect(ownPdf.headers()["content-type"]).toContain("application/pdf");
  expect(ownPdf.headers()["content-disposition"]).toContain("attachment");
  expect(ownPdf.headers()["cache-control"]).toContain("no-store");
  const ownPdfBytes = await ownPdf.body();
  expect(ownPdfBytes.subarray(0, 4).toString()).toBe("%PDF");
  const parsed = await PDFDocument.load(ownPdfBytes);
  expect(parsed.getPageCount()).toBeGreaterThan(0);

  const alienPdf = await api.get(`/api/classificacao-risco/${CLASSIFICATION_B}/pdf`);
  expect(alienPdf.status()).toBeGreaterThanOrEqual(400);
  expect(alienPdf.headers()["content-type"]).not.toContain("application/pdf");
  expect((await alienPdf.text())).not.toContain("GST-PHASE9-B");

  const alienTrash = await api.post("/api/gestantes/lixeira", {
    headers: mutationHeaders,
    data: { action: "trash", gestanteId: GESTANTE_B },
  });
  expect(alienTrash.status()).toBeGreaterThanOrEqual(400);

  const ownPage = await page.goto(`/dashboard/cadastro-clinico?gestante=${GESTANTE_A}`, {
    waitUntil: "domcontentloaded",
  });
  expect(ownPage?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Atualizar acompanhamento" })).toBeVisible();
});

test("PEC aceita preview CSV minimizado e rejeita XLSX", async ({ page }) => {
  await login(page, EMAIL_A, /\/dashboard$/);
  const api = page.context().request;
  const csv = Buffer.from(
    "Nome,Data de nascimento,Microarea,CPF\nPessoa Sintética,01/01/1990,01,00000000000\n",
    "utf8"
  );
  const preview = await api.post("/api/importacoes/pec", {
    headers: mutationHeaders,
    multipart: {
      mode: "preview",
      file: { name: "phase9.csv", mimeType: "text/csv", buffer: csv },
    },
  });
  expect(preview.status()).toBe(200);
  expect(preview.headers()["cache-control"]).toContain("no-store");
  const previewText = await preview.text();
  expect(previewText).not.toContain("Pessoa Sintética");
  expect(previewText).not.toContain("00000000000");

  const xlsx = await api.post("/api/importacoes/pec", {
    headers: mutationHeaders,
    multipart: {
      mode: "preview",
      file: {
        name: "phase9.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from("not-a-workbook"),
      },
    },
  });
  expect(xlsx.status()).toBe(400);
});

test("estados pendente, administrador e sem perfil recebem somente seus destinos", async ({ browser }) => {
  const scenarios = [
    [EMAIL_PENDING, /\/aguardando-aprovacao$/, "Acesso ainda não liberado"],
    [EMAIL_ADMIN, /\/dashboard\/autorizacoes$/, "Autorizações"],
    [EMAIL_NO_PROFILE, /\/completar-cadastro$/, "Complete seu cadastro"],
  ];
  for (const [email, destination, heading] of scenarios) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, email, destination);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await context.close();
  }
});

test("revogação invalida autorização com a sessão anterior ainda presente", async ({ page }) => {
  await login(page, EMAIL_REVOCABLE, /\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Profissional Revogável Phase 9");
  await withEphemeralDatabase(async (sql) => {
    await sql`
      update public.perfis
      set ativo = false, aprovacao_status = 'desativado'
      where email = ${EMAIL_REVOCABLE}
    `;
  });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/aguardando-aprovacao$/);
  await expect(page.getByText("Este acesso foi desativado pela gestão.")).toBeVisible();
});