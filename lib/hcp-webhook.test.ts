import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { hcpWebhookJobEvent, verifyHcpWebhookSignature } from "./hcp-webhook.ts";

describe("Housecall Pro webhook", () => {
  it("accepts a signed job.completed payload and ignores other events", () => {
    const body = JSON.stringify({
      event: "job.completed",
      company_id: "co-sample",
      job: { id: "job-1", invoice_number: "173128" },
    });
    const timestamp = "1700000000";
    const signature = createHmac("sha256", "test-secret").update(`${timestamp}.${body}`).digest("hex");
    assert.equal(
      verifyHcpWebhookSignature(body, timestamp, signature, "test-secret", 1_700_000_000_000),
      true,
    );
    assert.equal(
      verifyHcpWebhookSignature(body, timestamp, signature, "other-secret", 1_700_000_000_000),
      false,
    );
    assert.deepEqual(hcpWebhookJobEvent(JSON.parse(body)), { event: "job.completed", jobId: "job-1" });
    assert.equal(hcpWebhookJobEvent({ event: "customer.updated", customer: { id: "c" } }), null);
  });
});
