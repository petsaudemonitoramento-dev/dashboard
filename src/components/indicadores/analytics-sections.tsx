import {
  Activity,
  AlertTriangle,
  Baby,
  CheckCircle2,
  FileSpreadsheet,
  MapPinned,
} from "lucide-react";
import { IndicatorCard } from "./indicator-card";
import { UbsSummaryTable } from "./ubs-summary-table";
import {
  aggregateCategories,
  filterByUbs,
  formatMonth,
  formatPublishedNumber,
  formatPublishedPercent,
} from "./analytics-utils";
import type {
  AnalyticsDashboardData,
  CategoryPoint,
  NullableNumber,
} from "./types";
import styles from "./indicators.module.css";

function SimpleCategoryPanel({
  title,
  description,
  rows,
  selectedUbsId,
}: {
  title: string;
  description: string;
  rows: CategoryPoint[];
  selectedUbsId: string;
}) {
  const items = aggregateCategories(rows, selectedUbsId);
  const max = Math.max(
    ...items.map((item) => item.quantidade ?? 0),
    1
  );

  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className={styles.barList}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>Nenhum dado disponível.</div>
        ) : (
          items.map((item) => (
            <div className={styles.barRow} key={item.categoria}>
              <div className={styles.barLabel}>
                <span>{item.categoria}</span>
                <strong>{formatPublishedNumber(item.quantidade)}</strong>
              </div>
              <div className={styles.barTrack}>
                <i
                  style={{
                    width:
                      item.quantidade === null
                        ? "0%"
                        : `${Math.max((item.quantidade / max) * 100, 4)}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function sumNullable(values: NullableNumber[]): NullableNumber {
  const published = values.filter(
    (value): value is number => value !== null
  );
  return published.length === 0
    ? null
    : published.reduce((sum, value) => sum + value, 0);
}

export function UbsSection({
  data,
  selectedUbsId,
}: {
  data: AnalyticsDashboardData;
  selectedUbsId: string;
}) {
  const rows = filterByUbs(data.ubsIndicators, selectedUbsId);
  return (
    <div className={styles.sectionStack}>
      <section className={styles.sectionHeading}>
        <div><h2>Indicadores por UBS</h2><p>Comparação dos valores publicados por unidade.</p></div>
      </section>
      <article className={styles.widePanel}>
        <UbsSummaryTable rows={rows} />
      </article>
    </div>
  );
}

export function MicroareasSection({
  data,
  selectedUbsId,
}: {
  data: AnalyticsDashboardData;
  selectedUbsId: string;
}) {
  const rows = filterByUbs(data.microareas, selectedUbsId);
  return (
    <div className={styles.sectionStack}>
      <section className={styles.sectionHeading}>
        <div><h2>Microáreas</h2><p>Leitura territorial protegida pelo limite de publicação.</p></div>
      </section>
      <article className={styles.widePanel}>
        <div className={styles.tableScroller}>
          <table className={styles.analyticsTable}>
            <thead><tr><th>UBS</th><th>Microárea</th><th>Gestantes</th><th>Alto risco</th><th>Captação precoce</th><th>Consultas na meta</th><th>Pendências</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.microareaId}>
                  <td>{row.ubsNome}</td>
                  <td><strong>{row.microareaCodigo}</strong><small>{row.microareaNome || "Sem nome complementar"}</small></td>
                  <td>{formatPublishedNumber(row.gestantesAtivas)}</td>
                  <td>{formatPublishedNumber(row.altoRisco)}</td>
                  <td>{formatPublishedNumber(row.captacaoPrecoce)}</td>
                  <td>{formatPublishedNumber(row.consultasMeta)}</td>
                  <td>{formatPublishedNumber(row.gestantesComExamesPendentes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <div className={styles.emptyState}>Nenhuma microárea disponível.</div> : null}
      </article>
    </div>
  );
}

export function RiskSection({
  data,
  selectedUbsId,
}: {
  data: AnalyticsDashboardData;
  selectedUbsId: string;
}) {
  const factors = filterByUbs(data.riskFactors, selectedUbsId);
  return (
    <div className={styles.sectionStack}>
      <section className={styles.visualGrid}>
        <SimpleCategoryPanel title="Classificação de risco" description="Distribuição das categorias publicadas." rows={data.riskDistribution} selectedUbsId={selectedUbsId} />
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><h2>Fatores mais frequentes</h2><p>Ocorrências agrupadas, sem registros individuais.</p></div></header>
          <div className={styles.rankingList}>
            {factors.slice(0, 8).map((factor, index) => (
              <div key={`${factor.ubsId}-${factor.fatorTitulo}-${factor.grupo}`}>
                <span>{index + 1}</span><div><strong>{factor.fatorTitulo}</strong><small>{factor.grupo} • {factor.classificacao}</small></div><b>{factor.ocorrencias}</b>
              </div>
            ))}
            {factors.length === 0 ? <div className={styles.emptyState}>Nenhum fator atingiu o limite de publicação.</div> : null}
          </div>
        </article>
      </section>
    </div>
  );
}

export function PrenatalSection({
  data,
  selectedUbsId,
}: {
  data: AnalyticsDashboardData;
  selectedUbsId: string;
}) {
  const births = filterByUbs(data.birthForecast, selectedUbsId);
  return (
    <div className={styles.sectionStack}>
      <section className={styles.threePanelGrid}>
        <SimpleCategoryPanel title="Captação" description="Início do acompanhamento." rows={data.captureDistribution} selectedUbsId={selectedUbsId} />
        <SimpleCategoryPanel title="Consultas" description="Distribuição por faixas de consultas." rows={data.consultationDistribution} selectedUbsId={selectedUbsId} />
        <SimpleCategoryPanel title="Trimestres" description="Distribuição pela idade gestacional." rows={data.trimesterDistribution} selectedUbsId={selectedUbsId} />
      </section>
      <article className={styles.widePanel}>
        <header className={styles.panelHeader}><div><h2>Previsão mensal de partos</h2><p>Somente meses com quantidade publicada.</p></div></header>
        <div className={styles.timelineGrid}>
          {births.map((row) => <div key={`${row.ubsId}-${row.mesDpp}`}><span>{formatMonth(row.mesDpp)}</span><strong>{row.quantidade}</strong><small>{row.ubsNome}</small></div>)}
          {births.length === 0 ? <div className={styles.emptyState}>Nenhuma previsão atingiu o limite de publicação.</div> : null}
        </div>
      </article>
    </div>
  );
}

export function PecSection({
  data,
  selectedUbsId,
}: {
  data: AnalyticsDashboardData;
  selectedUbsId: string;
}) {
  const rows = filterByUbs(data.pecQuality, selectedUbsId);
  const files = rows.reduce((sum, row) => sum + row.arquivosImportados, 0);
  const received = rows.reduce((sum, row) => sum + row.linhasRecebidas, 0);
  const processed = rows.reduce((sum, row) => sum + row.linhasProcessadas, 0);
  const errors = rows.reduce((sum, row) => sum + row.linhasComErro, 0);
  const weightedPercent = received > 0 ? (processed / received) * 100 : null;
  return (
    <div className={styles.sectionStack}>
      <section className={styles.fourCardGrid}>
        <IndicatorCard icon={FileSpreadsheet} label="Arquivos importados" value={files} helper="Total no período publicado" tone="purple" />
        <IndicatorCard icon={Baby} label="Linhas recebidas" value={received} helper="Linhas informadas nas importações" tone="blue" />
        <IndicatorCard icon={CheckCircle2} label="Linhas processadas" value={processed} helper={formatPublishedPercent(weightedPercent)} tone="green" />
        <IndicatorCard icon={AlertTriangle} label="Linhas com erro" value={errors} helper="Erros técnicos registrados" tone="amber" />
      </section>
      <article className={styles.widePanel}>
        <div className={styles.tableScroller}><table className={styles.analyticsTable}><thead><tr><th>Mês</th><th>UBS</th><th>Arquivos</th><th>Recebidas</th><th>Processadas</th><th>Com erro</th><th>% processado</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.ubsId}-${row.mes}`}><td>{formatMonth(row.mes)}</td><td>{row.ubsNome}</td><td>{row.arquivosImportados}</td><td>{row.linhasRecebidas}</td><td>{row.linhasProcessadas}</td><td>{row.linhasComErro}</td><td>{formatPublishedPercent(row.percentualProcessado)}</td></tr>)}</tbody></table></div>
        {rows.length === 0 ? <div className={styles.emptyState}>Nenhuma importação disponível.</div> : null}
      </article>
    </div>
  );
}

export function AcsSection({
  data,
  selectedUbsId,
}: {
  data: AnalyticsDashboardData;
  selectedUbsId: string;
}) {
  const rows = filterByUbs(data.acsVisits, selectedUbsId);
  const actions = rows.reduce((sum, row) => sum + row.totalAcoes, 0);
  const visits = sumNullable(rows.map((row) => row.visitasRealizadas));
  const absent = sumNullable(rows.map((row) => row.naoEncontradas));
  const alerts = sumNullable(rows.map((row) => row.comSinaisAlerta));
  return (
    <div className={styles.sectionStack}>
      <section className={styles.fourCardGrid}>
        <IndicatorCard icon={Activity} label="Ações registradas" value={actions} helper="Total mensal agregado" tone="purple" />
        <IndicatorCard icon={CheckCircle2} label="Visitas realizadas" value={formatPublishedNumber(visits)} helper="Somente valores publicados" tone="green" />
        <IndicatorCard icon={MapPinned} label="Não encontradas" value={formatPublishedNumber(absent)} helper="Somente valores publicados" tone="amber" />
        <IndicatorCard icon={AlertTriangle} label="Com sinais de alerta" value={formatPublishedNumber(alerts)} helper="Somente valores publicados" tone="rose" />
      </section>
      <article className={styles.widePanel}>
        <div className={styles.tableScroller}><table className={styles.analyticsTable}><thead><tr><th>Mês</th><th>UBS</th><th>Ações</th><th>Realizadas</th><th>Não encontradas</th><th>Sinais de alerta</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.ubsId}-${row.mes}`}><td>{formatMonth(row.mes)}</td><td>{row.ubsNome}</td><td>{row.totalAcoes}</td><td>{formatPublishedNumber(row.visitasRealizadas)}</td><td>{formatPublishedNumber(row.naoEncontradas)}</td><td>{formatPublishedNumber(row.comSinaisAlerta)}</td></tr>)}</tbody></table></div>
        {rows.length === 0 ? <div className={styles.emptyState}>Nenhum mês atingiu o limite de publicação.</div> : null}
      </article>
    </div>
  );
}
