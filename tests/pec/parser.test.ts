import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { PecParseError, parsePecFile, type ParseWorkerLike } from "@/lib/pec/columns";
import { PEC_LIMITS } from "@/lib/pec/limits";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

const HEADERS = ["Nome", "Data de nascimento", "Microárea", "Idade", "Risco gestacional"];
const ROW = ["Pessoa Exemplo", "2000-01-01", "01", "26", "habitual"];

function workbookBuffer(bookType: "xls" | "xlsx", sheets = 1): Buffer {
  const workbook = XLSX.utils.book_new();
  for (let index = 0; index < sheets; index += 1) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([HEADERS, ROW]),
      `Planilha ${index + 1}`
    );
  }
  return XLSX.write(workbook, { type: "buffer", bookType });
}

function csvBuffer(rows: string[][] = [HEADERS, ROW]): Buffer {
  return Buffer.from(rows.map((row) => row.join(",")).join("\n"), "utf8");
}

async function expectParserCode(
  promise: Promise<unknown>,
  code: string
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: "PecParseError", code });
}

describe("parser PEC isolado", () => {
  it.each([
    ["CSV", csvBuffer(), "arquivo.csv", "csv", "text"],
    ["XLS legado", workbookBuffer("xls"), "arquivo.xls", "xls", "cfb"],
    ["XLSX", workbookBuffer("xlsx"), "arquivo.xlsx", "xlsx", "zip"],
  ] as const)("aceita %s válido", async (_label, buffer, name, extension, container) => {
    const parsed = await parsePecFile(buffer, name, extension, container);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.mapping).toMatchObject({
      nome: "Nome",
      data_nascimento: "Data de nascimento",
      microarea: "Microárea",
      idade_texto: "Idade",
      risco_gestacional: "Risco gestacional",
    });
    expect(parsed.rows[0].canonical).toMatchObject({
      nome: "Pessoa Exemplo",
      microarea: "01",
      idade_texto: "26",
    });
  });

  it("preserva o mapeamento semântico de colunas e não replica PII em extras", async () => {
    const buffer = csvBuffer([
      ["CPF", "Nome do cidadão", "Nascimento", "Micro área", "Observação"],
      ["00000000000", "Pessoa Exemplo", "2000-01-01", "02", "acompanhamento"],
    ]);
    const parsed = await parsePecFile(buffer, "golden.csv", "csv", "text");
    expect(parsed.mapping).toEqual({
      cpf: "CPF",
      nome: "Nome do cidadão",
      data_nascimento: "Nascimento",
      microarea: "Micro área",
    });
    expect(parsed.rows[0].extras).toEqual({ Observação: "acompanhamento" });
  });

  it("rejeita pacote ZIP comum que não é uma planilha OOXML", async () => {
    const emptyZip = Buffer.alloc(22);
    emptyZip.writeUInt32LE(0x06054b50, 0);
    await expectParserCode(
      parsePecFile(emptyZip, "comum.xlsx", "xlsx", "zip"),
      "ZIP_ENTRY_LIMIT"
    );
  });

  it("rejeita OLE inválido e truncado", async () => {
    const invalidOle = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(64),
    ]);
    await expectParserCode(
      parsePecFile(invalidOle, "invalido.xls", "xls", "cfb"),
      "CFB_TRUNCATED"
    );
  });

  it("rejeita XLSX truncado", async () => {
    const truncated = workbookBuffer("xlsx").subarray(0, 200);
    await expectParserCode(
      parsePecFile(truncated, "truncado.xlsx", "xlsx", "zip"),
      "ZIP_INVALID_DIRECTORY"
    );
  });

  it("rejeita XLSX estruturalmente corrompido", async () => {
    const corrupt = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(128, 0x7f),
    ]);
    await expectParserCode(
      parsePecFile(corrupt, "corrompido.xlsx", "xlsx", "zip"),
      "ZIP_INVALID_DIRECTORY"
    );
  });

  it("rejeita relacionamento externo em XLSX", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ROW]);
    sheet.A2.l = { Target: "https://example.invalid/externo" };
    XLSX.utils.book_append_sheet(workbook, sheet, "Planilha 1");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    await expectParserCode(
      parsePecFile(buffer, "externo.xlsx", "xlsx", "zip"),
      "EXTERNAL_REFERENCE"
    );
  });

  it("rejeita contêiner CFB com marcadores de arquivo criptografado", async () => {
    const cfb = XLSX.CFB.utils.cfb_new();
    XLSX.CFB.utils.cfb_add(cfb, "EncryptionInfo", Buffer.from("fixture"));
    XLSX.CFB.utils.cfb_add(cfb, "EncryptedPackage", Buffer.from("fixture"));
    const encrypted = XLSX.CFB.write(cfb, { type: "buffer" }) as Buffer;
    await expectParserCode(
      parsePecFile(encrypted, "protegido.xlsx", "xlsx", "cfb"),
      "ENCRYPTED_FILE"
    );
  });

  it("rejeita mais de dez planilhas", async () => {
    await expectParserCode(
      parsePecFile(workbookBuffer("xlsx", 11), "muitas.xlsx", "xlsx", "zip"),
      "SHEET_LIMIT"
    );
  });

  it("rejeita mais de 50.000 linhas de dados", async () => {
    const lines = [HEADERS.join(",")];
    for (let index = 0; index < PEC_LIMITS.maxRows; index += 1) {
      lines.push(`Pessoa ${index},2000-01-01,01,26,habitual`);
    }
    await expectParserCode(
      parsePecFile(Buffer.from(lines.join("\n")), "linhas.csv", "csv", "text"),
      "ROW_LIMIT"
    );
  });

  it("rejeita mais de 256 colunas", async () => {
    const headers = [...HEADERS, ...Array.from({ length: 252 }, (_, index) => `Extra ${index}`)];
    const values = [...ROW, ...Array.from({ length: 252 }, () => "x")];
    await expectParserCode(
      parsePecFile(csvBuffer([headers, values]), "colunas.csv", "csv", "text"),
      "COLUMN_LIMIT"
    );
  });

  it("rejeita célula acima do limite", async () => {
    const oversized = "x".repeat(PEC_LIMITS.maxCellCharacters + 1);
    await expectParserCode(
      parsePecFile(csvBuffer([HEADERS, [...ROW.slice(0, 4), oversized]]), "celula.csv", "csv", "text"),
      "CELL_SIZE_LIMIT"
    );
  });

  it("encerra o worker ao atingir o timeout", async () => {
    class HangingWorker implements ParseWorkerLike {
      terminated = false;
      once = (() => this) as ParseWorkerLike["once"];
      postMessage(): void {}
      async terminate(): Promise<number> {
        this.terminated = true;
        return 1;
      }
    }
    const worker = new HangingWorker();
    const promise = parsePecFile(csvBuffer(), "timeout.csv", "csv", "text", {
      timeoutMs: 5,
      workerFactory: () => worker,
    });
    await expect(promise).rejects.toBeInstanceOf(PecParseError);
    expect(worker.terminated).toBe(true);
  });
});
