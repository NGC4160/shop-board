import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatHcpSyncButtonLabel, formatHcpSyncFeedback } from "./hcp-sync-status.ts";

const justNow = Date.now() - 5_000;
const threeMinutesAgo = Date.now() - 3 * 60_000;

describe("formatHcpSyncButtonLabel", () => {
  it("shows Syncing… while a force sync is running", () => {
    assert.equal(formatHcpSyncButtonLabel(true), "Syncing…");
    assert.equal(formatHcpSyncButtonLabel(false), "Sync");
  });
});

describe("formatHcpSyncFeedback", () => {
  it("prefers live sync / pull copy over a stored last-sync time", () => {
    assert.equal(formatHcpSyncFeedback({ busy: true, lastSyncAt: justNow }), "Syncing…");
    assert.equal(formatHcpSyncFeedback({ busy: false, armed: true }), "Release to sync");
    assert.equal(
      formatHcpSyncFeedback({ busy: false, pulling: true, lastSyncAt: justNow }),
      "Pull to sync",
    );
  });

  it("shows the API error after a failed force sync", () => {
    assert.equal(
      formatHcpSyncFeedback({
        busy: false,
        lastResult: { ok: false, error: "Housecall Pro 502 Bad Gateway" },
        lastSyncAt: justNow,
      }),
      "Housecall Pro 502 Bad Gateway",
    );
    assert.equal(
      formatHcpSyncFeedback({ busy: false, lastResult: { ok: false } }),
      "Housecall Pro sync failed",
    );
  });

  it("shows job count and last sync time after a successful pull", () => {
    assert.equal(
      formatHcpSyncFeedback({
        busy: false,
        lastResult: { ok: true, skipped: false, count: 12 },
        lastSyncAt: justNow,
        now: justNow + 1_000,
      }),
      "12 jobs · just now",
    );
    assert.equal(
      formatHcpSyncFeedback({
        busy: false,
        lastResult: { ok: true, skipped: false, count: 0 },
        lastSyncAt: justNow,
        now: justNow + 1_000,
      }),
      "Up to date · just now",
    );
  });

  it("falls back to last sync time when this session has not clicked Sync yet", () => {
    assert.equal(
      formatHcpSyncFeedback({
        busy: false,
        lastResult: null,
        lastSyncAt: threeMinutesAgo,
        now: threeMinutesAgo + 3 * 60_000,
      }),
      "Last sync 3m ago",
    );
    assert.equal(formatHcpSyncFeedback({ busy: false, lastResult: null, lastSyncAt: null }), "");
  });
});
