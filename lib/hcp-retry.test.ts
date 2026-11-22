import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fetchHcpOpenJobs } from "./hcp.ts";
import {
  backoffDelayMs,
  parseRetryAfter,
  setHcpRetryDepsForTests,
} from "./hcp-retry.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  setHcpRetryDepsForTests(null);
});

describe("HCP retry schedule", () => {
  it("honors Retry-After seconds and HTTP dates", () => {
    assert.equal(parseRetryAfter("2"), 2_000);
    assert.equal(parseRetryAfter("0"), 0);
    const now = Date.parse("2026-10-16T04:00:00.000Z");
    assert.equal(parseRetryAfter("Thu, 16 Oct 2026 04:00:03 GMT", now), 3_000);
    assert.equal(parseRetryAfter("not-a-date"), null);
  });

  it("uses exponential backoff with jitter", () => {
    assert.equal(backoffDelayMs(0, () => 0, 250, 8_000), 125);
    assert.equal(backoffDelayMs(1, () => 0, 250, 8_000), 250);
    assert.equal(backoffDelayMs(2, () => 1, 250, 8_000), 1_000);
    assert.equal(backoffDelayMs(10, () => 1, 250, 8_000), 8_000);
  });
});

describe("fetchHcpOpenJobs retries", () => {
  const env = { HOUSECALL_PRO_API_KEY: "test-key" } as NodeJS.ProcessEnv;

  function jsonResponse(body: unknown, status: number, headers?: Record<string, string>) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  it("retries a 429 using Retry-After, then reads the jobs", async () => {
    const sleeps: number[] = [];
    setHcpRetryDepsForTests({
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: "slow down" }, 429, { "Retry-After": "2" });
      return jsonResponse({
        jobs: [{ id: "j1", invoice_number: "173128", work_status: "scheduled", customer: { first_name: "Mike", last_name: "Landry" } }],
        total_pages: 1,
      }, 200);
    }) as typeof fetch;

    const result = await fetchHcpOpenJobs(env);
    assert.equal(result.ok, true);
    if (!result.ok || result.skipped) return;
    assert.equal(result.jobs[0]?.jobNumber, "173128");
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [2_000]);
  });

  it("retries a 500 with backoff and does not retry a 400", async () => {
    const sleeps: number[] = [];
    setHcpRetryDepsForTests({
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: "unavailable" }, 500);
      return jsonResponse({ jobs: [], total_pages: 1 }, 200);
    }) as typeof fetch;
    const recovered = await fetchHcpOpenJobs(env);
    assert.equal(recovered.ok, true);
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [125]);

    sleeps.length = 0;
    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse({ error: "bad filter" }, 400);
    }) as typeof fetch;
    const rejected = await fetchHcpOpenJobs(env);
    assert.equal(rejected.ok, false);
    assert.equal(calls, 1);
    assert.deepEqual(sleeps, []);
  });

  it("retries a network error", async () => {
    const sleeps: number[] = [];
    setHcpRetryDepsForTests({
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("network down");
      return jsonResponse({ jobs: [], total_pages: 1 }, 200);
    }) as typeof fetch;
    const result = await fetchHcpOpenJobs(env);
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [125]);
  });

  it("stops after the attempt cap", async () => {
    const sleeps: number[] = [];
    setHcpRetryDepsForTests({
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
      maxAttempts: 3,
    });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse({ error: "still down" }, 503);
    }) as typeof fetch;
    const result = await fetchHcpOpenJobs(env);
    assert.equal(result.ok, false);
    assert.equal(calls, 3);
    assert.equal(sleeps.length, 2);
  });
});
