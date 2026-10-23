import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedJobs } from "./jobs.ts";
import { SAMPLE_PART_LINE, sanitizePartLine } from "./parts.ts";
import { type InventoryItem } from "./inventory.ts";
import {
  applyIncomingPartsPut,
  emptySharedPartsDocument,
  mergeSharedPartsDocuments,
  parseSharedPartsDocument,
  readPartsWriteBaseUpdatedAt,
  replacePartsLines,
  toSharedPartsDocument,
} from "./parts-board.ts";
import { SHARED_PARTS_PRIOR_BLOB_PATH } from "./parts-board-backend.ts";
import { parseSharedBoardDocument } from "./shared-board.ts";
import { SHARED_BOARD_BLOB_PATH } from "./shared-board-backend.ts";
import { SHARED_PARTS_BLOB_PATH } from "./parts-board-backend.ts";

describe("parts document isolation", () => {
  it("uses a different blob path than the job board", () => {
    assert.equal(SHARED_PARTS_BLOB_PATH, "ngc-parts-board.json");
    assert.equal(SHARED_BOARD_BLOB_PATH, "ngc-shop-board.json");
    assert.notEqual(SHARED_PARTS_BLOB_PATH, SHARED_BOARD_BLOB_PATH);
  });

  it("keeps an empty parts list instead of inventing customers", () => {
    const parsed = parseSharedPartsDocument({ parts: [] });
    assert.ok(parsed);
    assert.equal(parsed.parts.length, 0);
    assert.equal(parsed.version, 2);
    assert.deepEqual(parsed.inventory, []);
  });

  it("ignores a jobs field so a parts write cannot become job cards", () => {
    const parsed = parseSharedPartsDocument({
      parts: [SAMPLE_PART_LINE],
      jobs: seedJobs,
    });
    assert.ok(parsed);
    assert.equal(parsed.parts.length, 1);
    assert.equal(parsed.parts[0]?.customerName, "SAMPLE Customer");
    assert.equal("jobs" in parsed, false);
  });

  it("does not let a parts document populate the job board parser", () => {
    const partsDoc = toSharedPartsDocument({ parts: [SAMPLE_PART_LINE] });
    const asJobs = parseSharedBoardDocument(partsDoc);
    assert.ok(asJobs);
    assert.equal(asJobs.jobs.length, 0);
  });

  it("does not let a job board document populate the parts parser", () => {
    const asParts = parseSharedPartsDocument({
      version: 1,
      jobs: seedJobs,
      prefs: { hideClosed: true, timeframe: "" },
    });
    assert.ok(asParts);
    assert.equal(asParts.parts.length, 0);
  });

  it("keeps a Checked in line instead of dropping it as received", () => {
    const parsed = parseSharedPartsDocument({
      parts: [{ ...SAMPLE_PART_LINE, id: "line-check", status: "Checked in" }],
    });
    assert.ok(parsed);
    assert.equal(parsed.parts.length, 1);
    assert.equal(parsed.parts[0]?.status, "Checked in");
    assert.equal(parsed.parts[0]?.id, "line-check");
  });

  it("stamps version 2 without a jobs key", () => {
    const doc = emptySharedPartsDocument(1);
    assert.equal(doc.version, 2);
    assert.deepEqual(Object.keys(doc).sort(), [
      "inventory",
      "inventoryFlags",
      "inventoryReceipts",
      "inventorySync",
      "inventoryUsage",
      "parts",
      "updatedAt",
      "version",
    ]);
  });
});

describe("stale parts PUT merge", () => {
  const older = { ...SAMPLE_PART_LINE, id: "line-old", updatedAt: 1_000 };
  const newer = {
    ...SAMPLE_PART_LINE,
    id: "line-bot",
    customerName: "SAMPLE Bot",
    destinationType: "Customer" as const,
    destinationName: "SAMPLE Bot",
    partDescription: "Example solenoid — added after the page loaded",
    updatedAt: 2_000,
  };

  it("treats a missing client updatedAt as unknown, not now", () => {
    assert.equal(readPartsWriteBaseUpdatedAt({ parts: [] }), 0);
    assert.equal(readPartsWriteBaseUpdatedAt({ parts: [], updatedAt: null }), 0);
    assert.equal(readPartsWriteBaseUpdatedAt({ parts: [], updatedAt: 1_000 }), 1_000);
  });

  it("keeps a line added after the client's last-seen document time", () => {
    const current = toSharedPartsDocument({ parts: [older, newer] }, 2_000);
    const stale = mergeSharedPartsDocuments(current, { parts: [older] }, 1_000);
    assert.deepEqual(
      stale.parts.map((line) => line.id).sort(),
      ["line-bot", "line-old"],
    );
    assert.equal(stale.parts.find((line) => line.id === "line-bot")?.customerName, "SAMPLE Bot");
  });

  it("still removes a line the client already knew about", () => {
    const current = toSharedPartsDocument({ parts: [older] }, 1_000);
    const deleted = mergeSharedPartsDocuments(current, { parts: [] }, 1_000);
    assert.equal(deleted.parts.length, 0);
  });

  it("lets a newer incoming edit win on the same id", () => {
    const current = toSharedPartsDocument({ parts: [older] }, 1_000);
    const edited = { ...older, note: "On the shelf", updatedAt: 3_000 };
    const merged = mergeSharedPartsDocuments(current, { parts: [edited] }, 1_000);
    assert.equal(merged.parts.length, 1);
    assert.equal(merged.parts[0]?.note, "On the shelf");
  });

  it("keeps a newer Checked in line when a stale page saves another row", () => {
    const checkedIn = {
      ...SAMPLE_PART_LINE,
      id: "line-checked-in",
      status: "Checked in" as const,
      updatedAt: 2_000,
    };
    const current = toSharedPartsDocument({ parts: [older, checkedIn] }, 2_000);
    const result = applyIncomingPartsPut(current, { parts: [older], updatedAt: 1_000 }, 3_000);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.doc.parts.some((line) => line.id === "line-checked-in"), true);
    assert.equal(result.doc.parts.find((line) => line.id === "line-checked-in")?.status, "Checked in");
  });

  it("does not let a stale save drop newer lines", () => {
    const current = toSharedPartsDocument({ parts: [older, newer] }, 2_000);
    const result = applyIncomingPartsPut(current, { parts: [older], updatedAt: 1_000 }, 3_000);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.doc.parts.some((line) => line.id === "line-bot"), true);
    assert.equal(result.doc.parts.some((line) => line.id === "line-old"), true);
    assert.equal(result.doc.updatedAt, 3_000);
  });
});

describe("v1 parts documents", () => {
  const legacyLine = {
    id: "LINE-STOCK",
    customerName: "Inventory",
    jobNumber: "",
    partDescription: "Example bushing",
    vendor: "Example Vendor",
    status: "Received",
    carrier: "",
    trackingNumber: "",
    expectedDate: "2026-10-12",
    note: "Anonymized fixture shaped like a v1 row",
    updatedAt: 1_000,
    poHint: "keep-me",
  };

  function stockItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
    return {
      id: "inv-stock",
      sourcePartLineId: "LINE-STOCK",
      hcpMaterialId: null,
      partName: "Example bushing",
      partNumber: "PN-1",
      supplier: "Example Vendor",
      description: "Anonymized fixture shaped like a v1 row",
      qtyOnHand: 4,
      minQty: 1,
      minOrderQty: 2,
      unitValue: 10,
      updatedAt: 1_500,
      deletedAt: null,
      ...overrides,
    };
  }

  it("derives a destination from a v1 line and keeps unknown fields", () => {
    const loaded = sanitizePartLine(legacyLine);
    assert.ok(loaded);
    assert.equal(loaded.destinationType, "Inventory");
    assert.equal(loaded.destinationName, "");
    assert.equal(loaded.customerName, "Inventory");
    assert.equal(loaded.partDescription, "Example bushing");
    assert.equal((loaded as { poHint?: string }).poHint, "keep-me");
    assert.equal("jobs" in loaded, false);
  });

  it("does not let an unmigrated PUT wipe destinations, unknown fields, or inventory qty", () => {
    const loaded = parseSharedPartsDocument({
      version: 1,
      updatedAt: 1_000,
      parts: [legacyLine],
      shopNote: "keep-doc",
    });
    assert.ok(loaded);
    assert.equal("jobs" in loaded, false);
    const current = {
      ...loaded,
      inventory: [stockItem()],
    };
    const staleClient = {
      parts: [
        {
          id: "LINE-STOCK",
          customerName: "Inventory",
          jobNumber: "",
          partDescription: "Example bushing",
          vendor: "Example Vendor",
          status: "Received",
          carrier: "",
          trackingNumber: "",
          expectedDate: "2026-10-12",
          note: "Note edited on an old screen",
          updatedAt: 2_000,
        },
      ],
      updatedAt: 1_000,
    };
    const result = applyIncomingPartsPut(current, staleClient, 3_000);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const line = result.doc.parts[0];
    assert.equal(line?.destinationType, "Inventory");
    assert.equal(line?.destinationName, "");
    assert.equal(line?.note, "Note edited on an old screen");
    assert.equal((line as { poHint?: string } | undefined)?.poHint, "keep-me");
    assert.equal((result.doc as { shopNote?: string }).shopNote, "keep-doc");
    assert.equal(result.doc.inventory.length, 1);
    assert.equal(result.doc.inventory[0]?.qtyOnHand, 4);
    assert.equal(result.doc.inventory[0]?.partNumber, "PN-1");
    assert.equal(result.doc.inventory[0]?.minQty, 1);
    assert.equal(result.doc.inventory[0]?.minOrderQty, 2);
    assert.equal(result.doc.inventory[0]?.unitValue, 10);
    assert.equal(result.doc.inventory[0]?.deletedAt, null);
    assert.equal(result.doc.version, 2);
  });

  it("receives a new Inventory line without clearing an existing manual row", () => {
    const manual: InventoryItem = {
      id: "inv-manual",
      sourcePartLineId: null,
      hcpMaterialId: null,
      partName: "Windshield",
      partNumber: "",
      supplier: "Example Glass",
      description: "Not from a parts line",
      qtyOnHand: 1,
      minQty: null,
      minOrderQty: null,
      unitValue: null,
      updatedAt: 1,
      deletedAt: null,
    };
    const current = {
      ...emptySharedPartsDocument(1),
      inventory: [manual],
    };
    const part = sanitizePartLine(legacyLine);
    assert.ok(part);
    const next = replacePartsLines(current, [part], 5);
    assert.equal(next.inventory.find((item) => item.id === "inv-manual")?.qtyOnHand, 1);
    assert.equal(next.inventory.filter((item) => item.sourcePartLineId === "LINE-STOCK").length, 1);
    assert.equal(next.inventory.find((item) => item.sourcePartLineId === "LINE-STOCK")?.description, legacyLine.note);
  });

  it("keeps qty and value when a checked-in Inventory line is deleted", () => {
    const part = sanitizePartLine({ ...legacyLine, status: "Checked in" });
    assert.ok(part);
    const current = {
      ...emptySharedPartsDocument(1_000),
      parts: [part],
      inventory: [stockItem({ description: "Keep this", qtyOnHand: 4, unitValue: 10 })],
      inventoryReceipts: [
        { partLineId: part.id, inventoryItemId: "inv-stock", qty: 1, appliedAt: 1, skipped: false },
      ],
    };
    const next = replacePartsLines(current, [], 2_000);
    assert.equal(next.parts.length, 0);
    assert.equal(next.inventory.length, 1);
    assert.equal(next.inventory[0]?.qtyOnHand, 4);
    assert.equal(next.inventory[0]?.unitValue, 10);
    assert.equal(next.inventory[0]?.description, "Keep this");
    assert.equal(next.inventory[0]?.deletedAt, null);
  });

  it("does not recreate a retired inventory row from a parts save", () => {
    const part = sanitizePartLine({ ...legacyLine, status: "Checked in" });
    assert.ok(part);
    const retired = stockItem({ deletedAt: 500, qtyOnHand: 0, unitValue: 0, description: "Retired shelf" });
    const current = {
      ...emptySharedPartsDocument(1_000),
      parts: [part],
      inventory: [retired],
    };
    const result = applyIncomingPartsPut(
      current,
      {
        parts: [{ ...legacyLine, status: "Checked in", note: "Edited after retire", updatedAt: 2_000 }],
        updatedAt: 1_000,
      },
      3_000,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.doc.inventory.length, 1);
    assert.equal(result.doc.inventory[0]?.id, "inv-stock");
    assert.equal(result.doc.inventory[0]?.deletedAt, 500);
    assert.equal(result.doc.inventory[0]?.qtyOnHand, 0);
    assert.equal(result.doc.inventory[0]?.unitValue, 0);
    assert.equal(result.doc.inventory[0]?.description, "Retired shelf");
  });

  it("names the rolling prior document used before each save", () => {
    assert.equal(SHARED_PARTS_PRIOR_BLOB_PATH, "ngc-parts-board.prior.json");
  });
});
