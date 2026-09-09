import { jobNumberError, normalizeJobNumber, type CartJob } from "@/lib/jobs";

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

export type JobNumberParts = {
  major: number;
  minor: number;
  raw: string;
};

/** Split `1842` / `17312-1` so 1842 sorts before 18510 and before 1842-1. */
export function jobNumberParts(jobNumber: string): JobNumberParts {
  const raw = normalizeJobNumber(jobNumber);
  if (jobNumberError(raw)) {
    return { major: Number.POSITIVE_INFINITY, minor: 0, raw: jobNumber };
  }
  const match = raw.match(/^(\d+)(?:-(\d+))?$/);
  if (match) {
    return {
      major: Number(match[1]),
      minor: match[2] ? Number(match[2]) : 0,
      raw,
    };
  }
  return { major: Number.POSITIVE_INFINITY, minor: 0, raw };
}

export function jobNumberValue(jobNumber: string): number {
  return jobNumberParts(jobNumber).major;
}

export function compareJobNumbers(a: string, b: string): number {
  const left = jobNumberParts(a);
  const right = jobNumberParts(b);
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return compareText(left.raw, right.raw);
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function parseTimeExpectation(text: string, now = Date.now()): number | null {
  const raw = text.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "now" || /\bready now\b/.test(raw)) return now;

  const current = new Date(now);
  const timeMatch = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  let hours = 12;
  let minutes = 0;
  let hasClock = false;
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2] ?? "0");
    if (timeMatch[3] === "pm" && hours < 12) hours += 12;
    if (timeMatch[3] === "am" && hours === 12) hours = 0;
    hasClock = true;
  } else if (/\bmorning\b/.test(raw)) {
    hours = 9;
    hasClock = true;
  } else if (/\bafternoon\b/.test(raw)) {
    hours = 14;
    hasClock = true;
  } else if (/\bevening\b/.test(raw)) {
    hours = 17;
    hasClock = true;
  }

  const iso = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    const date = new Date(`${iso[1]}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      date.setHours(hours, minutes, 0, 0);
      return date.getTime();
    }
  }

  let dayOffset: number | null = null;
  if (/\btoday\b/.test(raw)) dayOffset = 0;
  else if (/\btomorrow\b/.test(raw)) dayOffset = 1;
  else if (/\byesterday\b/.test(raw)) dayOffset = -1;
  else {
    for (let weekday = 0; weekday < WEEKDAYS.length; weekday += 1) {
      if (raw.includes(WEEKDAYS[weekday])) {
        const delta = (weekday - current.getDay() + 7) % 7;
        dayOffset = delta;
        break;
      }
    }
  }

  if (dayOffset !== null) {
    const date = new Date(current);
    date.setHours(hasClock ? hours : 12, hasClock ? minutes : 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    return date.getTime();
  }

  const fallback = Date.parse(text);
  return Number.isNaN(fallback) ? null : fallback;
}

export function chicagoDayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function isDueToday(job: CartJob, now = Date.now()): boolean {
  const text = job.timeExpectation.trim().toLowerCase();
  if (!text) return false;
  if (/\btoday\b/.test(text) || /\bready now\b/.test(text)) return true;
  const parsed = parseTimeExpectation(job.timeExpectation, now);
  if (parsed === null) return false;
  return chicagoDayKey(parsed) === chicagoDayKey(now);
}

export function compareJobsByNumber(a: CartJob, b: CartJob): number {
  const result = compareJobNumbers(a.jobNumber, b.jobNumber);
  if (result !== 0) return result;
  return a.id.localeCompare(b.id);
}

/** Board order is Housecall Pro job number only, lowest first. */
export function sortJobsByJobNumber(jobs: CartJob[]): CartJob[] {
  return [...jobs].sort(compareJobsByNumber);
}

/** @deprecated Use sortJobsByJobNumber — the board no longer has multi-column sort. */
export function sortJobsBy(jobs: CartJob[]): CartJob[] {
  return sortJobsByJobNumber(jobs);
}
