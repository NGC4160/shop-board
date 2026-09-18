import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedJobs } from "./jobs.ts";
import {
  parseSharedBoardDocument,
  parseSharedPrefs,
  readDismissedJobNumbers,
  shouldMigrateLocalSnapshot,
  toSharedBoardDocument,
} from "./shared-board.ts";

describe("parseSharedBoardDocument", () => {
  it("returns null for non-objects", () => {
    assert.equal(parseSharedBoardDocument(null), null);
    assert.equal(parseSharedBoardDocument("nope"), null);
    assert.equal(parseSharedBoardDocument(12), null);
  });

  it("keeps an empty jobs list (cleared board) instead of inventing seeds", () => {
    const parsed = parseSharedBoardDocument({
      jobs: [],
      prefs: { hideClosed: false, timeframe: "2026-09-18" },
      dismissedJobNumbers: ["0173128"],
    });
    assert.ok(parsed);
    assert.equal(parsed.jobs.length, 0);
    assert.equal(parsed.prefs.hideClosed, false);
    assert.equal(parsed.prefs.timeframe, "2026-09-18");
    assert.deepEqual(parsed.dismissedJobNumbers, ["173128"]);
  });

  it("sanitizes jobs and drops leftover timeframe phrases", () => {
    const parsed = parseSharedBoardDocument({
      jobs: [
        {
          ...seedJobs[0],
          nextAction: "Call Jesse",
          timeExpectation: "this week",
          notes: "Controller on the bench",
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed.jobs[0]?.nextAction, "Call Jesse");
    assert.equal(parsed.jobs[0]?.timeExpectation, "");
    assert.equal(parsed.jobs[0]?.notes, "Controller on the bench");
    assert.equal(parsed.prefs.hideClosed, true);
    assert.equal(parsed.prefs.timeframe, "");
  });
});

describe("shared prefs and dismissed", () => {
  it("defaults prefs and normalizes dismissed job numbers", () => {
    assert.deepEqual(parseSharedPrefs(undefined), { hideClosed: true, timeframe: "" });
    assert.deepEqual(readDismissedJobNumbers(["1842", "01842", 12, ""]), ["1842"]);
  });

  it("only migrates when this browser already had a board key", () => {
    assert.equal(shouldMigrateLocalSnapshot(false), false);
    assert.equal(shouldMigrateLocalSnapshot(true), true);
  });

  it("stamps version 1 without lastHcpSyncAt", () => {
    const doc = toSharedBoardDocument({
      jobs: [seedJobs[0]],
      prefs: { hideClosed: true, timeframe: "" },
      dismissedJobNumbers: [],
    });
    assert.equal(doc.version, 1);
    assert.equal("lastHcpSyncAt" in doc, false);
  });
});
