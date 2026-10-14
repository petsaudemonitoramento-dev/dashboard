import test from "node:test";
import assert from "node:assert/strict";
import { buildProfessionalAlerts } from "../../src/lib/alertas/professional-alerts.ts";

const base = {
  gestante_id: "00000000-0000-4000-8000-000000000001",
  codigo: "GST-FICTICIA",
  nome_visual: "PACIENTE FICTÍCIA",
  risco_gestacional: "Risco habitual",
  pendencias_count: 0,
  dias_ultima_visita: 0,
  alta_ativa: false,
};

test("sininho agrupa diversos motivos por gestante e conta apenas uma vez", () => {
  const list = buildProfessionalAlerts([{
    ...base, risco_gestacional: "Alto risco",
    pendencias_count: 4, dias_ultima_visita: 45,
  }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].motivos.length, 3);
  assert.equal(list[0].aba, "gestacao");
  assert.equal(list[0].prioridade, "atencao");
});

test("sem indicador documentado, sem aviso; alta exclui os avisos", () => {
  assert.deepEqual(buildProfessionalAlerts([base]), []);
  assert.deepEqual(buildProfessionalAlerts([{
    ...base, alta_ativa: true, risco_gestacional: "Alto risco",
    pendencias_count: 9,
  }]), []);
});

test("o painel nunca descreve exame sem registro como procedimento não realizado", () => {
  const list = buildProfessionalAlerts([{ ...base, pendencias_count: 2 }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].aba, "exames");
  assert.match(list[0].motivos.join(" "), /pendência\(s\) documental\(is\)/);
  assert.doesNotMatch(list[0].motivos.join(" ").toLowerCase(), /não realizado|nao realizado/);
});

test("visita antiga direciona ao acompanhamento, sem interpretação clínica", () => {
  const list = buildProfessionalAlerts([{ ...base, dias_ultima_visita: 30 }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].aba, "consultas");
  assert.match(list[0].motivos[0], /Última visita registrada/);
});

test("ignora números ausentes, negativos e duplicatas de gestantes", () => {
  const list = buildProfessionalAlerts([
    { ...base, pendencias_count: -5, dias_ultima_visita: null, risco_gestacional: "Médio" },
    { ...base, pendencias_count: 9 },
  ]);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].motivos, ["Risco registrado: Médio"]);
});

test("riscos informados vêm antes de pendências documentais e preservam identidade", () => {
  const exams = {
    ...base,gestante_id:"00000000-0000-4000-8000-000000000002",
    codigo:"GST-002",nome_visual:"FICTICIA B",pendencias_count:10,
  };
  const risk = {
    ...base,gestante_id:"00000000-0000-4000-8000-000000000003",
    codigo:"GST-003",nome_visual:"FICTICIA C",risco_gestacional:"Alto risco",
  };
  const list=buildProfessionalAlerts([exams,risk]);
  assert.deepEqual(list.map(item=>item.codigo), ["GST-003","GST-002"]);
  assert.deepEqual(list.map(item=>item.nome), ["FICTICIA C","FICTICIA B"]);
});
