import type {
  AnalyticsSummary,
  CategoryPoint,
  NullableNumber,
  UbsIndicator,
} from "./types";

export function formatPublishedNumber(value: NullableNumber): string {
  return value === null ? "—" : new Intl.NumberFormat("pt-BR").format(value);
}

export function formatPublishedPercent(value: NullableNumber): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "sem atualização informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "sem atualização informada";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export function formatMonth(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function publishedRatio(
  numerator: NullableNumber,
  denominator: NullableNumber
): NullableNumber {
  if (numerator === null || denominator === null || denominator <= 0) {
    return null;
  }
  return (numerator / denominator) * 100;
}

export function filterByUbs<T extends { ubsId: string }>(
  rows: T[],
  selectedUbsId: string
): T[] {
  return selectedUbsId === "all"
    ? rows
    : rows.filter((row) => row.ubsId === selectedUbsId);
}

export function aggregateCategories(
  rows: CategoryPoint[],
  selectedUbsId: string
): Array<{ categoria: string; ordem: number; quantidade: NullableNumber }> {
  const filtered = filterByUbs(rows, selectedUbsId);
  const grouped = new Map<
    string,
    { categoria: string; ordem: number; values: number[] }
  >();

  for (const row of filtered) {
    const current = grouped.get(row.categoria) ?? {
      categoria: row.categoria,
      ordem: row.ordem,
      values: [],
    };
    if (row.quantidade !== null) current.values.push(row.quantidade);
    grouped.set(row.categoria, current);
  }

  return [...grouped.values()]
    .sort((a, b) => a.ordem - b.ordem)
    .map((item) => ({
      categoria: item.categoria,
      ordem: item.ordem,
      quantidade:
        item.values.length === 0
          ? null
          : item.values.reduce((sum, value) => sum + value, 0),
    }));
}

export function selectedSummary(
  base: AnalyticsSummary,
  ubsIndicators: UbsIndicator[],
  riskRows: CategoryPoint[],
  captureRows: CategoryPoint[],
  selectedUbsId: string
): AnalyticsSummary {
  if (selectedUbsId === "all") return base;

  const row = ubsIndicators.find((item) => item.ubsId === selectedUbsId);
  if (!row) return base;

  const risk = aggregateCategories(riskRows, selectedUbsId);
  const capture = aggregateCategories(captureRows, selectedUbsId);
  const categoryValue = (
    rows: Array<{ categoria: string; quantidade: NullableNumber }>,
    category: string
  ) => rows.find((item) => item.categoria === category)?.quantidade ?? null;

  return {
    ubsAtivas: 1,
    microareasAtivas: null,
    gestantesAtivas: row.gestantesAtivas,
    altas: row.altas,
    altoRisco: row.altoRisco,
    medioRisco: row.medioRisco,
    riscoHabitual: categoryValue(risk, "Risco habitual"),
    captacaoPrecoce: row.captacaoPrecoce,
    captacaoTardia: row.captacaoTardia,
    captacaoSemDados: categoryValue(capture, "Sem dados"),
    consultasMeta: row.consultasMeta,
    gestantesComExamesPendentes: row.gestantesComExamesPendentes,
    totalExamesPendentes: row.totalExamesPendentes,
    dtpaPendente: row.dtpaPendente,
    percentualCaptacaoPrecoce: row.percentualCaptacaoPrecoce,
    percentualMetaConsultas: row.percentualMetaConsultas,
    atualizadoEm: row.atualizadoEm,
  };
}
