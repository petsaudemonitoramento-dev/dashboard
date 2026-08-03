import type { LucideIcon } from "lucide-react";
import styles from "./indicators.module.css";

type IndicatorCardProps = {
  icon: LucideIcon;
  label: string;
  value: number | string;
  helper: string;
  detail?: string;
  tone?: "purple" | "blue" | "green" | "amber" | "rose";
};

export function IndicatorCard({
  icon: Icon,
  label,
  value,
  helper,
  detail,
  tone = "purple",
}: IndicatorCardProps) {
  return (
    <article className={`${styles.indicatorCard} ${styles[`tone_${tone}`]}`}>
      <div className={styles.indicatorIcon} aria-hidden="true">
        <Icon size={20} strokeWidth={2} />
      </div>

      <div className={styles.indicatorContent}>
        <span className={styles.indicatorLabel}>{label}</span>
        <strong className={styles.indicatorValue}>{value}</strong>
        <small className={styles.indicatorHelper}>{helper}</small>
        {detail ? <small className={styles.indicatorDetail}>{detail}</small> : null}
      </div>
    </article>
  );
}
