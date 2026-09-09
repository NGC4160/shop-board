import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareJobNumbers,
  jobNumberParts,
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
});
