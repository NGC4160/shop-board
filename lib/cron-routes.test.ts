import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { GET as getJobs } from "../app/api/cron/sync-jobs/route.ts";
import { GET as getInventory } from "../app/api/cron/sync-inventory/route.ts";
import { setHcpRetryDepsForTests } from "./hcp-retry.ts";

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const CHICAGO_7AM = Date.parse("2026-09-09T12:00:00.000Z");

const ENV_KEYS = [
  "NODE_ENV",
  "CRON_SECRET",
  "HOUSECALL_PRO_API_KEY",
  "HCP_API_KEY",
  "HOUSECALL_PRO_BEARER_TOKEN",
  "HOUSECALL_PRO_API_URL",
  "HOUSECALL_PRO_BASE_URL",
  "BLOB_READ_WRITE_TOKEN",
  "VERCEL",
] as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  setHcpRetryDepsForTests(null);
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

describe("cron routes", () => {
  it("rejects both cron routes in production when the bearer token does not match", async () => {
    withEnv({ NODE_ENV: "production", CRON_SECRET: "cron-secret" });
    const headers = { "user-agent": "vercel-cron/1.0" };
    const jobs = await getJobs(new Request("http://localhost/api/cron/sync-jobs", { headers }));
    const inventory = await getInventory(
      new Request("http://localhost/api/cron/sync-inventory", { headers }),
    );
    assert.equal(jobs.status, 401);
    assert.equal(inventory.status, 401);
  });

  it("lets the vercel-cron user-agent call inventory sync when CRON_SECRET is unset", async () => {
    withEnv({ NODE_ENV: "production" });
    const response = await getInventory(
      new Request("http://localhost/api/cron/sync-inventory", {
        headers: { "user-agent": "vercel-cron/1.0" },
      }),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; skipped: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.skipped, true);
  });

  it("does not start a second full Housecall pull after the in-fetch retry gives up", async () => {
    Date.now = () => CHICAGO_7AM;
    setHcpRetryDepsForTests({
      sleep: async () => undefined,
      random: () => 0,
      maxAttempts: 4,
    });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "unavailable" }), {
        status: 503,
        statusText: "Service Unavailable",
      });
    }) as typeof fetch;
    withEnv({
      NODE_ENV: "production",
      CRON_SECRET: "cron-secret",
      HOUSECALL_PRO_API_KEY: "test-key",
      HOUSECALL_PRO_API_URL: "https://hcp.test",
    });
    const started = performance.now();
    const response = await getJobs(
      new Request("http://localhost/api/cron/sync-jobs", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    assert.equal(response.status, 502);
    assert.equal(calls, 4);
    assert.ok(performance.now() - started < 500);
  });
});
