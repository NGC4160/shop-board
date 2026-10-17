import type { PartLine } from "@/lib/parts";

/**
 * Stock rows live in the same parts document as board lines so a destination
 * change and its inventory link save in one write.
 * One parts line maps to at most one item (`sourcePartLineId`). Mixed orders
 * are not split here.
 */
export type InventoryItem = {
  id: string;
  sourcePartLineId: string | null;
  partName: string;
  partNumber: string;
  supplier: string;
  description: string;
  qtyOnHand: number;
  minQty: number | null;
  minOrderQty: number | null;
  unitValue: number | null;
  updatedAt: number;
  deletedAt: number | null;
};

export type InventoryItemInput = {
  id?: unknown;
  sourcePartLineId?: unknown;
  partName?: unknown;
  partNumber?: unknown;
  supplier?: unknown;
  description?: unknown;
  qtyOnHand?: unknown;
  minQty?: unknown;
  minOrderQty?: unknown;
  unitValue?: unknown;
  updatedAt?: unknown;
  deletedAt?: unknown;
};

const INVENTORY_KEYS = new Set([
  "id",
  "sourcePartLineId",
  "partName",
  "partNumber",
  "supplier",
  "description",
  "qtyOnHand",
  "minQty",
  "minOrderQty",
  "unitValue",
  "updatedAt",
  "deletedAt",
  "jobs",
]);

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

function requiredQty(value: unknown, fallback = 0): number {
  const parsed = finiteNumber(value);
  if (parsed === undefined || parsed < 0) return fallback;
  return parsed;
}

function optionalQty(value: unknown, fallback: number | null): number | null {
  if (value == null || value === "") return null;
  const parsed = finiteNumber(value);
  if (parsed === undefined || parsed < 0) return fallback;
  return parsed;
}

export function createInventoryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeInventoryId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 128);
}

export function inventoryIdError(value: unknown): string | null {
  const id = normalizeInventoryId(value);
  if (!id) return "Inventory id is required";
  if (/\s/.test(id)) return "Inventory id cannot contain spaces";
  return null;
}

/** Note when the shop wrote one, otherwise the part description. Never invented. */
export function inventoryDescriptionFromPart(part: {
  note?: string;
  partDescription?: string;
}): string {
  const note = clip(part.note, 200);
  if (note) return note;
  return clip(part.partDescription, 200);
}

export function partIsSoftDeleted(part: object): boolean {
  if (!("deletedAt" in part)) return false;
  const deletedAt = (part as { deletedAt?: unknown }).deletedAt;
  return typeof deletedAt === "number" && Number.isFinite(deletedAt) && deletedAt > 0;
}

function sourcePartLineId(value: unknown): string | null {
  if (value == null || value === "") return null;
  const id = normalizeInventoryId(value);
  return id || null;
}

function itemExtras(record: object): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (INVENTORY_KEYS.has(key)) continue;
    extras[key] = value;
  }
  return extras;
}

export function emptyInventoryItem(id = createInventoryId(), now = Date.now()): InventoryItem {
  return {
    id,
    sourcePartLineId: null,
    partName: "",
    partNumber: "",
    supplier: "",
    description: "",
    qtyOnHand: 0,
    minQty: null,
    minOrderQty: null,
    unitValue: null,
    updatedAt: now,
    deletedAt: null,
  };
}

export function mergeInventoryItem(
  current: InventoryItem | null,
  patch: Partial<InventoryItem>,
  now = Date.now(),
): InventoryItem {
  const base = current ?? emptyInventoryItem(patch.id || createInventoryId(), now);
  const extras = { ...itemExtras(base), ...itemExtras(patch) };
  const source =
    patch.sourcePartLineId !== undefined ? sourcePartLineId(patch.sourcePartLineId) : base.sourcePartLineId;
  return {
    ...extras,
    id: normalizeInventoryId(patch.id) || base.id,
    sourcePartLineId: source,
    partName: patch.partName !== undefined ? clip(patch.partName, 200) : base.partName,
    partNumber: patch.partNumber !== undefined ? clip(patch.partNumber, 80) : base.partNumber,
    supplier: patch.supplier !== undefined ? clip(patch.supplier, 80) : base.supplier,
    description: patch.description !== undefined ? clip(patch.description, 200) : base.description,
    qtyOnHand: patch.qtyOnHand !== undefined ? requiredQty(patch.qtyOnHand, base.qtyOnHand) : base.qtyOnHand,
    minQty: patch.minQty !== undefined ? optionalQty(patch.minQty, base.minQty) : base.minQty,
    minOrderQty:
      patch.minOrderQty !== undefined ? optionalQty(patch.minOrderQty, base.minOrderQty) : base.minOrderQty,
    unitValue: patch.unitValue !== undefined ? optionalQty(patch.unitValue, base.unitValue) : base.unitValue,
    updatedAt:
      patch.updatedAt !== undefined && Number.isFinite(patch.updatedAt) ? patch.updatedAt : now,
    deletedAt:
      patch.deletedAt !== undefined
        ? patch.deletedAt != null && Number.isFinite(patch.deletedAt) && patch.deletedAt > 0
          ? patch.deletedAt
          : null
        : base.deletedAt,
  };
}

export function sanitizeInventoryItem(value: unknown): InventoryItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as InventoryItemInput;
  const id = normalizeInventoryId(record.id);
  if (!id || inventoryIdError(id)) return null;
  const patch: Partial<InventoryItem> = { id };
  if ("sourcePartLineId" in record) patch.sourcePartLineId = sourcePartLineId(record.sourcePartLineId);
  if ("partName" in record) patch.partName = clip(record.partName, 200);
  if ("partNumber" in record) patch.partNumber = clip(record.partNumber, 80);
  if ("supplier" in record) patch.supplier = clip(record.supplier, 80);
  if ("description" in record) patch.description = clip(record.description, 200);
  if ("qtyOnHand" in record) patch.qtyOnHand = requiredQty(record.qtyOnHand, 0);
  if ("minQty" in record) patch.minQty = optionalQty(record.minQty, null);
  if ("minOrderQty" in record) patch.minOrderQty = optionalQty(record.minOrderQty, null);
  if ("unitValue" in record) patch.unitValue = optionalQty(record.unitValue, null);
  if ("deletedAt" in record) {
    patch.deletedAt =
      typeof record.deletedAt === "number" && Number.isFinite(record.deletedAt) && record.deletedAt > 0
        ? record.deletedAt
        : null;
  }
  if (typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)) {
    patch.updatedAt = record.updatedAt;
  }
  const line = mergeInventoryItem(null, patch, patch.updatedAt ?? 0);
  return { ...itemExtras(record), ...line };
}

export function sanitizeLoadedInventory(value: unknown): InventoryItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const sourceSeen = new Set<string>();
  const items: InventoryItem[] = [];
  for (const item of value) {
    const line = sanitizeInventoryItem(item);
    if (!line || seen.has(line.id)) continue;
    if (line.sourcePartLineId) {
      if (sourceSeen.has(line.sourcePartLineId)) continue;
      sourceSeen.add(line.sourcePartLineId);
    }
    seen.add(line.id);
    items.push(line);
  }
  return items;
}

function linkedPart(parts: readonly PartLine[], sourcePartLineId: string): PartLine | undefined {
  return parts.find((part) => part.id === sourcePartLineId);
}

function refreshLinkedItem(existing: InventoryItem, part: PartLine, now: number): InventoryItem {
  const partName = clip(part.partDescription, 200);
  const supplier = clip(part.vendor, 80);
  const description = inventoryDescriptionFromPart(part);
  const unchanged =
    existing.deletedAt == null &&
    existing.partName === partName &&
    existing.supplier === supplier &&
    existing.description === description;
  if (unchanged) return existing;
  return {
    ...existing,
    partName,
    supplier,
    description,
    deletedAt: null,
    updatedAt: now,
  };
}

function createLinkedItem(part: PartLine, now: number): InventoryItem {
  return {
    id: createInventoryId(),
    sourcePartLineId: part.id,
    partName: clip(part.partDescription, 200),
    partNumber: "",
    supplier: clip(part.vendor, 80),
    description: inventoryDescriptionFromPart(part),
    qtyOnHand: 0,
    minQty: null,
    minOrderQty: null,
    unitValue: null,
    updatedAt: now,
    deletedAt: null,
  };
}

function softDeleteItem(item: InventoryItem, now: number): InventoryItem {
  if (item.deletedAt != null) return item;
  return { ...item, deletedAt: now, updatedAt: now };
}

/**
 * On a parts write: upsert one inventory row per live Inventory destination,
 * keyed by sourcePartLineId. Owned fields (qty, mins, unit value, part number)
 * stay as the inventory row left them. Leaving Inventory, or a soft-deleted
 * parts line, soft-deletes the link. Manual rows (no source) are untouched.
 */
export function syncInventoryFromParts(
  parts: readonly PartLine[],
  inventory: readonly InventoryItem[],
  now = Date.now(),
): InventoryItem[] {
  const active = new Map<string, PartLine>();
  for (const part of parts) {
    if (part.destinationType !== "Inventory" || partIsSoftDeleted(part)) continue;
    active.set(part.id, part);
  }

  const canonical = new Map<string, InventoryItem>();
  for (const item of inventory) {
    if (!item.sourcePartLineId) continue;
    const previous = canonical.get(item.sourcePartLineId);
    if (!previous || item.updatedAt >= previous.updatedAt) {
      canonical.set(item.sourcePartLineId, item);
    }
  }

  const seenSources = new Set<string>();
  const next: InventoryItem[] = [];

  for (const item of inventory) {
    if (!item.sourcePartLineId) {
      next.push(item);
      continue;
    }
    if (seenSources.has(item.sourcePartLineId)) continue;
    seenSources.add(item.sourcePartLineId);
    const source = canonical.get(item.sourcePartLineId) ?? item;
    const part = linkedPart(parts, item.sourcePartLineId);
    if (part && active.has(part.id)) {
      next.push(refreshLinkedItem(source, part, now));
    } else {
      next.push(softDeleteItem(source, now));
    }
  }

  for (const [partId, part] of active) {
    if (seenSources.has(partId)) continue;
    next.push(createLinkedItem(part, now));
  }

  return next;
}

export function mergeInventoryItems(
  current: readonly InventoryItem[],
  incoming: readonly InventoryItem[],
  basedOnUpdatedAt: number,
): InventoryItem[] {
  const currentById = new Map(current.map((item) => [item.id, item]));
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const items: InventoryItem[] = [];
  for (const item of incoming) {
    const serverItem = currentById.get(item.id);
    if (!serverItem || item.updatedAt >= serverItem.updatedAt) {
      items.push(serverItem ? { ...itemExtras(serverItem), ...item } : item);
    } else {
      items.push(serverItem);
    }
  }
  for (const item of current) {
    if (incomingById.has(item.id)) continue;
    if (item.updatedAt > basedOnUpdatedAt) items.push(item);
  }
  return items;
}

export function parseInventoryPatch(value: unknown): { id: string; patch: Partial<InventoryItem> } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as InventoryItemInput;
  const id = normalizeInventoryId(record.id);
  if (!id || inventoryIdError(id)) return null;
  const patch: Partial<InventoryItem> = { id };
  if ("sourcePartLineId" in record) patch.sourcePartLineId = sourcePartLineId(record.sourcePartLineId);
  if ("partName" in record) patch.partName = clip(record.partName, 200);
  if ("partNumber" in record) patch.partNumber = clip(record.partNumber, 80);
  if ("supplier" in record) patch.supplier = clip(record.supplier, 80);
  if ("description" in record) patch.description = clip(record.description, 200);
  if ("qtyOnHand" in record) patch.qtyOnHand = requiredQty(record.qtyOnHand, 0);
  if ("minQty" in record) patch.minQty = optionalQty(record.minQty, null);
  if ("minOrderQty" in record) patch.minOrderQty = optionalQty(record.minOrderQty, null);
  if ("unitValue" in record) patch.unitValue = optionalQty(record.unitValue, null);
  if ("deletedAt" in record) {
    patch.deletedAt =
      typeof record.deletedAt === "number" && Number.isFinite(record.deletedAt) && record.deletedAt > 0
        ? record.deletedAt
        : null;
  }
  if (typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)) {
    patch.updatedAt = record.updatedAt;
  }
  return { id, patch };
}

export function upsertInventoryItem(
  items: readonly InventoryItem[],
  incoming: unknown,
  now = Date.now(),
): { ok: true; items: InventoryItem[]; item: InventoryItem } | { ok: false; error: string } {
  const parsed = parseInventoryPatch(incoming);
  if (!parsed) return { ok: false, error: "A stable inventory id is required" };
  const source = parsed.patch.sourcePartLineId;
  if (source) {
    const clash = items.find((item) => item.sourcePartLineId === source && item.id !== parsed.id);
    if (clash) return { ok: false, error: "That parts line is already linked to inventory" };
  }
  const existing = items.find((item) => item.id === parsed.id) ?? null;
  const fields = { ...parsed.patch };
  delete fields.updatedAt;
  const item = mergeInventoryItem(existing, fields, now);
  if (!existing) return { ok: true, items: [...items, item], item };
  return {
    ok: true,
    items: items.map((row) => (row.id === item.id ? item : row)),
    item,
  };
}

export function parseInventoryIdInput(
  value: unknown,
): { ok: true; id: string } | { ok: false; error: string } {
  const raw =
    typeof value === "string" || value == null
      ? value
      : typeof value === "object"
        ? (value as { id?: unknown }).id
        : undefined;
  const error = inventoryIdError(raw);
  if (error) return { ok: false, error };
  return { ok: true, id: normalizeInventoryId(raw) };
}

/** Soft-delete. The row stays so a later parts sync can restore a live link. */
export function softDeleteInventoryItem(
  items: readonly InventoryItem[],
  incoming: unknown,
  now = Date.now(),
):
  | { ok: true; items: InventoryItem[]; removed: InventoryItem }
  | { ok: false; error: string; missing?: boolean } {
  const parsed = parseInventoryIdInput(incoming);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const existing = items.find((item) => item.id === parsed.id);
  if (!existing) return { ok: false, error: "Inventory item not found", missing: true };
  const removed = softDeleteItem(existing, now);
  return {
    ok: true,
    items: items.map((item) => (item.id === removed.id ? removed : item)),
    removed,
  };
}

/** Blank unit value counts as 0. The cell still displays blank. */
export function inventoryLineValue(item: Pick<InventoryItem, "qtyOnHand" | "unitValue">): number {
  const unit = item.unitValue == null ? 0 : item.unitValue;
  return item.qtyOnHand * unit;
}

/** Sum of qty × unit value. Soft-deleted rows are not stock. */
export function inventoryBalance(items: readonly InventoryItem[]): number {
  return items.reduce((sum, item) => {
    if (item.deletedAt != null) return sum;
    return sum + inventoryLineValue(item);
  }, 0);
}

export function isLowStock(item: Pick<InventoryItem, "qtyOnHand" | "minQty" | "deletedAt">): boolean {
  if (item.deletedAt != null) return false;
  if (item.minQty == null) return false;
  return item.qtyOnHand <= item.minQty;
}

export function activeInventory(items: readonly InventoryItem[]): InventoryItem[] {
  return items.filter((item) => item.deletedAt == null);
}

export function formatInventoryMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}
