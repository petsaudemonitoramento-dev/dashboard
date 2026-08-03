"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnalyticsPageHeader } from "./analytics-page-header";
import { AnalyticsNavigation } from "./analytics-navigation";
import { OverviewDashboard } from "./overview-dashboard";
import { PrivacySummary } from "./privacy-summary";
import {
  AcsSection,
  MicroareasSection,
  PecSection,
  PrenatalSection,
  RiskSection,
  UbsSection,
} from "./analytics-sections";
import { formatDateTime } from "./analytics-utils";
import type { AnalyticsDashboardData, AnalyticsTabId } from "./types";
import styles from "./indicators.module.css";

export function AnalyticsDashboard({ data }: { data: AnalyticsDashboardData }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [activeTab, setActiveTab] = useState<AnalyticsTabId>("overview");
  const [selectedUbsId, setSelectedUbsId] = useState(
    data.scope.ubsId ?? "all"
  );

  const updatedAt = useMemo(
    () => formatDateTime(data.summary.atualizadoEm),
    [data.summary.atualizadoEm]
  );

  function refreshNow() {
    startRefresh(() => router.refresh());
  }

  return (
    <div className={styles.wrapper}>
      <AnalyticsPageHeader
        onRefresh={refreshNow}
        refreshing={refreshing}
        updatedAt={updatedAt}
      />

      <section className={styles.analyticsToolbar}>
        <AnalyticsNavigation
          activeTab={activeTab}
          allowedTabs={data.scope.allowedTabs}
          onChange={setActiveTab}
        />

        {data.scope.canFilterUbs ? (
          <label className={styles.scopeFilter}>
            <span>Escopo</span>
            <select
              onChange={(event) => setSelectedUbsId(event.target.value)}
              value={selectedUbsId}
            >
              <option value="all">Município completo</option>
              {data.ubs.map((ubs) => (
                <option key={ubs.ubsId} value={ubs.ubsId}>
                  {ubs.nomeAbreviado || ubs.ubsNome}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className={styles.fixedScope}>
            <span>Escopo</span>
            <strong>{data.scope.title}</strong>
          </div>
        )}
      </section>

      {activeTab === "overview" ? (
        <OverviewDashboard data={data} selectedUbsId={selectedUbsId} />
      ) : null}
      {activeTab === "ubs" ? (
        <UbsSection data={data} selectedUbsId={selectedUbsId} />
      ) : null}
      {activeTab === "microareas" ? (
        <MicroareasSection data={data} selectedUbsId={selectedUbsId} />
      ) : null}
      {activeTab === "risk" ? (
        <RiskSection data={data} selectedUbsId={selectedUbsId} />
      ) : null}
      {activeTab === "prenatal" ? (
        <PrenatalSection data={data} selectedUbsId={selectedUbsId} />
      ) : null}
      {activeTab === "pec" ? (
        <PecSection data={data} selectedUbsId={selectedUbsId} />
      ) : null}
      {activeTab === "acs" ? (
        <AcsSection data={data} selectedUbsId={selectedUbsId} />
      ) : null}

      <PrivacySummary privacy={data.privacy} />
    </div>
  );
}
