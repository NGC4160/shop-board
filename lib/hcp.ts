import {
  PRIMARY_TECHS,
  coerceMillis,
  isPipelineStatus,
  normalizeJobNumber,
} from "@/lib/jobs";

export const HCP_API_BASE = "https://api.housecallpro.com";

export type HcpOpenJob = {
  hcpId: string;
  jobNumber: string;
  customerName: string;
  phone: string;
  /** Board pipeline label when we can map one. */
  status: string;
  /** True when status is an exact Housecall Pro Jobs pipeline stage name. */
  statusIsPipeline: boolean;
  /** Field tech name when it matches the shop dropdown; else empty. */
  primaryTech: string;
  /** Housecall Pro `schedule.scheduled_start` millis. Null when missing — never invented. */
  scheduledStart?: number | null;
  /**
   * True when the job payload included a `schedule` key (object or explicit null).
   * Used to distinguish “schedule omitted” from “HCP cleared / unscheduled”.
   */
  schedulePresent?: boolean;
};

export type HcpSyncResult =
  | {
      ok: true;
      skipped: false;
      jobs: HcpOpenJob[];
      fetchedAt: number;
      pageCount: number;
    }
  | {
      ok: true;
      skipped: true;
      reason: string;
      jobs: HcpOpenJob[];
      fetchedAt: number;
    }
  | {
      ok: false;
      skipped: false;
      error: string;
      jobs: HcpOpenJob[];
      fetchedAt: number;
    };

/** Conservative Jobs list query: page + page_size only. */
export const HCP_JOBS_PAGE_SIZE = 100;
export const HCP_JOBS_MAX_PAGES = 40;

const CLOSED_WORK_STATUSES = new Set([
  "complete rated",
  "complete unrated",
  "completed",
  "user canceled",
  "pro canceled",
  "canceled",
]);

const WORK_STATUS_TO_PIPELINE: Record<string, string> = {
  "needs scheduling": "Unscheduled",
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  "in progress": "In Progress",
  in_progress: "In Progress",
  "complete rated": "Completed",
  "complete unrated": "Completed",
  completed: "Completed",
};

export function hcpApiKey(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.HOUSECALL_PRO_API_KEY?.trim() ||
    env.HCP_API_KEY?.trim() ||
    env.HOUSECALL_PRO_BEARER_TOKEN?.trim() ||
    ""
  );
}

export function hcpBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.HOUSECALL_PRO_API_URL || env.HOUSECALL_PRO_BASE_URL || HCP_API_BASE).replace(
    /\/+$/,
    "",
  );
}

/**
 * List URL using only page / page_size.
 * Official Jobs OpenAPI documents those plus schedule / customer / employee
 * filters. sort_by and repeated work_status= values are what HCP 400s on
 * (Zapier: "work_status filter must be an array"); we filter open jobs after.
 *
 * Live GET /jobs includes Job.schedule (scheduled_start / scheduled_end /
 * arrival_window) without expand. expand[] is only for appointments /
 * attachments — do not add it here.
 */
export function buildHcpJobsListUrl(
  baseUrl: string,
  page: number,
  pageSize = HCP_JOBS_PAGE_SIZE,
): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/jobs`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));
  return url;
}

function authHeaders(apiKey: string): Headers {
  const headers = new Headers({ Accept: "application/json" });
  const scheme = process.env.HOUSECALL_PRO_AUTH_SCHEME?.trim().toLowerCase();
  if (scheme === "bearer") {
    headers.set("Authorization", `Bearer ${apiKey}`);
  } else {
    headers.set("Authorization", `Token ${apiKey}`);
  }
  const companyId = process.env.HOUSECALL_PRO_COMPANY_ID?.trim();
  if (companyId) headers.set("X-Company-Id", companyId);
  return headers;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function clipErrorText(value: string, max = 300): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("<")) return "";
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function errorsObjectDetail(errors: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(errors)) {
    if (Array.isArray(value)) {
      const msgs = value.map(asString).filter(Boolean).join(", ");
      if (msgs) parts.push(`${key} ${msgs}`);
    } else {
      const msg = asString(value);
      if (msg) parts.push(`${key} ${msg}`);
    }
  }
  return parts.join("; ");
}

/** Pull a readable reason from HCP JSON / text bodies when present. */
export function hcpErrorDetail(body: unknown): string {
  if (typeof body === "string") return clipErrorText(body);
  if (Array.isArray(body)) {
    const parts = body.map(asString).filter(Boolean);
    return parts.length ? clipErrorText(parts.join("; ")) : "";
  }
  const record = asRecord(body);
  if (!record) return "";

  const nestedError = asRecord(record.error);
  const direct =
    asString(record.error) ||
    asString(record.message) ||
    asString(record.error_description) ||
    asString(record.detail) ||
    asString(nestedError?.message) ||
    asString(nestedError?.error);
  if (direct) return clipErrorText(direct);

  if (Array.isArray(record.errors)) {
    const parts = record.errors.map(asString).filter(Boolean);
    if (parts.length) return clipErrorText(parts.join("; "));
  }
  const errorsRecord = asRecord(record.errors);
  if (errorsRecord) {
    const fromObject = errorsObjectDetail(errorsRecord);
    if (fromObject) return clipErrorText(fromObject);
  }
  return "";
}

export function formatHcpHttpError(
  status: number,
  statusText: string,
  body: unknown,
): string {
  const prefix = `Housecall Pro ${status}${statusText ? ` ${statusText}` : ""}`;
  const detail = hcpErrorDetail(body);
  if (!detail) return prefix;
  if (detail.toLowerCase().startsWith("housecall pro")) return detail;
  return `${prefix}: ${detail}`;
}

function normalizeWorkStatus(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ");
}

export function isOpenHcpWorkStatus(workStatus: string): boolean {
  const normalized = normalizeWorkStatus(workStatus);
  if (!normalized) return true;
  return !CLOSED_WORK_STATUSES.has(normalized);
}

/** Exact shop-as-customer string from the old company-first HCP mapping bug. */
export const SHOP_CUSTOMER_NAME = "Neighborhood Golf Carts";

/**
 * True for "Neighborhood Golf Carts" and close variants (case, punctuation,
 * trailing "LLC", singular "Cart"). Real customer companies must not match.
 */
export function isShopCustomerName(value: string | null | undefined): boolean {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return (
    normalized === "neighborhood golf carts" ||
    normalized === "neighborhood golf cart" ||
    normalized.startsWith("neighborhood golf cart")
  );
}

function usableHcpCustomerName(value: unknown): string {
  const text = asString(value);
  if (!text || isShopCustomerName(text)) return "";
  return text;
}

/**
 * Residential HCP customers often have the shop (or another company string)
 * filled on the company / display fields. Prefer a real person when first or
 * last name is present. Never use the shop name as customerName — fall through
 * to other person/display/company fields. Never invent.
 */
export function customerNameFromHcp(customer: unknown): string {
  const record = asRecord(customer);
  if (!record) return "";
  const person = [asString(record.first_name), asString(record.last_name)]
    .filter(Boolean)
    .join(" ");
  if (person && !isShopCustomerName(person)) return person;
  return (
    usableHcpCustomerName(record.display_name) ||
    usableHcpCustomerName(record.name) ||
    usableHcpCustomerName(record.company) ||
    usableHcpCustomerName(record.company_name)
  );
}

/**
 * Shop-facing Housecall job # is `invoice_number` — the number HCP shows on
 * the job/invoice in the shop. The public Jobs API has no separate customer-
 * visible job number. `job_number` is only a fallback if a payload includes it.
 *
 * Live NGC invoices are currently 6-digit (e.g. 173128). Seed rows like 1839 /
 * 1842 are local demo data, not a different HCP field.
 */
export function jobNumberFromHcp(job: unknown): string {
  const record = asRecord(job);
  if (!record) return "";
  return normalizeJobNumber(asString(record.invoice_number) || asString(record.job_number));
}

/**
 * Housecall Pro appointment start from Jobs API `schedule.scheduled_start`.
 * Official Job schema (Get Jobs / OpenAPI) is:
 *   schedule: { scheduled_start, scheduled_end, arrival_window }
 * Never invents a date. Does not read created_at, updated_at, work_timestamps,
 * appointments[], or undocumented aliases like schedule.start.
 */
export function scheduledStartFromHcp(job: unknown): number | null {
  const record = asRecord(job);
  if (!record) return null;
  const schedule = asRecord(record.schedule);
  if (!schedule) return null;
  for (const key of ["scheduled_start", "scheduledStart"] as const) {
    const parsed = parseHcpDateTime(schedule[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

/** True when the job object included a `schedule` key, even if start is empty. */
export function hcpJobHasSchedule(job: unknown): boolean {
  const record = asRecord(job);
  return Boolean(record && "schedule" in record);
}

function parseHcpDateTime(value: unknown): number | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const iso = Date.parse(trimmed);
    if (Number.isFinite(iso) && iso > 0) return iso;
  }
  return coerceMillis(value);
}

export function phoneFromHcp(customer: unknown): string {
  const record = asRecord(customer);
  if (!record) return "";
  return (
    asString(record.mobile_number) ||
    asString(record.home_number) ||
    asString(record.work_number)
  );
}

function pipelineStatusFromJob(job: Record<string, unknown>): string | null {
  const nested = asRecord(job.pipeline_status);
  if (nested) {
    const name = asString(nested.name) || asString(nested.label);
    if (name && isPipelineStatus(name)) return name;
  }
  for (const key of ["pipeline_status", "current_pipeline_status", "pipeline_stage", "status"]) {
    const value = asString(job[key]);
    if (value && isPipelineStatus(value)) return value;
  }
  const tags = job.tags;
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      const name = asString(tag);
      if (name && isPipelineStatus(name)) return name;
    }
  }
  return null;
}

function techFromHcp(job: Record<string, unknown>): string {
  const assigned = job.assigned_employees;
  if (!Array.isArray(assigned)) return "";
  for (const employee of assigned) {
    const record = asRecord(employee);
    if (!record) continue;
    const name = [asString(record.first_name), asString(record.last_name)].filter(Boolean).join(" ");
    if ((PRIMARY_TECHS as readonly string[]).includes(name)) return name;
  }
  return "";
}

export function mapHcpJob(raw: unknown): HcpOpenJob | null {
  const job = asRecord(raw);
  if (!job) return null;
  const workStatus = asString(job.work_status);
  if (workStatus && !isOpenHcpWorkStatus(workStatus)) return null;
  const jobNumber = jobNumberFromHcp(job);
  if (!jobNumber) return null;
  const pipeline = pipelineStatusFromJob(job);
  const mapped = WORK_STATUS_TO_PIPELINE[normalizeWorkStatus(workStatus)] ?? "New Job";
  return {
    hcpId: asString(job.id),
    jobNumber,
    customerName: customerNameFromHcp(job.customer),
    phone: phoneFromHcp(job.customer),
    status: pipeline ?? mapped,
    statusIsPipeline: Boolean(pipeline),
    primaryTech: techFromHcp(job),
    scheduledStart: scheduledStartFromHcp(job),
    schedulePresent: hcpJobHasSchedule(job),
  };
}

async function fetchJobsPage(
  baseUrl: string,
  apiKey: string,
  page: number,
): Promise<{ jobs: unknown[]; totalPages: number | null }> {
  const url = buildHcpJobsListUrl(baseUrl, page);
  const response = await fetch(url, {
    headers: authHeaders(apiKey),
    cache: "no-store",
  });
  const rawText = await response.text().catch(() => "");
  let body: unknown = null;
  if (rawText) {
    try {
      body = JSON.parse(rawText) as unknown;
    } catch {
      body = rawText;
    }
  }
  if (!response.ok) {
    throw new Error(formatHcpHttpError(response.status, response.statusText, body));
  }
  const record = asRecord(body);
  const jobs = Array.isArray(record?.jobs) ? record.jobs : Array.isArray(body) ? body : [];
  const totalPages =
    typeof record?.total_pages === "number" && record.total_pages > 0 ? record.total_pages : null;
  return { jobs, totalPages };
}

export async function fetchHcpOpenJobs(
  env: NodeJS.ProcessEnv = process.env,
): Promise<HcpSyncResult> {
  const fetchedAt = Date.now();
  const apiKey = hcpApiKey(env);
  if (!apiKey) {
    return {
      ok: true,
      skipped: true,
      reason:
        "HOUSECALL_PRO_API_KEY (or HCP_API_KEY) is not set. Add a read-only Housecall Pro API key in the Vercel project env.",
      jobs: [],
      fetchedAt,
    };
  }

  try {
    const baseUrl = hcpBaseUrl(env);
    const collected: unknown[] = [];
    let page = 1;
    let pageCount = 0;

    while (page <= HCP_JOBS_MAX_PAGES) {
      const result = await fetchJobsPage(baseUrl, apiKey, page);
      collected.push(...result.jobs);
      pageCount += 1;
      const knownMore = result.totalPages != null && page < result.totalPages;
      const inferredMore =
        result.totalPages == null && result.jobs.length >= HCP_JOBS_PAGE_SIZE;
      if (!knownMore && !inferredMore) break;
      page += 1;
    }

    const jobs = collected
      .map(mapHcpJob)
      .filter((job): job is HcpOpenJob => job !== null);

    return {
      ok: true,
      skipped: false,
      jobs,
      fetchedAt,
      pageCount,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : "Housecall Pro request failed",
      jobs: [],
      fetchedAt,
    };
  }
}
