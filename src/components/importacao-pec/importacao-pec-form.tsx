"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  FileSpreadsheet,
  LoaderCircle,
  ShieldCheck,
  Upload,
} from "lucide-react";

type SchemaAudit = {
  totalColunas: number;
  reconhecidas: number;
  novas: Array<{ coluna: string; tipo: string; sugestao?: string }>;
  duplicadas: Array<{ coluna: string; tipo: string }>;
  obrigatoriasAusentes: string[];
  valoresSuspeitos: Array<{ campo: string; ocorrencias: number }>;
  exigeRevisao: boolean;
  impedeImportacao: boolean;
  versao: string;
};

type PreviewResponse = {
  arquivoSha256: string;
  schemaAudit?: SchemaAudit;
  sheetName: string;
  headerRow: number;
  totalRows: number;
  mapping: Record<string, string>;
  warnings: string[];
  preview: Array<{
    linha: number;
    microarea: string;
    idade: string;
    risco: string;
    dpp: string;
    camposExtras: string[];
  }>;
};

type ImportResponse = {
  jaImportado?: boolean;
  importacao_id: string;
  total: number;
  processadas: number;
  erros: number;
  warnings?: string[];
};

export function ImportacaoPecForm({
  ubsId,
  ubsName,
}: {
  ubsId: string;
  ubsName: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [structureReviewed, setStructureReviewed] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] =
    useState<"preview" | "import" | null>(null);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setStructureReviewed(false);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function submit(mode: "preview" | "import") {
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }

    setLoadingMode(mode);
    setError(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("mode", mode);
    formData.set("ubs_id", ubsId);
    if (mode === "import" && preview?.arquivoSha256) {
      formData.set("arquivoAnalisadoSha256", preview.arquivoSha256);
    }
    if (mode === "import" && structureReviewed) formData.set("estrutura_revisada", "sim");

    try {
      const response = await fetch("/api/importacoes/pec", {
        method: "POST",
        body: formData,
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Erro ao processar o arquivo.");
      }

      if (mode === "preview") {
        setPreview(body);
        setStructureReviewed(false);
        setResult(null);
      } else {
        setResult(body);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível processar o arquivo."
      );
    } finally {
      setLoadingMode(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit("preview");
  }

  const resultVisual = result
    ? result.jaImportado
      ? {
          className: "pec-result-card--success",
          title: "Este arquivo já foi importado",
          Icon: CheckCircle2,
        }
      : result.erros === 0
      ? {
          className: "pec-result-card--success",
          title: "Importação concluída",
          Icon: CheckCircle2,
        }
      : result.processadas === 0 || result.erros >= result.total
        ? {
            className: "pec-result-card--error",
            title: "Importação não concluída",
            Icon: CircleX,
          }
        : {
            className: "pec-result-card--warning",
            title: "Importação concluída com erros",
            Icon: AlertTriangle,
          }
    : null;

  return (
    <div className="pec-import-grid">
      <section className="pec-card pec-upload-card">
        <div className="pec-card-heading">
          <div className="pec-card-icon">
            <FileSpreadsheet size={25} />
          </div>
          <div>
            <h2>Anexar relatório do PEC</h2>
            <p>UBS vinculada: {ubsName}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="pec-file-drop">
            <Upload size={28} />
            <strong>
              {file ? file.name : "Selecionar arquivo CSV"}
            </strong>
            <span>
              O sistema procura automaticamente a linha de títulos,
              inclusive quando ela muda de posição.
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
            />
          </label>

          <div className="pec-actions">
            <button
              type="submit"
              className="pec-secondary-button"
              disabled={!file || loadingMode !== null}
            >
              {loadingMode === "preview" ? (
                <LoaderCircle className="pec-spin" size={20} />
              ) : (
                <FileSpreadsheet size={20} />
              )}
              Analisar estrutura
            </button>

            <button
              type="button"
              className="pec-primary-button"
              disabled={!preview || loadingMode !== null || Boolean(preview.schemaAudit?.impedeImportacao) || Boolean(preview.schemaAudit?.exigeRevisao && !structureReviewed)}
              onClick={() => void submit("import")}
            >
              {loadingMode === "import" ? (
                <LoaderCircle className="pec-spin" size={20} />
              ) : (
                <ShieldCheck size={20} />
              )}
              Importar e pseudonimizar
            </button>
          </div>
        </form>

        <div className="pec-security-note">
          <ShieldCheck size={21} />
          <p>
            Os identificadores entram em uma área restrita, são
            criptografados e ligados a um código como
            <strong> GST-AB12CD34</strong>. O site consulta somente os
            dados pseudonimizados da própria UBS.
          </p>
        </div>

        {error && (
          <div className="pec-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
      </section>

      <section className="pec-card">
        <h2>Como a adaptação funciona</h2>
        <ol className="pec-steps">
          <li>Localiza a linha de cabeçalho por conteúdo, não por posição fixa.</li>
          <li>Normaliza acentos, parênteses e pequenas mudanças nos nomes.</li>
          <li>Guarda colunas clínicas novas em “dados extras”.</li>
          <li>Não envia nome, CPF, CNS, telefone ou endereço para a tela.</li>
        </ol>
      </section>

      {preview && (
        <section className="pec-card pec-preview-card">
          <div className="pec-preview-summary">
            <div>
              <span>Linha de títulos</span>
              <strong>{preview.headerRow}</strong>
            </div>
            <div>
              <span>Registros encontrados</span>
              <strong>{preview.totalRows}</strong>
            </div>
            <div>
              <span>Campos mapeados</span>
              <strong>{Object.keys(preview.mapping).length}</strong>
            </div>
          </div>

          {preview.schemaAudit && (
            <div className="pec-warning" role="region" aria-label="Revisão da estrutura do PEC">
              <h3>Conferência inteligente das colunas</h3>
              <p>
                {preview.schemaAudit.reconhecidas} colunas reconhecidas,
                {" "}{preview.schemaAudit.novas.length} novas,
                {" "}{preview.schemaAudit.duplicadas.length} conflitantes.
                Nenhum dado novo é convertido por suposição.
              </p>
              {preview.schemaAudit.novas.length > 0 && (
                <details>
                  <summary>Conferir {preview.schemaAudit.novas.length} colunas novas ou alteradas</summary>
                  <ul>
                    {preview.schemaAudit.novas.map((item, index) => (
                      <li key={index}>
                        <strong>{item.coluna}</strong>
                        {item.sugestao && (
                          <span> — possível equivalente: {item.sugestao}, não aplicado automaticamente</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {preview.schemaAudit.duplicadas.length > 0 && (
                <p role="alert">
                  Colunas duplicadas ou que representam o mesmo campo:{" "}
                  {preview.schemaAudit.duplicadas.map((item) => item.coluna).join("; ")}.
                  Remova o conflito no CSV e analise novamente.
                </p>
              )}
              {preview.schemaAudit.obrigatoriasAusentes.length > 0 && (
                <p role="alert">
                  Colunas necessárias não reconhecidas:{" "}
                  {preview.schemaAudit.obrigatoriasAusentes.join(", ")}.
                  Corrija o arquivo antes de importar.
                </p>
              )}
              {preview.schemaAudit.valoresSuspeitos.length > 0 && (
                <p role="alert">
                  Valores de data ou contagem incoerentes:{" "}
                  {preview.schemaAudit.valoresSuspeitos.map((item) =>
                    `${item.campo} (${item.ocorrencias} ocorrência(s))`
                  ).join("; ")}.
                  Nenhum valor será corrigido automaticamente.
                </p>
              )}
              {preview.schemaAudit.impedeImportacao ? (
                <p><strong>Importação bloqueada até corrigir as divergências.</strong></p>
              ) : preview.schemaAudit.exigeRevisao ? (
                <label style={{ display: "flex", alignItems: "start", gap: 10, marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={structureReviewed}
                    onChange={(event) => setStructureReviewed(event.target.checked)}
                  />
                  <span>
                    Conferi os nomes das colunas novas. Entendo que apenas os campos
                    reconhecidos serão interpretados automaticamente; nenhuma evidência
                    clínica do C3 será inventada.
                  </span>
                </label>
              ) : (
                <p><strong>Estrutura reconhecida. Pode importar sem preencher nada adicional.</strong></p>
              )}
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="pec-warning">
              {preview.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          <h3>Prévia sem identificadores diretos</h3>
          <div className="pec-table-wrap">
            <table className="pec-table">
              <caption>
                Prévia pseudonimizada dos registros encontrados no CSV
              </caption>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Microárea</th>
                  <th>Idade</th>
                  <th>Risco</th>
                  <th>DPP</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row) => (
                  <tr key={row.linha}>
                    <td>{row.linha}</td>
                    <td>{row.microarea}</td>
                    <td>{row.idade}</td>
                    <td>{row.risco}</td>
                    <td>{row.dpp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result && resultVisual && (
        <section
          className={`pec-card pec-result-card ${resultVisual.className}`}
          role={result.erros > 0 ? "alert" : "status"}
          aria-live="polite"
        >
          <resultVisual.Icon size={32} aria-hidden="true" />
          <div>
            <h2>{resultVisual.title}</h2>
            <p>
              {result.jaImportado
                ? "Este arquivo já havia sido processado pela sua conta. Nenhuma gestante foi duplicada ou reimportada."
                : `${result.processadas} de ${result.total} registros foram processados. Erros: ${result.erros}.`}
            </p>

            {result.processadas > 0 ? (
              <Link href="/dashboard/gestantes">
                Abrir lista pseudonimizada
              </Link>
            ) : (
              <strong className="pec-result-guidance">
                Nenhum registro foi importado. Revise os erros antes de
                tentar novamente.
              </strong>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
