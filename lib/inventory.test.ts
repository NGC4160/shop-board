import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAMPLE_PART_LINE, type PartLine } from "./parts.ts";
import {
  applyInventoryReceipts,
  inventoryBalance,
  inventoryLineValue,
  isLowStock,
  type InventoryItem,
} from "./inventory.ts";

function part(overrides: Partial<PartLine> & Pick<PartLine, "id">): PartLine {
  return {
    ...SAMPLE_PART_LINE,
    customerName: "SAMPLE Customer",
    destinationType: "Customer",
    destinationName: "SAMPLE Customer",
    ...overrides,
  };
}

function stock(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "inv-1",
    sourcePartLineId: "line-1",
    hcpMaterialId: null,
    partName: "Example solenoid",
    partNumber: "PN-9",
    supplier: "Example Vendor",
    description: "Shelf note",
    qtyOnHand: 6,
    minQty: 2,
    minOrderQty: 4,
    unitValue: 12.5,
    updatedAt: 1_000,
    deletedAt: null,
    ...overrides,
  };
}

function inventoryLine(overrides: Partial<ReturnType<typeof part>> = {}) {
  return part({
    id: "line-1",
    destinationType: "Inventory",
    destinationName: "",
    customerName: "Inventory",
    partDescription: "Example solenoid",
    vendor: "Example Vendor",
    note: "Shelf note",
    status: "Checked in",
    ...overrides,
  });
}

describe("inventory receipts", () => {
  it("creates one row when a new Inventory line is received and does not invent unit value", () => {
    const line = inventoryLine();
    const received = applyInventoryReceipts([], [line], [], [], 50);
    assert.equal(received.inventory.length, 1);
    const item = received.inventory[0];
    assert.ok(item);
    assert.equal(item.sourcePartLineId, "line-1");
    assert.equal(item.partName, "Example solenoid");
    assert.equal(item.supplier, "Example Vendor");
    assert.equal(item.description, "Shelf note");
    assert.equal(item.qtyOnHand, 1);
    assert.equal(item.partNumber, "");
    assert.equal(item.unitValue, null);
    assert.equal(item.deletedAt, null);
  });

  it("uses the part description when the note is empty", () => {
    const line = inventoryLine({ partDescription: "Example cable", note: "  " });
    const received = applyInventoryReceipts([], [line], [], [], 50);
    assert.equal(received.inventory[0]?.description, "Example cable");
  });

  it("adds qty to a live row and does not rewrite description or unit value", () => {
    const ordered = inventoryLine({ status: "Ordered" });
    const received = inventoryLine({
      status: "Checked in",
      partDescription: "Renamed solenoid",
      vendor: "Other Vendor",
      note: "Moved",
      quantity: 3,
    } as Partial<ReturnType<typeof part>>);
    const result = applyInventoryReceipts([ordered], [received], [stock()], [], 80);
    assert.equal(result.inventory.length, 1);
    const item = result.inventory[0];
    assert.equal(item?.id, "inv-1");
    assert.equal(item?.partName, "Example solenoid");
    assert.equal(item?.description, "Shelf note");
    assert.equal(item?.qtyOnHand, 9);
    assert.equal(item?.partNumber, "PN-9");
    assert.equal(item?.unitValue, 12.5);
    assert.equal(item?.deletedAt, null);
    const again = applyInventoryReceipts([received], [received], result.inventory, result.receipts, 90);
    assert.equal(again.inventory[0]?.qtyOnHand, 9);
  });

  it("keeps the row when the parts line is deleted or leaves Inventory", () => {
    const existing = stock();
    const gone = applyInventoryReceipts([inventoryLine()], [], [existing], [], 110);
    assert.equal(gone.inventory.length, 1);
    assert.equal(gone.inventory[0]?.deletedAt, null);
    assert.equal(gone.inventory[0]?.qtyOnHand, 6);
    assert.equal(gone.inventory[0]?.unitValue, 12.5);

    const customer = part({
      id: "line-1",
      destinationType: "Customer",
      destinationName: "Pearson",
      customerName: "Pearson",
      status: "Checked in",
    });
    const edited = applyInventoryReceipts([inventoryLine()], [customer], [existing], [], 120);
    assert.equal(edited.inventory[0]?.deletedAt, null);
    assert.equal(edited.inventory[0]?.qtyOnHand, 6);
    assert.equal(edited.inventory[0]?.description, "Shelf note");
  });

  it("does not recreate a retired row when the parts line is still Inventory", () => {
    const retired = stock({ deletedAt: 40, qtyOnHand: 0, unitValue: 0 });
    const line = inventoryLine();
    const saved = applyInventoryReceipts([line], [line], [retired], [], 130);
    assert.equal(saved.inventory.length, 1);
    assert.equal(saved.inventory[0]?.id, "inv-1");
    assert.equal(saved.inventory[0]?.deletedAt, 40);
    assert.equal(saved.inventory[0]?.qtyOnHand, 0);
    assert.equal(saved.inventory[0]?.unitValue, 0);

    const fresh = applyInventoryReceipts([], [line], [retired], [], 140);
    assert.equal(fresh.inventory.length, 1);
    assert.equal(fresh.inventory[0]?.deletedAt, 40);
    assert.equal(fresh.receipts[0]?.skipped, true);
  });
});

describe("inventory balance", () => {
  it("treats a blank unit value as zero and skips soft-deleted rows", () => {
    const priced = stock({ id: "a", sourcePartLineId: "a", qtyOnHand: 2, unitValue: 10 });
    const blank = stock({
      id: "b",
      sourcePartLineId: "b",
      qtyOnHand: 5,
      unitValue: null,
    });
    const removed = stock({
      id: "c",
      sourcePartLineId: "c",
      qtyOnHand: 9,
      unitValue: 100,
      deletedAt: 1,
    });
    assert.equal(inventoryLineValue(blank), 0);
    assert.equal(inventoryLineValue(priced), 20);
    assert.equal(inventoryBalance([priced, blank, removed]), 20);
  });

  it("flags low stock only when min qty is set and qty is at or under it", () => {
    assert.equal(isLowStock(stock({ qtyOnHand: 2, minQty: 2 })), true);
    assert.equal(isLowStock(stock({ qtyOnHand: 3, minQty: 2 })), false);
    assert.equal(isLowStock(stock({ qtyOnHand: 0, minQty: null })), false);
    assert.equal(isLowStock(stock({ qtyOnHand: 0, minQty: 1, deletedAt: 5 })), false);
  });
});
