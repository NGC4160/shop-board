import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerNameError,
  isBlankIdentity,
  isValidJobNumber,
  jobNumberError,
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
  });

  it("keeps job format and hyphen rules", () => {
    assert.equal(jobNumberError("1842"), null);
    assert.equal(jobNumberError("17312-1"), null);
    assert.match(jobNumberError("abc") ?? "", /digits/);
    assert.match(jobNumberError("17312-a") ?? "", /digits/);
  });

  it("treats a row with no name and no job as blank identity", () => {
    assert.equal(isBlankIdentity({ customerName: "", jobNumber: "" }), true);
    assert.equal(isBlankIdentity({ customerName: "  ", jobNumber: "  " }), true);
    assert.equal(isBlankIdentity({ customerName: "Amy", jobNumber: "" }), false);
    assert.equal(isBlankIdentity({ customerName: "", jobNumber: "1842" }), false);
  });
});
