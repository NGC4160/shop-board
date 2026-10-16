import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boardStats } from "./filters.ts";
import { seedJobs, upgradeJob, visibleJobs } from "./jobs.ts";
import {
  filterParts,
  removePartLine,
  sanitizeLoadedParts,
  upsertPartLine,
  SAMPLE_PART_LINE,
} from "./parts.ts";
import { deleteJob, getBoardSnapshot, replaceBoard, undoDelete } from "./board-store.ts";

describe("soft delete", () => {
  it("loads an existing job with no deletedAt as a live row", () => {
    const raw = { ...seedJobs[0] };
    delete (raw as { deletedAt?: number | null }).deletedAt;
    const loaded = upgradeJob(raw);
    assert.ok(loaded);
    assert.equal(loaded?.deletedAt, null);
    assert.equal(visibleJobs([loaded!]).length, 1);
  });

  it("hides a removed job without dropping it, and undo restores it", () => {
    replaceBoard([seedJobs[0], seedJobs[1]]);
    const id = seedJobs[0].id;
    const openBefore = boardStats(getBoardSnapshot().jobs).open;
    assert.equal(deleteJob(id), true);
    const stored = getBoardSnapshot().jobs.find((job) => job.id === id);
    assert.ok(stored?.deletedAt);
    assert.equal(visibleJobs(getBoardSnapshot().jobs).some((job) => job.id === id), false);
    assert.equal(boardStats(getBoardSnapshot().jobs).open, openBefore - 1);
    assert.equal(undoDelete(), true);
    assert.equal(getBoardSnapshot().jobs.find((job) => job.id === id)?.deletedAt, null);
    assert.equal(boardStats(getBoardSnapshot().jobs).open, openBefore);
  });

  it("keeps a removed parts line and lets a later upsert bring it back", () => {
    const created = upsertPartLine([], {
      id: "po-1",
      customerName: "SAMPLE Customer",
      partDescription: "Example solenoid",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const removed = removePartLine(created.parts, { id: "po-1" }, 50);
    assert.equal(removed.ok, true);
    if (!removed.ok) return;
    assert.equal(removed.parts.length, 1);
    assert.equal(removed.parts[0]?.deletedAt, 50);
    assert.equal(filterParts(removed.parts, { status: "all", search: "" }).length, 0);

    const loaded = sanitizeLoadedParts(removed.parts);
    assert.equal(loaded[0]?.deletedAt, 50);

    const again = upsertPartLine(loaded, {
      id: "po-1",
      note: "Back on the board",
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.line.deletedAt, null);
    assert.equal(again.line.note, "Back on the board");
    assert.equal(filterParts(again.parts, { status: "all", search: "" }).length, 1);
  });

  it("does not invent a deletedAt on the sample line", () => {
    assert.equal(SAMPLE_PART_LINE.deletedAt, null);
  });
});
