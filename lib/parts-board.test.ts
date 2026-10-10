import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedJobs } from "./jobs.ts";
import { SAMPLE_PART_LINE } from "./parts.ts";
import {
  applyIncomingPartsPut,
  emptySharedPartsDocument,
  mergeSharedPartsDocuments,
  parseSharedPartsDocument,
  readPartsWriteBaseUpdatedAt,
  toSharedPartsDocument,
} from "./parts-board.ts";
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
    assert.equal(parsed.version, 1);
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

  it("stamps version 1 without a jobs key", () => {
    const doc = emptySharedPartsDocument(1);
    assert.equal(doc.version, 1);
    assert.deepEqual(Object.keys(doc).sort(), ["parts", "updatedAt", "version"]);
  });
});

describe("stale parts PUT merge", () => {
  const older = { ...SAMPLE_PART_LINE, id: "line-old", updatedAt: 1_000 };
  const newer = {
    ...SAMPLE_PART_LINE,
    id: "line-bot",
    customerName: "SAMPLE Bot",
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
