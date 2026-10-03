import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedJobs } from "./jobs.ts";
import { SAMPLE_PART_LINE } from "./parts.ts";
import {
  emptySharedPartsDocument,
  parseSharedPartsDocument,
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

  it("stamps version 1 without a jobs key", () => {
    const doc = emptySharedPartsDocument(1);
    assert.equal(doc.version, 1);
    assert.deepEqual(Object.keys(doc).sort(), ["parts", "updatedAt", "version"]);
  });
});
