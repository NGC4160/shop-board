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

export type HcpMergeStats = {
  jobs: CartJob[];
  added: number;
  updated: number;
};

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
 * Updates customer / phone / (pipeline) status from HCP.
 * Keeps tech-entered next action, time expectation, notes, bay, cart, flags.
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
    const nextCustomer = hcp.customerName || existing.customerName;
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
