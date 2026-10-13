import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePecFile } from "../../src/lib/pec/columns.ts";
import { analyzePecSchema } from "../../src/lib/pec/schema-audit.ts";
import { evaluateC3Coverage } from "../../src/lib/c3/coverage.ts";

const fixture = new URL("../fixtures/pec-c3-estrutura-real-60-sintetico.csv", import.meta.url);

test("espelho exato do PEC original: 60 colunas e linha 26", async () => {
  const contents = await readFile(fixture);
  const parsed = parsePecFile(contents, "paciente-ficticia-real-layout.csv");
  assert.equal(parsed.headerRow, 26);
  assert.equal(parsed.headers.length, 60);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].linha, 27);

  const canonical = parsed.rows[0].canonical;
  assert.equal(canonical.nome, "PACIENTE FICTICIA C3 001");
  assert.equal(canonical.microarea, "07");
  assert.equal(canonical.data_nascimento, "15/04/1998");
  assert.equal(canonical.ig_dum_semanas, "31");
  assert.equal(canonical.exame_sifilis_primeiro, "REALIZADO");
  assert.equal(canonical.atendimentos_pre_natal, "5");
  assert.equal(canonical.visitas_pre_natal, "2");
  assert.equal(canonical.ultima_consulta_puerperio, "-");
  assert.equal(Object.hasOwn(parsed.rows[0].extras, "CPF"), false);

  const audit = analyzePecSchema(parsed);
  assert.equal(audit.impedeImportacao, false);
  assert.equal(audit.exigeRevisao, false, "os 60 titulos oficiais conhecidos nao devem obrigar repetidas confirmacoes");
  assert.equal(audit.novas.length, 0);
  assert.equal(audit.duplicadas.length, 0);
  assert.deepEqual(audit.obrigatoriasAusentes, []);
  assert.deepEqual(audit.valoresSuspeitos, []);
  assert.ok(Object.hasOwn(parsed.rows[0].extras, "Meses desde o último atendimento médico"));
});

test("valor '-' do PEC representa campo ausente, nao dado clinico presumido", async () => {
  const parsed = parsePecFile(await readFile(fixture), "paciente-ficticia-real-layout.csv");
  assert.equal(parsed.rows[0].canonical.ultima_consulta_puerperio, "-");
  const audit = analyzePecSchema(parsed);
  assert.equal(audit.valoresSuspeitos.length, 0);
  assert.equal(parsed.rows[0].canonical.visitas_puerperio, "0");
  assert.equal(parsed.rows[0].canonical.atendimentos_puerperio, "0");
});

test("paciente parcial gera checklist C3 sem falsamente atribuir 100 pontos", async () => {
  const parsed = parsePecFile(await readFile(fixture), "paciente-ficticia-real-layout.csv");
  const c = parsed.rows[0].canonical;
  const record = {
    gestacao: { inicioPreNatal: "" },
    acompanhamento: {
      atendimentosPreNatal: Number(c.atendimentos_pre_natal || 0),
      atendimentosAte12Semanas: Number(c.atendimentos_ate_12_semanas || 0),
      medicoesPressao: Number(c.medicoes_pressao || 0),
      medicoesPesoAltura: Number(c.medicoes_peso_altura || 0),
      visitasPreNatal: Number(c.visitas_pre_natal || 0),
      visitasPuerperio: Number(c.visitas_puerperio || 0),
      atendimentosPuerperio: Number(c.atendimentos_puerperio || 0),
      atendimentosOdontologicos: Number(c.atendimentos_odontologicos || 0),
    },
    vacinas: [],
    consultas: [],
    exames: [],
  };
  const result = evaluateC3Coverage(record);
  assert.equal(result.itens.length, 11);
  assert.ok(result.informados > 0 && result.informados < 11);
  assert.equal(result.pontuacaoOficialCalculada, false);
});
