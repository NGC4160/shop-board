import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { GET } from "../app/api/cron/sync-jobs/route.ts";

const originalFetch = globalThis.fetch;
const originalNow = Date.now;

const CHICAGO_7AM = Date.parse("2026-09-09T12:00:00.000Z");
const CHICAGO_6AM = Date.parse("2026-09-09T11:50:00.000Z");

const ENV_KEYS = [
  "NODE_ENV",
  "CRON_SECRET",
  "HOUSECALL_PRO_API_KEY",
  "HCP_API_KEY",
  "HOUSECALL_PRO_BEARER_TOKEN",
  "HOUSECALL_PRO_API_URL",
  "HOUSECALL_PRO_BASE_URL",
] as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
});

function cronRequest(headers?: HeadersInit): Request {
  return new Request("http://localhost/api/cron/sync-jobs", { headers });
}

function jsonResponse(body: unknown, status = 200, statusText = "OK"): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

function openJobResponse(): Response {
  return jsonResponse({
    total_pages: 1,
    jobs: [
      {
        id: "open-1",
        invoice_number: "1842",
        work_status: "scheduled",
        customer: { first_name: "Mike", last_name: "Landry" },
      },
    ],
  });
}

async function withCronEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  run: () => Promise<void>,
) {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]] as const);
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("GET /api/cron/sync-jobs", () => {
  it("rejects production calls when CRON_SECRET is unset, including vercel-cron", async () => {
    await withCronEnv({ NODE_ENV: "production" }, async () => {
      const missing = await GET(cronRequest());
      const cronUa = await GET(
        cronRequest({ "user-agent": "vercel-cron/1.0" }),
      );
      assert.equal(missing.status, 401);
      assert.deepEqual(await missing.json(), { ok: false, error: "Unauthorized" });
      assert.equal(cronUa.status, 401);
      assert.deepEqual(await cronUa.json(), { ok: false, error: "Unauthorized" });
    });
  });

  it("requires the bearer token in production and ignores the vercel-cron user-agent", async () => {
    await withCronEnv({ NODE_ENV: "production", CRON_SECRET: "cron-secret" }, async () => {
      const wrong = await GET(
        cronRequest({
          authorization: "Bearer other-secret",
          "user-agent": "vercel-cron/1.0",
        }),
      );
      const uaOnly = await GET(cronRequest({ "user-agent": "vercel-cron/1.0" }));
      assert.equal(wrong.status, 401);
      assert.equal(uaOnly.status, 401);
    });
  });

  it("allows local dev without a secret and does not sync before 7:00 AM Chicago", async () => {
    Date.now = () => CHICAGO_6AM;
    await withCronEnv({ NODE_ENV: "development" }, async () => {
      const response = await GET(cronRequest({ "user-agent": "vercel-cron/1.0" }));
      assert.equal(response.status, 200);
      const body = (await response.json()) as { ok: boolean; skipped: boolean };
      assert.equal(body.ok, true);
      assert.equal(body.skipped, true);
    });
  });

  it("syncs at 7:00 AM Chicago when the bearer token matches", async () => {
    Date.now = () => CHICAGO_7AM;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return openJobResponse();
    }) as typeof fetch;
    const started = performance.now();
    await withCronEnv(
      {
        NODE_ENV: "production",
        CRON_SECRET: "cron-secret",
        HOUSECALL_PRO_API_KEY: "test-key",
        HOUSECALL_PRO_API_URL: "https://hcp.test",
      },
      async () => {
        const response = await GET(cronRequest({ authorization: "Bearer cron-secret" }));
        assert.equal(response.status, 200);
        const body = (await response.json()) as { ok: boolean; skipped: boolean; count: number };
        assert.equal(body.ok, true);
        assert.equal(body.skipped, false);
        assert.equal(body.count, 1);
      },
    );
    assert.equal(calls, 1);
    assert.ok(performance.now() - started < 1500);
  });

  it("does not retry a skipped sync when the Housecall Pro key is missing", async () => {
    Date.now = () => CHICAGO_7AM;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("should not fetch");
    }) as typeof fetch;
    const started = performance.now();
    await withCronEnv(
      { NODE_ENV: "production", CRON_SECRET: "cron-secret" },
      async () => {
        const response = await GET(cronRequest({ authorization: "Bearer cron-secret" }));
        assert.equal(response.status, 200);
        const body = (await response.json()) as { ok: boolean; skipped: boolean; count: number };
        assert.equal(body.ok, true);
        assert.equal(body.skipped, true);
        assert.equal(body.count, 0);
      },
    );
    assert.equal(calls, 0);
    assert.ok(performance.now() - started < 1500);
  });

  it("retries once after about 2s when the Housecall Pro fetch is not ok", async () => {
    Date.now = () => CHICAGO_7AM;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: "unavailable" }, 503, "Service Unavailable");
      return openJobResponse();
    }) as typeof fetch;
    const started = performance.now();
    await withCronEnv(
      {
        NODE_ENV: "production",
        CRON_SECRET: "cron-secret",
        HOUSECALL_PRO_API_KEY: "test-key",
        HOUSECALL_PRO_API_URL: "https://hcp.test",
      },
      async () => {
        const response = await GET(cronRequest({ authorization: "Bearer cron-secret" }));
        assert.equal(response.status, 200);
        const body = (await response.json()) as { ok: boolean; skipped: boolean; count: number };
        assert.equal(body.ok, true);
        assert.equal(body.skipped, false);
        assert.equal(body.count, 1);
      },
    );
    assert.equal(calls, 2);
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= 1800, `expected one ~2s retry, took ${elapsed}ms`);
  });

  it("returns 502 after the single retry still fails", async () => {
    Date.now = () => CHICAGO_7AM;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse({ error: "unavailable" }, 503, "Service Unavailable");
    }) as typeof fetch;
    const started = performance.now();
    await withCronEnv(
      {
        NODE_ENV: "production",
        CRON_SECRET: "cron-secret",
        HOUSECALL_PRO_API_KEY: "test-key",
        HOUSECALL_PRO_API_URL: "https://hcp.test",
      },
      async () => {
        const response = await GET(cronRequest({ authorization: "Bearer cron-secret" }));
        assert.equal(response.status, 502);
        const body = (await response.json()) as { ok: boolean };
        assert.equal(body.ok, false);
      },
    );
    assert.equal(calls, 2);
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= 1800, `expected one ~2s retry, took ${elapsed}ms`);
  });
});
