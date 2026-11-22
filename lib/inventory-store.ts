import {
  mergeInventoryItem,
  sanitizeLoadedInventory,
  type InventoryItem,
} from "@/lib/inventory";
import {
  emptySharedPartsDocument,
  parseSharedPartsDocument,
  type SharedPartsDocument,
} from "@/lib/parts-board";

export type InventorySnapshot = {
  items: InventoryItem[];
  updatedAt: number | null;
};

type StoreListener = () => void;

const listeners = new Set<StoreListener>();

let snapshot: InventorySnapshot = {
  items: [],
  updatedAt: null,
};
let hydrated = false;
let sharedConfigured = true;
let sharedHydrated = false;
let sharedPushTimer: number | null = null;
let dirty = false;
let acknowledgedUpdatedAt: number | null = null;
let sharedReadyResolve: (() => void) | null = null;
const sharedReady = new Promise<void>((resolve) => {
  sharedReadyResolve = resolve;
});

function emit() {
  listeners.forEach((listener) => listener());
}

function getWindow(): (Window & typeof globalThis) | null {
  return typeof globalThis.window === "undefined" ? null : globalThis.window;
}

function markSharedReady() {
  sharedHydrated = true;
  sharedReadyResolve?.();
}

export function whenSharedInventoryReady(): Promise<void> {
  if (!getWindow()) return Promise.resolve();
  return sharedReady;
}

export function subscribeInventory(onStoreChange: StoreListener): () => void {
  listeners.add(onStoreChange);
  if (!hydrated && getWindow()) {
    hydrated = true;
    queueMicrotask(() => {
      void hydrateSharedInventory();
    });
  }
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getInventorySnapshot(): InventorySnapshot {
  return snapshot;
}

const serverSnapshot: InventorySnapshot = {
  items: [],
  updatedAt: null,
};

export function getServerInventorySnapshot(): InventorySnapshot {
  return serverSnapshot;
}

export function exportSharedInventoryPayload(): {
  inventory: InventoryItem[];
  updatedAt: number | null;
} {
  return { inventory: snapshot.items, updatedAt: acknowledgedUpdatedAt };
}

export function applySharedInventorySnapshot(
  shared: Partial<Pick<SharedPartsDocument, "parts" | "inventory" | "updatedAt">>,
) {
  const parsed = parseSharedPartsDocument({
    parts: shared.parts ?? [],
    inventory: shared.inventory ?? [],
    updatedAt: shared.updatedAt,
  });
  if (!parsed) return false;
  snapshot = {
    items: parsed.inventory,
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
    void pushSharedInventory();
  }, 350);
}

function commit(next: InventorySnapshot) {
  snapshot = next;
  dirty = true;
  scheduleSharedPush();
  emit();
}

async function pushSharedInventory(): Promise<SharedPartsDocument | null> {
  if (!getWindow() || !sharedConfigured || !dirty) return null;
  try {
    const response = await fetch("/api/inventory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        inventory: snapshot.items,
        updatedAt: acknowledgedUpdatedAt,
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | (SharedPartsDocument & { configured?: boolean })
      | null;
    if (body?.configured === false) {
      sharedConfigured = false;
      return null;
    }
    if (response.status === 409) {
      dirty = false;
      await hydrateSharedInventory();
      return null;
    }
    if (!response.ok || !body) return null;
    const parsed = parseSharedPartsDocument(body);
    if (parsed) {
      snapshot = { items: parsed.inventory, updatedAt: parsed.updatedAt };
      acknowledgedUpdatedAt = parsed.updatedAt;
      dirty = false;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function flushSharedInventoryPush(): Promise<void> {
  const win = getWindow();
  if (!win) return;
  if (sharedPushTimer != null) {
    win.clearTimeout(sharedPushTimer);
    sharedPushTimer = null;
  }
  if (dirty && sharedHydrated && sharedConfigured) await pushSharedInventory();
}

type InventoryApiResponse = SharedPartsDocument & {
  ok?: boolean;
  empty?: boolean;
  configured?: boolean;
  error?: string;
};

async function fetchSharedInventory(): Promise<InventoryApiResponse | null> {
  const response = await fetch("/api/inventory", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as InventoryApiResponse | null;
  if (!body) return null;
  return body;
}

export async function hydrateSharedInventory(): Promise<void> {
  if (!getWindow()) {
    markSharedReady();
    return;
  }
  try {
    const body = await fetchSharedInventory();
    if (!body || body.ok === false) return;
    if (body.configured === false) {
      sharedConfigured = false;
      return;
    }
    if (body.empty && !body.inventory) {
      applySharedInventorySnapshot(emptySharedPartsDocument());
      return;
    }
    applySharedInventorySnapshot(body);
  } catch {
    // Stay on the in-memory snapshot.
  } finally {
    markSharedReady();
  }
}

export async function reloadSharedInventory(): Promise<boolean> {
  if (!getWindow() || !sharedConfigured) return false;
  if (dirty) {
    await flushSharedInventoryPush();
    return true;
  }
  try {
    const body = await fetchSharedInventory();
    if (dirty) return false;
    if (!body || body.ok === false || body.configured === false) return false;
    if (body.empty && !body.inventory) {
      applySharedInventorySnapshot(emptySharedPartsDocument());
      return true;
    }
    return applySharedInventorySnapshot(body);
  } catch {
    return false;
  }
}

export function resetInventoryStoreForTests() {
  const win = getWindow();
  if (win && sharedPushTimer != null) win.clearTimeout(sharedPushTimer);
  sharedPushTimer = null;
  snapshot = { items: [], updatedAt: null };
  acknowledgedUpdatedAt = null;
  dirty = false;
  sharedConfigured = true;
  sharedHydrated = false;
  hydrated = false;
}

export function replaceInventory(items: InventoryItem[]) {
  commit({
    items: sanitizeLoadedInventory(items),
    updatedAt: Date.now(),
  });
}

export function updateInventoryItem(id: string, patch: Partial<InventoryItem>): boolean {
  const current = snapshot.items.find((item) => item.id === id);
  if (!current || current.deletedAt != null) return false;
  const next = mergeInventoryItem(current, patch);
  commit({
    items: snapshot.items.map((item) => (item.id === id ? next : item)),
    updatedAt: next.updatedAt,
  });
  return true;
}
