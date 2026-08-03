import {
  Activity,
  Building2,
  ClipboardCheck,
  HeartPulse,
  LayoutDashboard,
  MapPinned,
  Stethoscope,
} from "lucide-react";
import type { AnalyticsTabId } from "./types";
import styles from "./indicators.module.css";

const TAB_CONFIG: Record<
  AnalyticsTabId,
  { label: string; icon: typeof LayoutDashboard }
> = {
  overview: { label: "Visão Geral", icon: LayoutDashboard },
  ubs: { label: "Por UBS", icon: Building2 },
  microareas: { label: "Microáreas", icon: MapPinned },
  risk: { label: "Risco", icon: HeartPulse },
  prenatal: { label: "Pré-natal", icon: Stethoscope },
  pec: { label: "Qualidade PEC", icon: ClipboardCheck },
  acs: { label: "Acompanhamento ACS", icon: Activity },
};

export function AnalyticsNavigation({
  activeTab,
  allowedTabs,
  onChange,
}: {
  activeTab: AnalyticsTabId;
  allowedTabs: AnalyticsTabId[];
  onChange: (tab: AnalyticsTabId) => void;
}) {
  return (
    <nav className={styles.analyticsNavigation} aria-label="Áreas analíticas">
      {allowedTabs.map((tab) => {
        const config = TAB_CONFIG[tab];
        const Icon = config.icon;
        return (
          <button
            aria-current={activeTab === tab ? "page" : undefined}
            className={activeTab === tab ? styles.navigationActive : undefined}
            key={tab}
            onClick={() => onChange(tab)}
            type="button"
          >
            <Icon size={16} />
            {config.label}
          </button>
        );
      })}
    </nav>
  );
}
