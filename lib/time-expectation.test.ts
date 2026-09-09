import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TIME_PRESETS, timeExpectationError } from "./jobs.ts";

describe("timeExpectationError", () => {
  it("allows empty and every preset", () => {
    assert.equal(timeExpectationError(""), null);
    assert.equal(timeExpectationError("   "), null);
    for (const preset of TIME_PRESETS) {
      assert.equal(timeExpectationError(preset), null, preset);
    }
  });

  it("allows readable custom phrases", () => {
    for (const phrase of [
      "Promised Friday morning",
      "Due today 4:00 PM",
      "Parts ETA Wednesday",
      "Due Friday",
      "2 days",
      "in 2 days",
      "Call after lunch",
    ]) {
      assert.equal(timeExpectationError(phrase), null, phrase);
    }
  });

  it("rejects negatives", () => {
    assert.match(timeExpectationError("-3 days") ?? "", /negative/);
    assert.match(timeExpectationError("-3") ?? "", /negative/);
  });

  it("rejects bare absurd numbers and huge day counts", () => {
    for (const junk of ["999", " 999 ", "1,000", "999 days", "999 day", "in 999 days"]) {
      assert.match(timeExpectationError(junk) ?? "", /junk|readable/, junk);
    }
  });
});
