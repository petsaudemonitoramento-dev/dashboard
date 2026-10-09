import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  {
    name: "login",
    path: "/login",
    heading: "Cuidado na Gestação na APS",
    labels: ["E-mail ou usuário", "Senha"],
    controls: [
      { role: "button", name: "Continuar com Google" },
      { role: "button", name: "Entrar" },
      { role: "link", name: "Criar conta" },
    ],
  },
  {
    name: "cadastro",
    path: "/cadastro",
    heading: "Criar conta",
    labels: [
      "Nome completo",
      "Data de nascimento",
      "UBS",
      "E-mail",
      "Senha",
      "Confirmar senha",
    ],
    controls: [
      { role: "button", name: "Abrir calendário" },
      { role: "button", name: "Criar conta" },
    ],
  },
  {
    name: "recuperação de senha",
    path: "/recuperar-senha",
    heading: "Recuperar senha",
    labels: ["E-mail"],
    controls: [{ role: "button", name: "Enviar instruções" }],
  },
  {
    name: "redefinição de senha",
    path: "/redefinir-senha",
    heading: "Definir nova senha",
    labels: ["Nova senha", "Confirmar nova senha"],
    controls: [{ role: "button", name: "Atualizar senha" }],
  },
];

function describeViolations(violations) {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .flatMap((node) => node.target)
        .join(", ");
      return violation.id + " [" + violation.impact + "]: " + targets;
    })
    .join("\n");
}

for (const publicPage of pages) {
  test(publicPage.name + " não possui barreiras graves/críticas", async ({ page }) => {
    const response = await page.goto(publicPage.path, {
      waitUntil: "networkidle",
    });

    expect(response).not.toBeNull();
    expect(response.status()).toBeLessThan(400);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: publicPage.heading,
      })
    ).toBeVisible();

    for (const label of publicPage.labels) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }

    for (const control of publicPage.controls) {
      await expect(
        page.getByRole(control.role, {
          name: control.name,
          exact: true,
        })
      ).toBeVisible();
    }

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) =>
        violation.impact === "serious" ||
        violation.impact === "critical"
    );

    expect(blocking, describeViolations(blocking)).toEqual([]);

    await page.keyboard.press("Tab");
    const firstFocused = page.locator(":focus");
    await expect(firstFocused).toBeVisible();
    const firstDescriptor = await firstFocused.evaluate(
      (element) =>
        element.tagName +
        ":" +
        (element.getAttribute("id") ||
          element.getAttribute("name") ||
          element.textContent?.trim() ||
          "")
    );

    await page.keyboard.press("Tab");
    const secondFocused = page.locator(":focus");
    await expect(secondFocused).toBeVisible();
    const secondDescriptor = await secondFocused.evaluate(
      (element) =>
        element.tagName +
        ":" +
        (element.getAttribute("id") ||
          element.getAttribute("name") ||
          element.textContent?.trim() ||
          "")
    );

    expect(secondDescriptor).not.toBe(firstDescriptor);
  });
}