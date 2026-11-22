import {
  normalizeJobNumber,
  normalizeTimeframe,
  sanitizeLoadedJobs,
  type CartJob,
} from "@/lib/jobs";
import { isStaleRevision, readStoredRevision, STALE_REVISION_ERROR } from "@/lib/revision";

export const SHARED_BOARD_VERSION = 1;
export const SHARED_MIGRATED_KEY = "ngc-shop-board-shared-migrated-v1";

export type SharedBoardPrefs = {
  hideClosed: boolean;
  /** Board-level Date started filter (`YYYY-MM-DD`). Empty shows every job. */
  timeframe: string;
};

export type SharedBoardDocument = {
  version: typeof SHARED_BOARD_VERSION;
  /** Monotonic per-document revision. Not the schema `version`. Legacy blobs are 0. */
  revision: number;
  updatedAt: number;
  jobs: CartJob[];
  prefs: SharedBoardPrefs;
  dismissedJobNumbers: string[];
};

export type SharedBoardPayload = {
  jobs: CartJob[];
  prefs: SharedBoardPrefs;
  dismissedJobNumbers: string[];
};

export const defaultSharedPrefs: SharedBoardPrefs = {
  hideClosed: true,
  timeframe: "",
};

export function readDismissedJobNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeJobNumber(item))
        .filter(Boolean),
    ),
  ];
}

export function parseSharedPrefs(value: unknown): SharedBoardPrefs {
  if (!value || typeof value !== "object") return { ...defaultSharedPrefs };
  const record = value as Record<string, unknown>;
  return {
    hideClosed: typeof record.hideClosed === "boolean" ? record.hideClosed : true,
    timeframe: normalizeTimeframe(typeof record.timeframe === "string" ? record.timeframe : ""),
  };
}

/**
 * Accept a stored document or a PUT body. Returns null when the payload is
 * not an object. An empty jobs list is valid (someone cleared the board).
 */
export function parseSharedBoardDocument(value: unknown): SharedBoardDocument | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const jobs = Array.isArray(record.jobs) ? sanitizeLoadedJobs(record.jobs) : [];
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : Date.now();
  return {
    version: SHARED_BOARD_VERSION,
    revision: readStoredRevision(record),
    updatedAt,
    jobs,
    prefs: parseSharedPrefs(record.prefs),
    dismissedJobNumbers: readDismissedJobNumbers(record.dismissedJobNumbers),
  };
}

export function toSharedBoardDocument(
  payload: SharedBoardPayload,
  updatedAt = Date.now(),
  revision = 0,
): SharedBoardDocument {
  return {
    version: SHARED_BOARD_VERSION,
    revision,
    updatedAt,
    jobs: payload.jobs,
    prefs: {
      hideClosed: payload.prefs.hideClosed,
      timeframe: normalizeTimeframe(payload.prefs.timeframe),
    },
    dismissedJobNumbers: readDismissedJobNumbers(payload.dismissedJobNumbers),
  };
}

export function emptySharedBoardDocument(updatedAt = 0): SharedBoardDocument {
  return toSharedBoardDocument(
    {
      jobs: [],
      prefs: { ...defaultSharedPrefs },
      dismissedJobNumbers: [],
    },
    updatedAt,
    0,
  );
}

/**
 * Apply a PUT that already passed schema validation.
 * `baseRevision` must equal the stored revision (0 when the blob has no revision yet).
 */
export function applyIncomingBoardPut(
  current: SharedBoardDocument | null,
  payload: SharedBoardPayload,
  baseRevision: number,
  now = Date.now(),
):
  | { ok: true; doc: SharedBoardDocument }
  | { ok: false; conflict: true; error: string; current: SharedBoardDocument | null } {
  const currentRevision = current?.revision ?? 0;
  if (isStaleRevision(currentRevision, baseRevision)) {
    return { ok: false, conflict: true, error: STALE_REVISION_ERROR, current };
  }
  return {
    ok: true,
    doc: toSharedBoardDocument(payload, now, currentRevision + 1),
  };
}

/** True only when this browser already had a board key before this session. */
export function shouldMigrateLocalSnapshot(storageExisted: boolean): boolean {
  return storageExisted;
}
