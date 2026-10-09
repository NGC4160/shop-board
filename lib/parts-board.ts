import { sanitizeLoadedParts, type PartLine } from "@/lib/parts";

export const SHARED_PARTS_VERSION = 1;

export type SharedPartsDocument = {
  version: typeof SHARED_PARTS_VERSION;
  updatedAt: number;
  parts: PartLine[];
};

export type SharedPartsPayload = {
  parts: PartLine[];
  /** Last server `updatedAt` this client applied. Used to merge a stale PUT. */
  updatedAt?: number | null;
};

/**
 * Accept a stored document or a PUT body. Returns null when the payload is
 * not an object. An empty parts list is valid (empty board).
 * Ignores any `jobs` field so a parts write cannot be treated as a job card.
 */
export function parseSharedPartsDocument(value: unknown): SharedPartsDocument | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const parts = Array.isArray(record.parts) ? sanitizeLoadedParts(record.parts) : [];
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : Date.now();
  return {
    version: SHARED_PARTS_VERSION,
    updatedAt,
    parts,
  };
}

export function toSharedPartsDocument(
  payload: SharedPartsPayload,
  updatedAt = Date.now(),
): SharedPartsDocument {
  return {
    version: SHARED_PARTS_VERSION,
    updatedAt,
    parts: sanitizeLoadedParts(payload.parts),
  };
}

export function emptySharedPartsDocument(updatedAt = Date.now()): SharedPartsDocument {
  return {
    version: SHARED_PARTS_VERSION,
    updatedAt,
    parts: [],
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

/**
 * Merge a shop-floor snapshot write into the stored document.
 *
 * - Same id: newer `line.updatedAt` wins; a tie keeps the incoming save.
 * - Incoming-only: client added the line.
 * - Server-only: keep if the line is newer than the client's last-seen
 *   document time (added after that page loaded). Otherwise the client
 *   deleted a line it already knew about.
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
      parts.push(line);
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

/** Apply a PUT body to the stored document. Never drops newer server-only lines. */
export function applyIncomingPartsPut(
  current: SharedPartsDocument | null,
  body: unknown,
  now = Date.now(),
): { ok: true; doc: SharedPartsDocument } | { ok: false; error: string } {
  const parsed = parseSharedPartsDocument(body);
  if (!parsed) return { ok: false, error: "Parts payload was not an object" };
  const basedOn = readPartsWriteBaseUpdatedAt(body);
  const base = current ?? emptySharedPartsDocument(0);
  const merged = mergeSharedPartsDocuments(base, parsed, basedOn);
  return { ok: true, doc: toSharedPartsDocument(merged, now) };
}
