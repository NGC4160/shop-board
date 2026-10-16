import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedJobs } from "./jobs.ts";
import { SAMPLE_PART_LINE } from "./parts.ts";
import { applyIncomingPartsPut } from "./parts-board.ts";
import { validateBoardPut } from "./validate-board.ts";
import { validatePartUpsertFields, validatePartsPut } from "./validate-parts.ts";

const validJob = () => structuredClone(seedJobs[0]);

describe("validateBoardPut", () => {
  it("accepts a real board row", () => {
    const result = validateBoardPut({
      jobs: [validJob()],
      prefs: { hideClosed: true, timeframe: "" },
      dismissedJobNumbers: [],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.jobs.length, 1);
    assert.equal(result.value.jobs[0]?.jobNumber, seedJobs[0].jobNumber);
  });

  it("rejects a payload that is not an object", () => {
    const result = validateBoardPut([]);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /JSON object/);
  });

  it("rejects a missing jobs array instead of wiping the board", () => {
    const result = validateBoardPut({ prefs: { hideClosed: true, timeframe: "" } });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /jobs must be an array/);
  });

  it("rejects an invalid job number with the row number", () => {
    const result = validateBoardPut({
      jobs: [{ ...validJob(), jobNumber: "000" }],
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /Job 1/);
    assert.match(result.error, /zeros/);
  });

  it("rejects a timeframe phrase instead of clearing it", () => {
    const result = validateBoardPut({
      jobs: [{ ...validJob(), timeExpectation: "this week" }],
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /YYYY-MM-DD/);
  });

  it("rejects a duplicate job number", () => {
    const result = validateBoardPut({
      jobs: [validJob(), { ...validJob(), id: "other-id" }],
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /more than once/);
  });

  it("still allows an empty customer when Housecall Pro cleared a shop name", () => {
    const result = validateBoardPut({
      jobs: [{ ...validJob(), customerName: "" }],
    });
    assert.equal(result.ok, true);
  });

  it("allows a custom Other… status that is not a pipeline name", () => {
    const result = validateBoardPut({
      jobs: [{ ...validJob(), status: "Waiting on Ryan" }],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.jobs[0]?.status, "Waiting on Ryan");
  });
});

describe("validatePartsPut", () => {
  it("rejects an unknown status with the allowed list", () => {
    const result = validatePartsPut({
      parts: [{ ...SAMPLE_PART_LINE, status: "Overnighted" }],
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /Part 1/);
    assert.match(result.error, /Checked in/);
  });

  it("rejects a junk expected date", () => {
    const result = validatePartsPut({
      parts: [{ ...SAMPLE_PART_LINE, expectedDate: "next week" }],
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /YYYY-MM-DD/);
  });

  it("rejects a duplicate part id", () => {
    const result = validatePartsPut({
      parts: [SAMPLE_PART_LINE, { ...SAMPLE_PART_LINE }],
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /already used/);
  });

  it("keeps Checked in as a real status", () => {
    const result = validatePartsPut({
      parts: [{ ...SAMPLE_PART_LINE, status: "Checked in" }],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value[0]?.status, "Checked in");
  });

  it("does not apply a malformed parts PUT", () => {
    const current = {
      version: 1 as const,
      updatedAt: 1,
      parts: [SAMPLE_PART_LINE],
    };
    const result = applyIncomingPartsPut(current, { parts: [{ id: "x" }] });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /customer is required/);
  });
});

describe("validatePartUpsertFields", () => {
  it("rejects an unknown status on a token upsert", () => {
    const error = validatePartUpsertFields({ id: "po-1", status: "Lost" });
    assert.ok(error);
    assert.match(error, /Status must be one of/);
  });

  it("allows a partial upsert that omits status", () => {
    assert.equal(validatePartUpsertFields({ id: "po-1", note: "On the shelf" }), null);
  });
});
