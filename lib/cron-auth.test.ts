import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isAuthorizedCron } from "./cron-auth.ts";

const ENV_KEYS = ["NODE_ENV", "CRON_SECRET"] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

function call(headers?: HeadersInit) {
  return isAuthorizedCron(new Request("http://localhost/api/cron/sync-jobs", { headers }));
}

describe("cron authorization", () => {
  it("requires the bearer token when CRON_SECRET is set and ignores the vercel-cron user-agent", () => {
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "cron-secret";
    assert.equal(call({ authorization: "Bearer cron-secret" }), true);
    assert.equal(
      call({ authorization: "Bearer other", "user-agent": "vercel-cron/1.0" }),
      false,
    );
    assert.equal(call({ "user-agent": "vercel-cron/1.0" }), false);
    assert.equal(call(), false);
  });

  it("accepts the vercel-cron user-agent in production only when CRON_SECRET is unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CRON_SECRET;
    assert.equal(call({ "user-agent": "vercel-cron/1.0" }), true);
    assert.equal(call(), false);
  });

  it("allows local dev without a secret and still requires the bearer token when one is set", () => {
    process.env.NODE_ENV = "development";
    delete process.env.CRON_SECRET;
    assert.equal(call(), true);
    process.env.CRON_SECRET = "cron-secret";
    assert.equal(call(), false);
    assert.equal(call({ authorization: "Bearer cron-secret" }), true);
  });
});
