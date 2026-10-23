import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HcpJobPartsResult } from "./hcp-job-parts.ts";
import { emptySharedPartsDocument } from "./parts-board.ts";
import type { InventoryItem } from "./inventory.ts";
import { syncInventoryDocument } from "./inventory-hcp-sync.ts";
import type { HcpPartUse } from "./inventory-usage.ts";

const env = { HOUSECALL_PRO_API_KEY: "test-key" } as NodeJS.ProcessEnv;

function stock(overrides: Partial<InventoryItem> = {}): InventoryItem {
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

function material(overrides: Partial<HcpPartUse> = {}): HcpPartUse {
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

function jobResult(overrides: Partial<Extract<HcpJobPartsResult, { ok: true }>> = {}): HcpJobPartsResult {
  return {
    ok: true,
    missing: false,
    hcpJobId: "job-1",
    jobNumber: "173128",
    customerId: "cus-sample",
    completed: true,
    completedAt: 1_700_000_000_000,
    materials: [material()],
    jobInputs: [
      material({
        source: "job_inputs",
        lineId: "in-1",
        partNumber: "PN-2",
        partName: "Example cable",
        qty: 1,
      }),
    ],
    materialsError: null,
    jobInputsError: null,
    ...overrides,
  };
}

describe("inventory HCP poll", () => {
  it("deducts materials and job inputs once when the same completed job is polled again", async () => {
    const start = emptySharedPartsDocument(1);
    start.inventory = [
      stock(),
      stock({ id: "inv-2", partNumber: "PN-2", partName: "Example cable", qtyOnHand: 5, unitValue: 3 }),
    ];
    const fetchJob = async () => jobResult();
    const listCompleted = async () => ({
      ok: true as const,
      jobs: [{ hcpJobId: "job-1", completedAt: 1_700_000_000_000 }],
    });
    const first = await syncInventoryDocument(start, {
      mode: "poll",
      now: 1_700_000_100_000,
      env,
      fetchJob,
      listCompleted,
    });
    assert.equal(first.ok, true);
    if (!first.ok || first.skipped) return;
    assert.equal(first.doc.inventory.find((row) => row.id === "inv-1")?.qtyOnHand, 8);
    assert.equal(first.doc.inventory.find((row) => row.id === "inv-2")?.qtyOnHand, 4);
    assert.equal(first.doc.inventoryUsage.length, 2);
    assert.equal(first.doc.inventoryFlags.length, 0);
    const input = first.doc.inventoryUsage.find((row) => row.source === "job_inputs");
    assert.equal(input?.extendedValue, 3);
    assert.equal(first.doc.inventorySync?.since, 1_700_000_100_000);

    const second = await syncInventoryDocument(first.doc, {
      mode: "poll",
      now: 1_700_000_200_000,
      env,
      fetchJob,
      listCompleted,
    });
    assert.equal(second.ok, true);
    if (!second.ok || second.skipped) return;
    assert.equal(second.doc.inventory.find((row) => row.id === "inv-1")?.qtyOnHand, 8);
    assert.equal(second.doc.inventory.find((row) => row.id === "inv-2")?.qtyOnHand, 4);
    assert.equal(second.doc.inventoryUsage.length, 2);
    assert.equal(second.doc.inventoryUsage.every((row) => row.reversedAt == null), true);
  });

  it("does not move the poll cursor when a job read fails", async () => {
    const start = emptySharedPartsDocument(1);
    const failed = await syncInventoryDocument(start, {
      mode: "poll",
      now: 1_700_000_100_000,
      env,
      listCompleted: async () => ({ ok: true, jobs: [{ hcpJobId: "job-1", completedAt: 1_700_000_000_000 }] }),
      fetchJob: async () => ({ ok: false, missing: false, error: "Housecall Pro timed out" }),
    });
    assert.equal(failed.ok, true);
    if (!failed.ok || failed.skipped) return;
    assert.equal(failed.doc.inventorySync?.since, null);
    assert.equal(failed.doc.inventoryUsage.length, 0);
  });

  it("flags an unmatched part and leaves on-hand qty alone", async () => {
    const start = emptySharedPartsDocument(1);
    start.inventory = [stock()];
    const result = await syncInventoryDocument(start, {
      mode: "webhook",
      now: 1_700_000_100_000,
      env,
      jobId: "job-1",
      fetchJob: async () =>
        jobResult({
          jobInputs: [],
          materials: [material({ partNumber: "NO-SUCH", lineId: "x", qty: 4 })],
        }),
    });
    assert.equal(result.ok, true);
    if (!result.ok || result.skipped) return;
    assert.equal(result.doc.inventory[0]?.qtyOnHand, 10);
    assert.equal(result.doc.inventoryFlags[0]?.kind, "hcp_part_without_inventory");
    assert.equal(result.doc.inventorySync?.since, null);
  });
});
