import { PIPELINE_STATUSES, PRIORITIES, type PipelineStatus, type Priority } from "./catalog";
import type { CartJob } from "./types";

const DAY = 86_400_000;

export function isPipelineStatus(status: string): status is PipelineStatus {
  return (PIPELINE_STATUSES as readonly string[]).includes(status);
}

export function isClosedStatus(status: string): boolean {
  return status === "Invoice Paid" || status === "Completed";
}

/**
 * Board pipeline Unscheduled, or HCP work_status unscheduled / needs scheduling.
 * Date started must show — and Sync must clear a leftover scheduled_start.
 */
export function isUnscheduledStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
  return normalized === "unscheduled" || normalized === "needs scheduling";
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
