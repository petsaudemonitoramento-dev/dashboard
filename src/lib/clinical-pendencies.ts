// Suggested documentation checks, never a clinical order or official C3 score.
export type PendingConfig = { codigo: string; nome: string; semanaInicio: number | null; semanaFim?: number | null; condicaoAplicacao: string | null; trimestre?: number };
type Entry = { codigo: string; trimestre?: number; status: string };

export function pendingItems<T extends PendingConfig>(
  configs: T[], entries: Entry[], weeks: number | null, kind: "exam" | "vaccine",
  prenatalActive: boolean
): T[] {
  if (!prenatalActive || weeks === null || !Number.isFinite(weeks) || weeks < 0) return [];
  const byKey = new Map(entries.map(e => [kind === "exam" ? e.codigo + ":" + e.trimestre : e.codigo, e.status]));
  const trimesterStart = (t?: number) => t === 3 ? 28 : t === 2 ? 14 : 0;
  return configs.filter(c => {
    const status = byKey.get(kind === "exam" ? c.codigo + ":" + c.trimestre : c.codigo);
    const start = Math.max(c.semanaInicio ?? 0, kind === "exam" ? trimesterStart(c.trimestre) : 0);
    if (weeks < start) return false;
    // Keep overdue routine documentation visible; never treat a missed window as a new clinical indication.
    if (["realizado","resultado_alterado","realizada","nao_se_aplica"].includes(status ?? "")) return false;
    // A rapid HIV test and laboratory Anti-HIV are alternative screening records.
    if (kind === "exam" && ["hiv_t1","hiv_rapido_t1"].includes(c.codigo)) {
      const other = byKey.get((c.codigo === "hiv_t1" ? "hiv_rapido_t1" : "hiv_t1") + ":1");
      if (["realizado","resultado_alterado"].includes(other ?? "")) return false;
      // When both remain undocumented, suggest one screening check, not two tests.
      if (c.codigo === "hiv_rapido_t1" && configs.some(x => x.codigo === "hiv_t1" && x.trimestre === 1) && status !== "pendente" && status !== "solicitado" && byKey.get("hiv_t1:1") !== "nao_se_aplica") return false;
      if (c.codigo === "hiv_t1" && ["pendente","solicitado"].includes(other ?? "") && !["pendente","solicitado"].includes(status ?? "")) return false;
    }
    const routineVaccine = kind === "vaccine" && ["dtpa","vvsr"].includes(c.codigo);
    if (c.condicaoAplicacao && !routineVaccine) return ["pendente","solicitado","agendada"].includes(status ?? "");
    return true;
  });
}

export function weeksFromDum(dum: string | null | undefined, today: string, fallback: number | null): number | null {
  if (!dum) return fallback;
  const days = (Date.parse(today.slice(0,10)+"T00:00:00Z") - Date.parse(dum.slice(0,10)+"T00:00:00Z")) / 86400000;
  return Number.isFinite(days) && days >= 0 ? Math.floor(days / 7) : fallback;
}
