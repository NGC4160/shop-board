import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  commitOtherValue,
  customerNameError,
  hasDuplicateJobNumber,
  isBlankIdentity,
  isValidJobNumber,
  jobNumberError,
  jobNumberWarning,
  listedOtherError,
  normalizeJobNumber,
  PIPELINE_STATUSES,
  seedJobs,
} from "./jobs.ts";

describe("identity required", () => {
  it("rejects empty and whitespace-only customer names", () => {
    assert.equal(customerNameError(""), "Customer name is required");
    assert.equal(customerNameError("   "), "Customer name is required");
    assert.equal(customerNameError("\t\n"), "Customer name is required");
  });

  it("allows trimmed customer names", () => {
    assert.equal(customerNameError("Mike Landry"), null);
    assert.equal(customerNameError(" Amy "), null);
  });

  it("rejects empty and whitespace-only job numbers", () => {
    assert.equal(jobNumberError(""), "Job # is required");
    assert.equal(jobNumberError("   "), "Job # is required");
    assert.equal(isValidJobNumber(""), false);
    assert.equal(isValidJobNumber(" \t "), false);
  });

  it("rejects all-zero job numbers", () => {
    for (const junk of ["0", "00", "000", "0000", "000-1"]) {
      assert.match(jobNumberError(junk) ?? "", /zero/i, junk);
      assert.equal(isValidJobNumber(junk), false, junk);
    }
  });

  it("canonicalizes leading zeros so 01855 is the same job as 1855", () => {
    assert.equal(normalizeJobNumber("01855"), "1855");
    assert.equal(normalizeJobNumber("1855"), "1855");
    assert.equal(normalizeJobNumber("17312-1"), "17312-1");
    assert.equal(normalizeJobNumber("017312-1"), "17312-1");
    assert.equal(jobNumberError("01855"), null);
    assert.equal(jobNumberError("17312-1"), null);
    const jobs = [{ ...seedJobs[0], id: "seed-1855", jobNumber: "1855" }];
    assert.equal(hasDuplicateJobNumber(jobs, "other", "01855"), true);
    assert.equal(hasDuplicateJobNumber(jobs, "seed-1855", "01855"), false);
    assert.equal(hasDuplicateJobNumber(jobs, "other", "17312-1"), false);
    assert.match(jobNumberWarning("01855", jobs, "other"), /1855 is already on the board/);
  });

  it("keeps job format and hyphen rules", () => {
    assert.equal(jobNumberError("1842"), null);
    assert.equal(jobNumberError("17312-1"), null);
    assert.equal(jobNumberError("10"), null);
    assert.match(jobNumberError("abc") ?? "", /digits/);
    assert.match(jobNumberError("17312-a") ?? "", /digits/);
  });

  it("treats a row with no name and no job as blank identity", () => {
    assert.equal(isBlankIdentity({ customerName: "", jobNumber: "" }), true);
    assert.equal(isBlankIdentity({ customerName: "  ", jobNumber: "  " }), true);
    assert.equal(isBlankIdentity({ customerName: "Amy", jobNumber: "" }), false);
    assert.equal(isBlankIdentity({ customerName: "", jobNumber: "1842" }), false);
  });

  it("blocks Other… values that match a listed pipeline stage", () => {
    assert.equal(listedOtherError("In Progress", PIPELINE_STATUSES), "Pick it from the list");
    assert.equal(listedOtherError("in progress", PIPELINE_STATUSES), "Pick it from the list");
    assert.equal(listedOtherError("Waiting on Jesse", PIPELINE_STATUSES), null);
    assert.equal(listedOtherError("", PIPELINE_STATUSES), null);
  });

  it("empty Other… clears Tech but reverts Status/Next/Time", () => {
    assert.deepEqual(commitOtherValue("", "Hayden Silva", "Unassigned"), {
      next: "",
      persist: true,
    });
    assert.deepEqual(commitOtherValue("", "In Progress"), {
      next: "In Progress",
      persist: false,
    });
    assert.deepEqual(commitOtherValue("", "Call customer"), {
      next: "Call customer",
      persist: false,
    });
    assert.deepEqual(commitOtherValue("", "Due today"), {
      next: "Due today",
      persist: false,
    });
    assert.deepEqual(commitOtherValue("Waiting on Jesse", "New Job"), {
      next: "Waiting on Jesse",
      persist: true,
    });
  });
});
