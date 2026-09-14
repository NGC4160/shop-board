import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterJobsByTimeframe,
  jobMatchesTimeframeFilter,
  startedDateKey,
} from "./filters.ts";
import { seedJobs } from "./jobs.ts";

const SEP_11_CHICAGO = Date.parse("2026-09-12T04:00:00.000Z");
const SEP_12_CHICAGO = Date.parse("2026-09-12T16:00:00.000Z");

describe("timeframe start-date filter", () => {
  it("does not invent a start date for missing or Unscheduled jobs", () => {
    assert.equal(startedDateKey({ hcpScheduledStartAt: null, status: "Scheduled" }), null);
    assert.equal(startedDateKey({ hcpScheduledStartAt: 0, status: "In Progress" }), null);
    assert.equal(startedDateKey({ hcpScheduledStartAt: SEP_11_CHICAGO, status: "Unscheduled" }), null);
    assert.equal(
      startedDateKey({ hcpScheduledStartAt: SEP_11_CHICAGO, status: "needs scheduling" }),
      null,
    );
    assert.equal(startedDateKey({ ...seedJobs[0], hcpScheduledStartAt: null }), null);
  });

  it("uses the America/Chicago calendar day for a real scheduled start", () => {
    assert.equal(
      startedDateKey({ hcpScheduledStartAt: SEP_11_CHICAGO, status: "Scheduled" }),
      "2026-09-11",
    );
    assert.equal(
      startedDateKey({ hcpScheduledStartAt: SEP_12_CHICAGO, status: "In Progress" }),
      "2026-09-12",
    );
  });

  it("shows every job when the timeframe filter is empty", () => {
    const unscheduled = { hcpScheduledStartAt: null, status: "Unscheduled" };
    const scheduled = { hcpScheduledStartAt: SEP_12_CHICAGO, status: "Scheduled" };
    assert.equal(jobMatchesTimeframeFilter(unscheduled, ""), true);
    assert.equal(jobMatchesTimeframeFilter(scheduled, "   "), true);
    assert.equal(filterJobsByTimeframe(seedJobs, "").length, seedJobs.length);
  });

  it("hides jobs without a start date while a date is chosen", () => {
    const noStart = { hcpScheduledStartAt: null, status: "Scheduled" };
    const leftoverUnscheduled = { hcpScheduledStartAt: SEP_12_CHICAGO, status: "Unscheduled" };
    assert.equal(jobMatchesTimeframeFilter(noStart, "2026-09-12"), false);
    assert.equal(jobMatchesTimeframeFilter(leftoverUnscheduled, "2026-09-12"), false);
    assert.equal(filterJobsByTimeframe(seedJobs, "2026-09-14").length, 0);
  });

  it("keeps only jobs whose Date started is the chosen Chicago day", () => {
    const match = {
      id: "a",
      hcpScheduledStartAt: SEP_12_CHICAGO,
      status: "Scheduled",
    };
    const otherDay = {
      id: "b",
      hcpScheduledStartAt: SEP_11_CHICAGO,
      status: "In Progress",
    };
    const dash = {
      id: "c",
      hcpScheduledStartAt: null,
      status: "Scheduled",
    };
    const filtered = filterJobsByTimeframe([match, otherDay, dash], "2026-09-12");
    assert.deepEqual(
      filtered.map((job) => job.id),
      ["a"],
    );
  });
});
