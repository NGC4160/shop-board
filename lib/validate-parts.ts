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
  readDeletedAt,
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

    if ("destinationType" in line || "destinationName" in line) {
      const resolved = resolveDestinationInput(line);
      if (!resolved.ok) return { ok: false, error: `${label}: ${resolved.error}.` };
    }

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
    if ("deletedAt" in line && line.deletedAt != null) {
      if (typeof line.deletedAt !== "number" || !Number.isFinite(line.deletedAt) || line.deletedAt <= 0) {
        return { ok: false, error: `${label}: deletedAt must be a timestamp or null.` };
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
      deletedAt: readDeletedAt(line.deletedAt),
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
/**
 * Destination rules for a parts line.
 *
 * Legacy `customerName` still maps through `deriveDestinationFromCustomerName`
 * when `destinationType` / `destinationName` are absent. One board line has one
 * destination. "Kane & Inventory" is ambiguous and is kept as a single Other
 * line — it is not split into a customer plus stock.
 */

export const DESTINATION_TYPES = ["Inventory", "Customer", "Other"] as const;

export type DestinationType = (typeof DESTINATION_TYPES)[number];

export type DerivedDestination = {
  destinationType: DestinationType;
  destinationName: string;
  /**
   * True only for the mixed "Kane & Inventory" string.
   * Ambiguous: not one customer and not stock. The line stays one Other
   * destination; splitting is a bot/human data step, not an automatic one.
   */
  ambiguous: boolean;
};

const SHOP_OTHER_NAMES = new Set(["Shop cart", "Shop display"]);

export function isDestinationType(value: unknown): value is DestinationType {
  return typeof value === "string" && (DESTINATION_TYPES as readonly string[]).includes(value);
}

function clipDestinationName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Map a legacy customer string onto a destination.
 * Exact "Inventory" is stock with an empty name. "Shop cart" and "Shop display"
 * are Other plus that name. A value starting with "TBD" is Other plus the
 * original text. "Kane & Inventory" is Other plus the original text and is
 * flagged ambiguous. Anything else is Customer plus the name.
 */
export function deriveDestinationFromCustomerName(customerName: string): DerivedDestination {
  const name = clipDestinationName(customerName);
  if (name === "Inventory") {
    return { destinationType: "Inventory", destinationName: "", ambiguous: false };
  }
  if (SHOP_OTHER_NAMES.has(name)) {
    return { destinationType: "Other", destinationName: name, ambiguous: false };
  }
  if (name.startsWith("TBD")) {
    return { destinationType: "Other", destinationName: name, ambiguous: false };
  }
  // Ambiguous mixed order. One line, one destination — do not auto-split.
  if (name === "Kane & Inventory") {
    return { destinationType: "Other", destinationName: name, ambiguous: true };
  }
  return { destinationType: "Customer", destinationName: name, ambiguous: false };
}

/** Customer and Other need a name. Inventory must not have one. */
export function destinationError(type: string, name: string): string | null {
  if (!isDestinationType(type)) {
    return "Destination type must be Inventory, Customer, or Other";
  }
  const trimmed = clipDestinationName(name);
  if (type === "Inventory") {
    if (trimmed) return "Inventory destination cannot have a name";
    return null;
  }
  if (!trimmed) return "Destination name is required";
  return null;
}

/** Keep legacy customerName aligned with the destination during the transition. */
export function customerNameForDestination(type: DestinationType, name: string): string {
  if (type === "Inventory") return "Inventory";
  return clipDestinationName(name);
}

export type ResolvedDestination = {
  destinationType: DestinationType;
  destinationName: string;
  customerName: string;
  /** True when the new fields were missing and customerName was mapped. */
  derived: boolean;
  ambiguous: boolean;
};

/**
 * Resolve a write that may send the new fields, legacy customerName, or both.
 * Absent new fields use the legacy map. An explicit destinationType is checked
 * as an enum and is not repaired from customerName.
 */
export function resolveDestinationInput(
  record: object,
): { ok: true; destination: ResolvedDestination } | { ok: false; error: string } {
  const raw = record as {
    destinationType?: unknown;
    destinationName?: unknown;
    customerName?: unknown;
  };
  const hasType = Object.prototype.hasOwnProperty.call(raw, "destinationType") && raw.destinationType !== undefined;
  const hasName = Object.prototype.hasOwnProperty.call(raw, "destinationName") && raw.destinationName !== undefined;
  if (!hasType && !hasName) {
    const customerName = typeof raw.customerName === "string" ? raw.customerName : "";
    const derived = deriveDestinationFromCustomerName(customerName);
    const error = destinationError(derived.destinationType, derived.destinationName);
    if (error) return { ok: false, error };
    return {
      ok: true,
      destination: {
        destinationType: derived.destinationType,
        destinationName: derived.destinationName,
        customerName: customerNameForDestination(derived.destinationType, derived.destinationName),
        derived: true,
        ambiguous: derived.ambiguous,
      },
    };
  }
  if (!isDestinationType(raw.destinationType)) {
    return { ok: false, error: "Destination type must be Inventory, Customer, or Other" };
  }
  const destinationName = typeof raw.destinationName === "string" ? clipDestinationName(raw.destinationName) : "";
  const error = destinationError(raw.destinationType, destinationName);
  if (error) return { ok: false, error };
  const name = raw.destinationType === "Inventory" ? "" : destinationName;
  return {
    ok: true,
    destination: {
      destinationType: raw.destinationType,
      destinationName: name,
      customerName: customerNameForDestination(raw.destinationType, name),
      derived: false,
      ambiguous: false,
    },
  };
}
