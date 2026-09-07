export const STORAGE_KEY = "ngc-shop-board-v3";

/** Live NGC Housecall Pro Jobs pipeline (Pipeline → Jobs), left to right. */
export const PIPELINE_STATUSES = [
  "New Job",
  "Customer drop off",
  "Pictures Needed",
  "Deposit Needed",
  "RYAN",
  "Need to Order Materials",
  "Waiting on Materials",
  "Unscheduled",
  "Scheduled",
  "Return Call Needed",
  "In Progress",
  "Awaiting Queue",
  "Shop Queue",
  "JESSE- estimate ready to call",
  "Awaiting Estimate",
  "Awaiting Approval",
  "Awaiting Deposit",
  "Awaiting QC",
  "Completed",
  "Awaiting Payment",
  "Awaiting Return Delivery",
  "Customer pick up",
  "Need to Invoice",
  "Invoice Sent",
  "On Hold",
  "Invoice Paid",
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

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
  status: "New Job",
  nextAction: "",
  timeExpectation: "",
};

export const seedJobs: CartJob[] = [
  {
    id: "seed-1842",
    customerName: "Mike Landry",
    jobNumber: "1842",
    status: "In Progress",
    nextAction: "Replace solenoid and test drive",
    timeExpectation: "Due today 4:00 PM",
    createdAt: 1,
    updatedAt: 5,
  },
  {
    id: "seed-1847",
    customerName: "Sharon Badeaux",
    jobNumber: "1847",
    status: "Waiting on Materials",
    nextAction: "Call when controller comes in",
    timeExpectation: "Parts ETA Wednesday",
    createdAt: 2,
    updatedAt: 4,
  },
  {
    id: "seed-1851",
    customerName: "Trey Fontenot",
    jobNumber: "1851",
    status: "Customer drop off",
    nextAction: "Confirm drop-off time",
    timeExpectation: "Promised Friday morning",
    createdAt: 3,
    updatedAt: 3,
  },
  {
    id: "seed-1839",
    customerName: "The Landing HOA",
    jobNumber: "1839",
    status: "Awaiting Payment",
    nextAction: "Call customer — cart is ready",
    timeExpectation: "Ready now",
    createdAt: 4,
    updatedAt: 6,
  },
  {
    id: "seed-1855",
    customerName: 'James "Coach" Williams',
    jobNumber: "1855",
    status: "Deposit Needed",
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

export function isPipelineStatus(status: string): status is PipelineStatus {
  return (PIPELINE_STATUSES as readonly string[]).includes(status);
}

export function isClosedStatus(status: string): boolean {
  return status === "Invoice Paid";
}

export function draftToJob(draft: CartJobDraft, existing?: CartJob): CartJob {
  const now = Date.now();
  return {
    id: existing?.id ?? createId(),
    customerName: draft.customerName.trim(),
    jobNumber: draft.jobNumber.trim(),
    status: draft.status.trim() || "New Job",
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

export function statusRank(status: string): number {
  const index = PIPELINE_STATUSES.indexOf(status as PipelineStatus);
  if (index >= 0) return index;
  return PIPELINE_STATUSES.length - 0.5;
}

export function sortJobs(jobs: CartJob[]): CartJob[] {
  return [...jobs].sort((a, b) => {
    const rankDelta = statusRank(a.status) - statusRank(b.status);
    if (rankDelta !== 0) return rankDelta;
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

export type StatusTone =
  | "new"
  | "dropoff"
  | "pictures"
  | "ryan"
  | "deposit"
  | "order"
  | "materials"
  | "scheduled"
  | "callback"
  | "queue"
  | "estimate"
  | "progress"
  | "approval"
  | "qc"
  | "payment"
  | "pickup"
  | "invoice"
  | "hold"
  | "done"
  | "custom";

export function statusTone(status: string): StatusTone {
  switch (status) {
    case "New Job":
      return "new";
    case "Customer drop off":
      return "dropoff";
    case "Pictures Needed":
      return "pictures";
    case "Deposit Needed":
    case "Awaiting Deposit":
      return "deposit";
    case "RYAN":
      return "ryan";
    case "Need to Order Materials":
      return "order";
    case "Waiting on Materials":
      return "materials";
    case "Unscheduled":
    case "Scheduled":
      return "scheduled";
    case "Return Call Needed":
      return "callback";
    case "In Progress":
      return "progress";
    case "Awaiting Queue":
    case "Shop Queue":
      return "queue";
    case "JESSE- estimate ready to call":
    case "Awaiting Estimate":
      return "estimate";
    case "Awaiting Approval":
      return "approval";
    case "Awaiting QC":
      return "qc";
    case "Completed":
      return "done";
    case "Awaiting Payment":
      return "payment";
    case "Awaiting Return Delivery":
    case "Customer pick up":
      return "pickup";
    case "Need to Invoice":
    case "Invoice Sent":
      return "invoice";
    case "On Hold":
      return "hold";
    case "Invoice Paid":
      return "done";
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
