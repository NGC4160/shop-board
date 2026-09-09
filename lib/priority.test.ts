import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRIORITY_LABEL, nextPriority } from "./jobs.ts";

describe("flag cycle", () => {
  it("walks none → hot → promised → waiting → none", () => {
    assert.equal(nextPriority("none"), "hot");
    assert.equal(nextPriority("hot"), "promised");
    assert.equal(nextPriority("promised"), "waiting");
    assert.equal(nextPriority("waiting"), "none");
  });

  it("labels stay shop-floor words", () => {
    assert.equal(PRIORITY_LABEL.hot, "Hot");
    assert.equal(PRIORITY_LABEL.promised, "Promised");
    assert.equal(PRIORITY_LABEL.waiting, "Waiting");
    assert.equal(PRIORITY_LABEL.none, "No flag");
  });
});
