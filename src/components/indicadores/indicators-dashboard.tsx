import { OverviewDashboard } from "./overview-dashboard";
import type { IndicatorData } from "./types";

type IndicatorsDashboardProps = {
  data: IndicatorData;
  profile: string;
};

export function IndicatorsDashboard({
  data,
  profile,
}: IndicatorsDashboardProps) {
  return <OverviewDashboard data={data} profile={profile} />;
}
