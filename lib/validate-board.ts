import { PRIORITIES } from "@/lib/jobs/catalog";
import { jobNumberError, normalizeJobNumber } from "@/lib/jobs/identity";
import { upgradeJob } from "@/lib/jobs/load";
import { isIsoDate } from "@/lib/jobs/timeframe";
import type { CartJob } from "@/lib/jobs/types";
import {
  defaultSharedPrefs,
  readDismissedJobNumbers,
  type SharedBoardPayload,
  type SharedBoardPrefs,
} from "@/lib/shared-board";

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function jobLabel(index: number, id: string): string {
  const row = index + 1;
  return id ? `Job ${row} (${id})` : `Job ${row}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | { error: string } {
  if (!(key in record)) return "";
  const value = record[key];
  if (typeof value !== "string") return { error: `${label}: ${key} must be text.` };
  return value;
}

/**
 * Strict check for PUT /api/board. Reads stay lenient so an existing Blob
 * document still loads. A bad row fails the whole save with a row-specific
 * message instead of being dropped.
 */
export function validateBoardPut(body: unknown): ValidateResult<SharedBoardPayload> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Board payload must be a JSON object." };
  if (!Array.isArray(record.jobs)) {
    return { ok: false, error: "jobs must be an array. Refresh the board and try again." };
  }

  const prefsResult = validatePrefs(record.prefs);
  if (!prefsResult.ok) return prefsResult;
  const dismissedResult = validateDismissed(record.dismissedJobNumbers);
  if (!dismissedResult.ok) return dismissedResult;

  const jobs: CartJob[] = [];
  const seenIds = new Map<string, number>();
  const seenNumbers = new Map<string, number>();

  for (let index = 0; index < record.jobs.length; index += 1) {
    const item = record.jobs[index];
    const jobRecord = asRecord(item);
    if (!jobRecord) {
      return { ok: false, error: `Job ${index + 1}: each job must be an object.` };
    }
    const idRaw = jobRecord.id;
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    const label = jobLabel(index, id);
    if (!id) return { ok: false, error: `${label}: id is required.` };
    if (id.length > 128) return { ok: false, error: `${label}: id must be 128 characters or fewer.` };
    if (seenIds.has(id)) {
      return {
        ok: false,
        error: `${label}: id ${id} is already used by job ${seenIds.get(id)}.`,
      };
    }
    seenIds.set(id, index + 1);

    const customer = requireString(jobRecord, "customerName", label);
    if (typeof customer !== "string") return { ok: false, error: customer.error };
    const jobNumberRaw = requireString(jobRecord, "jobNumber", label);
    if (typeof jobNumberRaw !== "string") return { ok: false, error: jobNumberRaw.error };
    if (!customer.trim() && !jobNumberRaw.trim()) {
      return {
        ok: false,
        error: `${label}: customer name and job # are both blank. Fill them in or remove the row.`,
      };
    }
    const numberError = jobNumberRaw.trim() ? jobNumberError(jobNumberRaw) : "Job # is required";
    if (numberError) return { ok: false, error: `${label}: ${numberError}.` };
    const normalizedNumber = normalizeJobNumber(jobNumberRaw);
    if (seenNumbers.has(normalizedNumber)) {
      return {
        ok: false,
        error: `Job # ${normalizedNumber} is listed more than once (rows ${seenNumbers.get(normalizedNumber)} and ${index + 1}).`,
      };
    }
    seenNumbers.set(normalizedNumber, index + 1);

    for (const key of [
      "phone",
      "cartYear",
      "cartMake",
      "cartModel",
      "cartColor",
      "bay",
      "primaryTech",
      "status",
      "nextAction",
      "notes",
    ] as const) {
      if (!(key in jobRecord)) continue;
      if (typeof jobRecord[key] !== "string") {
        return { ok: false, error: `${label}: ${key} must be text.` };
      }
    }

    if ("timeExpectation" in jobRecord) {
      if (typeof jobRecord.timeExpectation !== "string") {
        return { ok: false, error: `${label}: timeframe must be text.` };
      }
      const timeframe = jobRecord.timeExpectation.trim();
      if (timeframe && !isIsoDate(timeframe)) {
        return {
          ok: false,
          error: `${label}: timeframe must be a calendar date (YYYY-MM-DD) or empty.`,
        };
      }
    }

    if ("priority" in jobRecord && jobRecord.priority != null) {
      if (typeof jobRecord.priority !== "string" || !(PRIORITIES as readonly string[]).includes(jobRecord.priority)) {
        return {
          ok: false,
          error: `${label}: priority must be one of ${PRIORITIES.join(", ")}.`,
        };
      }
    }

    if ("history" in jobRecord && jobRecord.history != null) {
      if (!Array.isArray(jobRecord.history)) {
        return { ok: false, error: `${label}: history must be an array.` };
      }
      for (let entryIndex = 0; entryIndex < jobRecord.history.length; entryIndex += 1) {
        const entry = asRecord(jobRecord.history[entryIndex]);
        if (!entry || typeof entry.at !== "number" || typeof entry.text !== "string") {
          return {
            ok: false,
            error: `${label}: history entry ${entryIndex + 1} needs a time and text.`,
          };
        }
      }
    }

    for (const key of ["createdAt", "updatedAt", "statusChangedAt"] as const) {
      if (!(key in jobRecord) || jobRecord[key] == null) continue;
      if (typeof jobRecord[key] !== "number" || !Number.isFinite(jobRecord[key] as number)) {
        return { ok: false, error: `${label}: ${key} must be a number.` };
      }
    }

    if ("hcpScheduledStartAt" in jobRecord && jobRecord.hcpScheduledStartAt != null) {
      if (typeof jobRecord.hcpScheduledStartAt !== "number" || !Number.isFinite(jobRecord.hcpScheduledStartAt)) {
        return { ok: false, error: `${label}: Date started must be a timestamp or null.` };
      }
    }
    if ("deletedAt" in jobRecord && jobRecord.deletedAt != null) {
      if (typeof jobRecord.deletedAt !== "number" || !Number.isFinite(jobRecord.deletedAt) || jobRecord.deletedAt <= 0) {
        return { ok: false, error: `${label}: deletedAt must be a timestamp or null.` };
      }
    }

    const upgraded = upgradeJob(jobRecord);
    if (!upgraded) {
      return { ok: false, error: `${label}: this row could not be read. Check customer, job #, and status.` };
    }
    jobs.push(upgraded);
  }

  return {
    ok: true,
    value: {
      jobs,
      prefs: prefsResult.value,
      dismissedJobNumbers: dismissedResult.value,
    },
  };
}

function validatePrefs(value: unknown): ValidateResult<SharedBoardPrefs> {
  if (value == null) return { ok: true, value: { ...defaultSharedPrefs } };
  const record = asRecord(value);
  if (!record) return { ok: false, error: "prefs must be an object." };
  if ("hideClosed" in record && typeof record.hideClosed !== "boolean") {
    return { ok: false, error: "prefs.hideClosed must be true or false." };
  }
  if ("timeframe" in record && record.timeframe != null) {
    if (typeof record.timeframe !== "string") {
      return { ok: false, error: "prefs.timeframe must be a calendar date (YYYY-MM-DD) or empty." };
    }
    const timeframe = record.timeframe.trim();
    if (timeframe && !isIsoDate(timeframe)) {
      return { ok: false, error: "prefs.timeframe must be a calendar date (YYYY-MM-DD) or empty." };
    }
  }
  return {
    ok: true,
    value: {
      hideClosed: typeof record.hideClosed === "boolean" ? record.hideClosed : defaultSharedPrefs.hideClosed,
      timeframe: typeof record.timeframe === "string" && isIsoDate(record.timeframe.trim())
        ? record.timeframe.trim()
        : "",
    },
  };
}

function validateDismissed(value: unknown): ValidateResult<string[]> {
  if (value == null) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, error: "dismissedJobNumbers must be an array of job numbers." };
  }
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") {
      return {
        ok: false,
        error: `dismissedJobNumbers entry ${index + 1} must be a job number string.`,
      };
    }
  }
  return { ok: true, value: readDismissedJobNumbers(value) };
}
