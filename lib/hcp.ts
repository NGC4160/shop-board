import {
  PRIMARY_TECHS,
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

const OPEN_QUERY_STATUSES = ["unscheduled", "scheduled", "in_progress"] as const;

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

function normalizeWorkStatus(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ");
}

export function isOpenHcpWorkStatus(workStatus: string): boolean {
  const normalized = normalizeWorkStatus(workStatus);
  if (!normalized) return true;
  return !CLOSED_WORK_STATUSES.has(normalized);
}

export function customerNameFromHcp(customer: unknown): string {
  const record = asRecord(customer);
  if (!record) return "";
  const company = asString(record.company) || asString(record.company_name);
  if (company) return company;
  return [asString(record.first_name), asString(record.last_name)].filter(Boolean).join(" ");
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
  const jobNumber = normalizeJobNumber(asString(job.invoice_number) || asString(job.job_number));
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
  };
}

async function fetchJobsPage(
  baseUrl: string,
  apiKey: string,
  page: number,
): Promise<{ jobs: unknown[]; totalPages: number }> {
  const url = new URL(`${baseUrl}/jobs`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", "100");
  url.searchParams.set("sort_by", "invoice_number");
  url.searchParams.set("sort_direction", "asc");
  for (const status of OPEN_QUERY_STATUSES) {
    url.searchParams.append("work_status", status);
  }

  const response = await fetch(url, {
    headers: authHeaders(apiKey),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const record = asRecord(body);
    const message =
      asString(record?.error) ||
      asString(record?.message) ||
      `Housecall Pro ${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  const record = asRecord(body);
  const jobs = Array.isArray(record?.jobs) ? record.jobs : Array.isArray(body) ? body : [];
  const totalPages =
    typeof record?.total_pages === "number" && record.total_pages > 0 ? record.total_pages : 1;
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
    let totalPages = 1;
    do {
      const result = await fetchJobsPage(baseUrl, apiKey, page);
      collected.push(...result.jobs);
      totalPages = result.totalPages;
      page += 1;
    } while (page <= totalPages && page <= 40);

    const jobs = collected
      .map(mapHcpJob)
      .filter((job): job is HcpOpenJob => job !== null);

    return {
      ok: true,
      skipped: false,
      jobs,
      fetchedAt,
      pageCount: totalPages,
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
