#!/usr/bin/env node
// Auditoria semanal a partir de package-lock, sem npm install nem scripts de terceiros.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

function audit(extraArgs) {
  const r = spawnSync("npm", ["audit", "--json", ...extraArgs], {
    encoding: "utf8",
    timeout: 90000,
    maxBuffer: 5 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  let report;
  try {
    report = JSON.parse(r.stdout || "{}");
  } catch {
    throw new Error("npm audit não retornou relatório JSON válido");
  }
  if (!report.metadata?.vulnerabilities) {
    throw new Error("npm audit indisponível (rede/registry); não aceitar como zero vulnerabilidades");
  }
  return report.metadata.vulnerabilities;
}

try {
  const runtime = audit(["--omit=dev"]);
  const complete = audit([]);
  const runtimeHigh = (runtime.high || 0) + (runtime.critical || 0);
  const allHigh = (complete.high || 0) + (complete.critical || 0);
  const devHigh = Math.max(0, allHigh - runtimeHigh);

  const lines = [
    "## Revisão semanal de dependências",
    "",
    "| Escopo | HIGH + CRITICAL |",
    "| --- | ---: |",
    `| Produção | ${runtimeHigh} |`,
    `| Dependências de desenvolvimento (diferença estimada) | ${devHigh} |`,
    "",
    "Produção tem gate obrigatório. Tooling de desenvolvimento é acompanhado sem forçar downgrade.",
    "Revisar qualquer PR de Dependabot e exigir CI antes de integrar.",
    "",
  ];
  const message = lines.join("\n");
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, message);
  }
  if (devHigh > 0) {
    console.log(`::warning::${devHigh} vulnerabilidade(s) HIGH/CRITICAL em dependências de desenvolvimento; verificar correção upstream compatível.`);
  }
  if (runtimeHigh > 0) {
    console.error(`::error::${runtimeHigh} vulnerabilidade(s) HIGH/CRITICAL em dependências de produção.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error("::error::Falha no npm audit: " + (error instanceof Error ? error.message : "erro desconhecido"));
  process.exitCode = 1;
}
