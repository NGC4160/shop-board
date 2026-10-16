import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayDaysSinceStarted, displayStartedDate, formatStartedDate } from "./format.ts";
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

describe("displayDaysSinceStarted", () => {
  const now = Date.parse("2026-10-16T15:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;

  it("counts whole days from the HCP clock-in", () => {
    assert.equal(displayDaysSinceStarted(now - 8 * day, now - 2 * day, now), "8");
    assert.equal(displayDaysSinceStarted(now - 7 * day - 60 * 60 * 1000, null, now), "7");
    assert.equal(displayDaysSinceStarted(now - day + 60_000, null, now), "0");
    assert.equal(displayDaysSinceStarted(now + day, now - 4 * day, now), "0");
  });

  it("falls back to the old Date started value only when the clock-in is null", () => {
    assert.equal(displayDaysSinceStarted(null, now - 3 * day, now), "3");
    assert.equal(displayDaysSinceStarted(undefined, now - 3 * day, now), "3");
    assert.equal(displayDaysSinceStarted(null, null, now), "—");
    assert.equal(displayDaysSinceStarted(null, 0, now), "—");
    assert.equal(displayDaysSinceStarted(0, now - 3 * day, now), "—");
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
