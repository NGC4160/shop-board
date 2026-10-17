import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveDestinationFromCustomerName,
  destinationError,
  resolveDestinationInput,
} from "./validate-parts.ts";
import { sanitizePartLine } from "./parts.ts";

describe("legacy customerName destination", () => {
  it("maps exact Inventory to stock with an empty name", () => {
    const derived = deriveDestinationFromCustomerName("Inventory");
    assert.equal(derived.destinationType, "Inventory");
    assert.equal(derived.destinationName, "");
    assert.equal(derived.ambiguous, false);
  });

  it("maps Shop cart and Shop display to Other plus that name", () => {
    for (const name of ["Shop cart", "Shop display"]) {
      const derived = deriveDestinationFromCustomerName(name);
      assert.equal(derived.destinationType, "Other");
      assert.equal(derived.destinationName, name);
      assert.equal(derived.ambiguous, false);
    }
  });

  it("maps values starting with TBD to Other plus the original text", () => {
    for (const name of ["TBD", "TBD (PO: small tools)", "TBD (PO: Inventory)"]) {
      const derived = deriveDestinationFromCustomerName(name);
      assert.equal(derived.destinationType, "Other");
      assert.equal(derived.destinationName, name);
      assert.equal(derived.ambiguous, false);
    }
  });

  it("keeps Kane & Inventory as one ambiguous Other line", () => {
    // Ambiguous mixed order: not split into a customer line plus stock.
    const derived = deriveDestinationFromCustomerName("Kane & Inventory");
    assert.equal(derived.destinationType, "Other");
    assert.equal(derived.destinationName, "Kane & Inventory");
    assert.equal(derived.ambiguous, true);
  });

  it("maps any other name to Customer plus that name", () => {
    const derived = deriveDestinationFromCustomerName("  Pearson  ");
    assert.equal(derived.destinationType, "Customer");
    assert.equal(derived.destinationName, "Pearson");
    assert.equal(derived.ambiguous, false);
  });

  it("derives on load when the new fields are absent", () => {
    const line = sanitizePartLine({
      id: "line-shop",
      customerName: "Shop cart",
      partDescription: "Vinyl",
    });
    assert.ok(line);
    assert.equal(line.destinationType, "Other");
    assert.equal(line.destinationName, "Shop cart");
    assert.equal(line.customerName, "Shop cart");
  });
});

describe("destination validation", () => {
  it("requires a known destination type", () => {
    assert.equal(
      destinationError("Bay", ""),
      "Destination type must be Inventory, Customer, or Other",
    );
    const rejected = resolveDestinationInput({ destinationType: "Bay", destinationName: "Pearson" });
    assert.equal(rejected.ok, false);
  });

  it("requires a name for Customer and Other and forbids one for Inventory", () => {
    assert.equal(destinationError("Customer", "  "), "Destination name is required");
    assert.equal(destinationError("Other", ""), "Destination name is required");
    assert.equal(destinationError("Inventory", "Pearson"), "Inventory destination cannot have a name");
    assert.equal(destinationError("Inventory", ""), null);
    assert.equal(destinationError("Customer", "Pearson"), null);
  });

  it("accepts explicit destination fields", () => {
    const resolved = resolveDestinationInput({
      destinationType: "Other",
      destinationName: "Shop display",
      customerName: "ignored",
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.destination.destinationType, "Other");
    assert.equal(resolved.destination.destinationName, "Shop display");
    assert.equal(resolved.destination.customerName, "Shop display");
    assert.equal(resolved.destination.derived, false);
  });

  it("keeps accepting legacy customerName when the new fields are absent", () => {
    const resolved = resolveDestinationInput({ customerName: "Inventory" });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.destination.destinationType, "Inventory");
    assert.equal(resolved.destination.destinationName, "");
    assert.equal(resolved.destination.derived, true);
    assert.equal(resolved.destination.ambiguous, false);
  });

  it("does not repair an explicit invalid destination from customerName", () => {
    const resolved = resolveDestinationInput({
      destinationType: "Inventory",
      destinationName: "Pearson",
      customerName: "Pearson",
    });
    assert.equal(resolved.ok, false);
  });
});
