import { sanitizeLoadedParts, withPartLineExtras, type PartLine } from "@/lib/parts";
import {
  mergeInventoryItems,
  sanitizeLoadedInventory,
  syncInventoryFromParts,
  type InventoryItem,
} from "@/lib/inventory";

export const SHARED_PARTS_VERSION = 2;

export type SharedPartsDocument = {
  version: typeof SHARED_PARTS_VERSION;
  updatedAt: number;
  parts: PartLine[];
  inventory: InventoryItem[];
};

export type SharedPartsPayload = {
  parts: PartLine[];
  /** Present only when the client loaded inventory and is writing it back. */
  inventory?: InventoryItem[];
  /** Last server `updatedAt` this client applied. Used to merge a stale PUT. */
  updatedAt?: number | null;
};

const DOC_KEYS = new Set(["version", "updatedAt", "parts", "inventory", "jobs"]);

type ParsedPartsBody = {
  parts: PartLine[];
  /** Null when the payload omitted inventory — a parts-only client must not clear it. */
  inventory: InventoryItem[] | null;
  updatedAt: number;
  extras: Record<string, unknown>;
};

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
  const inventory = Object.prototype.hasOwnProperty.call(record, "inventory")
    ? sanitizeLoadedInventory(record.inventory)
    : null;
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : Date.now();
  return { parts, inventory, updatedAt, extras: documentExtras(record) };
}

/**
 * Accept a stored document or a PUT body. Returns null when the payload is
 * not an object. An empty parts list is valid (empty board).
 * v1 documents have no destination fields and no inventory array. Load derives
 * destinations and leaves inventory empty until a parts write syncs links.
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
    inventory: syncInventoryFromParts(parts, inventory, updatedAt),
  };
}

export function emptySharedPartsDocument(updatedAt = Date.now()): SharedPartsDocument {
  return {
    version: SHARED_PARTS_VERSION,
    updatedAt,
    parts: [],
    inventory: [],
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

function withSyncedParts(
  current: SharedPartsDocument,
  parts: PartLine[],
  inventory: InventoryItem[],
  now: number,
): SharedPartsDocument {
  return {
    ...current,
    version: SHARED_PARTS_VERSION,
    updatedAt: now,
    parts,
    inventory: syncInventoryFromParts(parts, inventory, now),
  };
}

/** Replace parts lines and sync inventory links. Document extras and manual stock stay. */
export function replacePartsLines(
  current: SharedPartsDocument | null,
  parts: PartLine[],
  now = Date.now(),
): SharedPartsDocument {
  const base = current ?? emptySharedPartsDocument(0);
  return withSyncedParts(base, sanitizeLoadedParts(parts), base.inventory, now);
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
  return { ok: true, doc: withSyncedParts(base, merged.parts, inventory, now) };
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
