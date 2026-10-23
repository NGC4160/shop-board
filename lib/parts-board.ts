import { sanitizeLoadedParts, withPartLineExtras, type PartLine } from "@/lib/parts";
import {
  applyInventoryReceipts,
  mergeInventoryItems,
  sanitizeLoadedInventory,
  type InventoryItem,
  type InventoryReceipt,
} from "@/lib/inventory";
import { sanitizeInventorySync, type InventorySyncMeta } from "@/lib/inventory-hcp-sync";
import {
  sanitizeInventoryFlag,
  sanitizeInventoryUsage,
  type InventoryFlag,
  type InventoryUsage,
} from "@/lib/inventory-usage";

export const SHARED_PARTS_VERSION = 2;

export type SharedPartsDocument = {
  version: typeof SHARED_PARTS_VERSION;
  updatedAt: number;
  parts: PartLine[];
  inventory: InventoryItem[];
  /** Parts line ids already received into inventory. Stops a second save from adding qty again. */
  inventoryReceipts: InventoryReceipt[];
  /** Parts used on completed Housecall Pro jobs. The bookkeeper's draft source — nothing is posted. */
  inventoryUsage: InventoryUsage[];
  inventoryFlags: InventoryFlag[];
  inventorySync: InventorySyncMeta | null;
};

export type SharedPartsPayload = {
  parts: PartLine[];
  /** Present only when the client loaded inventory and is writing it back. */
  inventory?: InventoryItem[];
  /** Last server `updatedAt` this client applied. Used to merge a stale PUT. */
  updatedAt?: number | null;
};

const DOC_KEYS = new Set([
  "version",
  "updatedAt",
  "parts",
  "inventory",
  "inventoryReceipts",
  "inventoryUsage",
  "inventoryFlags",
  "inventorySync",
  "jobs",
]);

type ParsedPartsBody = {
  parts: PartLine[];
  /** Null when the payload omitted inventory — a parts-only client must not clear it. */
  inventory: InventoryItem[] | null;
  inventoryReceipts: InventoryReceipt[] | null;
  inventoryUsage: InventoryUsage[] | null;
  inventoryFlags: InventoryFlag[] | null;
  inventorySync: InventorySyncMeta | null;
  updatedAt: number;
  extras: Record<string, unknown>;
};

function sanitizeReceipt(value: unknown): InventoryReceipt | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<InventoryReceipt>;
  const partLineId = typeof record.partLineId === "string" ? record.partLineId.trim().slice(0, 128) : "";
  if (!partLineId) return null;
  const qty = typeof record.qty === "number" && Number.isFinite(record.qty) ? record.qty : 0;
  const appliedAt = typeof record.appliedAt === "number" && Number.isFinite(record.appliedAt) ? record.appliedAt : 0;
  const inventoryItemId =
    typeof record.inventoryItemId === "string" && record.inventoryItemId.trim()
      ? record.inventoryItemId.trim().slice(0, 128)
      : null;
  return {
    partLineId,
    inventoryItemId,
    qty,
    appliedAt,
    skipped: record.skipped === true,
  };
}

function readList<T>(value: unknown, present: boolean, sanitize: (item: unknown) => T | null): T[] | null {
  if (!present) return null;
  if (!Array.isArray(value)) return [];
  const rows: T[] = [];
  for (const item of value) {
    const row = sanitize(item);
    if (row) rows.push(row);
  }
  return rows;
}

function documentExtras(record: Record<string, unknown>): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (DOC_KEYS.has(key)) continue;
    extras[key] = value;
  }
  return extras;
}

function readPartsBody(value: unknown): ParsedPartsBody | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const parts = Array.isArray(record.parts) ? sanitizeLoadedParts(record.parts) : [];
  const has = (key: string) => Object.prototype.hasOwnProperty.call(record, key);
  const inventory = has("inventory") ? sanitizeLoadedInventory(record.inventory) : null;
  const inventoryReceipts = readList(record.inventoryReceipts, has("inventoryReceipts"), sanitizeReceipt);
  const inventoryUsage = readList(record.inventoryUsage, has("inventoryUsage"), sanitizeInventoryUsage);
  const inventoryFlags = readList(record.inventoryFlags, has("inventoryFlags"), sanitizeInventoryFlag);
  const inventorySync = has("inventorySync") ? sanitizeInventorySync(record.inventorySync) : null;
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : Date.now();
  return {
    parts,
    inventory,
    inventoryReceipts,
    inventoryUsage,
    inventoryFlags,
    inventorySync,
    updatedAt,
    extras: documentExtras(record),
  };
}

/**
 * Accept a stored document or a PUT body. Returns null when the payload is
 * not an object. An empty parts list is valid (empty board).
 * v1 documents have no destination fields and no inventory array. Load leaves
 * inventory as stored. A parts write can receipt new stock; it does not
 * delete or recreate inventory rows.
 * Ignores any `jobs` field so a parts write cannot be treated as a job card.
 * Unknown keys already stored on the document are kept.
 */
export function parseSharedPartsDocument(value: unknown): SharedPartsDocument | null {
  const parsed = readPartsBody(value);
  if (!parsed) return null;
  return {
    ...parsed.extras,
    version: SHARED_PARTS_VERSION,
    updatedAt: parsed.updatedAt,
    parts: parsed.parts,
    inventory: parsed.inventory ?? [],
    inventoryReceipts: parsed.inventoryReceipts ?? [],
    inventoryUsage: parsed.inventoryUsage ?? [],
    inventoryFlags: parsed.inventoryFlags ?? [],
    inventorySync: parsed.inventorySync,
  };
}

export function toSharedPartsDocument(
  payload: SharedPartsPayload,
  updatedAt = Date.now(),
): SharedPartsDocument {
  const parts = sanitizeLoadedParts(payload.parts);
  const inventory = sanitizeLoadedInventory(payload.inventory ?? []);
  return {
    version: SHARED_PARTS_VERSION,
    updatedAt,
    parts,
    inventory,
    inventoryReceipts: [],
    inventoryUsage: [],
    inventoryFlags: [],
    inventorySync: null,
  };
}

export function emptySharedPartsDocument(updatedAt = Date.now()): SharedPartsDocument {
  return {
    version: SHARED_PARTS_VERSION,
    updatedAt,
    parts: [],
    inventory: [],
    inventoryReceipts: [],
    inventoryUsage: [],
    inventoryFlags: [],
    inventorySync: null,
  };
}

/**
 * Client's last-seen document time. Missing/invalid means "unknown" (0) so a
 * stale PUT cannot treat newer server-only lines as deletes.
 */
export function readPartsWriteBaseUpdatedAt(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  if (typeof updatedAt === "number" && Number.isFinite(updatedAt) && updatedAt >= 0) {
    return updatedAt;
  }
  return 0;
}

function overlayPartLine(server: PartLine | undefined, incoming: PartLine): PartLine {
  if (!server) return incoming;
  return withPartLineExtras(incoming, server);
}

/**
 * Merge a shop-floor snapshot write into the stored document.
 *
 * - Same id: newer `line.updatedAt` wins; a tie keeps the incoming save.
 * - Incoming-only: client added the line.
 * - Server-only: keep if the line is newer than the client's last-seen
 *   document time (added after that page loaded). Otherwise the client
 *   deleted a line it already knew about.
 * Unknown fields on the server line survive when the incoming line omits them.
 */
export function mergeSharedPartsDocuments(
  current: SharedPartsDocument,
  incoming: SharedPartsPayload | SharedPartsDocument,
  basedOnUpdatedAt: number,
): SharedPartsPayload {
  const incomingParts = sanitizeLoadedParts(incoming.parts);
  const currentById = new Map(current.parts.map((line) => [line.id, line]));
  const incomingById = new Map(incomingParts.map((line) => [line.id, line]));
  const parts: PartLine[] = [];

  for (const line of incomingParts) {
    const serverLine = currentById.get(line.id);
    if (!serverLine || line.updatedAt >= serverLine.updatedAt) {
      parts.push(overlayPartLine(serverLine, line));
    } else {
      parts.push(serverLine);
    }
  }

  for (const line of current.parts) {
    if (incomingById.has(line.id)) continue;
    if (line.updatedAt > basedOnUpdatedAt) parts.push(line);
  }

  return { parts };
}

function withPartsWrite(
  current: SharedPartsDocument,
  parts: PartLine[],
  inventory: InventoryItem[],
  now: number,
): SharedPartsDocument {
  const received = applyInventoryReceipts(
    current.parts,
    parts,
    inventory,
    current.inventoryReceipts ?? [],
    now,
  );
  return {
    ...current,
    version: SHARED_PARTS_VERSION,
    updatedAt: now,
    parts,
    inventory: received.inventory,
    inventoryReceipts: received.receipts,
  };
}

/** Replace parts lines. A received Inventory line can add stock. It cannot delete or un-retire a row. */
export function replacePartsLines(
  current: SharedPartsDocument | null,
  parts: PartLine[],
  now = Date.now(),
): SharedPartsDocument {
  const base = current ?? emptySharedPartsDocument(0);
  return withPartsWrite(base, sanitizeLoadedParts(parts), base.inventory, now);
}

/** Replace inventory rows without re-syncing from parts. Parts lines stay put. */
export function replaceInventoryItems(
  current: SharedPartsDocument | null,
  inventory: InventoryItem[],
  now = Date.now(),
): SharedPartsDocument {
  const base = current ?? emptySharedPartsDocument(0);
  return {
    ...base,
    version: SHARED_PARTS_VERSION,
    updatedAt: now,
    parts: base.parts,
    inventory: sanitizeLoadedInventory(inventory),
  };
}

/** Apply a PUT body to the stored document. Never drops newer server-only lines. */
export function applyIncomingPartsPut(
  current: SharedPartsDocument | null,
  body: unknown,
  now = Date.now(),
): { ok: true; doc: SharedPartsDocument } | { ok: false; error: string } {
  const parsed = readPartsBody(body);
  if (!parsed) return { ok: false, error: "Parts payload was not an object" };
  const basedOn = readPartsWriteBaseUpdatedAt(body);
  const base = current ?? emptySharedPartsDocument(0);
  const merged = mergeSharedPartsDocuments(base, { parts: parsed.parts }, basedOn);
  const inventory =
    parsed.inventory == null
      ? base.inventory
      : mergeInventoryItems(base.inventory, parsed.inventory, basedOn);
  return { ok: true, doc: withPartsWrite(base, merged.parts, inventory, now) };
}

/**
 * Inventory PUT. Parts lines stay as stored. Omitted inventory would be a
 * parts-board save, so this requires an inventory array. Does not re-sync
 * from parts — qty and the other inventory-owned fields are the edit.
 */
export function applyIncomingInventoryPut(
  current: SharedPartsDocument | null,
  body: unknown,
  now = Date.now(),
): { ok: true; doc: SharedPartsDocument } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Inventory payload was not an object" };
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.inventory)) return { ok: false, error: "Inventory payload needs an inventory array" };
  const basedOn = readPartsWriteBaseUpdatedAt(body);
  const base = current ?? emptySharedPartsDocument(0);
  const incoming = sanitizeLoadedInventory(record.inventory);
  return {
    ok: true,
    doc: {
      ...base,
      version: SHARED_PARTS_VERSION,
      updatedAt: now,
      parts: base.parts,
      inventory: mergeInventoryItems(base.inventory, incoming, basedOn),
    },
  };
}
