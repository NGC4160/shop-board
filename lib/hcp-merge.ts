import { shouldSyncHcpNow } from "@/lib/chicago";
import {
  appendHistory,
  createId,
  emptyDraft,
  draftToJob,
  isGhostJob,
  isUnscheduledStatus,
  normalizeJobNumber,
  saneStatusChangedAt,
  type CartJob,
} from "@/lib/jobs";
import { isShopCustomerName, SHOP_CUSTOMER_NAME, type HcpOpenJob } from "@/lib/hcp";

/** Exact shop-as-customer string from the old company-first HCP mapping bug. */
export const STALE_HCP_COMPANY_CUSTOMER = SHOP_CUSTOMER_NAME;
export { isShopCustomerName };

export type HcpMergeStats = {
  jobs: CartJob[];
  added: number;
  updated: number;
  removed: number;
};

export function hasStaleHcpCompanyCustomerName(
  jobs: readonly { customerName?: string | null }[],
): boolean {
  return jobs.some((job) => isShopCustomerName(job.customerName));
}

export type HcpReapplyJob = {
  id?: string;
  customerName?: string | null;
  status?: string | null;
  hcpScheduledStartAt?: number | null;
  history?: readonly { text?: string }[];
};

/**
 * True when an HCP-tracked Scheduled / In Progress row has no stored
 * `hcpScheduledStartAt`. After the `hcpCreatedAt` → `hcpScheduledStartAt`
 * rename, a hard refresh keeps lastHcpSyncAt (morning already ran) and
 * upgradeJob drops the old field — Date started shows — until we re-pull.
 * Local-only seeds and Unscheduled jobs are not a reason to refetch.
 */
export function hasMissingHcpScheduledStarts(jobs: readonly HcpReapplyJob[]): boolean {
  return jobs.some((job) => {
    if (!isHcpTrackedJob({ id: job.id ?? "", history: job.history })) return false;
    const status = (job.status ?? "").trim().toLowerCase();
    if (status !== "scheduled" && status !== "in progress") return false;
    const start = job.hcpScheduledStartAt;
    return !(typeof start === "number" && Number.isFinite(start) && start > 0);
  });
}

/** HCP-originated row, or any later merge that wrote a Housecall Pro history line. */
export function isHcpTrackedJob(job: {
  id: string;
  history?: readonly { text?: string }[];
}): boolean {
  if (job.id.startsWith("hcp-")) return true;
  return (job.history ?? []).some((entry) => /housecall pro/i.test(entry.text ?? ""));
}

/** Incoming HCP name wins; leftover shop-as-customer strings are not kept. */
export function nextCustomerNameFromHcp(incoming: string, existing: string): string {
  const incomingName = incoming.trim();
  if (incomingName) return incomingName;
  if (isShopCustomerName(existing)) return "";
  return existing;
}

/**
 * Incoming HCP `schedule.scheduled_start` wins when present, except Unscheduled
 * / needs scheduling: those always clear, even if a leftover start is still
 * on the payload. Missing incoming never invents a date. A previously stored
 * start is kept only when the job is still scheduled and HCP omitted `schedule`.
 * `schedule` present with an empty `scheduled_start` also clears.
 */
export function nextHcpScheduledStartAt(
  incoming: number | null | undefined,
  existing: number | null | undefined,
  scheduleCleared = false,
): number | null {
  if (scheduleCleared) return null;
  if (typeof incoming === "number" && Number.isFinite(incoming) && incoming > 0) {
    return incoming;
  }
  if (typeof existing === "number" && Number.isFinite(existing) && existing > 0) {
    return existing;
  }
  return null;
}

function scheduleStartCleared(hcp: HcpOpenJob): boolean {
  if (typeof hcp.scheduledStart === "number" && Number.isFinite(hcp.scheduledStart) && hcp.scheduledStart > 0) {
    return false;
  }
  return Boolean(hcp.schedulePresent);
}

/** Clear Date started when HCP or the merged board status is Unscheduled. */
function shouldClearScheduledStart(hcp: HcpOpenJob, boardStatus: string): boolean {
  if (isUnscheduledStatus(hcp.status) || isUnscheduledStatus(boardStatus)) return true;
  return scheduleStartCleared(hcp);
}

/**
 * Morning window from shouldSyncHcpNow, plus a one-shot bypass when the board
 * still has a shop-as-customer name (Neighborhood Golf Carts or a close
 * variant) or HCP-tracked Scheduled / In Progress rows with no stored
 * schedule start (post-rename localStorage). After that re-apply, pass
 * staleCompanyResyncDone so leftover rows do not refetch every minute.
 */
export function shouldFetchHcpJobs(
  lastSyncAt: number | null | undefined,
  jobs: readonly HcpReapplyJob[],
  now = Date.now(),
  staleCompanyResyncDone = false,
): boolean {
  if (shouldSyncHcpNow(lastSyncAt, now)) return true;
  if (staleCompanyResyncDone) return false;
  return hasStaleHcpCompanyCustomerName(jobs) || hasMissingHcpScheduledStarts(jobs);
}

/** Morning gate plus an explicit pull-to-refresh bypass. */
export function shouldRunHcpClientFetch(
  lastSyncAt: number | null | undefined,
  jobs: readonly HcpReapplyJob[],
  now = Date.now(),
  staleCompanyResyncDone = false,
  force = false,
): boolean {
  if (force) return true;
  return shouldFetchHcpJobs(lastSyncAt, jobs, now, staleCompanyResyncDone);
}

function indexByJobNumber(jobs: CartJob[]): Map<string, CartJob> {
  const map = new Map<string, CartJob>();
  for (const job of jobs) {
    const key = normalizeJobNumber(job.jobNumber);
    if (key && !map.has(key)) map.set(key, job);
  }
  return map;
}

/**
 * Merge Housecall Pro open jobs into the local board by job number.
 * HCP customer names overwrite existing board names (so stale values like
 * "Neighborhood Golf Carts" get corrected). Empty HCP names are not invented
 * and do not keep a leftover shop name. Phone / pipeline status still update
 * from HCP. Date started comes from HCP `schedule.scheduled_start` when present
 * and is never invented from created_at. Unscheduled / needs scheduling always
 * stores null (even if leftover `scheduled_start` is still on the job).
 * Tech-entered next action and Timeframe stay only on jobs that
 * remain in the open pull. Finished/canceled HCP jobs drop off the board.
 * Local-only N-add / seed rows that were never synced from HCP stay.
 */
export function mergeHcpJobs(
  local: CartJob[],
  incoming: HcpOpenJob[],
  now = Date.now(),
): HcpMergeStats {
  const byNumber = indexByJobNumber(local);
  const seen = new Set<string>();
  const merged: CartJob[] = [];
  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const hcp of incoming) {
    const key = normalizeJobNumber(hcp.jobNumber);
    if (!key) continue;
    seen.add(key);
    const existing = byNumber.get(key);
    if (!existing) {
      const draft = {
        ...emptyDraft,
        customerName: hcp.customerName,
        jobNumber: key,
        phone: hcp.phone,
        status: hcp.status || "New Job",
        primaryTech: hcp.primaryTech,
      };
      const job = draftToJob(draft);
      merged.push({
        ...job,
        id: hcp.hcpId ? `hcp-${hcp.hcpId}` : createId(),
        history: [
          {
            at: now,
            kind: "created",
            text: "Added from Housecall Pro",
          },
        ],
        createdAt: now,
        hcpScheduledStartAt: nextHcpScheduledStartAt(
          hcp.scheduledStart,
          null,
          shouldClearScheduledStart(hcp, draft.status),
        ),
        updatedAt: now,
        statusChangedAt: now,
      });
      added += 1;
      continue;
    }

    const nextStatus =
      hcp.statusIsPipeline || !existing.status ? hcp.status : existing.status;
    const nextCustomer = nextCustomerNameFromHcp(hcp.customerName, existing.customerName);
    const nextPhone = hcp.phone || existing.phone;
    const statusChanged = nextStatus !== existing.status;
    const customerChanged = nextCustomer !== existing.customerName;
    const phoneChanged = nextPhone !== existing.phone;
    const nextStart = nextHcpScheduledStartAt(
      hcp.scheduledStart,
      existing.hcpScheduledStartAt,
      shouldClearScheduledStart(hcp, nextStatus),
    );
    if (!statusChanged && !customerChanged && !phoneChanged) {
      const startChanged = nextStart !== (existing.hcpScheduledStartAt ?? null);
      merged.push({
        ...existing,
        hcpScheduledStartAt: nextStart,
        statusChangedAt: saneStatusChangedAt(existing, now),
      });
      if (startChanged) updated += 1;
      continue;
    }

    let history = existing.history;
    if (statusChanged) {
      history = appendHistory(
        existing,
        "status",
        `${existing.status || "—"} → ${nextStatus || "—"} (Housecall Pro)`,
      );
    } else if (customerChanged) {
      history = appendHistory(existing, "edit", "Customer updated from Housecall Pro");
    }

    merged.push({
      ...existing,
      customerName: nextCustomer,
      phone: nextPhone,
      status: nextStatus,
      history,
      hcpScheduledStartAt: nextStart,
      statusChangedAt: statusChanged ? now : saneStatusChangedAt(existing, now),
      updatedAt: now,
    });
    updated += 1;
  }

  for (const job of local) {
    if (isGhostJob(job)) continue;
    const key = normalizeJobNumber(job.jobNumber);
    if (key && seen.has(key)) continue;
    if (isHcpTrackedJob(job) || isShopCustomerName(job.customerName)) {
      removed += 1;
      continue;
    }
    merged.push({
      ...job,
      statusChangedAt: saneStatusChangedAt(job, now),
    });
  }

  return { jobs: merged, added, updated, removed };
}
