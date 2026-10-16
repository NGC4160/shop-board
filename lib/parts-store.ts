import {
  createPartId,
  emptyPartLine,
  isBlankPartDraft,
  mergePartLine,
  sanitizeLoadedParts,
  type PartLine,
} from "@/lib/parts";
import { stableStringify, threeWayMergeById } from "@/lib/document-merge";
import {
  emptySharedPartsDocument,
  parseSharedPartsDocument,
  type SharedPartsDocument,
  type SharedPartsPayload,
} from "@/lib/parts-board";
import {
  PARTS_GAVE_UP_MESSAGE,
  PARTS_MERGED_MESSAGE,
  PARTS_REFRESHED_MESSAGE,
  notifyWriteConflict,
} from "@/lib/write-conflict";

export type PartsSnapshot = {
  parts: PartLine[];
  updatedAt: number | null;
};

type StoreListener = () => void;

const listeners = new Set<StoreListener>();

let snapshot: PartsSnapshot = {
  parts: [],
  updatedAt: null,
};
let hydrated = false;
let sharedConfigured = true;
let sharedHydrated = false;
let sharedPushTimer: number | null = null;
/** Local edits that still need a PUT. Idle refresh must not write. */
let dirty = false;
/** Last server document `updatedAt` this page applied. Sent on PUT for merge. */
let acknowledgedUpdatedAt: number | null = null;
/** Last server document revision this page applied. Sent as If-Match / baseRevision. */
let acknowledgedRevision = 0;
/** Parts array at that revision, used to merge a 409 instead of writing over it. */
let baseParts: PartLine[] = [];
let sharedReadyResolve: (() => void) | null = null;
const sharedReady = new Promise<void>((resolve) => {
  sharedReadyResolve = resolve;
});
type UndoSnapshot = { parts: PartLine[] };
let undoStack: UndoSnapshot | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

/** Browser `window`, including Node tests that assign `globalThis.window`. */
function getWindow(): (Window & typeof globalThis) | null {
  return typeof globalThis.window === "undefined" ? null : globalThis.window;
}

function markSharedReady() {
  sharedHydrated = true;
  sharedReadyResolve?.();
}

export function whenSharedPartsReady(): Promise<void> {
  if (!getWindow()) return Promise.resolve();
  return sharedReady;
}

export function subscribeParts(onStoreChange: StoreListener): () => void {
  listeners.add(onStoreChange);
  if (!hydrated && getWindow()) {
    hydrated = true;
    queueMicrotask(() => {
      void hydrateSharedParts();
    });
  }
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getPartsSnapshot(): PartsSnapshot {
  return snapshot;
}

const serverSnapshot: PartsSnapshot = {
  parts: [],
  updatedAt: null,
};

export function getServerPartsSnapshot(): PartsSnapshot {
  return serverSnapshot;
}

export function exportSharedPartsPayload(): SharedPartsPayload & { baseRevision: number } {
  return {
    parts: snapshot.parts,
    updatedAt: acknowledgedUpdatedAt,
    baseRevision: acknowledgedRevision,
  };
}

function rememberServerParts(parts: PartLine[], revision: number, updatedAt: number) {
  baseParts = parts;
  acknowledgedRevision = revision;
  acknowledgedUpdatedAt = updatedAt;
}

export function applySharedPartsSnapshot(shared: SharedPartsDocument | SharedPartsPayload) {
  const parsed = parseSharedPartsDocument(shared);
  if (!parsed) return false;
  snapshot = {
    parts: parsed.parts,
    updatedAt: parsed.updatedAt,
  };
  rememberServerParts(parsed.parts, parsed.revision, parsed.updatedAt);
  dirty = false;
  emit();
  return true;
}

function scheduleSharedPush() {
  const win = getWindow();
  if (!win || !sharedHydrated || !sharedConfigured) return;
  dirty = true;
  if (sharedPushTimer != null) win.clearTimeout(sharedPushTimer);
  sharedPushTimer = win.setTimeout(() => {
    sharedPushTimer = null;
    void pushSharedParts();
  }, 350);
}

function commit(next: PartsSnapshot, remember = false) {
  if (remember) {
    undoStack = { parts: snapshot.parts };
  }
  snapshot = next;
  dirty = true;
  scheduleSharedPush();
  emit();
}

async function pushSharedParts(attempt = 0): Promise<SharedPartsDocument | null> {
  if (!getWindow() || !sharedConfigured || !dirty) return null;
  const baseRevision = acknowledgedRevision;
  const localParts = snapshot.parts;
  const base = baseParts;
  try {
    const response = await fetch("/api/parts", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": String(baseRevision),
      },
      cache: "no-store",
      body: JSON.stringify(exportSharedPartsPayload()),
    });
    const body = (await response.json().catch(() => null)) as
      | (SharedPartsDocument & { configured?: boolean; error?: string; conflict?: boolean })
      | null;
    if (body?.configured === false) {
      sharedConfigured = false;
      return null;
    }
    if (response.status === 409 && body) {
      const server = parseSharedPartsDocument(body);
      if (!server) {
        notifyWriteConflict({ board: "parts", message: PARTS_GAVE_UP_MESSAGE });
        return null;
      }
      const merged = threeWayMergeById(base, localParts, server.parts);
      const changed = stableStringify(merged.items) !== stableStringify(server.parts);
      rememberServerParts(server.parts, server.revision, server.updatedAt);
      snapshot = {
        parts: changed ? merged.items : server.parts,
        updatedAt: server.updatedAt,
      };
      emit();
      if (!changed) {
        dirty = false;
        notifyWriteConflict({ board: "parts", message: PARTS_REFRESHED_MESSAGE });
        return server;
      }
      dirty = true;
      if (attempt >= 1) {
        notifyWriteConflict({ board: "parts", message: PARTS_GAVE_UP_MESSAGE });
        return server;
      }
      notifyWriteConflict({ board: "parts", message: PARTS_MERGED_MESSAGE });
      return pushSharedParts(attempt + 1);
    }
    if (!response.ok || !body) {
      if (body?.error) notifyWriteConflict({ board: "parts", message: body.error });
      return null;
    }
    const parsed = parseSharedPartsDocument(body);
    if (parsed) {
      snapshot = { parts: parsed.parts, updatedAt: parsed.updatedAt };
      rememberServerParts(parsed.parts, parsed.revision, parsed.updatedAt);
      dirty = false;
      emit();
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function flushSharedPartsPush(): Promise<void> {
  const win = getWindow();
  if (!win) return;
  if (sharedPushTimer != null) {
    win.clearTimeout(sharedPushTimer);
    sharedPushTimer = null;
  }
  if (dirty && sharedHydrated && sharedConfigured) await pushSharedParts();
}

type PartsApiResponse = SharedPartsDocument & {
  ok?: boolean;
  empty?: boolean;
  configured?: boolean;
  error?: string;
};

async function fetchSharedParts(): Promise<PartsApiResponse | null> {
  const response = await fetch("/api/parts", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as PartsApiResponse | null;
  if (!body) return null;
  return body;
}

export async function hydrateSharedParts(): Promise<void> {
  if (!getWindow()) {
    markSharedReady();
    return;
  }
  try {
    const body = await fetchSharedParts();
    if (!body || body.ok === false) return;
    if (body.configured === false) {
      sharedConfigured = false;
      return;
    }
    if (body.empty) {
      applySharedPartsSnapshot(emptySharedPartsDocument());
      return;
    }
    applySharedPartsSnapshot(body);
  } catch {
    // Stay on the in-memory snapshot. localStorage is not the source of truth.
  } finally {
    markSharedReady();
  }
}

export async function reloadSharedParts(): Promise<boolean> {
  if (!getWindow() || !sharedConfigured) return false;
  if (dirty) {
    await flushSharedPartsPush();
    return true;
  }
  try {
    const body = await fetchSharedParts();
    if (dirty) return false;
    if (!body || body.ok === false || body.configured === false) return false;
    if (body.empty) {
      applySharedPartsSnapshot(emptySharedPartsDocument());
      return true;
    }
    return applySharedPartsSnapshot(body);
  } catch {
    return false;
  }
}

/** Test helper: wipe in-memory board state between cases. */
export function resetPartsStoreForTests() {
  const win = getWindow();
  if (win && sharedPushTimer != null) {
    win.clearTimeout(sharedPushTimer);
  }
  sharedPushTimer = null;
  snapshot = { parts: [], updatedAt: null };
  acknowledgedUpdatedAt = null;
  acknowledgedRevision = 0;
  baseParts = [];
  dirty = false;
  sharedConfigured = true;
  sharedHydrated = false;
  hydrated = false;
  undoStack = null;
}

export function replaceParts(parts: PartLine[], remember = false) {
  commit(
    {
      parts: sanitizeLoadedParts(parts),
      updatedAt: Date.now(),
    },
    remember,
  );
}

export function insertPart(part: PartLine): boolean {
  if (!part.customerName.trim() || !part.partDescription.trim()) return false;
  const next = mergePartLine(null, { ...part, id: part.id || createPartId() });
  commit({
    parts: [next, ...snapshot.parts.filter((item) => item.id !== next.id)],
    updatedAt: next.updatedAt,
  });
  return true;
}

export function updatePart(id: string, patch: Partial<PartLine>): boolean {
  const current = snapshot.parts.find((item) => item.id === id);
  if (!current) return false;
  const next = mergePartLine(current, patch);
  commit({
    parts: snapshot.parts.map((item) => (item.id === id ? next : item)),
    updatedAt: next.updatedAt,
  });
  return true;
}

export function deletePart(id: string): boolean {
  const current = snapshot.parts.find((item) => item.id === id);
  if (!current || current.deletedAt) return false;
  const now = Date.now();
  commit(
    {
      parts: snapshot.parts.map((item) =>
        item.id === id ? { ...item, deletedAt: now, updatedAt: now } : item,
      ),
      updatedAt: now,
    },
    true,
  );
  return true;
}

export function undoDeletePart(): boolean {
  if (!undoStack) return false;
  const restore = undoStack;
  undoStack = null;
  commit({ parts: restore.parts, updatedAt: Date.now() }, false);
  return true;
}

export function createDraftPart(): PartLine {
  return emptyPartLine(createPartId());
}

export function isDraftAbandoned(part: PartLine): boolean {
  return isBlankPartDraft(part);
}
