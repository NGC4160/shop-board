import { isUnscheduledStatus } from "@/lib/jobs";

const TZ = "America/Chicago";

export function formatClock(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(now));
}

export function formatStamp(ms: number, now = Date.now()): string {
  const delta = now - ms;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "just now";
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  if (delta < 7 * day) return `${Math.floor(delta / day)}d ago`;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

export function formatDay(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

/**
 * Shop-floor Date started (Housecall Pro `schedule.scheduled_start`) in America/Chicago.
 * Date-only. Missing or invalid timestamps show an em dash — never invent a date.
 */
export function formatStartedDate(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Visible Date started. Unscheduled / needs scheduling always shows —, even if
 * a leftover `schedule.scheduled_start` is still stored.
 */
export function displayStartedDate(
  ms: number | null | undefined,
  status?: string | null,
): string {
  if (isUnscheduledStatus(status)) return "—";
  return formatStartedDate(ms);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function clockInMillis(ms: number | null | undefined): number | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  return ms;
}

/**
 * Whole elapsed days since a timestamp. A future clock-in is 0.
 * Missing or non-positive timestamps are null.
 */
export function wholeDaysSince(ms: number | null | undefined, now = Date.now()): number | null {
  const at = clockInMillis(ms);
  if (at == null) return null;
  return Math.max(0, Math.floor((now - at) / DAY_MS));
}

/**
 * Main-board Days column. Whole days since the first Housecall Pro clock-in
 * (`hcpWorkStartedAt`). When that field is null, count from the previous
 * Date started value (`hcpScheduledStartAt`) instead.
 */
export function displayDaysSinceStarted(
  hcpWorkStartedAt: number | null | undefined,
  hcpScheduledStartAt: number | null | undefined,
  now = Date.now(),
): string {
  const source = hcpWorkStartedAt == null ? hcpScheduledStartAt : hcpWorkStartedAt;
  const days = wholeDaysSince(source, now);
  if (days == null) return "—";
  return String(days);
}

export function agingLabel(days: number): string {
  if (!Number.isFinite(days) || days <= 0 || days > 365) return "today";
  if (days === 1) return "1d in stage";
  return `${days}d in stage`;
}
