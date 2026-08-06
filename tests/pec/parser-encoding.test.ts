import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { parsePecBuffer } from "../../src/lib/pec/parser-core.mjs";

const csv = [
  "Nome;Data de nascimento;Microárea;Idade",
  "Jéssica Vitória Tainá;17/02/2001;07;25 anos",
].join("\r\n");

function parseCsv(buffer) {
  return parsePecBuffer({
    buffer: Uint8Array.from(buffer).buffer,
    extension: "csv",
    container: "text",
  });
}

describe("codificação dos arquivos CSV do PEC", () => {
  it("preserva nomes acentuados em UTF-8", () => {
    const parsed = parseCsv(Buffer.from(csv, "utf8"));

    expect(parsed.rows[0].canonical.nome).toBe("Jéssica Vitória Tainá");
    expect(parsed.warnings[0]).toContain("UTF-8");
  });

  it("preserva nomes acentuados em Windows-1252", () => {
    const parsed = parseCsv(Buffer.from(csv, "latin1"));

    expect(parsed.rows[0].canonical.nome).toBe("Jéssica Vitória Tainá");
    expect(parsed.warnings[0]).toContain("Windows-1252");
  });
});
