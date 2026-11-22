import { hcpApiKey, hcpAuthHeaders, hcpBaseUrl, hcpErrorDetail, formatHcpHttpError } from "@/lib/hcp";
import { fetchWithRetry } from "@/lib/hcp-retry";
import { normalizeJobNumber } from "@/lib/jobs";
import {
  mergeJobPartUses,
  type HcpPartUse,
  type InventoryUsageSource,
} from "@/lib/inventory-usage";

/**
 * Housecall Pro lists material line items and material job inputs.
 * It does not list miscellaneous job inputs (permits, fees, and other
 * non-material job costs). Those costs are not read.
 */
export const HCP_MISCELLANEOUS_JOB_INPUTS_GAP =
  "Housecall Pro's public API lists material line items (GET /jobs/{id}/line_items, kind materials) and material job inputs (GET /jobs/{id}/job_input_materials, with part_number). It does not list miscellaneous job inputs. A miscellaneous cost is deducted only when it is entered as a material line or a material job input.";

const COMPLETED_WORK_STATUSES = new Set(["complete rated", "complete unrated", "completed"]);

export type HcpJobPartsResult =
  | {
      ok: true;
      missing: false;
      hcpJobId: string;
      jobNumber: string;
      customerId: string;
      completed: boolean;
      completedAt: number | null;
      materials: HcpPartUse[] | null;
      jobInputs: HcpPartUse[] | null;
      materialsError: string | null;
      jobInputsError: string | null;
    }
  | { ok: false; missing: boolean; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseHcpDateTime(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeWorkStatus(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ");
}

export function hcpJobIsCompleted(job: unknown): boolean {
  const record = asRecord(job);
  if (!record) return false;
  return COMPLETED_WORK_STATUSES.has(normalizeWorkStatus(asString(record.work_status)));
}

export function hcpCompletedAt(job: unknown): number | null {
  const record = asRecord(job);
  if (!record) return null;
  const timestamps = asRecord(record.work_timestamps);
  return parseHcpDateTime(timestamps?.completed_at);
}

function customerIdFromJob(job: unknown): string {
  const record = asRecord(job);
  const customer = asRecord(record?.customer);
  return asString(customer?.id).slice(0, 128);
}

function lineQty(record: Record<string, unknown>): number {
  const quantity = finiteNumber(record.quantity);
  if (quantity !== undefined) return quantity;
  const hundredths = finiteNumber(record.qty_in_hundredths);
  if (hundredths !== undefined) return hundredths / 100;
  return 0;
}

function explicitPartNumber(record: Record<string, unknown>): string {
  return asString(record.part_number) || asString(record.partNumber) || asString(record.sku);
}

function toPartUse(
  source: InventoryUsageSource,
  record: Record<string, unknown>,
  lineId: string,
): HcpPartUse | null {
  if (!lineId) return null;
  const qty = lineQty(record);
  if (!(qty > 0)) return null;
  return {
    source,
    lineId,
    partNumber: explicitPartNumber(record).slice(0, 80),
    partName: asString(record.name).slice(0, 200),
    description: asString(record.description).slice(0, 200),
    hcpMaterialId: asString(record.service_item_id) || asString(record.material_id) || null,
    qty,
  };
}

/** Material line items only. Labor, discounts, and gratuity are not stock. */
export function materialUsesFromLineItems(body: unknown): HcpPartUse[] {
  const record = asRecord(body);
  const rows = Array.isArray(record?.data)
    ? record.data
    : Array.isArray(record?.line_items)
      ? record.line_items
      : Array.isArray(body)
        ? body
        : [];
  const uses: HcpPartUse[] = [];
  for (const row of rows) {
    const line = asRecord(row);
    if (!line) continue;
    const kind = asString(line.kind).toLowerCase() || asString(line.type).toLowerCase();
    if (kind !== "materials" && kind !== "material") continue;
    const use = toPartUse("materials", line, asString(line.id));
    if (use) uses.push(use);
  }
  return uses;
}

/** Material job inputs (`GET /jobs/{id}/job_input_materials`). */
export function materialUsesFromJobInputs(body: unknown): HcpPartUse[] {
  const record = asRecord(body);
  const rows = Array.isArray(record?.job_input_materials)
    ? record.job_input_materials
    : Array.isArray(record?.data)
      ? record.data
      : Array.isArray(body)
        ? body
        : [];
  const uses: HcpPartUse[] = [];
  for (const row of rows) {
    const line = asRecord(row);
    if (!line) continue;
    const use = toPartUse("job_inputs", line, asString(line.uuid) || asString(line.id));
    if (use) uses.push(use);
  }
  return uses;
}

export function mergeMaterialsAndJobInputs(
  materials: readonly HcpPartUse[],
  jobInputs: readonly HcpPartUse[],
): HcpPartUse[] {
  return mergeJobPartUses(materials, jobInputs);
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text().catch(() => "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/**
 * One Housecall GET. 429, 5xx, and network errors are retried inside
 * `fetchWithRetry` (up to 4 attempts). This poll does not retry the whole
 * list again after that — a second full pass would stack on the in-fetch
 * retry and can run the cron into its time limit.
 */
async function hcpGet(url: URL, apiKey: string, env: NodeJS.ProcessEnv): Promise<{ status: number; body: unknown }> {
  const response = await fetchWithRetry(url, {
    headers: hcpAuthHeaders(apiKey, env),
    cache: "no-store",
  });
  const body = await readJson(response);
  return { status: response.status, body };
}

export async function fetchHcpJobParts(
  hcpJobId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HcpJobPartsResult> {
  const apiKey = hcpApiKey(env);
  if (!apiKey) {
    return { ok: false, missing: false, error: "HOUSECALL_PRO_API_KEY is not set" };
  }
  const id = hcpJobId.trim();
  if (!id) return { ok: false, missing: false, error: "Housecall Pro job id is required" };
  const base = hcpBaseUrl(env);

  try {
    const jobResponse = await hcpGet(new URL(`${base}/jobs/${encodeURIComponent(id)}`), apiKey, env);
    if (jobResponse.status === 404) {
      return { ok: false, missing: true, error: "Housecall Pro job was not found" };
    }
    if (jobResponse.status < 200 || jobResponse.status >= 300) {
      return {
        ok: false,
        missing: false,
        error: formatHcpHttpError(jobResponse.status, "", jobResponse.body),
      };
    }
    const job = asRecord(jobResponse.body);
    const materialsUrl = new URL(`${base}/jobs/${encodeURIComponent(id)}/line_items`);
    const inputsUrl = new URL(`${base}/jobs/${encodeURIComponent(id)}/job_input_materials`);
    const [materialsResponse, inputsResponse] = await Promise.all([
      hcpGet(materialsUrl, apiKey, env),
      hcpGet(inputsUrl, apiKey, env),
    ]);

    const materials =
      materialsResponse.status >= 200 && materialsResponse.status < 300
        ? materialUsesFromLineItems(materialsResponse.body)
        : null;
    const jobInputs =
      inputsResponse.status >= 200 && inputsResponse.status < 300
        ? materialUsesFromJobInputs(inputsResponse.body)
        : null;

    return {
      ok: true,
      missing: false,
      hcpJobId: asString(job?.id) || id,
      jobNumber: normalizeJobNumber(asString(job?.invoice_number) || asString(job?.job_number)),
      customerId: customerIdFromJob(job),
      completed: hcpJobIsCompleted(job),
      completedAt: hcpCompletedAt(job),
      materials,
      jobInputs,
      materialsError:
        materials == null ? formatHcpHttpError(materialsResponse.status, "", materialsResponse.body) : null,
      jobInputsError: jobInputs == null ? formatHcpHttpError(inputsResponse.status, "", inputsResponse.body) : null,
    };
  } catch (error) {
    return {
      ok: false,
      missing: false,
      error: error instanceof Error ? error.message : "Housecall Pro request failed",
    };
  }
}

export type CompletedHcpJobRef = {
  hcpJobId: string;
  completedAt: number | null;
};

export type CompletedJobsListMode = "sorted" | "filtered" | "scan";

/**
 * Completed-job list. The filter value is the documented enum `completed`
 * (the job body then says "complete rated" or "complete unrated").
 * `sort_by=updated_at` puts a cart that was opened days ago and finished
 * today on an early page. Default sort is `created_at`, which hides that cart
 * behind newer jobs.
 */
export function completedJobsListUrl(baseUrl: string, page: number, mode: CompletedJobsListMode): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/jobs`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", "100");
  if (mode !== "scan") url.searchParams.append("work_status[]", "completed");
  if (mode === "sorted") {
    url.searchParams.set("sort_by", "updated_at");
    url.searchParams.set("sort_direction", "desc");
  }
  return url;
}

function updatedAtFromJob(job: Record<string, unknown>): number | null {
  return parseHcpDateTime(job.updated_at);
}

function downgradeListMode(mode: CompletedJobsListMode): CompletedJobsListMode | null {
  if (mode === "sorted") return "filtered";
  if (mode === "filtered") return "scan";
  return null;
}

/**
 * Recently completed jobs. Jobs with no `completed_at` are skipped so an
 * undated historical job is not deducted. A full page whose `updated_at` is
 * before `sinceMs` ends the scan only while the list is sorted by
 * `updated_at` descending. A 400 drops `sort_by`, then the status filter,
 * because older Housecall responses rejected those parameters.
 */
export async function listCompletedHcpJobsSince(
  sinceMs: number,
  env: NodeJS.ProcessEnv = process.env,
  maxPages = 10,
): Promise<{ ok: true; jobs: CompletedHcpJobRef[] } | { ok: false; error: string }> {
  const apiKey = hcpApiKey(env);
  if (!apiKey) return { ok: false, error: "HOUSECALL_PRO_API_KEY is not set" };
  const base = hcpBaseUrl(env);
  const jobs: CompletedHcpJobRef[] = [];
  const seen = new Set<string>();
  let mode: CompletedJobsListMode = "sorted";

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      let response = await hcpGet(completedJobsListUrl(base, page, mode), apiKey, env);
      while (response.status === 400) {
        const nextMode = downgradeListMode(mode);
        if (!nextMode) break;
        mode = nextMode;
        response = await hcpGet(completedJobsListUrl(base, page, mode), apiKey, env);
      }
      if (response.status < 200 || response.status >= 300) {
        const detail = hcpErrorDetail(response.body);
        return {
          ok: false,
          error: formatHcpHttpError(response.status, "", detail || response.body),
        };
      }
      const record = asRecord(response.body);
      const rows = Array.isArray(record?.jobs) ? record.jobs : [];
      if (rows.length === 0) break;
      let pageOlderThanSince = mode === "sorted" && rows.length > 0;
      for (const row of rows) {
        const job = asRecord(row);
        if (!job) continue;
        if (mode === "sorted") {
          const updatedAt = updatedAtFromJob(job);
          if (updatedAt == null || updatedAt >= sinceMs) pageOlderThanSince = false;
        }
        if (!hcpJobIsCompleted(job)) continue;
        const id = asString(job.id);
        if (!id || seen.has(id)) continue;
        const completedAt = hcpCompletedAt(job);
        if (completedAt == null || completedAt < sinceMs) continue;
        seen.add(id);
        jobs.push({ hcpJobId: id, completedAt });
      }
      const totalPages = typeof record?.total_pages === "number" ? record.total_pages : null;
      if (totalPages != null && page >= totalPages) break;
      if (rows.length < 100) break;
      if (pageOlderThanSince) break;
    }
    return { ok: true, jobs };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Housecall Pro request failed" };
  }
}
