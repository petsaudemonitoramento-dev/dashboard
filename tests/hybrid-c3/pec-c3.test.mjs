import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePecFile } from "../../src/lib/pec/columns.ts";
import { analyzePecSchema } from "../../src/lib/pec/schema-audit.ts";
import { evaluateC3Coverage } from "../../src/lib/c3/coverage.ts";

const header = [
  "Nome do Cidadão", "Data de nascimento", "Microárea",
  "Quantidade de atendimentos no pré-natal", "DUM", "DPP DUM",
  "Quantidade de medições de pressão arterial",
  "Quantidade de medições simultâneas de peso e altura",
];
const row = [
  "Paciente Sintética Um", "12/04/2001", "07", "7", "12/01/2026",
  "19/10/2026", "7", "7",
];

function csv(headers, rows, preamble = 0) {
  return Buffer.from([
    ...Array.from({length:preamble}, (_, i) => "Relatório sintético linha " + (i + 1)),
    headers.join(";"),
    ...rows.map((r) => r.join(";")),
  ].join("\n"), "utf8");
}

function audit(headers, rows, preamble = 0) {
  const parsed = parsePecFile(csv(headers, rows, preamble), "pec-sintetico.csv");
  return {parsed, diagnosis: analyzePecSchema(parsed)};
}

test("detecta cabecalho movido para linha 26 sem depender de posicao", () => {
  const {parsed, diagnosis} = audit(header, [row], 25);
  assert.equal(parsed.headerRow, 26);
  assert.equal(parsed.rows.length, 1);
  assert.equal(diagnosis.impedeImportacao, false);
  assert.equal(diagnosis.novas.length, 0);
});

test("identifica colunas novas e nao inventa equivalencia automatica", () => {
  const {parsed, diagnosis} = audit([...header, "Consultas por mensagem"],
    [[...row, "4"]]);
  assert.equal(diagnosis.novas.length, 1);
  assert.equal(diagnosis.novas[0].coluna, "Consultas por mensagem");
  assert.equal(diagnosis.exigeRevisao, true);
  assert.equal(parsed.rows[0].canonical.atendimentos_pre_natal, "7");
  assert.equal(parsed.mapping.atendimentos_pre_natal, header[3]);
  assert.equal(parsed.mapping["consultas_por_mensagem"], undefined);
});

test("bloqueia mesmo campo canonico duplicado em duas colunas", () => {
  const {diagnosis} = audit([...header, "Data da última menstruação"],
    [[...row, "12/01/2026"]]);
  assert.ok(diagnosis.duplicadas.length > 0);
  assert.equal(diagnosis.impedeImportacao, true);
});

test("bloqueia data impossivel e contagem negativa em dado PEC", () => {
  const bad = [...row];
  bad[1] = "29/02/2025";
  bad[3] = "-7";
  const {diagnosis} = audit(header, [bad]);
  assert.equal(diagnosis.impedeImportacao, true);
  assert.ok(diagnosis.valoresSuspeitos.some((x) => x.campo === "data_nascimento"));
  assert.ok(diagnosis.valoresSuspeitos.some((x) => x.campo === "atendimentos_pre_natal"));
});

test("aceita ano bissexto valido, mas nao reinterpreta valor ambiguo", () => {
  const good = [...row];
  good[1] = "29/02/2024";
  const {diagnosis} = audit(header, [good]);
  assert.equal(diagnosis.valoresSuspeitos.length, 0);
});

test("nao exibe CPF ou nome como extras na pre-visualizacao", () => {
  const cols = [...header, "CPF", "Telefone celular"];
  const {parsed} = audit(cols, [[...row, "00000000000", "000000000"]]);
  assert.equal(parsed.rows[0].extras.CPF, undefined);
  assert.equal(parsed.rows[0].extras["Telefone celular"], undefined);
  assert.equal(parsed.rows[0].canonical.cpf, "00000000000");
});

test("C3 contem exatamente 11 praticas, 100 pontos possiveis e nunca atesta pontuacao oficial", () => {
  const fake = {
    gestacao: { inicioPreNatal: "" },
    acompanhamento: {
      atendimentosPreNatal: 0, atendimentosAte12Semanas: 0,
      medicoesPressao: 0, medicoesPesoAltura: 0, visitasPreNatal: 0,
      visitasPuerperio: 0, atendimentosPuerperio: 0, atendimentosOdontologicos: 0,
    },
    consultas: [], exames: [], vacinas: [],
  };
  const result = evaluateC3Coverage(fake);
  assert.equal(result.itens.length, 11);
  assert.equal(result.itens.map((x) => x.codigo).join(""), "ABCDEFGHIJK");
  assert.equal(result.itens.reduce((sum, x) => sum + x.pontosPossiveis, 0), 100);
  assert.equal(result.informados, 0);
  assert.equal(result.pontuacaoOficialCalculada, false);
});

test("dados agregados do PEC geram pendencia de validacao, nao comprovacao de meta", () => {
  const fake = {
    gestacao: { inicioPreNatal: "2026-02-01" },
    acompanhamento: {
      atendimentosPreNatal: 7, atendimentosAte12Semanas: 1,
      medicoesPressao: 7, medicoesPesoAltura: 7, visitasPreNatal: 3,
      visitasPuerperio: 1, atendimentosPuerperio: 1, atendimentosOdontologicos: 1,
    },
    consultas: [],
    vacinas: [{codigo:"DTPA", nome:"Vacina dTpa", status:"realizada", dataAplicacao:"2026-06-01"}],
    exames: [
      {codigo:"HIV", nome:"HIV", trimestre:1, status:"realizado"},
      {codigo:"SIF", nome:"Sífilis", trimestre:1, status:"realizado"},
      {codigo:"HBS", nome:"Hepatite B", trimestre:1, status:"realizado"},
      {codigo:"HCV", nome:"Hepatite C", trimestre:1, status:"realizado"},
      {codigo:"HIV", nome:"HIV", trimestre:3, status:"realizado"},
      {codigo:"SIF", nome:"Sífilis", trimestre:3, status:"realizado"},
    ],
  };
  const result = evaluateC3Coverage(fake);
  assert.equal(result.informados, 11);
  assert.equal(result.semInformacao, 0);
  assert.equal(result.pontuacaoOficialCalculada, false);
  assert.ok(result.itens[0].orientacao.includes("Conferir"));
});

test("importador analisa 20 gestantes ficticias e cabecalho PEC na linha 26", async () => {
  const fixture = await readFile(
    new URL("../fixtures/pec-c3-20-gestantes-sinteticas.csv", import.meta.url)
  );
  const parsed = parsePecFile(fixture, "pec-c3-20-gestantes-sinteticas.csv");
  const report = analyzePecSchema(parsed);
  assert.equal(parsed.headerRow, 26);
  assert.equal(parsed.rows.length, 20);
  assert.equal(report.impedeImportacao, false);
  assert.equal(report.novas.length, 0);
  assert.equal(report.valoresSuspeitos.length, 0);
  assert.ok(parsed.rows.every((row) => row.canonical.nome.startsWith("Paciente Sintetica C3")));
  assert.ok(parsed.rows.every((row) => !row.raw.CPF && !row.raw.CNS));
});

test("bloqueia cabecalhos fisicamente repetidos mesmo apos sufixo de desambiguacao", () => {
  const {diagnosis} = audit([...header, "Nome do Cidadão"], [[...row, "Paciente Sintética Duplicada"]]);
  assert.equal(diagnosis.impedeImportacao, true);
  assert.ok(diagnosis.duplicadas.length > 0);
});

test("colunas novas de email, filiacao e prontuario nao entram em extras", () => {
  const extra = ["E-mail do paciente", "Nome da mae", "Identidade", "Numero do prontuario"];
  const {parsed, diagnosis} = audit(
    [...header, ...extra],
    [[...row, "nao-real@example.invalid", "Filiacao Ficticia", "0000", "12345"]]
  );
  assert.equal(diagnosis.novas.length, 4);
  for (const name of extra) assert.equal(parsed.rows[0].extras[name], undefined);
  assert.equal(diagnosis.exigeRevisao, true);
});
