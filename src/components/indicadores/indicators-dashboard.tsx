import { AnalyticsDashboard } from "./analytics-dashboard";
import type { AnalyticsDashboardData } from "./types";

export function IndicatorsDashboard({
  data,
}: {
  data: AnalyticsDashboardData;
}) {
  return <AnalyticsDashboard data={data} />;
}
