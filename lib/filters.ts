import {
  cartLabel,
  isClosedStatus,
  isIsoDate,
  isPartsStatus,
  isPickupStatus,
  isStale,
  isUnscheduledStatus,
  type CartJob,
} from "@/lib/jobs";
import { chicagoDayKey, isDueToday } from "@/lib/sort";

export const CHIP_FILTERS = [
  "all",
  "hot",
  "due",
  "parts",
  "unassigned",
  "pickup",
  "stale",
  "closed",
] as const;

export type ChipFilter = (typeof CHIP_FILTERS)[number];

export const CHIP_LABELS: Record<ChipFilter, string> = {
  all: "All open",
  hot: "Hot",
  due: "Due today",
  parts: "Parts",
  unassigned: "Unassigned",
  pickup: "Ready / pickup",
  stale: "Stuck 3+ days",
  closed: "Closed",
};

export type BoardQuery = {
  search: string;
  tech: string;
  chip: ChipFilter;
  hideClosed: boolean;
};

export function jobMatches(job: CartJob, query: BoardQuery, now = Date.now()): boolean {
  const closed = isClosedStatus(job.status);
  if (query.chip === "closed") {
    if (!closed) return false;
  } else if (query.hideClosed && closed) {
    return false;
  }

  if (query.tech === "__none__") {
    if (job.primaryTech) return false;
  } else if (query.tech && job.primaryTech !== query.tech) {
    return false;
  }

  const needle = query.search.trim().toLowerCase();
  if (needle) {
    const haystack = [
      job.customerName,
      job.jobNumber,
      job.primaryTech,
      job.status,
      job.nextAction,
      job.timeExpectation,
      job.bay,
      job.notes,
      job.phone,
      cartLabel(job),
      job.cartColor,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  switch (query.chip) {
    case "all":
      return true;
    case "hot":
      return job.priority === "hot";
    case "due":
      return isDueToday(job, now);
    case "parts":
      return isPartsStatus(job.status);
    case "unassigned":
      return !job.primaryTech;
    case "pickup":
      return isPickupStatus(job.status);
    case "stale":
      return isStale(job, now);
    case "closed":
      return closed;
    default:
      return true;
  }
}

export function countChip(jobs: CartJob[], chip: ChipFilter, now = Date.now()): number {
  return jobs.filter((job) =>
    jobMatches(job, { search: "", tech: "", chip, hideClosed: chip !== "closed" }, now),
  ).length;
}

export type BoardStats = {
  open: number;
  hot: number;
  due: number;
  parts: number;
  unassigned: number;
  stale: number;
  total: number;
};

/**
 * Visible Date started as a Chicago `YYYY-MM-DD`.
 * Null when missing, invalid, or Unscheduled — never invented.
 */
export function startedDateKey(job: Pick<CartJob, "hcpScheduledStartAt" | "status">): string | null {
  if (isUnscheduledStatus(job.status)) return null;
  const ms = job.hcpScheduledStartAt;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  return chicagoDayKey(ms);
}

/**
 * Board-level Timeframe filter: empty shows every row.
 * A chosen date keeps only jobs whose Date started is that Chicago day.
 * Jobs without a start date are excluded while the filter is on.
 */
export function jobMatchesTimeframeFilter(
  job: Pick<CartJob, "hcpScheduledStartAt" | "status">,
  isoDate: string,
): boolean {
  const chosen = isoDate.trim();
  if (!chosen) return true;
  if (!isIsoDate(chosen)) return true;
  const started = startedDateKey(job);
  return started === chosen;
}

export function filterJobsByTimeframe<T extends Pick<CartJob, "hcpScheduledStartAt" | "status">>(
  jobs: readonly T[],
  isoDate: string,
): T[] {
  return jobs.filter((job) => jobMatchesTimeframeFilter(job, isoDate));
}

export function boardStats(jobs: CartJob[], now = Date.now()): BoardStats {
  const openJobs = jobs.filter((job) => !isClosedStatus(job.status));
  return {
    total: jobs.length,
    open: openJobs.length,
    hot: openJobs.filter((job) => job.priority === "hot").length,
    due: openJobs.filter((job) => isDueToday(job, now)).length,
    parts: openJobs.filter((job) => isPartsStatus(job.status)).length,
    unassigned: openJobs.filter((job) => !job.primaryTech).length,
    stale: openJobs.filter((job) => isStale(job, now)).length,
  };
}
