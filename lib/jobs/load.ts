import type { Priority } from "./catalog";
import { isGhostJob, normalizeJobNumber } from "./identity";
import { coerceMillis, isPriority, saneStatusChangedAt } from "./status";
import { normalizeTimeframe } from "./timeframe";
import type { CartJob, JobHistory } from "./types";

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
    hcpScheduledStartAt: parseStoredHcpScheduledStartAt(job.hcpScheduledStartAt),
    deletedAt: readDeletedAt(job.deletedAt),
  };
}

/** Missing or invalid `deletedAt` means the row is still on the board. */
export function readDeletedAt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function isDeletedJob(job: { deletedAt?: number | null }): boolean {
  return readDeletedAt(job.deletedAt) != null;
}

export function visibleJobs<T extends { deletedAt?: number | null }>(jobs: readonly T[]): T[] {
  return jobs.filter((job) => !isDeletedJob(job));
}

/** Persist a stored HCP schedule start. Do not fall back to created_at or board `createdAt`. */
function parseStoredHcpScheduledStartAt(raw: unknown): number | null {
  const ms = coerceMillis(raw);
  if (ms == null) return null;
  return ms;
}

export function sanitizeLoadedJobs(values: unknown[]): CartJob[] {
  return values
    .map(upgradeJob)
    .filter((job): job is CartJob => job !== null && !isGhostJob(job));
}
