/** Calendar date only: `YYYY-MM-DD`. Empty is allowed. */
export const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = value.trim().match(ISO_DATE_PATTERN);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** Keep a real calendar date; drop phrases, "999", and other leftover time text. */
export function normalizeTimeframe(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (isIsoDate(trimmed)) return trimmed;
  const embedded = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (embedded?.[1] && isIsoDate(embedded[1])) return embedded[1];
  return "";
}

export function formatTimeframe(value: string): string {
  const iso = normalizeTimeframe(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

/**
 * Empty is allowed. Anything else must be a real calendar date (`YYYY-MM-DD`).
 * Phrases, "999", and relative text are not stored.
 */
export function timeExpectationError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isIsoDate(trimmed)) return "Timeframe must be a calendar date";
  return null;
}
