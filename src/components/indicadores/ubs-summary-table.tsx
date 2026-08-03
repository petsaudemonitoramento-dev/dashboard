import type { UbsIndicator } from "./types";
import {
  formatDateTime,
  formatPublishedNumber,
  formatPublishedPercent,
} from "./analytics-utils";
import styles from "./indicators.module.css";

export function UbsSummaryTable({
  rows,
  compact = false,
}: {
  rows: UbsIndicator[];
  compact?: boolean;
}) {
  const visibleRows = compact ? rows.slice(0, 5) : rows;

  if (visibleRows.length === 0) {
    return <div className={styles.emptyState}>Nenhuma UBS disponível.</div>;
  }

  return (
    <div className={styles.tableScroller}>
      <table className={styles.analyticsTable}>
        <thead>
          <tr>
            <th>UBS</th>
            <th>Gestantes</th>
            <th>Alto risco</th>
            <th>Captação precoce</th>
            <th>Consultas na meta</th>
            <th>Pendências</th>
            {!compact ? <th>Atualização</th> : null}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.ubsId}>
              <td>
                <strong>{row.nomeAbreviado || row.ubsNome}</strong>
                {row.nomeAbreviado ? <small>{row.ubsNome}</small> : null}
              </td>
              <td>{formatPublishedNumber(row.gestantesAtivas)}</td>
              <td>{formatPublishedNumber(row.altoRisco)}</td>
              <td>{formatPublishedPercent(row.percentualCaptacaoPrecoce)}</td>
              <td>{formatPublishedPercent(row.percentualMetaConsultas)}</td>
              <td>{formatPublishedNumber(row.gestantesComExamesPendentes)}</td>
              {!compact ? <td>{formatDateTime(row.atualizadoEm)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
