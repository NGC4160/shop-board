const TZ = "America/Chicago";

export type ChicagoParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayKey: string;
};

export function chicagoParts(ms = Date.now()): ChicagoParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    dayKey: `${year}-${month}-${day}`,
  };
}

export function isChicagoSevenAmHour(ms = Date.now()): boolean {
  return chicagoParts(ms).hour === 7;
}

/**
 * True when the board should pull Housecall Pro:
 * after 7:00 AM America/Chicago, and we have not already synced since then today.
 */
export function shouldSyncHcpNow(lastSyncAt: number | null | undefined, now = Date.now()): boolean {
  const current = chicagoParts(now);
  if (current.hour < 7) return false;
  if (lastSyncAt == null) return true;
  const last = chicagoParts(lastSyncAt);
  if (last.dayKey !== current.dayKey) return true;
  return last.hour < 7;
}
