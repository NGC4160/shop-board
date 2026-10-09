import {
  createPartId,
  emptyPartLine,
  isBlankPartDraft,
  mergePartLine,
  sanitizeLoadedParts,
  type PartLine,
} from "@/lib/parts";
import {
  emptySharedPartsDocument,
  parseSharedPartsDocument,
  type SharedPartsDocument,
  type SharedPartsPayload,
} from "@/lib/parts-board";

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

export function exportSharedPartsPayload(): SharedPartsPayload {
  return { parts: snapshot.parts, updatedAt: acknowledgedUpdatedAt };
}

export function applySharedPartsSnapshot(shared: SharedPartsDocument | SharedPartsPayload) {
  const parsed = parseSharedPartsDocument(shared);
  if (!parsed) return false;
  snapshot = {
    parts: parsed.parts,
    updatedAt: parsed.updatedAt,
  };
  acknowledgedUpdatedAt = parsed.updatedAt;
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

async function pushSharedParts(): Promise<SharedPartsDocument | null> {
  if (!getWindow() || !sharedConfigured || !dirty) return null;
  try {
    const response = await fetch("/api/parts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(exportSharedPartsPayload()),
    });
    const body = (await response.json().catch(() => null)) as
      | (SharedPartsDocument & { configured?: boolean })
      | null;
    if (body?.configured === false) {
      sharedConfigured = false;
      return null;
    }
    if (!response.ok || !body) return null;
    const parsed = parseSharedPartsDocument(body);
    if (parsed) {
      snapshot = { parts: parsed.parts, updatedAt: parsed.updatedAt };
      acknowledgedUpdatedAt = parsed.updatedAt;
      dirty = false;
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
  if (!snapshot.parts.some((item) => item.id === id)) return false;
  commit(
    {
      parts: snapshot.parts.filter((item) => item.id !== id),
      updatedAt: Date.now(),
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
