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

type PreviewResponse = {
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
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] =
    useState<"preview" | "import" | null>(null);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
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
    ? result.erros === 0
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
              disabled={!preview || loadingMode !== null}
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

        {error && <div className="pec-error">{error}</div>}
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
              {result.processadas} de {result.total} registros foram
              processados. Erros: {result.erros}.
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
