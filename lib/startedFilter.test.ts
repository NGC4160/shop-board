import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { upgradeJob, type CartJob } from "./jobs.ts";
import { isOverSevenDaysStarted, jobsOverSevenDaysStarted } from "./startedFilter.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-16T12:00:00Z");

function job(
  hcpWorkStartedAt: number | null,
  status = "In Progress",
): Pick<CartJob, "hcpWorkStartedAt" | "status"> {
  return { hcpWorkStartedAt, status };
}

describe("isOverSevenDaysStarted", () => {
  it("is true only when the clock-in is more than 7 days ago and the job is open", () => {
    assert.equal(isOverSevenDaysStarted(job(NOW - 7 * DAY - 1), NOW), true);
    assert.equal(isOverSevenDaysStarted(job(NOW - 8 * DAY), NOW), true);
    assert.equal(isOverSevenDaysStarted(job(NOW - 7 * DAY), NOW), false);
    assert.equal(isOverSevenDaysStarted(job(NOW - 6 * DAY), NOW), false);
    assert.equal(isOverSevenDaysStarted(job(null), NOW), false);
    assert.equal(isOverSevenDaysStarted(job(0), NOW), false);
    assert.equal(isOverSevenDaysStarted(job(NOW - 30 * DAY, "Completed"), NOW), false);
    assert.equal(isOverSevenDaysStarted(job(NOW - 30 * DAY, "Invoice Paid"), NOW), false);
    assert.deepEqual(
      jobsOverSevenDaysStarted(
        [job(NOW - 8 * DAY), job(NOW - 2 * DAY), job(null)],
        NOW,
      ).map((item) => item.hcpWorkStartedAt),
      [NOW - 8 * DAY],
    );
  });
});

describe("upgradeJob hcpWorkStartedAt", () => {
  it("defaults a missing clock-in to null and keeps a stored millis value", () => {
    const base = {
      id: "job-1",
      customerName: "Ada",
      jobNumber: "173190",
      primaryTech: "",
      status: "Scheduled",
      nextAction: "",
      timeExpectation: "",
    };
    assert.equal(upgradeJob(base)?.hcpWorkStartedAt, null);
    const started = NOW - 10 * DAY;
    assert.equal(upgradeJob({ ...base, hcpWorkStartedAt: started })?.hcpWorkStartedAt, started);
    assert.equal(upgradeJob({ ...base, hcpWorkStartedAt: "nope" })?.hcpWorkStartedAt, null);
  });
});
