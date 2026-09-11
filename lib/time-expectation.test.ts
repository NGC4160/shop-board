import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatTimeframe,
  isIsoDate,
  normalizeTimeframe,
  timeExpectationError,
  upgradeJob,
  seedJobs,
} from "./jobs.ts";
import { isDueToday } from "./sort.ts";

describe("timeframe calendar date", () => {
  it("allows empty and valid ISO dates", () => {
    assert.equal(timeExpectationError(""), null);
    assert.equal(timeExpectationError("   "), null);
    assert.equal(timeExpectationError("2026-09-11"), null);
    assert.equal(timeExpectationError("2026-02-28"), null);
  });

  it("rejects phrases, junk numbers, and impossible dates", () => {
    for (const junk of [
      "999",
      "Due today",
      "Due today 4:00 PM",
      "Parts ETA Wednesday",
      "Ready now",
      "in 2 days",
      "2026-13-01",
      "2026-02-31",
      "09/11/2026",
    ]) {
      assert.match(timeExpectationError(junk) ?? "", /calendar date/, junk);
    }
  });

  it("normalizes leftover text to empty unless a real ISO date is present", () => {
    assert.equal(normalizeTimeframe(""), "");
    assert.equal(normalizeTimeframe("2026-09-11"), "2026-09-11");
    assert.equal(normalizeTimeframe(" 2026-09-11 "), "2026-09-11");
    assert.equal(normalizeTimeframe("Promised 2026-09-18 morning"), "2026-09-18");
    assert.equal(normalizeTimeframe("Due today 4:00 PM"), "");
    assert.equal(normalizeTimeframe("999"), "");
    assert.equal(normalizeTimeframe("2026-02-31"), "");
    assert.equal(isIsoDate("2026-09-11"), true);
    assert.equal(isIsoDate("2026-02-31"), false);
  });

  it("formats stored dates readably without a clock time", () => {
    assert.equal(formatTimeframe("2026-09-11"), "Fri, Sep 11");
    assert.equal(formatTimeframe(""), "");
    assert.equal(formatTimeframe("Due today"), "");
  });

  it("upgradeJob keeps ISO timeframes and clears leftover phrases", () => {
    const kept = upgradeJob({ ...seedJobs[0], timeExpectation: "2026-09-11" });
    assert.equal(kept?.timeExpectation, "2026-09-11");
    const cleared = upgradeJob({ ...seedJobs[0], timeExpectation: "Due today 4:00 PM" });
    assert.equal(cleared?.timeExpectation, "");
    const junk = upgradeJob({ ...seedJobs[0], timeExpectation: "999" });
    assert.equal(junk?.timeExpectation, "");
  });

  it("is due today only when timeframe is today's Chicago calendar date", () => {
    const now = Date.parse("2026-09-11T18:00:00.000Z");
    const job = { ...seedJobs[0], timeExpectation: "2026-09-11" };
    assert.equal(isDueToday(job, now), true);
    assert.equal(isDueToday({ ...job, timeExpectation: "2026-09-12" }, now), false);
    assert.equal(isDueToday({ ...job, timeExpectation: "Due today" }, now), false);
    assert.equal(isDueToday({ ...job, timeExpectation: "" }, now), false);
  });
});
