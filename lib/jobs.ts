export const STORAGE_KEY = "ngc-shop-board-v1";

export const SUGGESTED_STATUSES = [
  "Waiting for drop-off",
  "In bay",
  "Waiting on parts",
  "Waiting on deposit",
  "Ready for pickup",
  "Done",
] as const;

export type SuggestedStatus = (typeof SUGGESTED_STATUSES)[number];

export type CartJob = {
  id: string;
  customerName: string;
  jobNumber: string;
  status: string;
  nextAction: string;
  timeExpectation: string;
  createdAt: number;
  updatedAt: number;
};

export type CartJobDraft = {
  customerName: string;
  jobNumber: string;
  status: string;
  nextAction: string;
  timeExpectation: string;
};

export const emptyDraft: CartJobDraft = {
  customerName: "",
  jobNumber: "",
  status: "Waiting for drop-off",
  nextAction: "",
  timeExpectation: "",
};

export const seedJobs: CartJob[] = [
  {
    id: "seed-1842",
    customerName: "Mike Landry",
    jobNumber: "1842",
    status: "In bay",
    nextAction: "Replace solenoid and test drive",
    timeExpectation: "Due today 4:00 PM",
    createdAt: 1,
    updatedAt: 5,
  },
  {
    id: "seed-1847",
    customerName: "Sharon Badeaux",
    jobNumber: "1847",
    status: "Waiting on parts",
    nextAction: "Call when controller comes in",
    timeExpectation: "Parts ETA Wednesday",
    createdAt: 2,
    updatedAt: 4,
  },
  {
    id: "seed-1851",
    customerName: "Trey Fontenot",
    jobNumber: "1851",
    status: "Waiting for drop-off",
    nextAction: "Confirm drop-off time",
    timeExpectation: "Promised Friday morning",
    createdAt: 3,
    updatedAt: 3,
  },
  {
    id: "seed-1839",
    customerName: "The Landing HOA",
    jobNumber: "1839",
    status: "Ready for pickup",
    nextAction: "Call customer — cart is ready",
    timeExpectation: "Ready now",
    createdAt: 4,
    updatedAt: 6,
  },
  {
    id: "seed-1855",
    customerName: 'James "Coach" Williams',
    jobNumber: "1855",
    status: "Waiting on deposit",
    nextAction: "Text Housecall Pro invoice",
    timeExpectation: "Hold until paid",
    createdAt: 5,
    updatedAt: 2,
  },
];

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function draftToJob(draft: CartJobDraft, existing?: CartJob): CartJob {
  const now = Date.now();
  return {
    id: existing?.id ?? createId(),
    customerName: draft.customerName.trim(),
    jobNumber: draft.jobNumber.trim(),
    status: draft.status.trim() || "Waiting for drop-off",
    nextAction: draft.nextAction.trim(),
    timeExpectation: draft.timeExpectation.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function jobToDraft(job: CartJob): CartJobDraft {
  return {
    customerName: job.customerName,
    jobNumber: job.jobNumber,
    status: job.status,
    nextAction: job.nextAction,
    timeExpectation: job.timeExpectation,
  };
}

export function sortJobs(jobs: CartJob[]): CartJob[] {
  return [...jobs].sort((a, b) => {
    const aDone = a.status.toLowerCase() === "done" ? 1 : 0;
    const bDone = b.status.toLowerCase() === "done" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return b.updatedAt - a.updatedAt;
  });
}

type StoreListener = () => void;

const listeners = new Set<StoreListener>();
let storeJobs: CartJob[] = seedJobs;
let storeHydrated = false;

function readJobsFromStorage(): CartJob[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedJobs));
      return seedJobs;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return seedJobs;
    const jobs = parsed.filter(isCartJob);
    return jobs.length > 0 ? jobs : seedJobs;
  } catch {
    return seedJobs;
  }
}

export function subscribeJobs(onStoreChange: StoreListener): () => void {
  listeners.add(onStoreChange);
  if (!storeHydrated && typeof window !== "undefined") {
    storeHydrated = true;
    const next = readJobsFromStorage();
    queueMicrotask(() => {
      storeJobs = next;
      listeners.forEach((listener) => listener());
    });
  }
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getJobsSnapshot(): CartJob[] {
  return storeJobs;
}

export function getServerJobsSnapshot(): CartJob[] {
  return seedJobs;
}

export function saveJobs(jobs: CartJob[]): void {
  storeJobs = jobs;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }
  listeners.forEach((listener) => listener());
}

export function statusTone(status: string): "bay" | "parts" | "deposit" | "ready" | "done" | "wait" | "custom" {
  switch (status) {
    case "In bay":
      return "bay";
    case "Waiting on parts":
      return "parts";
    case "Waiting on deposit":
      return "deposit";
    case "Ready for pickup":
      return "ready";
    case "Done":
      return "done";
    case "Waiting for drop-off":
      return "wait";
    default:
      return "custom";
  }
}

function isCartJob(value: unknown): value is CartJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Record<string, unknown>;
  return (
    typeof job.id === "string" &&
    typeof job.customerName === "string" &&
    typeof job.jobNumber === "string" &&
    typeof job.status === "string" &&
    typeof job.nextAction === "string" &&
    typeof job.timeExpectation === "string"
  );
}
