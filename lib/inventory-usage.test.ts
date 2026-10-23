import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InventoryItem } from "./inventory.ts";
import {
  applyJobPartUsage,
  mergeJobPartUses,
  type HcpPartUse,
  type InventoryJobParts,
} from "./inventory-usage.ts";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "inv-1",
    sourcePartLineId: null,
    hcpMaterialId: null,
    partName: "Example solenoid",
    partNumber: "PN-9",
    supplier: "Example Vendor",
    description: "Shelf",
    qtyOnHand: 10,
    minQty: null,
    minOrderQty: null,
    unitValue: 4,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function use(overrides: Partial<HcpPartUse> = {}): HcpPartUse {
  return {
    source: "materials",
    lineId: "line-a",
    partNumber: "PN-9",
    partName: "Example solenoid",
    description: "",
    hcpMaterialId: null,
    qty: 2,
    ...overrides,
  };
}

function job(parts: HcpPartUse[], overrides: Partial<InventoryJobParts> = {}): InventoryJobParts {
  return {
    hcpJobId: "job-1",
    jobNumber: "173128",
    customerId: "cus-sample",
    completed: true,
    knownSources: ["materials", "job_inputs"],
    parts,
    ...overrides,
  };
}

describe("job part usage", () => {
  it("deducts once when the same completed job is applied again", () => {
    const first = applyJobPartUsage([item()], [], [], job([use()]), 100);
    assert.equal(first.inventory[0]?.qtyOnHand, 8);
    assert.equal(first.usage.length, 1);
    assert.equal(first.usage[0]?.extendedValue, 8);
    assert.equal(first.usage[0]?.unitValue, 4);
    assert.equal(first.usage[0]?.source, "materials");
    assert.equal(first.usage[0]?.jobNumber, "173128");
    assert.equal(first.usage[0]?.customerId, "cus-sample");

    const second = applyJobPartUsage(first.inventory, first.usage, first.flags, job([use()]), 200);
    assert.equal(second.inventory[0]?.qtyOnHand, 8);
    assert.equal(second.usage.length, 1);
    assert.equal(second.usage[0]?.appliedAt, 100);
    assert.equal(second.usage[0]?.reversedAt, null);
  });

  it("merges material line items and job inputs and deducts both", () => {
    const materials = [use({ lineId: "mat-1", qty: 2, partNumber: "PN-9" })];
    const inputs = [
      use({
        source: "job_inputs",
        lineId: "in-1",
        qty: 3,
        partNumber: "PN-2",
        partName: "Example cable",
      }),
    ];
    const merged = mergeJobPartUses(materials, inputs);
    assert.equal(merged.length, 2);
    assert.deepEqual(
      merged.map((part) => part.source),
      ["materials", "job_inputs"],
    );

    const cable = item({
      id: "inv-2",
      partNumber: "PN-2",
      partName: "Example cable",
      qtyOnHand: 5,
      unitValue: 2,
    });
    const applied = applyJobPartUsage([item(), cable], [], [], job(merged), 100);
    assert.equal(applied.inventory.find((row) => row.id === "inv-1")?.qtyOnHand, 8);
    assert.equal(applied.inventory.find((row) => row.id === "inv-2")?.qtyOnHand, 2);
    const inputRow = applied.usage.find((row) => row.source === "job_inputs");
    assert.equal(inputRow?.qty, 3);
    assert.equal(inputRow?.extendedValue, 6);
    assert.equal(applied.flags.length, 0);
  });

  it("flags a Housecall part with no inventory row and does not deduct", () => {
    const applied = applyJobPartUsage([item()], [], [], job([use({ partNumber: "NO-SUCH", lineId: "x" })]), 100);
    assert.equal(applied.inventory[0]?.qtyOnHand, 10);
    assert.equal(applied.flags.length, 1);
    assert.equal(applied.flags[0]?.kind, "hcp_part_without_inventory");
    assert.equal(applied.usage[0]?.inventoryItemId, null);
  });

  it("flags usage whose Housecall line is gone and puts the qty back", () => {
    const first = applyJobPartUsage([item()], [], [], job([use()]), 100);
    const removed = applyJobPartUsage(first.inventory, first.usage, first.flags, job([]), 200);
    assert.equal(removed.inventory[0]?.qtyOnHand, 10);
    assert.equal(removed.usage[0]?.reversedAt, 200);
    assert.equal(removed.usage[0]?.reverseReason, "line_removed");
    assert.equal(removed.flags.some((flag) => flag.kind === "usage_without_hcp_line"), true);

    const again = applyJobPartUsage(removed.inventory, removed.usage, removed.flags, job([]), 300);
    assert.equal(again.inventory[0]?.qtyOnHand, 10);
  });

  it("puts qty back when the job is reopened and deducts again if it is completed", () => {
    const first = applyJobPartUsage([item()], [], [], job([use({ qty: 1 })]), 100);
    const reopened = applyJobPartUsage(
      first.inventory,
      first.usage,
      first.flags,
      job([use({ qty: 1 })], { completed: false }),
      200,
    );
    assert.equal(reopened.inventory[0]?.qtyOnHand, 10);
    assert.equal(reopened.usage[0]?.reverseReason, "job_reopened");
    assert.equal(reopened.flags[0]?.kind, "usage_without_hcp_line");

    const completed = applyJobPartUsage(reopened.inventory, reopened.usage, reopened.flags, job([use({ qty: 1 })]), 300);
    assert.equal(completed.inventory[0]?.qtyOnHand, 9);
    assert.equal(completed.usage[0]?.reversedAt, null);
    assert.equal(completed.flags.length, 0);
  });

  it("does not reverse job-input usage when that source was not read", () => {
    const first = applyJobPartUsage(
      [item()],
      [],
      [],
      job([use({ source: "job_inputs", lineId: "in-1", qty: 2 })]),
      100,
    );
    assert.equal(first.inventory[0]?.qtyOnHand, 8);
    const partial = applyJobPartUsage(
      first.inventory,
      first.usage,
      first.flags,
      job([], { knownSources: ["materials"] }),
      200,
    );
    assert.equal(partial.inventory[0]?.qtyOnHand, 8);
    assert.equal(partial.usage[0]?.reversedAt, null);
    assert.equal(partial.flags.length, 0);
  });

  it("matches an explicit HCP material id and does not fuzzy-match a similar name", () => {
    const linked = item({ id: "inv-link", partNumber: "", hcpMaterialId: "pb_mat_1", qtyOnHand: 4 });
    const byId = applyJobPartUsage(
      [linked],
      [],
      [],
      job([use({ partNumber: "", partName: "Example solenoid kit", hcpMaterialId: "pb_mat_1", qty: 1 })]),
      100,
    );
    assert.equal(byId.inventory[0]?.qtyOnHand, 3);
    assert.equal(byId.flags.length, 0);

    const fuzzy = applyJobPartUsage(
      [item({ partNumber: "PN-9", partName: "Example solenoid" })],
      [],
      [],
      job([use({ partNumber: "", partName: "Example solenoid kit", hcpMaterialId: null })]),
      100,
    );
    assert.equal(fuzzy.inventory[0]?.qtyOnHand, 10);
    assert.equal(fuzzy.flags[0]?.kind, "hcp_part_without_inventory");
  });
});
