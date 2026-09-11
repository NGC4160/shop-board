import { shouldSyncHcpNow } from "@/lib/chicago";
import {
  appendHistory,
  createId,
  emptyDraft,
  draftToJob,
  isGhostJob,
  normalizeJobNumber,
  saneStatusChangedAt,
  type CartJob,
} from "@/lib/jobs";
import type { HcpOpenJob } from "@/lib/hcp";

/** Exact shop-as-customer string from the old company-first HCP mapping bug. */
export const STALE_HCP_COMPANY_CUSTOMER = "Neighborhood Golf Carts";

export type HcpMergeStats = {
  jobs: CartJob[];
  added: number;
  updated: number;
};

export function hasStaleHcpCompanyCustomerName(
  jobs: readonly { customerName?: string | null }[],
): boolean {
  return jobs.some((job) => job.customerName === STALE_HCP_COMPANY_CUSTOMER);
}

/**
 * Morning window from shouldSyncHcpNow, plus a one-shot bypass when the board
 * still has the exact shop-as-customer bug string. After that re-apply,
 * pass staleCompanyResyncDone so leftover real company rows do not refetch
 * every minute.
 */
export function shouldFetchHcpJobs(
  lastSyncAt: number | null | undefined,
  jobs: readonly { customerName?: string | null }[],
  now = Date.now(),
  staleCompanyResyncDone = false,
): boolean {
  if (shouldSyncHcpNow(lastSyncAt, now)) return true;
  if (staleCompanyResyncDone) return false;
  return hasStaleHcpCompanyCustomerName(jobs);
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
 * and do not blank a stored name. Phone / pipeline status still update from
 * HCP. Tech-entered next action, local Timeframe date, notes, bay, cart, flags stay.
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
        updatedAt: now,
        statusChangedAt: now,
      });
      added += 1;
      continue;
    }

    const nextStatus =
      hcp.statusIsPipeline || !existing.status ? hcp.status : existing.status;
    const incomingName = hcp.customerName.trim();
    const nextCustomer = incomingName || existing.customerName;
    const nextPhone = hcp.phone || existing.phone;
    const statusChanged = nextStatus !== existing.status;
    const customerChanged = nextCustomer !== existing.customerName;
    const phoneChanged = nextPhone !== existing.phone;
    if (!statusChanged && !customerChanged && !phoneChanged) {
      merged.push({
        ...existing,
        statusChangedAt: saneStatusChangedAt(existing, now),
      });
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
      statusChangedAt: statusChanged ? now : saneStatusChangedAt(existing, now),
      updatedAt: now,
    });
    updated += 1;
  }

  for (const job of local) {
    if (isGhostJob(job)) continue;
    const key = normalizeJobNumber(job.jobNumber);
    if (!key || !seen.has(key)) {
      merged.push({
        ...job,
        statusChangedAt: saneStatusChangedAt(job, now),
      });
    }
  }

  return { jobs: merged, added, updated };
}
