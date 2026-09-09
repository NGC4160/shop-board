import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agingLabel } from "./format.ts";
import { daysInStatus, seedJobs, upgradeJob } from "./jobs.ts";

const DAY = 86_400_000;

describe("daysInStatus", () => {
  it("uses a normal statusChangedAt", () => {
    const now = Date.now();
    const job = { ...seedJobs[0], statusChangedAt: now - 5 * DAY, createdAt: now - 8 * DAY };
    assert.equal(daysInStatus(job, now), 5);
  });

  it("does not show multi-decade ages for epoch or junk timestamps", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    const epoch = { ...seedJobs[0], statusChangedAt: 0, createdAt: now - 2 * DAY };
    assert.equal(daysInStatus(epoch, now), 2);
    const unixJunk = { ...seedJobs[0], statusChangedAt: 1, createdAt: now - DAY };
    assert.ok(daysInStatus(unixJunk, now) <= 2);
    assert.ok(daysInStatus(unixJunk, now) < 1000);
  });

  it("returns today when both timestamps are epoch", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    const job = { ...seedJobs[0], statusChangedAt: 0, createdAt: 0 };
    assert.equal(daysInStatus(job, now), 0);
    assert.equal(agingLabel(daysInStatus(job, now)), "today");
  });

  it("returns today when createdAt is a tiny unix-ms leftover", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    const job = { ...seedJobs[0], statusChangedAt: 1, createdAt: 1000 };
    assert.equal(daysInStatus(job, now), 0);
    assert.equal(agingLabel(20705), "today");
  });

  it("coerces unix-seconds timestamps into a sane recent age", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    const fiveDaysAgoSec = Math.floor((now - 5 * DAY) / 1000);
    const job = {
      ...seedJobs[0],
      statusChangedAt: fiveDaysAgoSec,
      createdAt: fiveDaysAgoSec,
    };
    assert.equal(daysInStatus(job, now), 5);
    assert.equal(agingLabel(5), "5d in stage");
  });

  it("upgradeJob rewrites absurd stage timestamps so they never display as 20705d", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    const upgraded = upgradeJob({
      ...seedJobs[1],
      jobNumber: "1847",
      statusChangedAt: 0,
      createdAt: 1,
    });
    assert.ok(upgraded);
    assert.ok(daysInStatus(upgraded, now) <= 365);
    assert.notEqual(agingLabel(daysInStatus(upgraded, now)), "20705d in stage");
  });
});
