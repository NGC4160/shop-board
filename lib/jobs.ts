import { chicagoParts } from "@/lib/chicago";

export const STORAGE_KEY = "ngc-shop-board-v6";
export const LEGACY_JOBS_KEY = "ngc-shop-board-v5";
export const LEGACY_SORT_KEY = "ngc-shop-board-sort-v2";

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

/** Live NGC Housecall Pro Field Techs (Settings → Team & Permissions). */
export const PRIMARY_TECHS = [
  "Marlon Gray",
  "Ryan Gorgoglione",
  "Hayden Silva",
] as const;

export type PrimaryTech = (typeof PRIMARY_TECHS)[number];

export const NEXT_ACTION_PRESETS = [
  "Call customer",
  "Text Housecall Pro invoice",
  "Confirm drop-off time",
  "Take pictures",
  "Order parts",
  "Call when parts come in",
  "Test drive",
  "QC and wash",
  "Call customer — cart is ready",
  "Schedule return delivery",
] as const;

/** Calendar date only: `YYYY-MM-DD`. Empty is allowed. */
export const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = value.trim().match(ISO_DATE_PATTERN);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** Keep a real calendar date; drop phrases, "999", and other leftover time text. */
export function normalizeTimeframe(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (isIsoDate(trimmed)) return trimmed;
  const embedded = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (embedded?.[1] && isIsoDate(embedded[1])) return embedded[1];
  return "";
}

export function formatTimeframe(value: string): string {
  const iso = normalizeTimeframe(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

export const CART_MAKES = [
  "EZ-GO",
  "Club Car",
  "Yamaha",
  "Icon",
  "Evolution",
  "Advanced EV",
] as const;

export const CART_COLORS = [
  "White",
  "Black",
  "Red",
  "Blue",
  "Green",
  "Tan",
  "Beige",
  "Silver",
  "Platinum",
  "Burgundy",
  "Gray",
  "Orange",
] as const;

export const BAYS = [
  "Bay 1",
  "Bay 2",
  "Bay 3",
  "Bay 4",
  "Bay 5",
  "Bay 6",
  "Outside",
  "Lot",
  "Wash",
  "Trailer",
] as const;

export const PRIORITIES = ["none", "hot", "promised", "waiting"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: "No flag",
  hot: "Hot",
  promised: "Promised",
  waiting: "Waiting",
};

export function nextPriority(priority: Priority): Priority {
  const index = PRIORITIES.indexOf(priority);
  return PRIORITIES[(index + 1) % PRIORITIES.length] ?? "none";
}

export type HistoryKind = "created" | "status" | "tech" | "note" | "edit";

export type JobHistory = {
  at: number;
  kind: HistoryKind;
  text: string;
};

export type CartJob = {
  id: string;
  customerName: string;
  jobNumber: string;
  phone: string;
  cartYear: string;
  cartMake: string;
  cartModel: string;
  cartColor: string;
  bay: string;
  primaryTech: string;
  status: string;
  nextAction: string;
  timeExpectation: string;
  priority: Priority;
  notes: string;
  history: JobHistory[];
  createdAt: number;
  updatedAt: number;
  statusChangedAt: number;
};

export type CartJobDraft = {
  customerName: string;
  jobNumber: string;
  phone: string;
  cartYear: string;
  cartMake: string;
  cartModel: string;
  cartColor: string;
  bay: string;
  primaryTech: string;
  status: string;
  nextAction: string;
  timeExpectation: string;
  priority: Priority;
  notes: string;
};

const DAY = 86_400_000;
const NOW = Date.now();

function chicagoDayOffset(days: number, now = NOW): string {
  const { year, month, day } = chicagoParts(now);
  const stamp = new Date(Date.UTC(year, month - 1, day + days));
  const y = stamp.getUTCFullYear();
  const m = String(stamp.getUTCMonth() + 1).padStart(2, "0");
  const d = String(stamp.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const SEED_TODAY = chicagoDayOffset(0);
const SEED_TOMORROW = chicagoDayOffset(1);
const SEED_PLUS_3 = chicagoDayOffset(3);
const SEED_PLUS_5 = chicagoDayOffset(5);

function seed(
  partial: Omit<CartJob, "history" | "createdAt" | "updatedAt" | "statusChangedAt"> & {
    daysAgo: number;
    statusDays: number;
    history: string[];
  },
): CartJob {
  const createdAt = NOW - partial.daysAgo * DAY;
  const statusChangedAt = NOW - partial.statusDays * DAY;
  return {
    id: partial.id,
    customerName: partial.customerName,
    jobNumber: partial.jobNumber,
    phone: partial.phone,
    cartYear: partial.cartYear,
    cartMake: partial.cartMake,
    cartModel: partial.cartModel,
    cartColor: partial.cartColor,
    bay: partial.bay,
    primaryTech: partial.primaryTech,
    status: partial.status,
    nextAction: partial.nextAction,
    timeExpectation: partial.timeExpectation,
    priority: partial.priority,
    notes: partial.notes,
    createdAt,
    updatedAt: statusChangedAt,
    statusChangedAt,
    history: [
      { at: createdAt, kind: "created", text: "Added to the board" },
      ...partial.history.map((text, index) => ({
        at: createdAt + (index + 1) * 3_600_000,
        kind: "edit" as const,
        text,
      })),
    ],
  };
}

export const seedJobs: CartJob[] = [
  seed({
    id: "seed-1842",
    customerName: "Mike Landry",
    jobNumber: "1842",
    phone: "985-555-0142",
    cartYear: "2018",
    cartMake: "EZ-GO",
    cartModel: "TXT 48V",
    cartColor: "White",
    bay: "Bay 2",
    primaryTech: "Hayden Silva",
    status: "In Progress",
    nextAction: "Replace solenoid and test drive",
    timeExpectation: SEED_TODAY,
    priority: "hot",
    notes: "Intermittent no-go after sitting. Customer waiting on it for the weekend.",
    daysAgo: 2,
    statusDays: 0,
    history: ["Moved to In Progress", "Assigned Hayden Silva"],
  }),
  seed({
    id: "seed-1847",
    customerName: "Sharon Badeaux",
    jobNumber: "1847",
    phone: "985-555-0188",
    cartYear: "2021",
    cartMake: "Club Car",
    cartModel: "Precedent",
    cartColor: "Platinum",
    bay: "Bay 4",
    primaryTech: "Marlon Gray",
    status: "Waiting on Materials",
    nextAction: "Call when controller comes in",
    timeExpectation: SEED_PLUS_5,
    priority: "waiting",
    notes: "Controller ordered from Navitas. Tracking in Housecall Pro.",
    daysAgo: 8,
    statusDays: 5,
    history: ["Need to Order Materials", "Waiting on Materials"],
  }),
  seed({
    id: "seed-1851",
    customerName: "Trey Fontenot",
    jobNumber: "1851",
    phone: "",
    cartYear: "2016",
    cartMake: "Yamaha",
    cartModel: "Drive",
    cartColor: "Green",
    bay: "Lot",
    primaryTech: "",
    status: "Customer drop off",
    nextAction: "Confirm drop-off time",
    timeExpectation: SEED_PLUS_3,
    priority: "promised",
    notes: "Dropping off Friday. No tech assigned yet.",
    daysAgo: 1,
    statusDays: 1,
    history: ["Customer called to schedule drop-off"],
  }),
  seed({
    id: "seed-1839",
    customerName: "The Landing HOA",
    jobNumber: "1839",
    phone: "985-555-0110",
    cartYear: "2020",
    cartMake: "EZ-GO",
    cartModel: "RXV",
    cartColor: "Tan",
    bay: "Outside",
    primaryTech: "Hayden Silva",
    status: "Awaiting Payment",
    nextAction: "Call customer — cart is ready",
    timeExpectation: SEED_TODAY,
    priority: "promised",
    notes: "Fleet cart 7. Invoice already in Housecall Pro.",
    daysAgo: 11,
    statusDays: 1,
    history: ["QC passed", "Moved to Awaiting Payment"],
  }),
  seed({
    id: "seed-1855",
    customerName: 'James "Coach" Williams',
    jobNumber: "1855",
    phone: "985-555-0164",
    cartYear: "2019",
    cartMake: "Club Car",
    cartModel: "DS",
    cartColor: "Red",
    bay: "Lot",
    primaryTech: "Ryan Gorgoglione",
    status: "Deposit Needed",
    nextAction: "Text Housecall Pro invoice",
    timeExpectation: "",
    priority: "waiting",
    notes: "Estimate approved verbally. Need deposit before parts.",
    daysAgo: 4,
    statusDays: 3,
    history: ["Pictures taken", "Deposit Needed"],
  }),
  seed({
    id: "seed-1860",
    customerName: "Patti Thibodeaux",
    jobNumber: "1860",
    phone: "985-555-0127",
    cartYear: "2022",
    cartMake: "Icon",
    cartModel: "i40",
    cartColor: "Black",
    bay: "Wash",
    primaryTech: "Marlon Gray",
    status: "Pictures Needed",
    nextAction: "Take pictures",
    timeExpectation: SEED_TOMORROW,
    priority: "none",
    notes: "Lithium pack. Customer wants photos of the underbody scrape.",
    daysAgo: 1,
    statusDays: 1,
    history: ["Checked in"],
  }),
  seed({
    id: "seed-1858",
    customerName: "Daryl Melerine",
    jobNumber: "1858",
    phone: "985-555-0193",
    cartYear: "2017",
    cartMake: "EZ-GO",
    cartModel: "TXT",
    cartColor: "Blue",
    bay: "Bay 5",
    primaryTech: "Hayden Silva",
    status: "Shop Queue",
    nextAction: "QC and wash",
    timeExpectation: SEED_TOMORROW,
    priority: "none",
    notes: "Steering click. Parts are here — waiting on a bay.",
    daysAgo: 6,
    statusDays: 2,
    history: ["Waiting on Materials", "Moved to Shop Queue"],
  }),
  seed({
    id: "seed-1844",
    customerName: "St. Tammany Parish",
    jobNumber: "1844",
    phone: "985-555-0100",
    cartYear: "2021",
    cartMake: "Yamaha",
    cartModel: "Drive2",
    cartColor: "White",
    bay: "Outside",
    primaryTech: "Ryan Gorgoglione",
    status: "Awaiting Estimate",
    nextAction: "Call customer",
    timeExpectation: "",
    priority: "none",
    notes: "Park cart. Need written estimate before approval.",
    daysAgo: 9,
    statusDays: 4,
    history: ["JESSE- estimate ready to call", "Awaiting Estimate"],
  }),
  seed({
    id: "seed-1862",
    customerName: "Kayla Guidry",
    jobNumber: "1862",
    phone: "985-555-0155",
    cartYear: "2023",
    cartMake: "Club Car",
    cartModel: "Onward",
    cartColor: "White",
    bay: "Lot",
    primaryTech: "",
    status: "Need to Order Materials",
    nextAction: "Order parts",
    timeExpectation: SEED_PLUS_5,
    priority: "waiting",
    notes: "Rear leaf springs. Confirm OEM vs aftermarket with Ryan.",
    daysAgo: 2,
    statusDays: 2,
    history: ["Inspected", "Need to Order Materials"],
  }),
  seed({
    id: "seed-1853",
    customerName: "Robert Vicknair",
    jobNumber: "1853",
    phone: "985-555-0171",
    cartYear: "2015",
    cartMake: "EZ-GO",
    cartModel: "RXV",
    cartColor: "Green",
    bay: "Bay 1",
    primaryTech: "Hayden Silva",
    status: "Awaiting QC",
    nextAction: "QC and wash",
    timeExpectation: SEED_TODAY,
    priority: "hot",
    notes: "Motor swap done. Needs test drive before pickup.",
    daysAgo: 7,
    statusDays: 0,
    history: ["In Progress", "Awaiting QC"],
  }),
  seed({
    id: "seed-1849",
    customerName: "Fairway Estates",
    jobNumber: "1849",
    phone: "985-555-0133",
    cartYear: "2020",
    cartMake: "Club Car",
    cartModel: "Tempo",
    cartColor: "Beige",
    bay: "Trailer",
    primaryTech: "Ryan Gorgoglione",
    status: "Scheduled",
    nextAction: "Confirm drop-off time",
    timeExpectation: SEED_PLUS_3,
    priority: "promised",
    notes: "On-site Friday. Bring solenoid kit.",
    daysAgo: 3,
    statusDays: 3,
    history: ["Scheduled for Friday"],
  }),
  seed({
    id: "seed-1864",
    customerName: "Cheryl Lavigne",
    jobNumber: "1864",
    phone: "985-555-0148",
    cartYear: "2014",
    cartMake: "Yamaha",
    cartModel: "G29",
    cartColor: "Burgundy",
    bay: "Lot",
    primaryTech: "Marlon Gray",
    status: "Return Call Needed",
    nextAction: "Call customer",
    timeExpectation: "",
    priority: "hot",
    notes: "Left voicemail yesterday about the estimate.",
    daysAgo: 5,
    statusDays: 2,
    history: ["Awaiting Estimate", "Return Call Needed"],
  }),
  seed({
    id: "seed-1856",
    customerName: "Alan Petit",
    jobNumber: "1856",
    phone: "985-555-0122",
    cartYear: "2018",
    cartMake: "Club Car",
    cartModel: "Precedent",
    cartColor: "Silver",
    bay: "Bay 3",
    primaryTech: "Hayden Silva",
    status: "JESSE- estimate ready to call",
    nextAction: "Call customer",
    timeExpectation: SEED_TODAY,
    priority: "none",
    notes: "Estimate written. Jesse to call this afternoon.",
    daysAgo: 3,
    statusDays: 0,
    history: ["Pictures Needed", "Estimate written"],
  }),
];

export const emptyDraft: CartJobDraft = {
  customerName: "",
  jobNumber: "",
  phone: "",
  cartYear: "",
  cartMake: "",
  cartModel: "",
  cartColor: "",
  bay: "",
  primaryTech: "",
  status: "New Job",
  nextAction: "",
  timeExpectation: "",
  priority: "none",
  notes: "",
};

/**
 * Trim and strip leading zeros from the numeric core so `01855` and `1855`
 * are the same job. Keeps a hyphen suffix (`17312-1`). All-zeros become `0`.
 */
export function normalizeJobNumber(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const match = trimmed.match(/^(\d+)(-\d+)?$/);
  if (!match) return trimmed;
  const major = (match[1] ?? "").replace(/^0+/, "") || "0";
  return `${major}${match[2] ?? ""}`;
}

const JOB_NUMBER_PATTERN = /^\d+(-\d+)?$/;

export function customerNameError(value: string): string | null {
  if (!value.trim()) return "Customer name is required";
  return null;
}

export function jobNumberError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Job # is required";
  if (!JOB_NUMBER_PATTERN.test(trimmed)) {
    return "Job # must be digits, or digits-hyphen-digits (like 17312-1)";
  }
  const major = normalizeJobNumber(trimmed).split("-")[0] ?? "";
  if (major === "0") return "Job # can't be zeros";
  return null;
}

export function isValidJobNumber(value: string): boolean {
  return jobNumberError(value) === null;
}

/** Other… must not impersonate a listed option (e.g. typing In Progress as a custom status). */
export function listedOtherError(value: string, options: readonly string[]): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (options.some((option) => option.toLowerCase() === trimmed.toLowerCase())) {
    return "Pick it from the list";
  }
  return null;
}

export function isBlankIdentity(job: Pick<CartJob, "customerName" | "jobNumber">): boolean {
  return !job.customerName.trim() && !normalizeJobNumber(job.jobNumber);
}

/** Live Add cart persisted empty/untitled rows. Drop them on load so they never bump Open. */
export function isGhostJob(job: Pick<CartJob, "customerName" | "jobNumber">): boolean {
  if (isBlankIdentity(job)) return true;
  const name = job.customerName.trim();
  const untitled = /^untitled(\s+cart)?$/i.test(name);
  if ((!name || untitled) && jobNumberError(job.jobNumber)) return true;
  return false;
}

export function hasDuplicateJobNumber(
  jobs: CartJob[],
  id: string,
  jobNumber: string,
): boolean {
  const normalized = normalizeJobNumber(jobNumber);
  if (!normalized || normalized === "0") return false;
  return jobs.some(
    (job) => job.id !== id && normalizeJobNumber(job.jobNumber) === normalized,
  );
}

export function jobNumberWarning(
  jobNumber: string,
  jobs: CartJob[],
  id: string,
): string {
  const format = jobNumberError(jobNumber);
  if (format) return format;
  if (hasDuplicateJobNumber(jobs, id, jobNumber)) {
    return `Job # ${normalizeJobNumber(jobNumber)} is already on the board`;
  }
  return "";
}

/**
 * Empty Other… : Tech/Bay (emptyLabel set) persist Unassigned/—.
 * Status / Next / Time have no empty option — keep the previous value.
 */
export function commitOtherValue(
  trimmed: string,
  previous: string,
  emptyLabel?: string,
): { next: string; persist: boolean } {
  if (trimmed !== "") return { next: trimmed, persist: true };
  if (emptyLabel !== undefined) return { next: "", persist: true };
  return { next: previous, persist: false };
}

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
  return status === "Invoice Paid" || status === "Completed";
}

/**
 * Empty is allowed. Anything else must be a real calendar date (`YYYY-MM-DD`).
 * Phrases, "999", and relative text are not stored.
 */
export function timeExpectationError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isIsoDate(trimmed)) return "Timeframe must be a calendar date";
  return null;
}

export function draftToJob(draft: CartJobDraft, existing?: CartJob): CartJob {
  const now = Date.now();
  const status = draft.status.trim() || "New Job";
  const statusChanged =
    existing && existing.status !== status ? now : (existing?.statusChangedAt ?? now);
  const history = existing?.history ? [...existing.history] : [];
  if (!existing) {
    history.push({ at: now, kind: "created", text: "Added to the board" });
  }
  return {
    id: existing?.id ?? createId(),
    customerName: draft.customerName.trim(),
    jobNumber: normalizeJobNumber(draft.jobNumber),
    phone: draft.phone.trim(),
    cartYear: draft.cartYear.trim(),
    cartMake: draft.cartMake.trim(),
    cartModel: draft.cartModel.trim(),
    cartColor: draft.cartColor.trim(),
    bay: draft.bay.trim(),
    primaryTech: draft.primaryTech.trim(),
    status,
    nextAction: draft.nextAction.trim(),
    timeExpectation: normalizeTimeframe(draft.timeExpectation),
    priority: draft.priority,
    notes: draft.notes.trim(),
    history,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    statusChangedAt: statusChanged,
  };
}

export function jobToDraft(job: CartJob): CartJobDraft {
  return {
    customerName: job.customerName,
    jobNumber: job.jobNumber,
    phone: job.phone,
    cartYear: job.cartYear,
    cartMake: job.cartMake,
    cartModel: job.cartModel,
    cartColor: job.cartColor,
    bay: job.bay,
    primaryTech: job.primaryTech,
    status: job.status,
    nextAction: job.nextAction,
    timeExpectation: job.timeExpectation,
    priority: job.priority,
    notes: job.notes,
  };
}

export function statusRank(status: string): number {
  const index = PIPELINE_STATUSES.indexOf(status as PipelineStatus);
  if (index >= 0) return index;
  return PIPELINE_STATUSES.length - 0.5;
}

export function nextPipelineStatus(status: string): string | null {
  const index = PIPELINE_STATUSES.indexOf(status as PipelineStatus);
  if (index < 0 || index >= PIPELINE_STATUSES.length - 1) return null;
  return PIPELINE_STATUSES[index + 1];
}

export function prevPipelineStatus(status: string): string | null {
  const index = PIPELINE_STATUSES.indexOf(status as PipelineStatus);
  if (index <= 0) return null;
  return PIPELINE_STATUSES[index - 1];
}

export function cartLabel(job: Pick<CartJob, "cartYear" | "cartMake" | "cartModel">): string {
  return [job.cartYear, job.cartMake, job.cartModel].filter(Boolean).join(" ");
}

/** Stage ages older than this are treated as missing/corrupt, not "20705d in stage". */
export const MAX_STAGE_AGE_DAYS = 365;
const MAX_STAGE_MS = MAX_STAGE_AGE_DAYS * DAY;
/** Unix seconds (2026 ≈ 1.75e9) vs milliseconds (1.75e12). */
const UNIX_SECONDS_MAX = 1e10;

export function coerceMillis(raw: unknown): number | null {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < UNIX_SECONDS_MAX ? n * 1000 : n;
}

function saneStageTimestamp(raw: unknown, now: number): number | null {
  const ms = coerceMillis(raw);
  if (ms == null || ms > now) return null;
  if (now - ms > MAX_STAGE_MS) return null;
  return ms;
}

export function saneStatusChangedAt(
  job: Pick<CartJob, "createdAt" | "updatedAt" | "statusChangedAt">,
  now = Date.now(),
): number {
  return (
    saneStageTimestamp(job.statusChangedAt, now) ??
    saneStageTimestamp(job.createdAt, now) ??
    now
  );
}

export function daysInStatus(job: CartJob, now = Date.now()): number {
  const at = saneStatusChangedAt(job, now);
  const days = Math.floor((now - at) / DAY);
  if (!Number.isFinite(days) || days < 0 || days > MAX_STAGE_AGE_DAYS) return 0;
  return days;
}

export function daysOnBoard(job: CartJob, now = Date.now()): number {
  return Math.max(0, Math.floor((now - job.createdAt) / DAY));
}

export function isStale(job: CartJob, now = Date.now()): boolean {
  if (isClosedStatus(job.status)) return false;
  return daysInStatus(job, now) >= 3;
}

export function isPartsStatus(status: string): boolean {
  return (
    status === "Need to Order Materials" ||
    status === "Waiting on Materials"
  );
}

export function isPickupStatus(status: string): boolean {
  return (
    status === "Customer pick up" ||
    status === "Awaiting Return Delivery" ||
    status === "Awaiting Payment" ||
    status === "Completed"
  );
}

export function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
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

export const STATUS_CHIP: Record<StatusTone, string> = {
  new: "bg-chip-wait text-chip-wait-fg",
  dropoff: "bg-chip-wait text-chip-wait-fg",
  pictures: "bg-chip-sand text-chip-sand-fg",
  ryan: "bg-chip-bay text-chip-bay-fg",
  deposit: "bg-chip-clay text-chip-clay-fg",
  order: "bg-chip-parts text-chip-parts-fg",
  materials: "bg-chip-parts text-chip-parts-fg",
  scheduled: "bg-chip-wait text-chip-wait-fg",
  callback: "bg-chip-clay text-chip-clay-fg",
  queue: "bg-chip-steel text-chip-steel-fg",
  estimate: "bg-chip-sand text-chip-sand-fg",
  progress: "bg-chip-bay text-chip-bay-fg",
  approval: "bg-chip-sand text-chip-sand-fg",
  qc: "bg-chip-steel text-chip-steel-fg",
  payment: "bg-chip-clay text-chip-clay-fg",
  pickup: "bg-chip-ready text-chip-ready-fg",
  invoice: "bg-chip-wait text-chip-wait-fg",
  hold: "bg-surface-2 text-muted border border-border",
  done: "bg-surface-2 text-muted border border-border",
  custom: "bg-surface-2 text-foreground border border-border",
};

export function appendHistory(
  job: CartJob,
  kind: HistoryKind,
  text: string,
): JobHistory[] {
  return [...job.history, { at: Date.now(), kind, text }].slice(-40);
}

export function isCartJob(value: unknown): value is CartJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Record<string, unknown>;
  return (
    typeof job.id === "string" &&
    typeof job.customerName === "string" &&
    typeof job.jobNumber === "string" &&
    typeof job.primaryTech === "string" &&
    typeof job.status === "string" &&
    typeof job.nextAction === "string" &&
    typeof job.timeExpectation === "string"
  );
}

export function upgradeJob(value: unknown): CartJob | null {
  if (!isCartJob(value)) return null;
  const job = value as CartJob & Record<string, unknown>;
  const now = Date.now();
  const createdMs = coerceMillis(job.createdAt);
  const createdAt =
    createdMs != null && createdMs <= now ? createdMs : now;
  const updatedMs = coerceMillis(job.updatedAt);
  const updatedAt =
    updatedMs != null && updatedMs <= now ? updatedMs : createdAt;
  const history = Array.isArray(job.history)
    ? job.history.filter(
        (entry): entry is JobHistory =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as JobHistory).at === "number" &&
          typeof (entry as JobHistory).text === "string",
      )
    : [{ at: createdAt, kind: "created" as const, text: "Added to the board" }];
  return {
    id: job.id,
    customerName: job.customerName,
    jobNumber: normalizeJobNumber(job.jobNumber),
    phone: typeof job.phone === "string" ? job.phone : "",
    cartYear: typeof job.cartYear === "string" ? job.cartYear : "",
    cartMake: typeof job.cartMake === "string" ? job.cartMake : "",
    cartModel: typeof job.cartModel === "string" ? job.cartModel : "",
    cartColor: typeof job.cartColor === "string" ? job.cartColor : "",
    bay: typeof job.bay === "string" ? job.bay : "",
    primaryTech: job.primaryTech,
    status: job.status,
    nextAction: job.nextAction,
    timeExpectation: normalizeTimeframe(job.timeExpectation),
    priority: isPriority(String(job.priority ?? "none"))
      ? (job.priority as Priority)
      : "none",
    notes: typeof job.notes === "string" ? job.notes : "",
    history,
    createdAt,
    updatedAt,
    statusChangedAt: saneStatusChangedAt(
      {
        createdAt,
        updatedAt,
        statusChangedAt:
          typeof job.statusChangedAt === "number" ? job.statusChangedAt : updatedAt,
      },
      now,
    ),
  };
}

export function sanitizeLoadedJobs(values: unknown[]): CartJob[] {
  return values
    .map(upgradeJob)
    .filter((job): job is CartJob => job !== null && !isGhostJob(job));
}
