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
