import {
  normalizeHcpMaterialId,
  normalizePartNumber,
  type InventoryItem,
} from "@/lib/inventory";

export type InventoryUsageSource = "materials" | "job_inputs";

/** One part recorded on a Housecall Pro job. Matching is exact — never a fuzzy name guess. */
export type HcpPartUse = {
  source: InventoryUsageSource;
  lineId: string;
  partNumber: string;
  partName: string;
  description: string;
  /** Price-book material id (`service_item_id`) when the line has one. */
  hcpMaterialId: string | null;
  qty: number;
};

export type InventoryUsage = {
  id: string;
  hcpJobId: string;
  jobNumber: string;
  customerId: string;
  source: InventoryUsageSource;
  lineId: string;
  partNumber: string;
  partName: string;
  hcpMaterialId: string | null;
  inventoryItemId: string | null;
  qty: number;
  /** Unit value copied from the inventory row when the qty was deducted. */
  unitValue: number | null;
  /** qty × unit value. Blank unit value counts as 0. Not posted to QuickBooks. */
  extendedValue: number;
  appliedAt: number;
  reversedAt: number | null;
  reverseReason: "line_removed" | "job_reopened" | null;
};

export type InventoryFlagKind = "usage_without_hcp_line" | "hcp_part_without_inventory";

export type InventoryFlag = {
  id: string;
  kind: InventoryFlagKind;
  hcpJobId: string;
  jobNumber: string;
  customerId: string;
  source: InventoryUsageSource;
  lineId: string;
  partNumber: string;
  partName: string;
  qty: number;
  detail: string;
};

export type InventoryJobParts = {
  hcpJobId: string;
  jobNumber: string;
  customerId: string;
  completed: boolean;
  /** Sources that were actually read. A failed read must not reverse that source. */
  knownSources: readonly InventoryUsageSource[];
  parts: readonly HcpPartUse[];
};

const USAGE_SOURCES = new Set<InventoryUsageSource>(["materials", "job_inputs"]);

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function inventoryUsageId(hcpJobId: string, source: InventoryUsageSource, lineId: string): string {
  return `${hcpJobId}:${source}:${lineId}`;
}

export function extendedInventoryValue(qty: number, unitValue: number | null): number {
  return qty * (unitValue == null ? 0 : unitValue);
}

/**
 * Keep both sources. The same part on materials and on job inputs is two uses.
 * Duplicate line ids inside one source collapse to the first.
 */
export function mergeJobPartUses(
  materials: readonly HcpPartUse[],
  jobInputs: readonly HcpPartUse[],
): HcpPartUse[] {
  const seen = new Set<string>();
  const merged: HcpPartUse[] = [];
  for (const part of [...materials, ...jobInputs]) {
    if (!part.lineId || part.qty <= 0) continue;
    if (!USAGE_SOURCES.has(part.source)) continue;
    const key = `${part.source}:${part.lineId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(part);
  }
  return merged;
}

function sameMaterialId(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function partNumberCandidates(part: HcpPartUse): string[] {
  const explicit = normalizePartNumber(part.partNumber);
  if (explicit) return [explicit];
  const keys = [normalizePartNumber(part.partName), normalizePartNumber(part.description)].filter(Boolean);
  return [...new Set(keys)];
}

export function matchInventoryForPart(
  items: readonly InventoryItem[],
  part: HcpPartUse,
): InventoryItem | "ambiguous" | null {
  const live = items.filter((item) => item.deletedAt == null);
  const materialId = normalizeHcpMaterialId(part.hcpMaterialId);
  if (materialId) {
    const linked = live.filter((item) => sameMaterialId(item.hcpMaterialId, materialId));
    if (linked.length === 1) return linked[0]!;
    if (linked.length > 1) return "ambiguous";
  }
  const candidates = partNumberCandidates(part);
  if (candidates.length === 0) return null;
  const matched = live.filter((item) => candidates.includes(normalizePartNumber(item.partNumber)));
  if (matched.length === 1) return matched[0]!;
  if (matched.length > 1) return "ambiguous";
  return null;
}

function flagId(kind: InventoryFlagKind, hcpJobId: string, source: InventoryUsageSource, lineId: string): string {
  return `${kind}:${hcpJobId}:${source}:${lineId}`;
}

function usageFlag(
  row: Pick<InventoryUsage, "hcpJobId" | "jobNumber" | "customerId" | "source" | "lineId" | "partNumber" | "partName" | "qty">,
  detail: string,
): InventoryFlag {
  return {
    id: flagId("usage_without_hcp_line", row.hcpJobId, row.source, row.lineId),
    kind: "usage_without_hcp_line",
    hcpJobId: row.hcpJobId,
    jobNumber: row.jobNumber,
    customerId: row.customerId,
    source: row.source,
    lineId: row.lineId,
    partNumber: row.partNumber,
    partName: row.partName,
    qty: row.qty,
    detail,
  };
}

function unmatchedFlag(job: InventoryJobParts, part: HcpPartUse, detail: string): InventoryFlag {
  return {
    id: flagId("hcp_part_without_inventory", job.hcpJobId, part.source, part.lineId),
    kind: "hcp_part_without_inventory",
    hcpJobId: job.hcpJobId,
    jobNumber: job.jobNumber,
    customerId: job.customerId,
    source: part.source,
    lineId: part.lineId,
    partNumber: part.partNumber,
    partName: part.partName,
    qty: part.qty,
    detail,
  };
}

function blankUsage(job: InventoryJobParts, part: HcpPartUse, now: number): InventoryUsage {
  return {
    id: inventoryUsageId(job.hcpJobId, part.source, part.lineId),
    hcpJobId: job.hcpJobId,
    jobNumber: clip(job.jobNumber, 32),
    customerId: clip(job.customerId, 128),
    source: part.source,
    lineId: part.lineId,
    partNumber: clip(part.partNumber, 80),
    partName: clip(part.partName, 200),
    hcpMaterialId: normalizeHcpMaterialId(part.hcpMaterialId),
    inventoryItemId: null,
    qty: part.qty,
    unitValue: null,
    extendedValue: 0,
    appliedAt: now,
    reversedAt: null,
    reverseReason: null,
  };
}

export function sanitizeInventoryUsage(value: unknown): InventoryUsage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<InventoryUsage>;
  const hcpJobId = clip(record.hcpJobId, 128);
  const lineId = clip(record.lineId, 128);
  const source = record.source;
  if (!hcpJobId || !lineId || (source !== "materials" && source !== "job_inputs")) return null;
  const qty = finiteNumber(record.qty);
  if (qty === undefined) return null;
  const unitValue = record.unitValue == null ? null : (finiteNumber(record.unitValue) ?? null);
  const appliedAt = finiteNumber(record.appliedAt) ?? 0;
  const reversedAt =
    typeof record.reversedAt === "number" && Number.isFinite(record.reversedAt) && record.reversedAt > 0
      ? record.reversedAt
      : null;
  const reverseReason =
    record.reverseReason === "line_removed" || record.reverseReason === "job_reopened" ? record.reverseReason : null;
  return {
    id: inventoryUsageId(hcpJobId, source, lineId),
    hcpJobId,
    jobNumber: clip(record.jobNumber, 32),
    customerId: clip(record.customerId, 128),
    source,
    lineId,
    partNumber: clip(record.partNumber, 80),
    partName: clip(record.partName, 200),
    hcpMaterialId: normalizeHcpMaterialId(record.hcpMaterialId),
    inventoryItemId: clip(record.inventoryItemId, 128) || null,
    qty,
    unitValue,
    extendedValue: extendedInventoryValue(qty, unitValue),
    appliedAt,
    reversedAt,
    reverseReason: reversedAt ? reverseReason : null,
  };
}

export function sanitizeInventoryFlag(value: unknown): InventoryFlag | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<InventoryFlag>;
  const kind = record.kind;
  const source = record.source;
  const hcpJobId = clip(record.hcpJobId, 128);
  const lineId = clip(record.lineId, 128);
  if (
    (kind !== "usage_without_hcp_line" && kind !== "hcp_part_without_inventory") ||
    (source !== "materials" && source !== "job_inputs") ||
    !hcpJobId ||
    !lineId
  ) {
    return null;
  }
  const qty = finiteNumber(record.qty) ?? 0;
  return {
    id: flagId(kind, hcpJobId, source, lineId),
    kind,
    hcpJobId,
    jobNumber: clip(record.jobNumber, 32),
    customerId: clip(record.customerId, 128),
    source,
    lineId,
    partNumber: clip(record.partNumber, 80),
    partName: clip(record.partName, 200),
    qty,
    detail: clip(record.detail, 300),
  };
}

/**
 * Deduct qty for the parts on one Housecall Pro job, or put qty back when the
 * job is reopened or a line is gone. Applying the same parts again does not
 * deduct twice. Unmatched parts are flagged and do not change on-hand qty.
 */
export function applyJobPartUsage(
  inventory: readonly InventoryItem[],
  usage: readonly InventoryUsage[],
  flags: readonly InventoryFlag[],
  job: InventoryJobParts,
  now = Date.now(),
): { inventory: InventoryItem[]; usage: InventoryUsage[]; flags: InventoryFlag[] } {
  const known = new Set(job.knownSources);
  const existing = usage.filter((row) => row.hcpJobId === job.hcpJobId);
  const kept = usage.filter((row) => row.hcpJobId !== job.hcpJobId);
  const deltas = new Map<string, number>();
  const nextUsage: InventoryUsage[] = [];
  const nextFlags: InventoryFlag[] = [];

  const addDelta = (itemId: string | null, delta: number) => {
    if (!itemId || delta === 0) return;
    deltas.set(itemId, (deltas.get(itemId) ?? 0) + delta);
  };

  const rememberReversed = (row: InventoryUsage) => {
    nextUsage.push(row);
    if (row.reverseReason === "line_removed" || row.reverseReason === "job_reopened") {
      nextFlags.push(
        usageFlag(
          row,
          row.reverseReason === "job_reopened"
            ? "Job is not completed in Housecall Pro. On-hand qty was put back."
            : "This usage has no matching line on the Housecall Pro job. On-hand qty was put back.",
        ),
      );
    }
  };

  if (!job.completed) {
    for (const row of existing) {
      if (row.reversedAt != null || !known.has(row.source)) {
        if (row.reversedAt != null) rememberReversed(row);
        else nextUsage.push(row);
        continue;
      }
      addDelta(row.inventoryItemId, row.qty);
      rememberReversed({ ...row, reversedAt: now, reverseReason: "job_reopened" });
    }
  } else {
    const desired = job.parts.filter((part) => known.has(part.source) && part.lineId && part.qty > 0);
    const desiredIds = new Set(desired.map((part) => inventoryUsageId(job.hcpJobId, part.source, part.lineId)));
    const existingById = new Map(existing.map((row) => [row.id, row]));

    for (const part of desired) {
      const id = inventoryUsageId(job.hcpJobId, part.source, part.lineId);
      const prior = existingById.get(id) ?? null;
      const match = matchInventoryForPart(inventory, part);
      if (match === "ambiguous" || match == null) {
        if (prior && prior.reversedAt == null) addDelta(prior.inventoryItemId, prior.qty);
        nextUsage.push({
          ...blankUsage(job, part, prior?.appliedAt && prior.reversedAt == null ? prior.appliedAt : now),
          reversedAt: null,
          reverseReason: null,
        });
        nextFlags.push(
          unmatchedFlag(
            job,
            part,
            match === "ambiguous"
              ? "More than one inventory row matches this part. Qty was not changed."
              : "No inventory row matches this part number or HCP material id. Qty was not changed.",
          ),
        );
        continue;
      }
      const priorActive = prior && prior.reversedAt == null && prior.inventoryItemId === match.id ? prior.qty : 0;
      if (prior && prior.reversedAt == null && prior.inventoryItemId && prior.inventoryItemId !== match.id) {
        addDelta(prior.inventoryItemId, prior.qty);
      }
      const deltaUse = part.qty - priorActive;
      addDelta(match.id, -deltaUse);
      const unitValue =
        prior && prior.reversedAt == null && prior.inventoryItemId === match.id && prior.unitValue != null
          ? prior.unitValue
          : match.unitValue;
      nextUsage.push({
        ...blankUsage(job, part, prior && prior.reversedAt == null && deltaUse === 0 ? prior.appliedAt : now),
        partNumber: clip(part.partNumber, 80) || match.partNumber,
        partName: clip(part.partName, 200) || match.partName,
        inventoryItemId: match.id,
        qty: part.qty,
        unitValue,
        extendedValue: extendedInventoryValue(part.qty, unitValue),
        reversedAt: null,
        reverseReason: null,
      });
    }

    for (const prior of existing) {
      if (desiredIds.has(prior.id)) continue;
      if (prior.reversedAt != null || !known.has(prior.source)) {
        if (prior.reversedAt != null) rememberReversed(prior);
        else nextUsage.push(prior);
        continue;
      }
      addDelta(prior.inventoryItemId, prior.qty);
      rememberReversed({ ...prior, reversedAt: now, reverseReason: "line_removed" });
    }
  }

  const nextInventory = inventory.map((item) => {
    const delta = deltas.get(item.id);
    if (!delta) return item;
    return { ...item, qtyOnHand: item.qtyOnHand + delta, updatedAt: now };
  });

  return {
    inventory: nextInventory,
    usage: [...kept, ...nextUsage],
    flags: [...flags.filter((flag) => flag.hcpJobId !== job.hcpJobId), ...nextFlags],
  };
}
