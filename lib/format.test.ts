import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCreatedDate } from "./format.ts";

describe("formatCreatedDate", () => {
  it("formats a timestamp in America/Chicago and never invents missing dates", () => {
    assert.equal(formatCreatedDate(Date.parse("2026-09-12T16:00:00.000Z")), "Sep 12, 2026");
    // 04:00 UTC is still Sep 11 in Chicago (CDT).
    assert.equal(formatCreatedDate(Date.parse("2026-09-12T04:00:00.000Z")), "Sep 11, 2026");
    assert.equal(formatCreatedDate(null), "—");
    assert.equal(formatCreatedDate(undefined), "—");
    assert.equal(formatCreatedDate(0), "—");
    assert.equal(formatCreatedDate(Number.NaN), "—");
  });
});
