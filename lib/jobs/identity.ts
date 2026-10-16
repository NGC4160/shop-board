import type { CartJob } from "./types";

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
