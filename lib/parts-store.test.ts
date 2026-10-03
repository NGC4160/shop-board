import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAMPLE_PART_LINE, emptyPartLine } from "./parts.ts";
import { seedJobs } from "./jobs.ts";
import {
  applySharedPartsSnapshot,
  deletePart,
  exportSharedPartsPayload,
  getPartsSnapshot,
  insertPart,
  replaceParts,
  undoDeletePart,
  updatePart,
} from "./parts-store.ts";
import { getBoardSnapshot, loadSampleBoard } from "./board-store.ts";

describe("parts store isolation", () => {
  it("exports parts only — never jobs", () => {
    replaceParts([SAMPLE_PART_LINE]);
    const payload = exportSharedPartsPayload();
    assert.deepEqual(Object.keys(payload), ["parts"]);
    assert.equal(payload.parts.length, 1);
    assert.equal("jobs" in payload, false);
  });

  it("does not change job cards when a part is edited", () => {
    loadSampleBoard();
    const jobsBefore = getBoardSnapshot().jobs.map((job) => ({ ...job }));
    replaceParts([SAMPLE_PART_LINE]);
    assert.equal(updatePart("sample-demo-part", { status: "Received", note: "On the shelf" }), true);
    assert.equal(
      getPartsSnapshot().parts.find((part) => part.id === "sample-demo-part")?.status,
      "Received",
    );
    assert.deepEqual(
      getBoardSnapshot().jobs.map((job) => job.id),
      jobsBefore.map((job) => job.id),
    );
    assert.deepEqual(
      getBoardSnapshot().jobs.map((job) => job.customerName),
      jobsBefore.map((job) => job.customerName),
    );
    assert.equal(getBoardSnapshot().jobs.length, seedJobs.length);
  });

  it("inserts only after customer and part description are present", () => {
    replaceParts([]);
    assert.equal(insertPart(emptyPartLine("draft-1")), false);
    assert.equal(getPartsSnapshot().parts.length, 0);
    assert.equal(
      insertPart({
        ...emptyPartLine("draft-1"),
        customerName: "SAMPLE Customer",
        partDescription: "Example battery",
      }),
      true,
    );
    assert.equal(getPartsSnapshot().parts.length, 1);
  });

  it("can remove a row and undo", () => {
    replaceParts([SAMPLE_PART_LINE]);
    assert.equal(deletePart("sample-demo-part"), true);
    assert.equal(getPartsSnapshot().parts.length, 0);
    assert.equal(undoDeletePart(), true);
    assert.equal(getPartsSnapshot().parts[0]?.id, "sample-demo-part");
  });

  it("applies a shared snapshot without seeding fake customers", () => {
    replaceParts([SAMPLE_PART_LINE]);
    applySharedPartsSnapshot({ parts: [] });
    assert.equal(getPartsSnapshot().parts.length, 0);
  });
});
