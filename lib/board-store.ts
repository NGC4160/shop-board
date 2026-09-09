import {
  LEGACY_JOBS_KEY,
  STORAGE_KEY,
  appendHistory,
  createId,
  draftToJob,
  emptyDraft,
  hasDuplicateJobNumber,
  isValidJobNumber,
  nextPipelineStatus,
  normalizeJobNumber,
  seedJobs,
  timeExpectationError,
  upgradeJob,
  type CartJob,
  type Priority,
} from "@/lib/jobs";
import { mergeHcpJobs } from "@/lib/hcp-merge";
import type { HcpOpenJob } from "@/lib/hcp";

export type BoardView = "floor" | "queue";

export type BoardPrefs = {
  hideClosed: boolean;
  view: BoardView;
};

export type BoardSnapshot = {
  jobs: CartJob[];
  prefs: BoardPrefs;
  lastHcpSyncAt: number | null;
};

const defaultPrefs: BoardPrefs = {
  hideClosed: true,
  view: "floor",
};

type StoreListener = () => void;

const listeners = new Set<StoreListener>();
let snapshot: BoardSnapshot = {
  jobs: seedJobs,
  prefs: defaultPrefs,
  lastHcpSyncAt: null,
};
let hydrated = false;
let undoStack: CartJob[] | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function parseLegacyJobs(raw: string | null): CartJob[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const jobs = parsed.map(upgradeJob).filter((job): job is CartJob => job !== null);
    return jobs.length > 0 ? jobs : null;
  } catch {
    return null;
  }
}

function readFromStorage(): BoardSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const jobs = Array.isArray(record.jobs)
          ? record.jobs.map(upgradeJob).filter((job): job is CartJob => job !== null)
          : [];
        return {
          jobs: jobs.length > 0 ? jobs : seedJobs,
          prefs: {
            hideClosed:
              typeof record.prefs === "object" &&
              record.prefs !== null &&
              typeof (record.prefs as BoardPrefs).hideClosed === "boolean"
                ? (record.prefs as BoardPrefs).hideClosed
                : true,
            view:
              typeof record.prefs === "object" &&
              record.prefs !== null &&
              ((record.prefs as BoardPrefs).view === "queue" ||
                (record.prefs as BoardPrefs).view === "floor")
                ? (record.prefs as BoardPrefs).view
                : "floor",
          },
          lastHcpSyncAt:
            typeof record.lastHcpSyncAt === "number" ? record.lastHcpSyncAt : null,
        };
      }
    }
    const legacyJobs = parseLegacyJobs(window.localStorage.getItem(LEGACY_JOBS_KEY));
    const next: BoardSnapshot = {
      jobs: legacyJobs ?? seedJobs,
      prefs: defaultPrefs,
      lastHcpSyncAt: null,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return { jobs: seedJobs, prefs: defaultPrefs, lastHcpSyncAt: null };
  }
}

export function subscribeBoard(onStoreChange: StoreListener): () => void {
  listeners.add(onStoreChange);
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    const next = readFromStorage();
    queueMicrotask(() => {
      snapshot = next;
      emit();
    });
  }
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getBoardSnapshot(): BoardSnapshot {
  return snapshot;
}

export function getServerBoardSnapshot(): BoardSnapshot {
  return { jobs: seedJobs, prefs: defaultPrefs, lastHcpSyncAt: null };
}

function commit(next: BoardSnapshot, remember = false) {
  if (remember) undoStack = snapshot.jobs;
  snapshot = next;
  persist();
  emit();
}

export function saveJobs(jobs: CartJob[], remember = true) {
  commit({ ...snapshot, jobs }, remember);
}

export function savePrefs(prefs: Partial<BoardPrefs>) {
  commit({ ...snapshot, prefs: { ...snapshot.prefs, ...prefs } }, false);
}

export function updateJob(id: string, patch: Partial<CartJob>): boolean {
  const jobs = snapshot.jobs;
  const current = jobs.find((job) => job.id === id);
  if (!current) return false;

  const nextPatch = { ...patch };
  if (nextPatch.jobNumber !== undefined) {
    if (!isValidJobNumber(nextPatch.jobNumber)) return false;
    if (hasDuplicateJobNumber(jobs, id, nextPatch.jobNumber)) return false;
    nextPatch.jobNumber = normalizeJobNumber(nextPatch.jobNumber);
  }
  if (
    nextPatch.timeExpectation !== undefined &&
    timeExpectationError(nextPatch.timeExpectation)
  ) {
    return false;
  }

  const now = Date.now();
  let history = current.history;
  let statusChangedAt = current.statusChangedAt;
  if (nextPatch.status !== undefined && nextPatch.status !== current.status) {
    statusChangedAt = now;
    history = appendHistory(
      current,
      "status",
      `${current.status || "—"} → ${nextPatch.status || "—"}`,
    );
  } else if (
    nextPatch.primaryTech !== undefined &&
    nextPatch.primaryTech !== current.primaryTech
  ) {
    history = appendHistory(
      current,
      "tech",
      nextPatch.primaryTech
        ? `Assigned ${nextPatch.primaryTech}`
        : "Unassigned",
    );
  } else if (nextPatch.notes !== undefined && nextPatch.notes !== current.notes) {
    history = appendHistory(current, "note", "Notes updated");
  } else if (nextPatch.priority !== undefined && nextPatch.priority !== current.priority) {
    history = appendHistory(
      current,
      "edit",
      nextPatch.priority === "none"
        ? "Cleared flag"
        : `Flagged ${nextPatch.priority}`,
    );
  }

  saveJobs(
    jobs.map((job) =>
      job.id === id
        ? {
            ...job,
            ...nextPatch,
            history,
            statusChangedAt,
            updatedAt: now,
          }
        : job,
    ),
  );
  return true;
}

export function addRow(): string {
  const id = createId();
  const job = {
    ...draftToJob(emptyDraft),
    id,
    customerName: "",
    jobNumber: "",
  };
  saveJobs([job, ...snapshot.jobs]);
  return id;
}

export function deleteJob(id: string) {
  saveJobs(snapshot.jobs.filter((job) => job.id !== id));
}

export function undoDelete(): boolean {
  if (!undoStack) return false;
  saveJobs(undoStack, false);
  undoStack = null;
  return true;
}

export function advanceJob(id: string): string | null {
  const job = snapshot.jobs.find((item) => item.id === id);
  if (!job) return null;
  const next = nextPipelineStatus(job.status);
  if (!next) return null;
  updateJob(id, { status: next });
  return next;
}

export function replaceBoard(jobs: CartJob[]) {
  saveJobs(jobs.length > 0 ? jobs : seedJobs, true);
}

export function loadSampleBoard() {
  saveJobs(seedJobs.map((job) => ({ ...job, history: [...job.history] })));
}

export function exportBoardJson(): string {
  return JSON.stringify(
    {
      version: 6,
      exportedAt: new Date().toISOString(),
      jobs: snapshot.jobs,
    },
    null,
    2,
  );
}

export function importBoardJson(raw: string): { ok: true; count: number } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { jobs?: unknown }).jobs)
        ? (parsed as { jobs: unknown[] }).jobs
        : null;
    if (!list) return { ok: false, error: "File does not look like a shop board export" };
    const jobs = list.map(upgradeJob).filter((job): job is CartJob => job !== null);
    if (jobs.length === 0) return { ok: false, error: "No carts found in that file" };
    replaceBoard(jobs);
    return { ok: true, count: jobs.length };
  } catch {
    return { ok: false, error: "Could not read that file" };
  }
}

export function setPriority(id: string, priority: Priority) {
  updateJob(id, { priority });
}

export function applyHcpJobs(incoming: HcpOpenJob[]): { added: number; updated: number } {
  const { jobs, added, updated } = mergeHcpJobs(snapshot.jobs, incoming);
  commit(
    {
      ...snapshot,
      jobs,
      lastHcpSyncAt: Date.now(),
    },
    true,
  );
  return { added, updated };
}
