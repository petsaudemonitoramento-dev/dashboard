import { createRequire } from "node:module";
import { inflateRawSync } from "node:zlib";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const LIMITS = Object.freeze({
  maxSheets: 10,
  maxRows: 50_000,
  maxColumns: 256,
  maxCellCharacters: 32_767,
  maxAggregateTextBytes: 64 * 1024 * 1024,
  maxZipEntries: 1_000,
  maxZipEntryBytes: 64 * 1024 * 1024,
  maxZipUncompressedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxRelationshipBytes: 2 * 1024 * 1024,
  maxHeaderScanRows: 100,
});

const ALIASES = {
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
  atendimentos_ate_12_semanas: ["quantidade de atendimentos ate 12 semanas no pre natal"],
  ultima_consulta_pre_natal: ["ultima consulta de pre natal"],
  atendimentos_odontologicos: ["quantidade de atendimentos odontologicos no pre natal"],
  dtpa: ["dtpa"],
  medicoes_altura_uterina: ["quantidade de medicoes de altura uterina"],
  medicoes_pressao: ["quantidade de medicoes de pressao arterial"],
  medicoes_peso_altura: ["quantidade de medicoes simultaneas de peso e altura"],
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
  "nome", "data_nascimento", "cpf", "cns", "telefone_celular",
  "telefone_residencial", "telefone_contato", "rua", "numero",
  "complemento", "bairro", "municipio", "uf", "cep",
]);
const PII_HEADER_PATTERN =
  /(nome|cpf|cns|cartao.*sus|telefone|celular|nascimento|logradouro|rua|numero|complemento|bairro|cep|endereco)/;

export class ParserInputError extends Error {
  constructor(code) {
    super(code);
    this.name = "ParserInputError";
    this.code = code;
  }
}

function reject(code) {
  throw new ParserInputError(code);
}

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const aliasIndex = new Map();
for (const [canonical, aliases] of Object.entries(ALIASES)) {
  for (const alias of aliases) aliasIndex.set(normalizeHeader(alias), canonical);
}

function uniqueHeaders(values) {
  const counts = new Map();
  return values.map((value, index) => {
    const base = String(value ?? "").trim() || `coluna_${index + 1}`;
    const current = (counts.get(base) ?? 0) + 1;
    counts.set(base, current);
    return current === 1 ? base : `${base} (${current})`;
  });
}

function findHeaderRow(matrix) {
  let bestIndex = -1;
  let bestScore = -1;
  const scanLimit = Math.min(matrix.length, LIMITS.maxHeaderScanRows);
  for (let index = 0; index < scanLimit; index += 1) {
    const normalized = (matrix[index] ?? []).map(normalizeHeader).filter(Boolean);
    const mapped = normalized.filter((header) => aliasIndex.has(header)).length;
    const score = mapped * 20 + Math.min(normalized.length, 80);
    if (mapped >= 4 && score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  if (bestIndex < 0) reject("HEADER_NOT_FOUND");
  return bestIndex;
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  reject("ZIP_INVALID_DIRECTORY");
}

function safeZipPath(name) {
  return (
    name.length > 0 &&
    !name.includes("\\") &&
    !name.includes("\0") &&
    !name.startsWith("/") &&
    !name.split("/").includes("..")
  );
}

function validateZip(buffer) {
  if (buffer.length < 22) reject("ZIP_TRUNCATED");
  const eocd = findEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const entries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (
    disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entries ||
    entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff
  ) reject("ZIP_UNSUPPORTED_LAYOUT");
  if (entries === 0 || entries > LIMITS.maxZipEntries) reject("ZIP_ENTRY_LIMIT");
  if (centralOffset + centralSize > eocd || centralOffset + centralSize > buffer.length) {
    reject("ZIP_INVALID_DIRECTORY");
  }

  let offset = centralOffset;
  let totalUncompressed = 0;
  const files = new Map();
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      reject("ZIP_INVALID_DIRECTORY");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > buffer.length) reject("ZIP_INVALID_DIRECTORY");
    if ((flags & 0x0001) !== 0) reject("ENCRYPTED_FILE");
    if (method !== 0 && method !== 8) reject("ZIP_UNSUPPORTED_COMPRESSION");
    if (uncompressedSize > LIMITS.maxZipEntryBytes) reject("ZIP_ENTRY_SIZE_LIMIT");
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > LIMITS.maxZipUncompressedBytes) reject("ZIP_TOTAL_SIZE_LIMIT");
    if (compressedSize === 0 ? uncompressedSize > 0 : uncompressedSize / compressedSize > LIMITS.maxCompressionRatio) {
      reject("ZIP_COMPRESSION_RATIO_LIMIT");
    }
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (!safeZipPath(name)) reject("ZIP_UNSAFE_PATH");
    if (files.has(name)) reject("ZIP_DUPLICATE_ENTRY");
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      reject("ZIP_INVALID_LOCAL_HEADER");
    }
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const localName = buffer.toString("utf8", localOffset + 30, localOffset + 30 + localNameLength);
    if ((localFlags & 0x0001) !== 0) reject("ENCRYPTED_FILE");
    if (localMethod !== method || localName !== name) reject("ZIP_HEADER_MISMATCH");
    if (dataOffset + compressedSize > buffer.length) reject("ZIP_TRUNCATED");
    files.set(name, { method, compressedSize, uncompressedSize, dataOffset });
    offset = next;
  }
  if (offset !== centralOffset + centralSize) reject("ZIP_INVALID_DIRECTORY");

  for (const required of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml"]) {
    if (!files.has(required)) reject("XLSX_REQUIRED_PART_MISSING");
  }
  if (![...files.keys()].some((name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name))) {
    reject("XLSX_REQUIRED_PART_MISSING");
  }
  if ([...files.keys()].some((name) => name.startsWith("xl/externalLinks/"))) {
    reject("EXTERNAL_REFERENCE");
  }

  for (const [name, entry] of files) {
    if (!name.toLowerCase().endsWith(".rels")) continue;
    if (entry.uncompressedSize > LIMITS.maxRelationshipBytes) reject("RELATIONSHIP_SIZE_LIMIT");
    const compressed = buffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
    let relationship;
    try {
      relationship = entry.method === 0
        ? compressed
        : inflateRawSync(compressed, { maxOutputLength: LIMITS.maxRelationshipBytes });
    } catch {
      reject("ZIP_INVALID_RELATIONSHIP");
    }
    const xml = relationship.toString("utf8");
    if (/TargetMode\s*=\s*["']External["']/i.test(xml)) reject("EXTERNAL_REFERENCE");
  }
}

function validateCfb(buffer, extension) {
  if (buffer.length < 512) reject("CFB_TRUNCATED");
  if (buffer[28] !== 0xfe || buffer[29] !== 0xff) reject("CFB_INVALID_BYTE_ORDER");
  const sectorShift = buffer.readUInt16LE(30);
  if (sectorShift !== 9 && sectorShift !== 12) reject("CFB_INVALID_SECTOR_SIZE");
  let cfb;
  try {
    cfb = XLSX.CFB.read(buffer, { type: "buffer" });
  } catch {
    reject("CFB_INVALID");
  }
  const paths = (cfb.FullPaths ?? []).map((path) => path.toLowerCase());
  const encrypted = paths.some((path) => /\/(encryptioninfo|encryptedpackage)$/.test(path));
  if (encrypted) reject("ENCRYPTED_FILE");
  if (extension === "xlsx") reject("SIGNATURE_MISMATCH");
  if (!paths.some((path) => /\/(workbook|book)$/.test(path))) reject("XLS_WORKBOOK_MISSING");
}

function validateContainer(buffer, extension, container) {
  if (extension === "xlsx" && container === "zip") return validateZip(buffer);
  if ((extension === "xls" || extension === "xlsx") && container === "cfb") {
    return validateCfb(buffer, extension);
  }
  if (extension === "csv" && container === "text") return;
  reject("SIGNATURE_MISMATCH");
}

function workbookRead(buffer, options) {
  try {
    return XLSX.read(buffer, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/password|encrypt|protected/i.test(message)) reject("ENCRYPTED_FILE");
    reject("WORKBOOK_INVALID");
  }
}

function inspectSheet(sheet) {
  const reference = sheet["!fullref"] ?? sheet["!ref"];
  if (reference) {
    let range;
    try {
      range = XLSX.utils.decode_range(reference);
    } catch {
      reject("SHEET_RANGE_INVALID");
    }
    if (range.e.c + 1 > LIMITS.maxColumns) reject("COLUMN_LIMIT");
    if (range.e.r + 1 > LIMITS.maxRows) reject("ROW_LIMIT");
  }
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const cell = sheet[address];
    if (cell?.l?.Target && /^(?:[a-z][a-z0-9+.-]*:|\\\\)/i.test(cell.l.Target)) {
      reject("EXTERNAL_REFERENCE");
    }
    if (typeof cell?.f === "string" && /\[[^\]]+\]/.test(cell.f)) reject("EXTERNAL_REFERENCE");
    if (cell && "f" in cell) delete cell.f;
  }
}

export function parsePecBuffer(input) {
  const buffer = Buffer.from(input.buffer);
  validateContainer(buffer, input.extension, input.container);

  const sheetList = workbookRead(buffer, {
    type: "buffer",
    bookSheets: true,
    raw: false,
    cellDates: false,
    codepage: 65001,
  });
  if (!sheetList.SheetNames?.length) reject("EMPTY_WORKBOOK");
  if (sheetList.SheetNames.length > LIMITS.maxSheets) reject("SHEET_LIMIT");
  const sheetName = sheetList.SheetNames[0];

  const workbook = workbookRead(buffer, {
    type: "buffer",
    raw: false,
    cellDates: false,
    cellFormula: true,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    codepage: 65001,
    sheets: [sheetName],
    sheetRows: LIMITS.maxRows + 1,
  });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) reject("EMPTY_WORKBOOK");
  inspectSheet(sheet);

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
    raw: false,
  });
  if (matrix.length > LIMITS.maxRows) reject("ROW_LIMIT");
  const headerIndex = findHeaderRow(matrix);
  const headers = uniqueHeaders(matrix[headerIndex] ?? []);
  if (headers.length > LIMITS.maxColumns) reject("COLUMN_LIMIT");

  const mapping = {};
  const headerCanonical = new Map();
  headers.forEach((header, index) => {
    const canonical = aliasIndex.get(normalizeHeader(header));
    if (canonical && !mapping[canonical]) {
      mapping[canonical] = header;
      headerCanonical.set(index, canonical);
    }
  });

  const warnings = [];
  for (const required of ["nome", "data_nascimento", "microarea"]) {
    if (!mapping[required]) warnings.push(`Campo não reconhecido automaticamente: ${required}`);
  }

  const rows = [];
  let aggregateTextBytes = 0;
  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex] ?? [];
    if (values.length > LIMITS.maxColumns) reject("COLUMN_LIMIT");
    const nonEmpty = values.filter((value) => String(value ?? "").trim()).length;
    if (nonEmpty < 2) continue;
    if (rows.length >= LIMITS.maxRows) reject("ROW_LIMIT");

    const raw = {};
    const canonical = {};
    const extras = {};
    headers.forEach((header, columnIndex) => {
      const value = String(values[columnIndex] ?? "").trim();
      if (!value) return;
      if (value.length > LIMITS.maxCellCharacters) reject("CELL_SIZE_LIMIT");
      aggregateTextBytes += Buffer.byteLength(value, "utf8");
      if (aggregateTextBytes > LIMITS.maxAggregateTextBytes) reject("AGGREGATE_TEXT_LIMIT");
      raw[header] = value;
      const canonicalKey = headerCanonical.get(columnIndex);
      if (canonicalKey) canonical[canonicalKey] = value;
      else if (!PII_HEADER_PATTERN.test(normalizeHeader(header))) extras[header] = value;
    });
    for (const key of DIRECT_IDENTIFIER_KEYS) delete extras[key];
    rows.push({ linha: rowIndex + 1, raw, canonical, extras });
  }
  if (rows.length === 0) reject("NO_DATA_ROWS");

  return {
    sheetName,
    headerRow: headerIndex + 1,
    headers,
    mapping,
    rows,
    warnings: [
      `Arquivo interpretado como ${input.extension === "csv" ? "CSV" : "planilha"}.`,
      ...warnings,
    ],
  };
}
