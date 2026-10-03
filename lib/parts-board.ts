import { sanitizeLoadedParts, type PartLine } from "@/lib/parts";

export const SHARED_PARTS_VERSION = 1;

export type SharedPartsDocument = {
  version: typeof SHARED_PARTS_VERSION;
  updatedAt: number;
  parts: PartLine[];
};

export type SharedPartsPayload = {
  parts: PartLine[];
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
