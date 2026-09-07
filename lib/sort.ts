import { statusRank, type CartJob } from "@/lib/jobs";

export const SORT_STORAGE_KEY = "ngc-shop-board-sort-v2";

export const SORT_COLUMNS = [
  "customerName",
  "jobNumber",
  "primaryTech",
  "status",
  "nextAction",
  "timeExpectation",
] as const;

export type SortColumn = (typeof SORT_COLUMNS)[number];
export type SortDirection = "asc" | "desc";
export type StatusSortMode = "pipeline" | "alpha";

export type SortState = {
  column: SortColumn;
  direction: SortDirection;
  statusMode: StatusSortMode;
};

export const defaultSort: SortState = {
  column: "status",
  direction: "asc",
  statusMode: "pipeline",
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function isSortColumn(value: string): value is SortColumn {
  return (SORT_COLUMNS as readonly string[]).includes(value);
}

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

export function jobNumberValue(jobNumber: string): number {
  const digits = jobNumber.replace(/\D/g, "");
  if (!digits) return Number.POSITIVE_INFINITY;
  return Number(digits);
}

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

export function compareJobs(a: CartJob, b: CartJob, sort: SortState): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  let result = 0;

  switch (sort.column) {
    case "customerName":
      result = compareText(a.customerName, b.customerName);
      break;
    case "jobNumber": {
      const numberDelta = jobNumberValue(a.jobNumber) - jobNumberValue(b.jobNumber);
      result = numberDelta !== 0 ? numberDelta : compareText(a.jobNumber, b.jobNumber);
      break;
    }
    case "primaryTech":
      result = compareText(a.primaryTech || "\uFFFF", b.primaryTech || "\uFFFF");
      break;
    case "status":
      result =
        sort.statusMode === "alpha"
          ? compareText(a.status, b.status)
          : statusRank(a.status) - statusRank(b.status);
      break;
    case "nextAction":
      result = compareText(a.nextAction, b.nextAction);
      break;
    case "timeExpectation": {
      const aTime = parseTimeExpectation(a.timeExpectation);
      const bTime = parseTimeExpectation(b.timeExpectation);
      if (aTime !== null && bTime !== null) result = aTime - bTime;
      else if (aTime !== null) result = -1;
      else if (bTime !== null) result = 1;
      else result = compareText(a.timeExpectation, b.timeExpectation);
      break;
    }
    default:
      result = 0;
  }

  if (result !== 0) return result * direction;
  return a.id.localeCompare(b.id);
}

export function sortJobsBy(jobs: CartJob[], sort: SortState): CartJob[] {
  return [...jobs].sort((left, right) => compareJobs(left, right, sort));
}

export function toggleSort(current: SortState, column: SortColumn): SortState {
  if (column !== "status") {
    if (current.column === column) {
      return {
        ...current,
        column,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    }
    return { ...current, column, direction: "asc" };
  }

  if (current.column !== "status") {
    return { column: "status", direction: "asc", statusMode: "pipeline" };
  }
  if (current.statusMode === "pipeline" && current.direction === "asc") {
    return { column: "status", direction: "desc", statusMode: "pipeline" };
  }
  if (current.statusMode === "pipeline" && current.direction === "desc") {
    return { column: "status", direction: "asc", statusMode: "alpha" };
  }
  if (current.statusMode === "alpha" && current.direction === "asc") {
    return { column: "status", direction: "desc", statusMode: "alpha" };
  }
  return { column: "status", direction: "asc", statusMode: "pipeline" };
}

export function setStatusSortMode(current: SortState, statusMode: StatusSortMode): SortState {
  if (current.column === "status" && current.statusMode === statusMode) {
    return {
      column: "status",
      statusMode,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { column: "status", statusMode, direction: "asc" };
}

function isSortState(value: unknown): value is SortState {
  if (!value || typeof value !== "object") return false;
  const sort = value as Record<string, unknown>;
  return (
    typeof sort.column === "string" &&
    isSortColumn(sort.column) &&
    (sort.direction === "asc" || sort.direction === "desc") &&
    (sort.statusMode === "pipeline" || sort.statusMode === "alpha")
  );
}

type StoreListener = () => void;

const listeners = new Set<StoreListener>();
let storeSort: SortState = defaultSort;
let storeHydrated = false;

function readSortFromStorage(): SortState {
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return defaultSort;
    const parsed = JSON.parse(raw) as unknown;
    return isSortState(parsed) ? parsed : defaultSort;
  } catch {
    return defaultSort;
  }
}

export function subscribeSort(onStoreChange: StoreListener): () => void {
  listeners.add(onStoreChange);
  if (!storeHydrated && typeof window !== "undefined") {
    storeHydrated = true;
    const next = readSortFromStorage();
    queueMicrotask(() => {
      storeSort = next;
      listeners.forEach((listener) => listener());
    });
  }
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getSortSnapshot(): SortState {
  return storeSort;
}

export function getServerSortSnapshot(): SortState {
  return defaultSort;
}

export function saveSort(sort: SortState): void {
  storeSort = sort;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
  }
  listeners.forEach((listener) => listener());
}
