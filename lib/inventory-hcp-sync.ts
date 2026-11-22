import type { SharedPartsDocument } from "@/lib/parts-board";
import {
  fetchHcpJobParts,
  listCompletedHcpJobsSince,
  type HcpJobPartsResult,
} from "@/lib/hcp-job-parts";
import { hcpApiKey } from "@/lib/hcp";
import {
  applyJobPartUsage,
  mergeJobPartUses,
  type InventoryUsageSource,
} from "@/lib/inventory-usage";

export const INVENTORY_USAGE_LOOKBACK_DAYS = 1;
const OVERLAP_MS = 60 * 60 * 1000;
const MAX_TRACKED_JOBS = 100;

export type InventorySyncMeta = {
  at: number;
  /** Poll cursor. Jobs completed before this, minus a one-hour overlap, are not listed again. */
  since: number | null;
  completedJobs: number;
  deductedLines: number;
  reversedLines: number;
  jobInputsAvailable: boolean;
  jobInputsDetail: string | null;
  mode: "poll" | "webhook";
  /** Next slice of active jobs to re-check for a reopen. */
  trackedOffset: number;
};

export function inventoryUsageLookbackDays(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.INVENTORY_USAGE_LOOKBACK_DAYS);
  if (!Number.isFinite(parsed) || parsed <= 0) return INVENTORY_USAGE_LOOKBACK_DAYS;
  return Math.min(Math.floor(parsed), 90);
}

export function emptyInventorySync(now = Date.now()): InventorySyncMeta {
  return {
    at: now,
    since: null,
    completedJobs: 0,
    deductedLines: 0,
    reversedLines: 0,
    jobInputsAvailable: true,
    jobInputsDetail: null,
    mode: "poll",
    trackedOffset: 0,
  };
}

export function sanitizeInventorySync(value: unknown): InventorySyncMeta | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<InventorySyncMeta>;
  const at = typeof record.at === "number" && Number.isFinite(record.at) ? record.at : 0;
  const since = typeof record.since === "number" && Number.isFinite(record.since) ? record.since : null;
  return {
    at,
    since,
    completedJobs: typeof record.completedJobs === "number" ? record.completedJobs : 0,
    deductedLines: typeof record.deductedLines === "number" ? record.deductedLines : 0,
    reversedLines: typeof record.reversedLines === "number" ? record.reversedLines : 0,
    jobInputsAvailable: record.jobInputsAvailable !== false,
    jobInputsDetail: typeof record.jobInputsDetail === "string" ? record.jobInputsDetail.slice(0, 300) : null,
    mode: record.mode === "webhook" ? "webhook" : "poll",
    trackedOffset:
      typeof record.trackedOffset === "number" && Number.isFinite(record.trackedOffset) && record.trackedOffset >= 0
        ? Math.floor(record.trackedOffset)
        : 0,
  };
}

function knownSources(result: Extract<HcpJobPartsResult, { ok: true }>): InventoryUsageSource[] {
  const sources: InventoryUsageSource[] = [];
  if (result.materials) sources.push("materials");
  if (result.jobInputs) sources.push("job_inputs");
  return sources;
}

/**
 * Active deductions to re-read. At most `max` jobs per poll, rotating through
 * the full set so a reopen past the first hundred is still put back.
 */
export function activeInventoryJobIds(
  doc: SharedPartsDocument,
  offset = 0,
  max = MAX_TRACKED_JOBS,
): { ids: string[]; nextOffset: number } {
  const seen = new Set<string>();
  const all: string[] = [];
  const active = doc.inventoryUsage.filter((row) => row.reversedAt == null);
  const sorted = [...active].sort(
    (a, b) => a.appliedAt - b.appliedAt || a.hcpJobId.localeCompare(b.hcpJobId),
  );
  for (const row of sorted) {
    if (seen.has(row.hcpJobId)) continue;
    seen.add(row.hcpJobId);
    all.push(row.hcpJobId);
  }
  if (all.length === 0 || all.length <= max) return { ids: all, nextOffset: 0 };
  const start = ((Math.floor(offset) % all.length) + all.length) % all.length;
  const ids: string[] = [];
  for (let i = 0; i < max; i += 1) ids.push(all[(start + i) % all.length]!);
  return { ids, nextOffset: (start + max) % all.length };
}

export async function syncInventoryDocument(
  doc: SharedPartsDocument,
  options: {
    mode: "poll" | "webhook";
    now?: number;
    env?: NodeJS.ProcessEnv;
    jobId?: string;
    listCompleted?: typeof listCompletedHcpJobsSince;
    fetchJob?: typeof fetchHcpJobParts;
  },
): Promise<
  | { ok: true; skipped: false; doc: SharedPartsDocument }
  | { ok: true; skipped: true; reason: string; doc: SharedPartsDocument }
  | { ok: false; error: string; doc: SharedPartsDocument }
> {
  const now = options.now ?? Date.now();
  const env = options.env ?? process.env;
  const fetchJob = options.fetchJob ?? fetchHcpJobParts;
  const listCompleted = options.listCompleted ?? listCompletedHcpJobsSince;
  if (!hcpApiKey(env)) {
    return {
      ok: true,
      skipped: true,
      reason: "HOUSECALL_PRO_API_KEY is not set",
      doc,
    };
  }

  const ids = new Set<string>();
  const tracked = activeInventoryJobIds(doc, doc.inventorySync?.trackedOffset ?? 0);
  if (options.mode === "webhook") {
    const jobId = options.jobId?.trim() ?? "";
    if (!jobId) return { ok: false, error: "Webhook payload had no job id", doc };
    ids.add(jobId);
  } else {
    const cursor = doc.inventorySync?.since;
    const since = cursor == null ? now - inventoryUsageLookbackDays(env) * 24 * 60 * 60 * 1000 : cursor - OVERLAP_MS;
    const listed = await listCompleted(since, env);
    if (!listed.ok) return { ok: false, error: listed.error, doc };
    for (const job of listed.jobs) ids.add(job.hcpJobId);
    for (const id of tracked.ids) ids.add(id);
  }

  let next = doc;
  let allOk = true;
  let jobInputsAvailable = true;
  let jobInputsDetail: string | null = null;
  let completedJobs = 0;
  let deductedLines = 0;
  let reversedLines = 0;

  for (const id of ids) {
    const result = await fetchJob(id, env);
    if (!result.ok) {
      if (!result.missing) {
        allOk = false;
        continue;
      }
      const before = next.inventoryUsage.filter((row) => row.hcpJobId === id && row.reversedAt == null).length;
      const applied = applyJobPartUsage(next.inventory, next.inventoryUsage, next.inventoryFlags, {
        hcpJobId: id,
        jobNumber: next.inventoryUsage.find((row) => row.hcpJobId === id)?.jobNumber ?? "",
        customerId: next.inventoryUsage.find((row) => row.hcpJobId === id)?.customerId ?? "",
        completed: false,
        knownSources: ["materials", "job_inputs"],
        parts: [],
      }, now);
      reversedLines += before;
      next = { ...next, inventory: applied.inventory, inventoryUsage: applied.usage, inventoryFlags: applied.flags };
      continue;
    }

    if (result.jobInputsError) {
      jobInputsAvailable = false;
      jobInputsDetail = result.jobInputsError;
    }
    const sources = knownSources(result);
    const parts = mergeJobPartUses(result.materials ?? [], result.jobInputs ?? []);
    const beforeActive = new Map(
      next.inventoryUsage.filter((row) => row.hcpJobId === result.hcpJobId).map((row) => [row.id, row]),
    );
    const applied = applyJobPartUsage(
      next.inventory,
      next.inventoryUsage,
      next.inventoryFlags,
      {
        hcpJobId: result.hcpJobId,
        jobNumber: result.jobNumber,
        customerId: result.customerId,
        completed: result.completed,
        knownSources: sources,
        parts,
      },
      now,
    );
    if (result.completed) completedJobs += 1;
    for (const row of applied.usage) {
      if (row.hcpJobId !== result.hcpJobId) continue;
      const prior = beforeActive.get(row.id);
      if (row.reversedAt == null && row.inventoryItemId && (!prior || prior.reversedAt != null || prior.qty !== row.qty)) {
        deductedLines += 1;
      }
      if (row.reversedAt != null && (prior == null || prior.reversedAt == null)) reversedLines += 1;
    }
    next = { ...next, inventory: applied.inventory, inventoryUsage: applied.usage, inventoryFlags: applied.flags };
  }

  const previousSince = doc.inventorySync?.since ?? null;
  next = {
    ...next,
    updatedAt: now,
    inventorySync: {
      at: now,
      since: options.mode === "poll" ? (allOk ? now : previousSince) : previousSince,
      completedJobs,
      deductedLines,
      reversedLines,
      jobInputsAvailable,
      jobInputsDetail,
      mode: options.mode,
      trackedOffset:
        options.mode === "poll" && allOk ? tracked.nextOffset : (doc.inventorySync?.trackedOffset ?? 0),
    },
  };
  return { ok: true, skipped: false, doc: next };
}
