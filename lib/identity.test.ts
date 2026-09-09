import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerNameError,
  isBlankIdentity,
  isValidJobNumber,
  jobNumberError,
  listedOtherError,
  PIPELINE_STATUSES,
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

  it("rejects all-zero and leading-zero job numbers", () => {
    for (const junk of ["0", "00", "000", "0000", "01842", "000-1", "017312-1"]) {
      assert.match(jobNumberError(junk) ?? "", /zero/i, junk);
      assert.equal(isValidJobNumber(junk), false, junk);
    }
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
});
