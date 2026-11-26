// Calendar dates for the APS workspace, independent of browser/server timezone.
export function workspaceToday(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const get = (type: string) => parts.find(p=>p.type===type)?.value??"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
