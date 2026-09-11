import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampScrollOffset, documentScrollNeedsReset } from "./viewport.ts";

describe("clampScrollOffset", () => {
  it("keeps a valid offset and clamps leftover keyboard pan", () => {
    assert.equal(clampScrollOffset(120, 800, 390), 120);
    assert.equal(clampScrollOffset(900, 800, 390), 410);
    assert.equal(clampScrollOffset(-40, 800, 390), 0);
    assert.equal(clampScrollOffset(12, 300, 390), 0);
  });
});

describe("documentScrollNeedsReset", () => {
  it("detects a leftover window scroll after iOS keyboard dismiss", () => {
    assert.equal(documentScrollNeedsReset(0, 0), false);
    assert.equal(documentScrollNeedsReset(140, 0), true);
    assert.equal(documentScrollNeedsReset(0, 64), true);
  });
});
