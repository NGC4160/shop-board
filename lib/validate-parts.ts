import {
  PART_CARRIERS,
  PART_STATUSES,
  customerNameError,
  isPartStatus,
  mergePartLine,
  normalizeCarrier,
  normalizePartId,
  partDescriptionError,
  partIdError,
  type PartLine,
} from "@/lib/parts";
import { isIsoDate } from "@/lib/jobs/timeframe";
import type { ValidateResult } from "@/lib/validate-board";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function partLabel(index: number, id: string): string {
  const row = index + 1;
  return id ? `Part ${row} (${id})` : `Part ${row}`;
}

/**
 * Strict check for PUT /api/parts. A bad line fails the save with a
 * line-specific message. GET still loads older documents leniently.
 */
export function validatePartsPut(body: unknown): ValidateResult<PartLine[]> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Parts payload must be a JSON object." };
  if (!Array.isArray(record.parts)) {
    return { ok: false, error: "parts must be an array. Refresh the parts board and try again." };
  }

  const parts: PartLine[] = [];
  const seenIds = new Map<string, number>();

  for (let index = 0; index < record.parts.length; index += 1) {
    const line = asRecord(record.parts[index]);
    if (!line) return { ok: false, error: `Part ${index + 1}: each part must be an object.` };
    const id = normalizePartId(line.id);
    const idError = partIdError(line.id);
    const label = partLabel(index, id);
    if (idError) return { ok: false, error: `${label}: ${idError}.` };
    if (seenIds.has(id)) {
      return { ok: false, error: `${label}: id ${id} is already used by part ${seenIds.get(id)}.` };
    }
    seenIds.set(id, index + 1);

    if (typeof line.customerName !== "string") {
      return { ok: false, error: `${label}: customer is required.` };
    }
    const customerError = customerNameError(line.customerName);
    if (customerError) return { ok: false, error: `${label}: ${customerError}.` };

    if (typeof line.partDescription !== "string") {
      return { ok: false, error: `${label}: part description is required.` };
    }
    const descriptionError = partDescriptionError(line.partDescription);
    if (descriptionError) return { ok: false, error: `${label}: ${descriptionError}.` };

    if (typeof line.status !== "string" || !isPartStatus(line.status.trim())) {
      return {
        ok: false,
        error: `${label}: status must be one of ${PART_STATUSES.join(", ")}.`,
      };
    }

    if ("jobNumber" in line && line.jobNumber != null && typeof line.jobNumber !== "string") {
      return { ok: false, error: `${label}: job # must be text.` };
    }
    if ("vendor" in line && line.vendor != null && typeof line.vendor !== "string") {
      return { ok: false, error: `${label}: vendor must be text.` };
    }
    if ("note" in line && line.note != null && typeof line.note !== "string") {
      return { ok: false, error: `${label}: note must be text.` };
    }
    if ("trackingNumber" in line && line.trackingNumber != null && typeof line.trackingNumber !== "string") {
      return { ok: false, error: `${label}: tracking number must be text.` };
    }

    if ("carrier" in line && line.carrier != null && line.carrier !== "") {
      if (typeof line.carrier !== "string") {
        return { ok: false, error: `${label}: carrier must be text.` };
      }
      const carrier = line.carrier.trim();
      if (carrier && !normalizeCarrier(carrier)) {
        return {
          ok: false,
          error: `${label}: carrier must be empty or one of ${PART_CARRIERS.join(", ")}.`,
        };
      }
    }

    if ("expectedDate" in line && line.expectedDate != null && line.expectedDate !== "") {
      if (typeof line.expectedDate !== "string") {
        return { ok: false, error: `${label}: expected date must be YYYY-MM-DD or empty.` };
      }
      const expected = line.expectedDate.trim();
      if (expected && !isIsoDate(expected)) {
        return { ok: false, error: `${label}: expected date must be YYYY-MM-DD or empty.` };
      }
    }

    if ("updatedAt" in line && line.updatedAt != null) {
      if (typeof line.updatedAt !== "number" || !Number.isFinite(line.updatedAt)) {
        return { ok: false, error: `${label}: updatedAt must be a number.` };
      }
    }

    const merged = mergePartLine(null, {
      id,
      customerName: line.customerName,
      jobNumber: typeof line.jobNumber === "string" ? line.jobNumber : "",
      partDescription: line.partDescription,
      vendor: typeof line.vendor === "string" ? line.vendor : "",
      status: line.status.trim() as PartLine["status"],
      carrier: normalizeCarrier(line.carrier),
      trackingNumber: typeof line.trackingNumber === "string" ? line.trackingNumber : "",
      expectedDate: typeof line.expectedDate === "string" ? line.expectedDate : "",
      note: typeof line.note === "string" ? line.note : "",
      updatedAt: typeof line.updatedAt === "number" ? line.updatedAt : undefined,
    });
    parts.push(merged);
  }

  return { ok: true, value: parts };
}

/** POST field checks for values the lenient patch parser would otherwise ignore. */
export function validatePartUpsertFields(incoming: unknown): string | null {
  const record = asRecord(incoming);
  if (!record) return null;
  if ("status" in record) {
    const status = typeof record.status === "string" ? record.status.trim() : "";
    if (!isPartStatus(status)) {
      return `Status must be one of ${PART_STATUSES.join(", ")}.`;
    }
  }
  if ("expectedDate" in record && record.expectedDate != null && record.expectedDate !== "") {
    if (typeof record.expectedDate !== "string" || !isIsoDate(record.expectedDate.trim())) {
      return "Expected date must be YYYY-MM-DD or empty.";
    }
  }
  if ("carrier" in record && record.carrier != null && record.carrier !== "") {
    if (typeof record.carrier !== "string" || !normalizeCarrier(record.carrier)) {
      return `Carrier must be empty or one of ${PART_CARRIERS.join(", ")}.`;
    }
  }
  return null;
}
