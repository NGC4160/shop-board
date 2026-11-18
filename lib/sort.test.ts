import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayDaysSinceStarted } from "./format.ts";
import {
  compareJobNumbers,
  jobNumberParts,
  sortJobsByDaysHeld,
  sortJobsByJobNumber,
} from "./sort.ts";
import { seedJobs } from "./jobs.ts";

describe("job number sort", () => {
  it("puts 1842 before 18510", () => {
    assert.ok(compareJobNumbers("1842", "18510") < 0);
    assert.ok(compareJobNumbers("18510", "1842") > 0);
  });

  it("keeps hyphenated suffixes after the same major number", () => {
    assert.equal(jobNumberParts("1842").major, 1842);
    assert.equal(jobNumberParts("1842-1").major, 1842);
    assert.ok(compareJobNumbers("1842", "1842-1") < 0);
    assert.ok(compareJobNumbers("1842-1", "18510") < 0);
  });

  it("sorts the seed board lowest job number first", () => {
    const sorted = sortJobsByJobNumber(seedJobs);
    const numbers = sorted.map((job) => job.jobNumber);
    assert.equal(numbers[0], "1839");
    assert.ok(numbers.indexOf("1842") < numbers.indexOf("1858"));
    assert.deepEqual(
      [...numbers].sort((a, b) => compareJobNumbers(a, b)),
      numbers,
    );
  });

  it("sends blank job numbers to the end", () => {
    const sorted = sortJobsByJobNumber([
      { ...seedJobs[0], id: "a", jobNumber: "18510" },
      { ...seedJobs[0], id: "b", jobNumber: "" },
      { ...seedJobs[0], id: "c", jobNumber: "1842" },
    ]);
    assert.deepEqual(
      sorted.map((job) => job.jobNumber),
      ["1842", "18510", ""],
    );
  });

  it("sends zero junk to the end and sorts padded numbers with their core", () => {
    const sorted = sortJobsByJobNumber([
      { ...seedJobs[0], id: "a", jobNumber: "000" },
      { ...seedJobs[0], id: "b", jobNumber: "1842" },
      { ...seedJobs[0], id: "c", jobNumber: "01842" },
    ]);
    assert.deepEqual(
      sorted.map((job) => job.jobNumber),
      ["1842", "01842", "000"],
    );
    assert.equal(compareJobNumbers("01855", "1855"), 0);
  });
});

describe("aging board order", () => {
  const now = Date.parse("2026-10-16T15:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;

  it("puts the cart the shop has had longest first, using the Days column count", () => {
    const jobs = [
      {
        ...seedJobs[0],
        id: "short",
        jobNumber: "100",
        hcpWorkStartedAt: now - 8 * day,
        hcpScheduledStartAt: now - 30 * day,
        createdAt: now - 100 * day,
      },
      {
        ...seedJobs[0],
        id: "long",
        jobNumber: "900",
        hcpWorkStartedAt: now - 40 * day,
        hcpScheduledStartAt: now - day,
        createdAt: now - day,
      },
      {
        ...seedJobs[0],
        id: "tie-high",
        jobNumber: "18510",
        hcpWorkStartedAt: now - 8 * day,
        hcpScheduledStartAt: null,
        createdAt: now,
      },
      {
        ...seedJobs[0],
        id: "tie-low",
        jobNumber: "1842",
        hcpWorkStartedAt: now - 8 * day,
        hcpScheduledStartAt: null,
        createdAt: now,
      },
      {
        ...seedJobs[0],
        id: "fallback",
        jobNumber: "200",
        hcpWorkStartedAt: null,
        hcpScheduledStartAt: now - 12 * day,
        createdAt: now,
      },
      {
        ...seedJobs[0],
        id: "future",
        jobNumber: "1",
        hcpWorkStartedAt: now + day,
        hcpScheduledStartAt: now - 50 * day,
        createdAt: now - 50 * day,
      },
      {
        ...seedJobs[0],
        id: "none",
        jobNumber: "50",
        hcpWorkStartedAt: null,
        hcpScheduledStartAt: null,
        createdAt: now - 100 * day,
      },
      {
        ...seedJobs[0],
        id: "zero-clock",
        jobNumber: "10",
        hcpWorkStartedAt: 0,
        hcpScheduledStartAt: now - 20 * day,
        createdAt: now - 20 * day,
      },
    ];
    const sorted = sortJobsByDaysHeld(jobs, now);
    assert.deepEqual(
      sorted.map((job) => job.id),
      ["long", "fallback", "short", "tie-low", "tie-high", "future", "zero-clock", "none"],
    );
    assert.deepEqual(
      sorted.map((job) =>
        displayDaysSinceStarted(job.hcpWorkStartedAt, job.hcpScheduledStartAt, now),
      ),
      ["40", "12", "8", "8", "8", "0", "—", "—"],
    );
  });

  it("breaks an equal day count by job number, lowest first", () => {
    const sameDay = now - 9 * day;
    const sorted = sortJobsByDaysHeld(
      [
        { ...seedJobs[0], id: "b", jobNumber: "1842-1", hcpWorkStartedAt: sameDay },
        { ...seedJobs[0], id: "c", jobNumber: "18510", hcpWorkStartedAt: sameDay },
        { ...seedJobs[0], id: "a", jobNumber: "1842", hcpWorkStartedAt: sameDay },
      ],
      now,
    );
    assert.deepEqual(
      sorted.map((job) => job.jobNumber),
      ["1842", "1842-1", "18510"],
    );
  });
});
