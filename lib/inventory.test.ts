import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAMPLE_PART_LINE, type PartLine } from "./parts.ts";
import {
  inventoryBalance,
  inventoryLineValue,
  isLowStock,
  syncInventoryFromParts,
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

describe("inventory sync", () => {
  it("creates one item for an Inventory line and does not invent owned fields", () => {
    const line = part({
      id: "line-1",
      destinationType: "Inventory",
      destinationName: "",
      customerName: "Inventory",
      partDescription: "Example solenoid",
      vendor: "Example Vendor",
      note: "Shelf note",
    });
    const synced = syncInventoryFromParts([line], [], 50);
    assert.equal(synced.length, 1);
    const item = synced[0];
    assert.ok(item);
    assert.equal(item.sourcePartLineId, "line-1");
    assert.equal(item.partName, "Example solenoid");
    assert.equal(item.supplier, "Example Vendor");
    assert.equal(item.description, "Shelf note");
    assert.equal(item.qtyOnHand, 0);
    assert.equal(item.partNumber, "");
    assert.equal(item.minQty, null);
    assert.equal(item.minOrderQty, null);
    assert.equal(item.unitValue, null);
    assert.equal(item.deletedAt, null);
  });

  it("uses the part description when the note is empty", () => {
    const line = part({
      id: "line-1",
      destinationType: "Inventory",
      destinationName: "",
      customerName: "Inventory",
      partDescription: "Example cable",
      note: "  ",
    });
    const synced = syncInventoryFromParts([line], [], 50);
    assert.equal(synced[0]?.description, "Example cable");
  });

  it("refreshes the link and preserves inventory-owned fields", () => {
    const line = part({
      id: "line-1",
      destinationType: "Inventory",
      destinationName: "",
      customerName: "Inventory",
      partDescription: "Renamed solenoid",
      vendor: "Other Vendor",
      note: "Moved",
    });
    const synced = syncInventoryFromParts([line], [stock()], 80);
    assert.equal(synced.length, 1);
    const item = synced[0];
    assert.equal(item?.id, "inv-1");
    assert.equal(item?.partName, "Renamed solenoid");
    assert.equal(item?.supplier, "Other Vendor");
    assert.equal(item?.description, "Moved");
    assert.equal(item?.qtyOnHand, 6);
    assert.equal(item?.partNumber, "PN-9");
    assert.equal(item?.minQty, 2);
    assert.equal(item?.minOrderQty, 4);
    assert.equal(item?.unitValue, 12.5);
    assert.equal(item?.deletedAt, null);
  });

  it("soft-deletes the link when the line leaves Inventory and restores it without resetting qty", () => {
    const existing = stock();
    const customer = part({
      id: "line-1",
      destinationType: "Customer",
      destinationName: "Pearson",
      customerName: "Pearson",
    });
    const removed = syncInventoryFromParts([customer], [existing], 90);
    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.deletedAt, 90);
    assert.equal(removed[0]?.qtyOnHand, 6);

    const back = part({
      id: "line-1",
      destinationType: "Inventory",
      destinationName: "",
      customerName: "Inventory",
      partDescription: "Example solenoid",
      vendor: "Example Vendor",
      note: "Shelf note",
    });
    const restored = syncInventoryFromParts([back], removed, 100);
    assert.equal(restored.length, 1);
    assert.equal(restored[0]?.deletedAt, null);
    assert.equal(restored[0]?.qtyOnHand, 6);
    assert.equal(restored[0]?.partNumber, "PN-9");
    assert.equal(restored[0]?.unitValue, 12.5);
  });

  it("soft-deletes the link when the parts line is removed or soft-deleted", () => {
    const existing = stock();
    const gone = syncInventoryFromParts([], [existing], 110);
    assert.equal(gone[0]?.deletedAt, 110);

    const deletedLine = part({
      id: "line-1",
      destinationType: "Inventory",
      destinationName: "",
      customerName: "Inventory",
      deletedAt: 40,
    });
    const hidden = syncInventoryFromParts([deletedLine], [stock({ deletedAt: null })], 120);
    assert.equal(hidden[0]?.deletedAt, 120);
    assert.equal(hidden.length, 1);
  });

  it("does not split one parts line into more than one inventory item", () => {
    const line = part({
      id: "line-1",
      destinationType: "Inventory",
      destinationName: "",
      customerName: "Inventory",
      partDescription: "Two kits and a wheel",
    });
    const duplicate = stock({ id: "inv-older", updatedAt: 10, qtyOnHand: 1, partNumber: "OLD" });
    const newer = stock({ id: "inv-newer", updatedAt: 20, qtyOnHand: 3, partNumber: "NEW" });
    const synced = syncInventoryFromParts([line], [duplicate, newer], 130);
    const linked = synced.filter((item) => item.sourcePartLineId === "line-1");
    assert.equal(linked.length, 1);
    assert.equal(linked[0]?.id, "inv-newer");
    assert.equal(linked[0]?.qtyOnHand, 3);
    assert.equal(linked[0]?.partNumber, "NEW");
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
