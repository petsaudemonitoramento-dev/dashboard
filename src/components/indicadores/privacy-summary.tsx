import { ShieldCheck } from "lucide-react";
import styles from "./indicators.module.css";

export function PrivacySummary({ studentLimited }: { studentLimited: boolean }) {
  return (
    <section className={styles.privacySummary}>
      <ShieldCheck size={19} aria-hidden="true" />
      <div>
        <strong>Visualização protegida</strong>
        <p>
          {studentLimited
            ? "Este perfil acessa somente indicadores gerais, agregados e não sensíveis."
            : "Os indicadores desta área são agregados e não exibem nomes, CPF, CNS ou registros individuais."}
        </p>
      </div>
    </section>
  );
}
