import { ALIASES, normalizeHeader, type ParsedPecFile } from "./columns.ts";

export type PecColumnIssue = {
  coluna: string;
  tipo: "nova" | "duplicada" | "possivel_equivalente";
  sugestao?: string;
};

export type PecSchemaAudit = {
  totalColunas: number;
  reconhecidas: number;
  novas: PecColumnIssue[];
  duplicadas: PecColumnIssue[];
  obrigatoriasAusentes: string[];
  valoresSuspeitos: Array<{ campo: string; ocorrencias: number }>;
  exigeRevisao: boolean;
  impedeImportacao: boolean;
  versao: "pec-schema-v1";
};

const SAFE_KEYS = new Set([
  "atendimentos_pre_natal", "atendimentos_ate_12_semanas",
  "atendimentos_odontologicos", "medicoes_pressao", "medicoes_peso_altura",
  "visitas_pre_natal", "visitas_puerperio", "atendimentos_puerperio",
]);

const DATE_KEYS = new Set([
  "data_nascimento", "dum", "dpp_dum", "dpp_ecografia",
  "ultima_consulta_pre_natal", "ultima_consulta_puerperio",
  "data_ultimo_peso_altura", "data_ultima_pressao",
]);

function validDate(value: string): boolean {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!iso && !br) return false;
  const year = Number(iso?.[1] ?? br?.[3]);
  const month = Number(iso?.[2] ?? br?.[2]);
  const day = Number(iso?.[3] ?? br?.[1]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function similarity(a: string, b: string): number {
  const x = new Set(a.split(" ").filter(Boolean));
  const y = new Set(b.split(" ").filter(Boolean));
  if (!x.size || !y.size) return 0;
  let intersection = 0;
  for (const token of x) if (y.has(token)) intersection++;
  return intersection / (x.size + y.size - intersection);
}

const aliases = Object.entries(ALIASES)
  .flatMap(([canonical, names]) => names.map((name) => ({canonical, label: normalizeHeader(name)})));

function suggest(header: string): string | undefined {
  const key = normalizeHeader(header);
  let best: { canonical: string; score: number } | null = null;
  for (const alias of aliases) {
    const score = similarity(key, alias.label);
    if (score > (best?.score ?? 0)) best = { canonical: alias.canonical, score };
  }
  // Only a proposal; the importer NEVER maps a new column using fuzzy matching.
  return best && best.score >= 0.65 ? best.canonical : undefined;
}

export function analyzePecSchema(parsed: ParsedPecFile): PecSchemaAudit {
  const recognized = new Set(Object.values(parsed.mapping));
  const newColumns: PecColumnIssue[] = [];
  const duplicates: PecColumnIssue[] = [];
  const index = new Map<string, string>();
  const normalizedIndex = new Map<string, string>();
  for (const header of parsed.headers) {
    const normalized = normalizeHeader(header.replace(/\\s+\\(\\d+\\)$/, ""));
    const first = normalizedIndex.get(normalized);
    if (first) {
      duplicates.push({ coluna: header, tipo: "duplicada" });
    } else {
      normalizedIndex.set(normalized, header);
    }

    const canonical = Object.keys(parsed.mapping).find((field) => parsed.mapping[field] === header);
    if (canonical) {
      const previous = index.get(canonical);
      if (previous) duplicates.push({ coluna: header, tipo: "duplicada" });
      else index.set(canonical, header);
    } else {
      const match = aliases.find((item) => item.label === normalized);
      if (match && parsed.mapping[match.canonical] !== header) {
        duplicates.push({ coluna: header, tipo: "duplicada" });
      } else {
        const candidate = suggest(header);
        newColumns.push({
          coluna: header,
          tipo: candidate ? "possivel_equivalente" : "nova",
          ...(candidate ? { sugestao: candidate } : {}),
        });
      }
    }
  }
  const missing = ["nome", "data_nascimento", "microarea"].filter((k) => !parsed.mapping[k]);
  const suspiciousCount = new Map<string, number>();
  for (const row of parsed.rows) {
    for (const [field, value] of Object.entries(row.canonical)) {
      const invalid = SAFE_KEYS.has(field)
        ? !/^\d+$/.test(value.trim()) || Number(value) > 999
        : DATE_KEYS.has(field)
          ? !validDate(value)
          : false;
      if (invalid) suspiciousCount.set(field, (suspiciousCount.get(field) ?? 0) + 1);
    }
  }
  return {
    totalColunas: parsed.headers.length,
    reconhecidas: recognized.size,
    novas: newColumns,
    duplicadas: duplicates,
    obrigatoriasAusentes: missing,
    valoresSuspeitos: [...suspiciousCount.entries()].map(([campo, ocorrencias]) => ({campo, ocorrencias})),
    exigeRevisao: newColumns.length > 0 || duplicates.length > 0 ||
      missing.length > 0 || suspiciousCount.size > 0,
    impedeImportacao: duplicates.length > 0 || missing.length > 0 || suspiciousCount.size > 0,
    versao: "pec-schema-v1",
  };
}
