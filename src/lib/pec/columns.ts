import * as XLSX from "xlsx";

export type ParsedPecRow = {
  linha: number;
  raw: Record<string, string>;
  canonical: Record<string, string>;
  extras: Record<string, string>;
};

export type ParsedPecFile = {
  sheetName: string;
  headerRow: number;
  headers: string[];
  mapping: Record<string, string>;
  rows: ParsedPecRow[];
  warnings: string[];
};

export const ALIASES: Record<string, string[]> = {
  nome: ["nome", "nome do cidadao", "nome da pessoa", "paciente"],
  data_nascimento: ["data de nascimento", "dt nascimento", "nascimento"],
  idade_texto: ["idade"],
  sexo: ["sexo"],
  identidade_genero: ["identidade de genero"],
  raca_cor: ["raca cor", "raca/cor"],
  bolsa_familia: [
    "beneficiario do programa bolsa familia",
    "beneficiaria do programa bolsa familia",
    "bolsa familia",
  ],
  vigencia_bolsa_familia: ["vigencia do programa bolsa familia"],
  cpf: ["cpf"],
  cns: ["cns", "cartao sus", "cartao nacional de saude"],
  telefone_celular: ["telefone celular", "celular"],
  telefone_residencial: ["telefone residencial"],
  telefone_contato: ["telefone de contato"],
  microarea: ["microarea", "micro area"],
  rua: ["rua", "logradouro"],
  numero: ["numero", "número"],
  complemento: ["complemento"],
  bairro: ["bairro"],
  municipio: ["municipio", "cidade"],
  uf: ["uf", "estado"],
  cep: ["cep"],
  dias_ultimo_atendimento_medico: ["dias desde o ultimo atendimento medico"],
  dias_ultimo_atendimento_enfermagem: ["dias desde o ultimo atendimento de enfermagem"],
  dias_ultimo_atendimento_odontologico: ["dias desde o ultimo atendimento odontologico"],
  dias_ultima_visita: ["dias desde a ultima visita domiciliar"],
  peso_kg: ["ultima medicao de peso", "peso"],
  altura_cm: ["ultima medicao de altura", "altura"],
  data_ultimo_peso_altura: ["data da ultima medicao de peso e altura"],
  pressao_arterial: ["ultima medicao de pressao arterial", "pressao arterial"],
  data_ultima_pressao: ["data da ultima medicao de pressao arterial"],
  risco_gestacional: ["risco gestacional", "classificacao de risco"],
  dum: ["dum", "data da ultima menstruacao"],
  ig_dum_semanas: ["ig dum semanas"],
  ig_dum_dias: ["ig dum dias"],
  dpp_dum: ["dpp dum"],
  ig_ecografia_semanas: ["ig ecografia obstetrica semanas"],
  ig_ecografia_dias: ["ig ecografia obstetrica dias"],
  dpp_ecografia: ["dpp ecografia obstetrica"],
  atendimentos_pre_natal: ["quantidade de atendimentos no pre natal"],
  atendimentos_ate_12_semanas: [
    "quantidade de atendimentos ate 12 semanas no pre natal",
  ],
  ultima_consulta_pre_natal: ["ultima consulta de pre natal"],
  atendimentos_odontologicos: [
    "quantidade de atendimentos odontologicos no pre natal",
  ],
  dtpa: ["dtpa"],
  medicoes_altura_uterina: ["quantidade de medicoes de altura uterina"],
  medicoes_pressao: ["quantidade de medicoes de pressao arterial"],
  medicoes_peso_altura: [
    "quantidade de medicoes simultaneas de peso e altura",
  ],
  exame_hiv_primeiro: ["exame de hiv no primeiro trimestre"],
  exame_sifilis_primeiro: ["exame de sifilis no primeiro trimestre"],
  exame_hepatite_b_primeiro: ["exame de hepatite b no primeiro trimestre"],
  exame_hepatite_c_primeiro: ["exame de hepatite c no primeiro trimestre"],
  exame_hiv_terceiro: ["exame de hiv no terceiro trimestre"],
  exame_sifilis_terceiro: ["exame de sifilis no terceiro trimestre"],
  visitas_pre_natal: ["quantidade de visitas domiciliares no pre natal"],
  visitas_puerperio: ["quantidade de visitas domiciliares no puerperio"],
  atendimentos_puerperio: ["quantidade de atendimentos no puerperio"],
  ultima_consulta_puerperio: ["ultima consulta de puerperio"],
};

const DIRECT_IDENTIFIER_KEYS = new Set([
  "nome",
  "data_nascimento",
  "cpf",
  "cns",
  "telefone_celular",
  "telefone_residencial",
  "telefone_contato",
  "rua",
  "numero",
  "complemento",
  "bairro",
  "municipio",
  "uf",
  "cep",
]);

const PII_HEADER_PATTERN =
  /(nome|cpf|cns|cartao.*sus|telefone|celular|nascimento|logradouro|rua|numero|complemento|bairro|cep|endereco)/;

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const aliasIndex = new Map<string, string>();

for (const [canonical, aliases] of Object.entries(ALIASES)) {
  for (const alias of aliases) {
    aliasIndex.set(normalizeHeader(alias), canonical);
  }
}

function uniqueHeaders(values: unknown[]): string[] {
  const counts = new Map<string, number>();

  return values.map((value, index) => {
    const base = String(value ?? "").trim() || `coluna_${index + 1}`;
    const current = (counts.get(base) ?? 0) + 1;
    counts.set(base, current);
    return current === 1 ? base : `${base} (${current})`;
  });
}

function findHeaderRow(matrix: unknown[][]): number {
  let bestIndex = -1;
  let bestScore = -1;

  const scanLimit = Math.min(matrix.length, 100);

  for (let index = 0; index < scanLimit; index += 1) {
    const row = matrix[index] ?? [];
    const normalized = row.map(normalizeHeader).filter(Boolean);
    const mapped = normalized.filter((header) => aliasIndex.has(header)).length;
    const nonEmpty = normalized.length;

    const score = mapped * 20 + Math.min(nonEmpty, 80);

    if (mapped >= 4 && score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  if (bestIndex < 0) {
    throw new Error(
      "Não foi possível localizar automaticamente a linha de títulos. " +
        "O arquivo precisa conter pelo menos quatro colunas reconhecidas."
    );
  }

  return bestIndex;
}

export function parsePecFile(
  buffer: Buffer,
  filename: string
): ParsedPecFile {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    raw: false,
    cellDates: false,
    codepage: 65001,
  });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("O arquivo não possui planilhas ou dados legíveis.");
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
    raw: false,
  });

  const headerIndex = findHeaderRow(matrix);
  const headers = uniqueHeaders(matrix[headerIndex] ?? []);
  const mapping: Record<string, string> = {};
  const headerCanonical = new Map<number, string>();

  headers.forEach((header, index) => {
    const canonical = aliasIndex.get(normalizeHeader(header));

    if (canonical && !mapping[canonical]) {
      mapping[canonical] = header;
      headerCanonical.set(index, canonical);
    }
  });

  const warnings: string[] = [];

  for (const required of ["nome", "data_nascimento", "microarea"]) {
    if (!mapping[required]) {
      warnings.push(`Campo não reconhecido automaticamente: ${required}`);
    }
  }

  const rows: ParsedPecRow[] = [];

  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex] ?? [];
    const nonEmpty = values.filter((value) => String(value ?? "").trim()).length;

    if (nonEmpty < 2) {
      continue;
    }

    const raw: Record<string, string> = {};
    const canonical: Record<string, string> = {};
    const extras: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      const value = String(values[columnIndex] ?? "").trim();

      if (!value) {
        return;
      }

      raw[header] = value;
      const canonicalKey = headerCanonical.get(columnIndex);

      if (canonicalKey) {
        canonical[canonicalKey] = value;
      } else if (!PII_HEADER_PATTERN.test(normalizeHeader(header))) {
        extras[header] = value;
      }
    });

    // Campos reconhecidos como identificadores nunca vão para dados_extras.
    for (const key of DIRECT_IDENTIFIER_KEYS) {
      delete extras[key];
    }

    rows.push({
      linha: rowIndex + 1,
      raw,
      canonical,
      extras,
    });
  }

  if (rows.length === 0) {
    throw new Error("Nenhuma linha de dados foi encontrada após o cabeçalho.");
  }

  if (rows.length > 10000) {
    throw new Error("O arquivo ultrapassa o limite de 10.000 registros por importação.");
  }

  return {
    sheetName,
    headerRow: headerIndex + 1,
    headers,
    mapping,
    rows,
    warnings: [
      `Arquivo interpretado como ${filename.toLowerCase().endsWith(".csv") ? "CSV" : "planilha"}.`,
      ...warnings,
    ],
  };
}
