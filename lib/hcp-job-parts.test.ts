import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completedJobsListUrl,
  listCompletedHcpJobsSince,
  materialUsesFromJobInputs,
  materialUsesFromLineItems,
  mergeMaterialsAndJobInputs,
} from "./hcp-job-parts.ts";

describe("Housecall Pro part reads", () => {
  it("keeps material line items and material job inputs as separate uses", () => {
    const materials = materialUsesFromLineItems({
      data: [
        {
          id: "li-labor",
          name: "Shop labor",
          kind: "labor",
          quantity: 1,
        },
        {
          id: "li-mat",
          name: "Example solenoid",
          description: "Shelf",
          kind: "materials",
          quantity: 2,
          service_item_id: "pb_mat_9",
          service_item_type: "pricebook_material",
        },
      ],
    });
    const inputs = materialUsesFromJobInputs({
      job_input_materials: [
        {
          uuid: "in-1",
          name: "Example cable",
          description: "",
          part_number: "PN-2",
          unit_cost: 250,
          quantity: 1.5,
        },
      ],
    });
    assert.equal(materials.length, 1);
    assert.equal(materials[0]?.source, "materials");
    assert.equal(materials[0]?.qty, 2);
    assert.equal(materials[0]?.hcpMaterialId, "pb_mat_9");
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0]?.source, "job_inputs");
    assert.equal(inputs[0]?.partNumber, "PN-2");
    assert.equal(inputs[0]?.qty, 1.5);
    const merged = mergeMaterialsAndJobInputs(materials, inputs);
    assert.equal(merged.length, 2);
  });
});

describe("completed job list", () => {
  it("filters with the documented completed status and sorts by updated_at", () => {
    const url = completedJobsListUrl("https://hcp.test", 2, "sorted");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("work_status[]"), "completed");
    assert.equal(url.searchParams.get("sort_by"), "updated_at");
    assert.equal(url.searchParams.get("sort_direction"), "desc");
    assert.equal(url.searchParams.has("work_status"), false);
  });

  it("includes a recently finished older job and stops once updated_at is past the window", async () => {
    const original = globalThis.fetch;
    const since = Date.parse("2026-10-20T12:00:00.000Z");
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(`${url.pathname}${url.search}`);
      const page = url.searchParams.get("page");
      const jobs =
        page === "1"
          ? Array.from({ length: 100 }, (_, index) => ({
              id: index === 99 ? "finished-today" : `older-${index}`,
              work_status: "complete rated",
              created_at: "2026-08-01T00:00:00.000Z",
              updated_at: index === 99 ? "2026-10-20T15:00:00.000Z" : "2026-10-20T13:00:00.000Z",
              work_timestamps: {
                completed_at: index === 99 ? "2026-10-20T15:00:00.000Z" : "2026-10-01T00:00:00.000Z",
              },
            }))
          : [
              {
                id: "finished-last-week",
                work_status: "complete unrated",
                created_at: "2026-10-19T00:00:00.000Z",
                updated_at: "2026-10-19T00:00:00.000Z",
                work_timestamps: { completed_at: "2026-10-19T00:00:00.000Z" },
              },
            ];
      return new Response(JSON.stringify({ jobs, total_pages: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const result = await listCompletedHcpJobsSince(since, {
        HOUSECALL_PRO_API_KEY: "test-key",
        HOUSECALL_PRO_API_URL: "https://hcp.test",
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.deepEqual(
        result.jobs.map((job) => job.hcpJobId),
        ["finished-today"],
      );
      assert.equal(calls.length, 2);
      assert.match(calls[0] ?? "", /sort_by=updated_at/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("drops sort_by when Housecall rejects it and still reads the page", async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url.search);
      if (url.searchParams.get("sort_by")) {
        return new Response(JSON.stringify({ errors: ["sort_by is invalid"] }), { status: 400 });
      }
      return new Response(
        JSON.stringify({
          jobs: [
            {
              id: "job-1",
              work_status: "complete rated",
              updated_at: "2026-10-20T15:00:00.000Z",
              work_timestamps: { completed_at: "2026-10-20T15:00:00.000Z" },
            },
          ],
          total_pages: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const result = await listCompletedHcpJobsSince(Date.parse("2026-10-20T12:00:00.000Z"), {
        HOUSECALL_PRO_API_KEY: "test-key",
        HOUSECALL_PRO_API_URL: "https://hcp.test",
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.deepEqual(result.jobs.map((job) => job.hcpJobId), ["job-1"]);
      assert.match(calls[1] ?? "", /work_status(?:%5B%5D|\[\])=completed/);
      assert.equal(calls[1]?.includes("sort_by"), false);
    } finally {
      globalThis.fetch = original;
    }
  });
});
