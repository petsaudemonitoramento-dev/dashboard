import { ShieldCheck } from "lucide-react";
import type { PrivacyConfig } from "./types";
import styles from "./indicators.module.css";

export function PrivacySummary({ privacy }: { privacy: PrivacyConfig }) {
  return (
    <section className={styles.privacySummary}>
      <ShieldCheck size={19} aria-hidden="true" />
      <div>
        <strong>Visualização agregada e protegida</strong>
        <p>{privacy.regra} Nenhum nome, CPF, CNS ou registro individual é exibido.</p>
      </div>
      <span>k={privacy.kMinimo} • {privacy.versao}</span>
    </section>
  );
}
