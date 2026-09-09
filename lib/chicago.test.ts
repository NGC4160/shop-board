import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chicagoParts, isChicagoSevenAmHour, shouldSyncHcpNow } from "./chicago.ts";

describe("America/Chicago 7am sync window", () => {
  it("treats 12:00 UTC in September as 7:00 AM CDT", () => {
    const ms = Date.parse("2026-09-09T12:00:00.000Z");
    assert.equal(chicagoParts(ms).hour, 7);
    assert.equal(isChicagoSevenAmHour(ms), true);
  });

  it("treats 13:00 UTC in January as 7:00 AM CST", () => {
    const ms = Date.parse("2026-01-15T13:00:00.000Z");
    assert.equal(chicagoParts(ms).hour, 7);
    assert.equal(isChicagoSevenAmHour(ms), true);
  });

  it("does not sync before 7:00 AM Chicago", () => {
    const sixFifty = Date.parse("2026-09-09T11:50:00.000Z");
    assert.equal(chicagoParts(sixFifty).hour, 6);
    assert.equal(shouldSyncHcpNow(null, sixFifty), false);
  });

  it("syncs after 7:00 AM if not yet synced today", () => {
    const eight = Date.parse("2026-09-09T13:00:00.000Z");
    assert.equal(shouldSyncHcpNow(null, eight), true);
    const yesterday = Date.parse("2026-09-08T12:05:00.000Z");
    assert.equal(shouldSyncHcpNow(yesterday, eight), true);
  });

  it("does not sync twice after 7:00 AM the same Chicago day", () => {
    const seven = Date.parse("2026-09-09T12:00:00.000Z");
    const noon = Date.parse("2026-09-09T17:00:00.000Z");
    assert.equal(shouldSyncHcpNow(seven, noon), false);
  });
});
