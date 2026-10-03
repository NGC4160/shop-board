import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorizePartsWrite, isPartsWriteConfigured, readBearerToken } from "./parts-auth.ts";

describe("parts write token", () => {
  it("reads a Bearer token and rejects a missing or wrong token", () => {
    const previous = process.env.PARTS_WRITE_TOKEN;
    process.env.PARTS_WRITE_TOKEN = "shop-parts-secret";
    try {
      assert.equal(isPartsWriteConfigured(), true);
      const ok = new Request("http://localhost/api/parts", {
        headers: { authorization: "Bearer shop-parts-secret" },
      });
      const missing = new Request("http://localhost/api/parts");
      const wrong = new Request("http://localhost/api/parts", {
        headers: { authorization: "Bearer other-secret" },
      });
      assert.equal(readBearerToken(ok), "shop-parts-secret");
      assert.equal(authorizePartsWrite(ok), true);
      assert.equal(authorizePartsWrite(missing), false);
      assert.equal(authorizePartsWrite(wrong), false);
    } finally {
      if (previous === undefined) delete process.env.PARTS_WRITE_TOKEN;
      else process.env.PARTS_WRITE_TOKEN = previous;
    }
  });

  it("does not authorize when the env var is unset", () => {
    const previous = process.env.PARTS_WRITE_TOKEN;
    delete process.env.PARTS_WRITE_TOKEN;
    try {
      assert.equal(isPartsWriteConfigured(), false);
      const request = new Request("http://localhost/api/parts", {
        headers: { authorization: "Bearer shop-parts-secret" },
      });
      assert.equal(authorizePartsWrite(request), false);
    } finally {
      if (previous === undefined) delete process.env.PARTS_WRITE_TOKEN;
      else process.env.PARTS_WRITE_TOKEN = previous;
    }
  });
});
