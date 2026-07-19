const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return UUID_PATTERN.test(String(value ?? "").trim());
}

export function normalizeBirthDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  let iso = text;

  const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);

  if (brMatch) {
    iso = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!isoMatch) return null;

  const year = Number(isoMatch[1]);
  const month = Number(isoMatch[2]);
  const day = Number(isoMatch[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  const earliest = new Date(Date.UTC(1930, 0, 1, 0, 0, 0));

  if (parsed > today || parsed < earliest) {
    return null;
  }

  return iso;
}
