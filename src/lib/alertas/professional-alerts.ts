/**
 * Avisos operacionais provenientes da lista de gestantes autorizadas.
 * Uma gestante = um item e uma unidade no contador, mesmo com vários sinais.
 * "Sem registro" nunca deve ser interpretado como "não realizado".
 */
export type ProfessionalAlertSource = {
  gestante_id: string;
  codigo: string;
  nome_visual: string;
  risco_gestacional: string | null;
  pendencias_count: number | null;
  dias_ultima_visita: number | null;
  alta_ativa: boolean;
};

export type ProfessionalAlert = {
  gestanteId: string;
  codigo: string;
  nome: string;
  prioridade: "atencao" | "conferencia";
  motivos: string[];
  aba: "gestacao" | "exames" | "consultas";
};

function riskLevel(text: string | null): number {
  const normalized = (text ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("alto")) return 1;
  if (normalized.includes("medio")) return 2;
  return 3;
}

export function buildProfessionalAlerts(rows: ProfessionalAlertSource[]): ProfessionalAlert[] {
  const items: Array<ProfessionalAlert & { score: number; pendencias: number }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.alta_ativa || seen.has(row.gestante_id)) continue;
    seen.add(row.gestante_id);
    const risk = riskLevel(row.risco_gestacional);
    const exams = Number.isFinite(row.pendencias_count) ?
      Math.max(0, Number(row.pendencias_count)) : 0;
    const days = Number.isFinite(row.dias_ultima_visita) ?
      Math.max(0, Number(row.dias_ultima_visita)) : 0;
    const reasons: string[] = [];
    if (risk < 3) reasons.push("Risco registrado: " + (row.risco_gestacional ?? "conferir"));
    if (exams > 0) reasons.push(exams + " pendência(s) documental(is) de exames");
    if (days >= 30) reasons.push("Última visita registrada há " + days + " dias");
    if (!reasons.length) continue;

    items.push({
      gestanteId: row.gestante_id,
      codigo: row.codigo,
      nome: row.nome_visual,
      prioridade: risk < 3 ? "atencao" : "conferencia",
      motivos: reasons,
      aba: risk < 3 ? "gestacao" : exams > 0 ? "exames" : "consultas",
      score: risk,
      pendencias: exams,
    });
  }
  items.sort((a,b) => a.score - b.score ||
    b.pendencias - a.pendencias ||
    a.codigo.localeCompare(b.codigo, "pt-BR"));
  return items.map(({score: _score, pendencias: _pendencias, ...alert}) => alert);
}
