import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptySharedPartsDocument } from "./parts-board.ts";
import {
  applySharedInventorySnapshot,
  getInventorySnapshot,
  resetInventoryStoreForTests,
} from "./inventory-store.ts";

describe("inventory page snapshot", () => {
  it("keeps usage and flags that arrived with the shared document", () => {
    resetInventoryStoreForTests();
    const doc = emptySharedPartsDocument(50);
    doc.inventory = [
      {
        id: "inv-1",
        sourcePartLineId: "line-1",
        hcpMaterialId: null,
        partName: "Example solenoid",
        partNumber: "PN-9",
        supplier: "Example Vendor",
        description: "Keep this",
        qtyOnHand: 6,
        minQty: null,
        minOrderQty: null,
        unitValue: 12.5,
        updatedAt: 40,
        deletedAt: null,
      },
    ];
    doc.inventoryUsage = [
      {
        id: "job-1:materials:line-a",
        hcpJobId: "job-1",
        jobNumber: "173128",
        customerId: "cus-sample",
        source: "materials",
        lineId: "line-a",
        partNumber: "PN-9",
        partName: "Example solenoid",
        hcpMaterialId: null,
        inventoryItemId: "inv-1",
        qty: 2,
        unitValue: 12.5,
        extendedValue: 25,
        appliedAt: 40,
        reversedAt: null,
        reverseReason: null,
      },
    ];
    doc.inventoryFlags = [
      {
        id: "hcp_part_without_inventory:job-1:job_inputs:in-9",
        kind: "hcp_part_without_inventory",
        hcpJobId: "job-1",
        jobNumber: "173128",
        customerId: "cus-sample",
        source: "job_inputs",
        lineId: "in-9",
        partNumber: "NO-SUCH",
        partName: "",
        qty: 1,
        detail: "No inventory row matches this part number or HCP material id. Qty was not changed.",
      },
    ];

    assert.equal(applySharedInventorySnapshot(doc), true);
    const snap = getInventorySnapshot();
    assert.equal(snap.items[0]?.qtyOnHand, 6);
    assert.equal(snap.items[0]?.unitValue, 12.5);
    assert.equal(snap.items[0]?.description, "Keep this");
    assert.equal(snap.usage.length, 1);
    assert.equal(snap.usage[0]?.extendedValue, 25);
    assert.equal(snap.flags.length, 1);
    assert.equal(snap.flags[0]?.kind, "hcp_part_without_inventory");
  });
});
