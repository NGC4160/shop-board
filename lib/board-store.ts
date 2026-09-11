import {
  LEGACY_JOBS_KEY,
  STORAGE_KEY,
  appendHistory,
  createId,
  draftToJob,
  emptyDraft,
  customerNameError,
  hasDuplicateJobNumber,
  sanitizeLoadedJobs,
  jobNumberError,
  nextPipelineStatus,
  normalizeJobNumber,
  seedJobs,
  normalizeTimeframe,
  timeExpectationError,
  type CartJob,
  type Priority,
} from "@/lib/jobs";
import { mergeHcpJobs } from "@/lib/hcp-merge";
import type { HcpOpenJob } from "@/lib/hcp";

export type BoardPrefs = {
  hideClosed: boolean;
};

export type BoardSnapshot = {
  jobs: CartJob[];
  prefs: BoardPrefs;
  lastHcpSyncAt: number | null;
  /** Normalized job numbers removed on this device. HCP sync will not re-add them. */
  dismissedJobNumbers: string[];
};

const defaultPrefs: BoardPrefs = {
  hideClosed: true,
};

type StoreListener = () => void;

const listeners = new Set<StoreListener>();
function emptyDismissed(): string[] {
  return [];
}

function readDismissed(value: unknown): string[] {
  if (!Array.isArray(value)) return emptyDismissed();
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeJobNumber(item))
        .filter(Boolean),
    ),
  ];
}

let snapshot: BoardSnapshot = {
  jobs: seedJobs,
  prefs: defaultPrefs,
  lastHcpSyncAt: null,
  dismissedJobNumbers: emptyDismissed(),
};
let hydrated = false;
type UndoSnapshot = {
  jobs: CartJob[];
  dismissedJobNumbers: string[];
};
let undoStack: UndoSnapshot | null = null;

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
    const jobs = sanitizeLoadedJobs(parsed);
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
        const jobs = Array.isArray(record.jobs) ? sanitizeLoadedJobs(record.jobs) : [];
        return {
          jobs: jobs.length > 0 ? jobs : seedJobs,
          prefs: {
            hideClosed:
              typeof record.prefs === "object" &&
              record.prefs !== null &&
              typeof (record.prefs as BoardPrefs).hideClosed === "boolean"
                ? (record.prefs as BoardPrefs).hideClosed
                : true,
          },
          lastHcpSyncAt:
            typeof record.lastHcpSyncAt === "number" ? record.lastHcpSyncAt : null,
          dismissedJobNumbers: readDismissed(record.dismissedJobNumbers),
        };
      }
    }
    const legacyJobs = parseLegacyJobs(window.localStorage.getItem(LEGACY_JOBS_KEY));
    const next: BoardSnapshot = {
      jobs: legacyJobs ?? seedJobs,
      prefs: defaultPrefs,
      lastHcpSyncAt: null,
      dismissedJobNumbers: emptyDismissed(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return {
      jobs: seedJobs,
      prefs: defaultPrefs,
      lastHcpSyncAt: null,
      dismissedJobNumbers: emptyDismissed(),
    };
  }
}

export function subscribeBoard(onStoreChange: StoreListener): () => void {
  listeners.add(onStoreChange);
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    const next = readFromStorage();
    queueMicrotask(() => {
      snapshot = next;
      persist();
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

const serverSnapshot: BoardSnapshot = {
  jobs: seedJobs,
  prefs: defaultPrefs,
  lastHcpSyncAt: null,
  dismissedJobNumbers: emptyDismissed(),
};

export function getServerBoardSnapshot(): BoardSnapshot {
  return serverSnapshot;
}

function commit(next: BoardSnapshot, remember = false) {
  if (remember) {
    undoStack = {
      jobs: snapshot.jobs,
      dismissedJobNumbers: snapshot.dismissedJobNumbers,
    };
  }
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
  if (nextPatch.customerName !== undefined) {
    if (customerNameError(nextPatch.customerName)) return false;
    nextPatch.customerName = nextPatch.customerName.trim();
  }
  if (nextPatch.jobNumber !== undefined) {
    if (jobNumberError(nextPatch.jobNumber)) return false;
    if (hasDuplicateJobNumber(jobs, id, nextPatch.jobNumber)) return false;
    nextPatch.jobNumber = normalizeJobNumber(nextPatch.jobNumber);
  }
  if (nextPatch.timeExpectation !== undefined) {
    nextPatch.timeExpectation = normalizeTimeframe(nextPatch.timeExpectation);
    if (timeExpectationError(nextPatch.timeExpectation)) return false;
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

export function createDraftJob(): CartJob {
  return {
    ...draftToJob(emptyDraft),
    id: createId(),
    customerName: "",
    jobNumber: "",
  };
}

export function insertJob(job: CartJob): boolean {
  if (customerNameError(job.customerName)) return false;
  if (jobNumberError(job.jobNumber)) return false;
  if (hasDuplicateJobNumber(snapshot.jobs, job.id, job.jobNumber)) return false;
  const next: CartJob = {
    ...job,
    customerName: job.customerName.trim(),
    jobNumber: normalizeJobNumber(job.jobNumber),
  };
  const key = next.jobNumber;
  commit({
    ...snapshot,
    jobs: [next, ...snapshot.jobs.filter((item) => item.id !== job.id)],
    dismissedJobNumbers: snapshot.dismissedJobNumbers.filter((item) => item !== key),
  });
  return true;
}

export function deleteJob(id: string): boolean {
  const current = snapshot.jobs.find((job) => job.id === id);
  if (!current) return false;
  const key = normalizeJobNumber(current.jobNumber);
  const dismissed = key
    ? [...new Set([...snapshot.dismissedJobNumbers, key])]
    : snapshot.dismissedJobNumbers;
  commit(
    {
      ...snapshot,
      jobs: snapshot.jobs.filter((job) => job.id !== id),
      dismissedJobNumbers: dismissed,
    },
    true,
  );
  return true;
}

export function undoDelete(): boolean {
  if (!undoStack) return false;
  const restore = undoStack;
  undoStack = null;
  commit(
    {
      ...snapshot,
      jobs: restore.jobs,
      dismissedJobNumbers: restore.dismissedJobNumbers,
    },
    false,
  );
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
  commit(
    {
      ...snapshot,
      jobs: jobs.length > 0 ? jobs : seedJobs,
      dismissedJobNumbers: emptyDismissed(),
    },
    true,
  );
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
    const jobs = sanitizeLoadedJobs(list);
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
  const dismissed = new Set(snapshot.dismissedJobNumbers);
  const allowed = incoming.filter((job) => {
    const key = normalizeJobNumber(job.jobNumber);
    return !key || !dismissed.has(key);
  });
  const { jobs, added, updated } = mergeHcpJobs(snapshot.jobs, allowed);
  commit(
    {
      ...snapshot,
      jobs,
      lastHcpSyncAt: Date.now(),
    },
    false,
  );
  return { added, updated };
}
