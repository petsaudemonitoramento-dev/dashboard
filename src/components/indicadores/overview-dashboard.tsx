"use client";

import { type CSSProperties, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Baby,
  CalendarCheck2,
  CheckCircle2,
  Stethoscope,
} from "lucide-react";
import { AnalyticsPageHeader } from "./analytics-page-header";
import { IndicatorCard } from "./indicator-card";
import { PrivacySummary } from "./privacy-summary";
import type { IndicatorData, IndicatorItem } from "./types";
import styles from "./indicators.module.css";

type OverviewDashboardProps = {
  data: IndicatorData;
  profile: string;
};

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumItems(items: IndicatorItem[]): number {
  return items.reduce(
    (sum, item) => sum + safeNumber(item.quantidade),
    0
  );
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "agora";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findConsultationTarget(items: IndicatorItem[]) {
  const targetPatterns = [
    "meta",
    "adequad",
    "atingid",
    "6 ou mais",
    "seis ou mais",
    ">= 6",
  ];

  const matches = items.filter((item) => {
    const label = normalizeLabel(item.rotulo);
    return targetPatterns.some((pattern) => label.includes(pattern));
  });

  if (matches.length > 0) {
    return {
      identified: true,
      value: sumItems(matches),
    };
  }

  return {
    identified: false,
    value: sumItems(items),
  };
}

function riskClassName(label: string): string {
  const normalized = normalizeLabel(label);

  if (normalized.includes("alto")) return styles.riskHigh;
  if (normalized.includes("medio")) return styles.riskMedium;
  if (
    normalized.includes("habitual") ||
    normalized.includes("baixo")
  ) {
    return styles.riskLow;
  }

  return styles.riskOther;
}

export function OverviewDashboard({
  data,
  profile,
}: OverviewDashboardProps) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const updatedAt = useMemo(
    () => formatDateTime(data.atualizadoEm),
    [data.atualizadoEm]
  );

  const active = safeNumber(data.resumo.ativas);
  const early = safeNumber(data.resumo.captacaoPrecoce);
  const late = safeNumber(data.resumo.captacaoTardia);
  const unknown = safeNumber(data.resumo.captacaoSemDados);
  const captureTotal = early + late + unknown;
  const highRisk = safeNumber(data.resumo.altoRisco);
  const examinationPending = safeNumber(data.resumo.examesPendentes);
  const consultationTarget = useMemo(
    () => findConsultationTarget(data.consultas),
    [data.consultas]
  );

  const riskItems = useMemo(
    () =>
      data.riscos
        .map((item) => ({
          ...item,
          quantidade: safeNumber(item.quantidade),
        }))
        .filter((item) => item.quantidade > 0),
    [data.riscos]
  );

  const riskTotal = sumItems(riskItems);
  const earlyDegrees =
    captureTotal > 0 ? (early / captureTotal) * 360 : 0;
  const lateDegrees =
    captureTotal > 0 ? ((early + late) / captureTotal) * 360 : 0;

  function refreshNow() {
    startRefresh(() => {
      router.refresh();
    });
  }

  return (
    <div className={styles.wrapper}>
      <AnalyticsPageHeader
        onRefresh={refreshNow}
        refreshing={refreshing}
        updatedAt={updatedAt}
      />

      <section className={styles.scopeNote}>
        <span>{data.titulo}</span>
        <small>Fotografia atual do escopo autorizado</small>
      </section>

      <section className={styles.indicatorGrid}>
        <IndicatorCard
          helper="Total agregado no escopo atual"
          icon={Baby}
          label="Gestantes ativas"
          tone="blue"
          value={active}
        />

        <IndicatorCard
          detail={`${early} registros com captação precoce`}
          helper="Início do pré-natal até a 12ª semana"
          icon={CheckCircle2}
          label="Captação precoce"
          tone="green"
          value={formatPercent(early, captureTotal)}
        />

        <IndicatorCard
          helper={
            consultationTarget.identified
              ? "Categoria de meta identificada nos dados"
              : "Soma disponível das categorias de consultas"
          }
          icon={CalendarCheck2}
          label={
            consultationTarget.identified
              ? "Consultas conforme meta"
              : "Consultas registradas"
          }
          tone="purple"
          value={consultationTarget.value}
        />

        <IndicatorCard
          detail={`${highRisk} registros classificados`}
          helper="Percentual sobre gestantes ativas"
          icon={AlertTriangle}
          label="Alto risco"
          tone="rose"
          value={formatPercent(highRisk, active)}
        />

        <IndicatorCard
          helper="Exames previstos ainda não registrados"
          icon={Stethoscope}
          label="Pendências de exames"
          tone="amber"
          value={examinationPending}
        />
      </section>

      <section className={styles.visualGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Distribuição de risco</h2>
              <p>Classificação agregada das gestantes ativas.</p>
            </div>
            <strong>{riskTotal}</strong>
          </header>

          {riskItems.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhuma classificação disponível.
            </div>
          ) : (
            <>
              <div className={styles.segmentedBar} aria-label="Distribuição de risco">
                {riskItems.map((item) => {
                  const percentage =
                    riskTotal > 0
                      ? (item.quantidade / riskTotal) * 100
                      : 0;

                  return (
                    <i
                      className={riskClassName(item.rotulo)}
                      key={item.rotulo}
                      style={{ width: `${percentage}%` }}
                      title={`${item.rotulo}: ${item.quantidade}`}
                    />
                  );
                })}
              </div>

              <div className={styles.legendList}>
                {riskItems.map((item) => (
                  <div key={item.rotulo}>
                    <i className={riskClassName(item.rotulo)} />
                    <span>{item.rotulo}</span>
                    <strong>{item.quantidade}</strong>
                    <small>
                      {formatPercent(item.quantidade, riskTotal)}
                    </small>
                  </div>
                ))}
              </div>
            </>
          )}
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Captação pré-natal</h2>
              <p>Distribuição pelo momento de início do acompanhamento.</p>
            </div>
            <strong>{captureTotal}</strong>
          </header>

          <div className={styles.captureLayout}>
            <div
              className={styles.captureDonut}
              style={
                {
                  "--early": `${earlyDegrees}deg`,
                  "--late": `${lateDegrees}deg`,
                } as CSSProperties
              }
            >
              <div>
                <strong>{formatPercent(early, captureTotal)}</strong>
                <span>precoce</span>
              </div>
            </div>

            <div className={styles.captureLegend}>
              <div>
                <i className={styles.captureEarly} />
                <span>Precoce</span>
                <strong>{early}</strong>
              </div>
              <div>
                <i className={styles.captureLate} />
                <span>Tardia</span>
                <strong>{late}</strong>
              </div>
              <div>
                <i className={styles.captureUnknown} />
                <span>Sem informação</span>
                <strong>{unknown}</strong>
              </div>
            </div>
          </div>
        </article>
      </section>

      <PrivacySummary studentLimited={profile === "aluno"} />
    </div>
  );
}
