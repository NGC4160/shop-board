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

export function agingLabel(days: number): string {
  if (!Number.isFinite(days) || days <= 0 || days > 365) return "today";
  if (days === 1) return "1d in stage";
  return `${days}d in stage`;
}
