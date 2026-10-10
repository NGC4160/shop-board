import { isIsoDate, normalizeTimeframe } from "@/lib/jobs";

export const PART_STATUSES = [
  "Ordered",
  "Shipped",
  "Out for delivery",
  "Received",
  "Checked in",
  "Problem",
] as const;

export type PartStatus = (typeof PART_STATUSES)[number];

export const PART_CARRIERS = ["USPS", "UPS", "FedEx"] as const;

export type PartCarrier = (typeof PART_CARRIERS)[number];

export type PartLine = {
  id: string;
  customerName: string;
  jobNumber: string;
  partDescription: string;
  vendor: string;
  status: PartStatus;
  carrier: PartCarrier | "";
  trackingNumber: string;
  expectedDate: string;
  note: string;
  updatedAt: number;
};

export type PartLineInput = {
  id?: unknown;
  customerName?: unknown;
  jobNumber?: unknown;
  partDescription?: unknown;
  vendor?: unknown;
  status?: unknown;
  carrier?: unknown;
  trackingNumber?: unknown;
  expectedDate?: unknown;
  note?: unknown;
  updatedAt?: unknown;
};

export const PART_STATUS_CHIP: Record<PartStatus, string> = {
  Ordered: "bg-chip-parts text-chip-parts-fg",
  Shipped: "bg-chip-wait text-chip-wait-fg",
  "Out for delivery": "bg-chip-bay text-chip-bay-fg",
  Received: "bg-chip-ready text-chip-ready-fg",
  "Checked in": "bg-chip-check text-chip-check-fg",
  Problem: "bg-chip-clay text-chip-clay-fg",
};

const STATUS_RANK: Record<PartStatus, number> = {
  "Out for delivery": 0,
  Shipped: 1,
  Ordered: 2,
  Problem: 3,
  Received: 4,
  "Checked in": 5,
};

/** Obviously fake demo row — not a real customer, order, or tracking number. */
export const SAMPLE_PART_LINE: PartLine = {
  id: "sample-demo-part",
  customerName: "SAMPLE Customer",
  jobNumber: "SAMPLE",
  partDescription: "Example 48V charger — not a real order",
  vendor: "Example Vendor",
  status: "Ordered",
  carrier: "",
  trackingNumber: "",
  expectedDate: "",
  note: "Fake sample row for layout. Not a real shipment.",
  updatedAt: 0,
};

export function createPartId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `part-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyPartLine(id = createPartId(), now = Date.now()): PartLine {
  return {
    id,
    customerName: "",
    jobNumber: "",
    partDescription: "",
    vendor: "",
    status: "Ordered",
    carrier: "",
    trackingNumber: "",
    expectedDate: "",
    note: "",
    updatedAt: now,
  };
}

export function isPartStatus(value: string): value is PartStatus {
  return (PART_STATUSES as readonly string[]).includes(value);
}

export function isPartCarrier(value: string): value is PartCarrier {
  return (PART_CARRIERS as readonly string[]).includes(value);
}

export function clipText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizePartId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 128);
}

export function partIdError(value: unknown): string | null {
  const id = normalizePartId(value);
  if (!id) return "Part id is required";
  if (/\s/.test(id)) return "Part id cannot contain spaces";
  return null;
}

export function customerNameError(value: string): string | null {
  if (!value.trim()) return "Customer is required";
  return null;
}

export function partDescriptionError(value: string): string | null {
  if (!value.trim()) return "Part description is required";
  return null;
}

export function normalizeCarrier(value: unknown): PartCarrier | "" {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = PART_CARRIERS.find((carrier) => carrier.toLowerCase() === trimmed.toLowerCase());
  return match ?? "";
}

export function normalizeTrackingNumber(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, "").trim().slice(0, 40);
}

export function inferCarrier(trackingNumber: string): PartCarrier | "" {
  const n = normalizeTrackingNumber(trackingNumber);
  if (!n) return "";
  if (/^1Z[A-Z0-9]{16}$/i.test(n)) return "UPS";
  if (/^(9\d{19,21}|[A-Z]{2}\d{9}US)$/i.test(n)) return "USPS";
  if (/^\d{12}$|^\d{15}$/.test(n)) return "FedEx";
  return "";
}

export function trackingUrl(carrier: string, trackingNumber: string): string | null {
  const num = normalizeTrackingNumber(trackingNumber);
  if (!num) return null;
  const kind = normalizeCarrier(carrier) || inferCarrier(num);
  const encoded = encodeURIComponent(num);
  switch (kind) {
    case "USPS":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
    case "UPS":
      return `https://www.ups.com/track?tracknum=${encoded}`;
    case "FedEx":
      return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
    default:
      return null;
  }
}

export function parsePartPatch(value: unknown): { id: string; patch: Partial<PartLine> } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as PartLineInput;
  const id = normalizePartId(record.id);
  if (!id || partIdError(id)) return null;
  const patch: Partial<PartLine> = { id };
  if ("customerName" in record) patch.customerName = clipText(record.customerName, 120);
  if ("jobNumber" in record) patch.jobNumber = clipText(record.jobNumber, 32);
  if ("partDescription" in record) patch.partDescription = clipText(record.partDescription, 200);
  if ("vendor" in record) patch.vendor = clipText(record.vendor, 80);
  if ("status" in record) {
    const statusRaw = typeof record.status === "string" ? record.status.trim() : "";
    if (isPartStatus(statusRaw)) patch.status = statusRaw;
  }
  if ("carrier" in record) patch.carrier = normalizeCarrier(record.carrier);
  if ("trackingNumber" in record) patch.trackingNumber = normalizeTrackingNumber(record.trackingNumber);
  if ("expectedDate" in record) {
    patch.expectedDate = normalizeTimeframe(
      typeof record.expectedDate === "string" ? record.expectedDate : "",
    );
  }
  if ("note" in record) patch.note = clipText(record.note, 160);
  if (typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)) {
    patch.updatedAt = record.updatedAt;
  }
  return { id, patch };
}

export function sanitizePartLine(value: unknown, fallbackId?: string): PartLine | null {
  const parsed = parsePartPatch(value);
  const fallback = normalizePartId(fallbackId);
  const id = parsed?.id || fallback;
  if (!id || partIdError(id)) return null;
  return mergePartLine(null, { ...(parsed?.patch ?? {}), id });
}

export function sanitizeLoadedParts(value: unknown): PartLine[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const parts: PartLine[] = [];
  for (const item of value) {
    const line = sanitizePartLine(item);
    if (!line || seen.has(line.id)) continue;
    seen.add(line.id);
    parts.push(line);
  }
  return parts;
}

export function mergePartLine(current: PartLine | null, patch: Partial<PartLine>, now = Date.now()): PartLine {
  const base = current ?? emptyPartLine(patch.id || createPartId(), now);
  const next: PartLine = {
    ...base,
    ...patch,
    id: normalizePartId(patch.id) || base.id,
    customerName:
      patch.customerName !== undefined ? clipText(patch.customerName, 120) : base.customerName,
    jobNumber: patch.jobNumber !== undefined ? clipText(patch.jobNumber, 32) : base.jobNumber,
    partDescription:
      patch.partDescription !== undefined
        ? clipText(patch.partDescription, 200)
        : base.partDescription,
    vendor: patch.vendor !== undefined ? clipText(patch.vendor, 80) : base.vendor,
    status: patch.status && isPartStatus(patch.status) ? patch.status : base.status,
    carrier: patch.carrier !== undefined ? normalizeCarrier(patch.carrier) : base.carrier,
    trackingNumber:
      patch.trackingNumber !== undefined
        ? normalizeTrackingNumber(patch.trackingNumber)
        : base.trackingNumber,
    expectedDate:
      patch.expectedDate !== undefined
        ? normalizeTimeframe(patch.expectedDate)
        : base.expectedDate,
    note: patch.note !== undefined ? clipText(patch.note, 160) : base.note,
    updatedAt:
      patch.updatedAt !== undefined && Number.isFinite(patch.updatedAt) ? patch.updatedAt : now,
  };
  return next;
}

export function upsertPartLine(
  parts: readonly PartLine[],
  incoming: unknown,
  now = Date.now(),
): { ok: true; parts: PartLine[]; line: PartLine } | { ok: false; error: string } {
  const parsed = parsePartPatch(incoming);
  if (!parsed) return { ok: false, error: "A stable part id is required" };
  const existing = parts.find((item) => item.id === parsed.id) ?? null;
  const fields = { ...parsed.patch };
  delete fields.updatedAt;
  const line = mergePartLine(existing, fields, now);
  if (!existing) {
    return { ok: true, parts: [...parts, line], line };
  }
  return {
    ok: true,
    parts: parts.map((item) => (item.id === line.id ? line : item)),
    line,
  };
}

/** Accept a raw id string or an object with `id` (POST/DELETE body). */
export function parsePartIdInput(
  value: unknown,
): { ok: true; id: string } | { ok: false; error: string } {
  const raw =
    typeof value === "string" || value == null
      ? value
      : typeof value === "object"
        ? (value as { id?: unknown }).id
        : undefined;
  const error = partIdError(raw);
  if (error) return { ok: false, error };
  return { ok: true, id: normalizePartId(raw) };
}

/**
 * Remove one line by stable id. Other lines are unchanged.
 * Does not invent a replacement row.
 */
export function removePartLine(
  parts: readonly PartLine[],
  incoming: unknown,
):
  | { ok: true; parts: PartLine[]; removed: PartLine }
  | { ok: false; error: string; missing?: boolean } {
  const parsed = parsePartIdInput(incoming);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const removed = parts.find((item) => item.id === parsed.id);
  if (!removed) return { ok: false, error: "Part not found", missing: true };
  return {
    ok: true,
    parts: parts.filter((item) => item.id !== parsed.id),
    removed,
  };
}

export function partMatchesSearch(part: PartLine, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [part.customerName, part.jobNumber].join(" ").toLowerCase();
  return haystack.includes(needle);
}

export function filterParts(
  parts: readonly PartLine[],
  query: { status: string; search: string },
): PartLine[] {
  const status = query.status.trim();
  return parts.filter((part) => {
    if (status && status !== "all" && part.status !== status) return false;
    return partMatchesSearch(part, query.search);
  });
}

export function sortParts(parts: readonly PartLine[]): PartLine[] {
  return [...parts].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    const aDate = isIsoDate(a.expectedDate) ? a.expectedDate : "9999-99-99";
    const bDate = isIsoDate(b.expectedDate) ? b.expectedDate : "9999-99-99";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    const names = a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" });
    if (names !== 0) return names;
    return a.id.localeCompare(b.id);
  });
}

export function isBlankPartDraft(part: Pick<PartLine, "customerName" | "partDescription">): boolean {
  return !part.customerName.trim() && !part.partDescription.trim();
}
