import { describe, expect, it, vi } from "vitest";
import { handlePecPost, type PecRouteDependencies } from "@/app/api/importacoes/pec/route";
import type { ParsedPecFile } from "@/lib/pec/columns";
import { PEC_LIMITS } from "@/lib/pec/limits";
import {
  isEligiblePecImporter,
  PecRequestError,
  validateContentLength,
  validateUploadFile,
} from "@/lib/pec/policy";

const parsedFixture: ParsedPecFile = {
  sheetName: "Planilha 1",
  headerRow: 1,
  headers: ["Nome", "Data de nascimento", "Microárea", "Idade"],
  mapping: {
    nome: "Nome",
    data_nascimento: "Data de nascimento",
    microarea: "Microárea",
    idade_texto: "Idade",
  },
  rows: [
    {
      linha: 2,
      raw: { Nome: "Pessoa Exemplo" },
      canonical: { nome: "Pessoa Exemplo", microarea: "01", idade_texto: "26" },
      extras: {},
    },
  ],
  warnings: ["Arquivo interpretado como CSV."],
};

function makeRequest(mode = "preview", extra?: Record<string, string>): Request {
  const form = new FormData();
  form.set("file", new File(["Nome,Data de nascimento,Microárea,Idade\nPessoa,2000-01-01,01,26"], "pec.csv", { type: "text/csv" }));
  form.set("mode", mode);
  for (const [key, value] of Object.entries(extra ?? {})) form.set(key, value);
  return new Request("http://localhost/api/importacoes/pec", { method: "POST", body: form });
}

function dependencies(overrides: Partial<PecRouteDependencies> = {}): PecRouteDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue({ userId: "user-server", ubsId: "ubs-server" }),
    parse: vi.fn().mockResolvedValue(parsedFixture),
    persist: vi.fn().mockResolvedValue({ importacao_id: "import-1" }),
    logError: vi.fn(),
    ...overrides,
  };
}

describe("política de upload PEC", () => {
  it.each(["administrador", "gestao_municipal", "acs", "aluno", "profissional_ubs"])(
    "nega o perfil %s",
    (perfil) => {
      expect(
        isEligiblePecImporter({
          perfil,
          ubs_id: "ubs-1",
          status: "ativo",
          ativo: true,
          cadastro_completo: true,
          aprovacao_status: "aprovado",
        })
      ).toBe(false);
    }
  );

  it("aceita somente equipe_ubs ativa, aprovada, completa e vinculada", () => {
    expect(
      isEligiblePecImporter({
        perfil: "equipe_ubs",
        ubs_id: "ubs-1",
        status: "ativo",
        ativo: true,
        cadastro_completo: true,
        aprovacao_status: "aprovado",
      })
    ).toBe(true);
  });

  it.each([
    ["pendente", { status: "pendente" }],
    ["inativa", { ativo: false }],
    ["incompleta", { cadastro_completo: false }],
    ["não aprovada", { aprovacao_status: "pendente" }],
    ["sem UBS", { ubs_id: null }],
  ])("nega equipe_ubs %s", (_label, override) => {
    expect(
      isEligiblePecImporter({
        perfil: "equipe_ubs",
        ubs_id: "ubs-1",
        status: "ativo",
        ativo: true,
        cadastro_completo: true,
        aprovacao_status: "aprovado",
        ...override,
      })
    ).toBe(false);
  });

  it("rejeita extensão falsa e MIME incompatível", () => {
    const fake = new File(["texto"], "falso.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(() => validateUploadFile(fake, Buffer.from("texto"))).toThrowError(
      expect.objectContaining({ code: "SIGNATURE_MISMATCH" })
    );
    const wrongMime = new File(["a,b"], "arquivo.csv", {
      type: "application/pdf",
    });
    expect(() => validateUploadFile(wrongMime, Buffer.from("a,b"))).toThrowError(
      expect.objectContaining({ code: "MIME_MISMATCH" })
    );
  });

  it("rejeita arquivo e requisição acima dos limites", () => {
    const oversized = Buffer.alloc(PEC_LIMITS.maxFileBytes + 1, 0x61);
    const file = new File([oversized], "grande.csv", { type: "text/csv" });
    expect(() => validateUploadFile(file, oversized)).toThrowError(
      expect.objectContaining({ code: "FILE_TOO_LARGE" })
    );
    expect(() => validateContentLength(String(PEC_LIMITS.maxRequestBytes + 1))).toThrowError(
      expect.objectContaining({ code: "REQUEST_TOO_LARGE" })
    );
  });
});

describe("rota de importação PEC", () => {
  it("responde 401 para usuário não autenticado", async () => {
    const deps = dependencies({
      authenticate: vi.fn().mockRejectedValue(
        new PecRequestError(401, "Sessão expirada. Entre novamente.", "UNAUTHENTICATED")
      ),
    });
    const response = await handlePecPost(makeRequest(), deps);
    expect(response.status).toBe(401);
    expect(deps.parse).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("não carrega o parser nem persiste quando a autenticação falha", async () => {
    const deps = dependencies({
      authenticate: vi.fn().mockRejectedValue(
        new PecRequestError(403, "Usuário sem permissão para importar arquivos PEC.", "IMPORT_FORBIDDEN")
      ),
    });
    const response = await handlePecPost(makeRequest(), deps);
    expect(response.status).toBe(403);
    expect(deps.parse).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("faz preview sem inserção definitiva", async () => {
    const deps = dependencies();
    const response = await handlePecPost(makeRequest("preview"), deps);
    expect(response.status).toBe(200);
    expect(deps.parse).toHaveBeenCalledOnce();
    expect(deps.persist).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ totalRows: 1 });
  });

  it("ignora UBS adulterada e persiste uma única vez com o vínculo do servidor", async () => {
    const deps = dependencies();
    const response = await handlePecPost(
      makeRequest("import", { ubs_id: "ubs-atacante", user_id: "usuario-atacante" }),
      deps
    );
    expect(response.status).toBe(200);
    expect(deps.persist).toHaveBeenCalledOnce();
    expect(deps.persist).toHaveBeenCalledWith(
      expect.objectContaining({ ubsId: "ubs-server", userId: "user-server" })
    );
  });

  it("não persiste, não repete e não produz estado parcial quando o parser falha", async () => {
    const deps = dependencies({
      parse: vi.fn().mockRejectedValue(Object.assign(new Error("PARSE_FAILURE"), { name: "PecParseError", code: "WORKBOOK_INVALID" })),
    });
    const response = await handlePecPost(makeRequest("import"), deps);
    expect(response.status).toBe(400);
    expect(deps.parse).toHaveBeenCalledOnce();
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("valida o arquivo antes de qualquer persistência", async () => {
    const form = new FormData();
    form.set("file", new File(["não é zip"], "falso.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));
    form.set("mode", "import");
    const deps = dependencies();
    const response = await handlePecPost(
      new Request("http://localhost/api/importacoes/pec", { method: "POST", body: form }),
      deps
    );
    expect(response.status).toBe(400);
    expect(deps.parse).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("não envia nome de arquivo, conteúdo nem mensagem potencialmente pessoal aos logs", async () => {
    const logError = vi.fn();
    const deps = dependencies({
      parse: vi.fn().mockRejectedValue(
        new Error("CPF 00000000000; risco gestacional alto; arquivo pessoa.csv")
      ),
      logError,
    });
    await handlePecPost(makeRequest("import"), deps);
    expect(logError).toHaveBeenCalledWith({ event: "pec_import_failed", code: "Error" });
    expect(JSON.stringify(logError.mock.calls)).not.toContain("00000000000");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("risco gestacional");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("pessoa.csv");
  });
});
