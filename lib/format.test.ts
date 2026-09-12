import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayStartedDate, formatStartedDate } from "./format.ts";
import { isUnscheduledStatus } from "./jobs.ts";

describe("formatStartedDate", () => {
  it("formats a timestamp in America/Chicago and never invents missing dates", () => {
    assert.equal(formatStartedDate(Date.parse("2026-09-12T16:00:00.000Z")), "Sep 12, 2026");
    // 04:00 UTC is still Sep 11 in Chicago (CDT).
    assert.equal(formatStartedDate(Date.parse("2026-09-12T04:00:00.000Z")), "Sep 11, 2026");
    assert.equal(formatStartedDate(null), "—");
    assert.equal(formatStartedDate(undefined), "—");
    assert.equal(formatStartedDate(0), "—");
    assert.equal(formatStartedDate(Number.NaN), "—");
  });
});

describe("displayStartedDate", () => {
  it("hides a leftover start when the board status is Unscheduled", () => {
    const leftover = Date.parse("2026-09-11T15:30:00.000Z");
    assert.equal(displayStartedDate(leftover, "Unscheduled"), "—");
    assert.equal(displayStartedDate(leftover, "needs scheduling"), "—");
    assert.equal(displayStartedDate(leftover, "Scheduled"), "Sep 11, 2026");
    assert.equal(displayStartedDate(leftover, "In Progress"), "Sep 11, 2026");
    assert.equal(displayStartedDate(null, "Scheduled"), "—");
    assert.equal(isUnscheduledStatus("Unscheduled"), true);
    assert.equal(isUnscheduledStatus("Needs Scheduling"), true);
    assert.equal(isUnscheduledStatus("Scheduled"), false);
  });
});
