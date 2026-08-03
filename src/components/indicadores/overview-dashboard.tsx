import {
  AlertTriangle,
  Baby,
  CalendarCheck2,
  CheckCircle2,
  Stethoscope,
} from "lucide-react";
import { IndicatorCard } from "./indicator-card";
import { UbsSummaryTable } from "./ubs-summary-table";
import {
  aggregateCategories,
  formatPublishedNumber,
  formatPublishedPercent,
  publishedRatio,
  selectedSummary,
} from "./analytics-utils";
import type { AnalyticsDashboardData } from "./types";
import styles from "./indicators.module.css";

function categoryClass(category: string): string {
  const normalized = category.toLowerCase();
  if (normalized.includes("alto")) return styles.riskHigh;
  if (normalized.includes("médio") || normalized.includes("medio")) {
    return styles.riskMedium;
  }
  if (normalized.includes("habitual") || normalized.includes("baixo")) {
    return styles.riskLow;
  }
  return styles.riskOther;
}

function CategoryDistribution({
  title,
  description,
  rows,
  selectedUbsId,
  mode,
}: {
  title: string;
  description: string;
  rows: AnalyticsDashboardData["riskDistribution"];
  selectedUbsId: string;
  mode: "risk" | "capture";
}) {
  const items = aggregateCategories(rows, selectedUbsId);
  const published = items.filter(
    (item): item is { categoria: string; ordem: number; quantidade: number } =>
      item.quantidade !== null
  );
  const total = published.reduce((sum, item) => sum + item.quantidade, 0);

  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <strong>{formatPublishedNumber(total > 0 ? total : null)}</strong>
      </header>

      {published.length === 0 ? (
        <div className={styles.emptyState}>
          Nenhum valor atingiu o limite de publicação.
        </div>
      ) : (
        <>
          <div className={styles.segmentedBar} aria-label={title}>
            {published.map((item, index) => (
              <i
                className={
                  mode === "risk"
                    ? categoryClass(item.categoria)
                    : styles[`category_${(index % 4) + 1}`]
                }
                key={item.categoria}
                style={{ width: `${(item.quantidade / total) * 100}%` }}
                title={`${item.categoria}: ${item.quantidade}`}
              />
            ))}
          </div>

          <div className={styles.legendList}>
            {items.map((item, index) => (
              <div key={item.categoria}>
                <i
                  className={
                    mode === "risk"
                      ? categoryClass(item.categoria)
                      : styles[`category_${(index % 4) + 1}`]
                  }
                />
                <span>{item.categoria}</span>
                <strong>{formatPublishedNumber(item.quantidade)}</strong>
                <small>
                  {item.quantidade === null || total <= 0
                    ? "não publicado"
                    : formatPublishedPercent(
                        (item.quantidade / total) * 100
                      )}
                </small>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

export function OverviewDashboard({
  data,
  selectedUbsId,
}: {
  data: AnalyticsDashboardData;
  selectedUbsId: string;
}) {
  const summary = selectedSummary(
    data.summary,
    data.ubsIndicators,
    data.riskDistribution,
    data.captureDistribution,
    selectedUbsId
  );
  const highRiskPercent = publishedRatio(
    summary.altoRisco,
    summary.gestantesAtivas
  );
  const visibleUbs =
    selectedUbsId === "all"
      ? data.ubsIndicators
      : data.ubsIndicators.filter((row) => row.ubsId === selectedUbsId);

  return (
    <div className={styles.sectionStack}>
      <section className={styles.indicatorGrid}>
        <IndicatorCard
          helper="Total publicado no escopo atual"
          icon={Baby}
          label="Gestantes ativas"
          tone="blue"
          value={formatPublishedNumber(summary.gestantesAtivas)}
        />
        <IndicatorCard
          detail={`${formatPublishedNumber(summary.captacaoPrecoce)} registros publicados`}
          helper="Início do pré-natal até a 12ª semana"
          icon={CheckCircle2}
          label="Captação precoce"
          tone="green"
          value={formatPublishedPercent(summary.percentualCaptacaoPrecoce)}
        />
        <IndicatorCard
          detail={`${formatPublishedNumber(summary.consultasMeta)} registros publicados`}
          helper="Gestantes com sete ou mais consultas"
          icon={CalendarCheck2}
          label="Consultas conforme meta"
          tone="purple"
          value={formatPublishedPercent(summary.percentualMetaConsultas)}
        />
        <IndicatorCard
          detail={`${formatPublishedNumber(summary.altoRisco)} registros publicados`}
          helper="Percentual sobre gestantes ativas publicadas"
          icon={AlertTriangle}
          label="Alto risco"
          tone="rose"
          value={formatPublishedPercent(highRiskPercent)}
        />
        <IndicatorCard
          detail={`${formatPublishedNumber(summary.totalExamesPendentes)} exames publicados`}
          helper="Gestantes com exames previstos pendentes"
          icon={Stethoscope}
          label="Pendências de exames"
          tone="amber"
          value={formatPublishedNumber(
            summary.gestantesComExamesPendentes
          )}
        />
      </section>

      <section className={styles.visualGrid}>
        <CategoryDistribution
          description="Soma dos valores que atingiram o limite de publicação."
          mode="risk"
          rows={data.riskDistribution}
          selectedUbsId={selectedUbsId}
          title="Distribuição de risco"
        />
        <CategoryDistribution
          description="Momento de início do acompanhamento pré-natal."
          mode="capture"
          rows={data.captureDistribution}
          selectedUbsId={selectedUbsId}
          title="Captação pré-natal"
        />
      </section>

      {data.scope.kind !== "student" ? (
        <article className={styles.widePanel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Resumo por UBS</h2>
              <p>Comparação compacta dos indicadores publicados.</p>
            </div>
            <strong>{visibleUbs.length}</strong>
          </header>
          <UbsSummaryTable compact rows={visibleUbs} />
        </article>
      ) : null}
    </div>
  );
}
