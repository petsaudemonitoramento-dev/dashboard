"use client";

import { RefreshCw } from "lucide-react";
import styles from "./indicators.module.css";

type AnalyticsPageHeaderProps = {
  updatedAt: string;
  refreshing: boolean;
  onRefresh: () => void;
};

export function AnalyticsPageHeader({
  updatedAt,
  refreshing,
  onRefresh,
}: AnalyticsPageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>Indicadores</p>
        <h1>Visão Geral</h1>
        <span>Acompanhamento agregado dos principais indicadores</span>
      </div>

      <div className={styles.pageHeaderActions}>
        <small>Atualizado em {updatedAt}</small>
        <button
          disabled={refreshing}
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw
            className={refreshing ? styles.spinning : undefined}
            size={16}
          />
          {refreshing ? "Atualizando" : "Atualizar"}
        </button>
      </div>
    </header>
  );
}
