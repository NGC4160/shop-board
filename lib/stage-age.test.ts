import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysInStatus, seedJobs } from "./jobs.ts";

const DAY = 86_400_000;

describe("daysInStatus", () => {
  it("uses a normal statusChangedAt", () => {
    const now = Date.now();
    const job = { ...seedJobs[0], statusChangedAt: now - 5 * DAY, createdAt: now - 8 * DAY };
    assert.equal(daysInStatus(job, now), 5);
  });

  it("does not show multi-decade ages for epoch or junk timestamps", () => {
    const now = Date.now();
    const epoch = { ...seedJobs[0], statusChangedAt: 0, createdAt: now - 2 * DAY };
    assert.equal(daysInStatus(epoch, now), 2);
    const unixJunk = { ...seedJobs[0], statusChangedAt: 1, createdAt: now - DAY };
    assert.ok(daysInStatus(unixJunk, now) <= 2);
    assert.ok(daysInStatus(unixJunk, now) < 1000);
  });
});
