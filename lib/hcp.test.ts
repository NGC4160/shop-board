import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildHcpJobsListUrl,
  customerNameFromHcp,
  fetchHcpOpenJobs,
  formatHcpHttpError,
  hcpErrorDetail,
  isOpenHcpWorkStatus,
  jobNumberFromHcp,
  mapHcpJob,
} from "./hcp.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200, statusText = "OK"): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(
  impl: (url: URL, init?: RequestInit) => Promise<Response> | Response,
): { calls: URL[] } {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    return impl(url, init);
  }) as typeof fetch;
  return { calls };
}

describe("buildHcpJobsListUrl", () => {
  it("uses only page and page_size", () => {
    const url = buildHcpJobsListUrl("https://api.housecallpro.com/", 2);
    assert.equal(url.origin + url.pathname, "https://api.housecallpro.com/jobs");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("page_size"), "100");
    assert.equal([...url.searchParams.keys()].sort().join(","), "page,page_size");
    assert.equal(url.search.includes("sort_"), false);
    assert.equal(url.search.includes("work_status"), false);
  });
});

describe("customerNameFromHcp", () => {
  it("prefers first + last name over company", () => {
    assert.equal(
      customerNameFromHcp({
        first_name: "Mike",
        last_name: "Landry",
        company: "Neighborhood Golf Carts",
        company_name: "Neighborhood Golf Carts",
      }),
      "Mike Landry",
    );
  });

  it("uses a single person field when the other is blank", () => {
    assert.equal(
      customerNameFromHcp({ first_name: "Sharon", last_name: "", company: "Neighborhood Golf Carts" }),
      "Sharon",
    );
    assert.equal(
      customerNameFromHcp({ first_name: "", last_name: "Badeaux", company: "Acme" }),
      "Badeaux",
    );
  });

  it("uses company only when there is no person name", () => {
    assert.equal(
      customerNameFromHcp({
        first_name: "",
        last_name: "  ",
        company: "The Landing HOA",
        company_name: "Ignored when company is set",
      }),
      "The Landing HOA",
    );
    assert.equal(
      customerNameFromHcp({ company_name: "Fairway Estates" }),
      "Fairway Estates",
    );
  });

  it("uses display_name / name only when there is no person", () => {
    assert.equal(
      customerNameFromHcp({
        first_name: "James",
        display_name: "Neighborhood Golf Carts",
      }),
      "James",
    );
    assert.equal(
      customerNameFromHcp({ display_name: "Coach Williams", company: "NGC" }),
      "Coach Williams",
    );
    assert.equal(customerNameFromHcp({ name: "Kayla Guidry" }), "Kayla Guidry");
  });

  it("leaves an empty customer empty — does not invent a name", () => {
    assert.equal(customerNameFromHcp(null), "");
    assert.equal(customerNameFromHcp(undefined), "");
    assert.equal(customerNameFromHcp({}), "");
    assert.equal(customerNameFromHcp({ first_name: "  ", last_name: "", company: "" }), "");
  });
});

describe("jobNumberFromHcp", () => {
  it("uses invoice_number as the shop-facing Housecall job #", () => {
    assert.equal(jobNumberFromHcp({ invoice_number: "173128", job_number: "1842" }), "173128");
    assert.equal(jobNumberFromHcp({ invoice_number: 173128 }), "173128");
    assert.equal(jobNumberFromHcp({ job_number: "1842" }), "1842");
    assert.equal(jobNumberFromHcp({}), "");
  });
});

describe("isOpenHcpWorkStatus", () => {
  it("keeps blank and in-progress jobs", () => {
    assert.equal(isOpenHcpWorkStatus(""), true);
    assert.equal(isOpenHcpWorkStatus("in_progress"), true);
    assert.equal(isOpenHcpWorkStatus("scheduled"), true);
    assert.equal(isOpenHcpWorkStatus("needs scheduling"), true);
  });

  it("drops completed and canceled variants", () => {
    assert.equal(isOpenHcpWorkStatus("completed"), false);
    assert.equal(isOpenHcpWorkStatus("complete_rated"), false);
    assert.equal(isOpenHcpWorkStatus("user canceled"), false);
    assert.equal(isOpenHcpWorkStatus("pro_canceled"), false);
  });
});

describe("hcpErrorDetail / formatHcpHttpError", () => {
  it("prefers a string error field", () => {
    assert.equal(hcpErrorDetail({ error: "work_status filter must be an array" }), "work_status filter must be an array");
  });

  it("joins Rails-style errors objects", () => {
    assert.equal(
      hcpErrorDetail({ errors: { work_status: ["must be an array"] } }),
      "work_status must be an array",
    );
  });

  it("appends the HCP body to the HTTP status line", () => {
    assert.equal(
      formatHcpHttpError(400, "Bad Request", { errors: ["sort_by is invalid"] }),
      "Housecall Pro 400 Bad Request: sort_by is invalid",
    );
  });

  it("falls back to status text when the body is empty", () => {
    assert.equal(formatHcpHttpError(400, "Bad Request", null), "Housecall Pro 400 Bad Request");
  });
});

describe("fetchHcpOpenJobs", () => {
  const env = {
    HOUSECALL_PRO_API_KEY: "test-key",
    HOUSECALL_PRO_API_URL: "https://hcp.test",
  };

  it("skips when no API key is set", async () => {
    const { calls } = mockFetch(() => {
      throw new Error("should not fetch");
    });
    const result = await fetchHcpOpenJobs({});
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(calls.length, 0);
  });

  it("requests only page/page_size and filters closed jobs after fetch", async () => {
    const { calls } = mockFetch((url) => {
      assert.equal(url.origin, "https://hcp.test");
      assert.equal(url.pathname, "/jobs");
      assert.equal([...url.searchParams.keys()].sort().join(","), "page,page_size");
      return jsonResponse({
        total_pages: 1,
        jobs: [
          {
            id: "open-1",
            invoice_number: "1842",
            work_status: "in progress",
            customer: { first_name: "Mike", last_name: "Landry" },
          },
          {
            id: "done-1",
            invoice_number: "1801",
            work_status: "completed",
            customer: { first_name: "Done" },
          },
          {
            id: "cancel-1",
            invoice_number: "1802",
            work_status: "user canceled",
            customer: { first_name: "Cancel" },
          },
          {
            id: "open-2",
            invoice_number: "1851",
            work_status: "unscheduled",
            tags: ["Awaiting QC"],
            customer: { first_name: "James", last_name: "Williams" },
          },
        ],
      });
    });

    const result = await fetchHcpOpenJobs(env);
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
    if (!result.ok || result.skipped) throw new Error("expected success");
    assert.equal(calls.length, 1);
    assert.equal(result.pageCount, 1);
    assert.deepEqual(
      result.jobs.map((job) => ({ jobNumber: job.jobNumber, status: job.status })),
      [
        { jobNumber: "1842", status: "In Progress" },
        { jobNumber: "1851", status: "Awaiting QC" },
      ],
    );
    assert.equal(mapHcpJob({ invoice_number: "1801", work_status: "completed" }), null);
  });

  it("keeps paging when a full page has no total_pages", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      id: `p1-${i}`,
      invoice_number: String(1000 + i),
      work_status: i === 0 ? "scheduled" : "completed",
    }));
    const { calls } = mockFetch((url) => {
      if (url.searchParams.get("page") === "1") {
        return jsonResponse({ jobs: fullPage });
      }
      return jsonResponse({
        jobs: [{ id: "p2", invoice_number: "2001", work_status: "unscheduled" }],
      });
    });

    const result = await fetchHcpOpenJobs(env);
    assert.equal(result.ok, true);
    if (!result.ok || result.skipped) throw new Error("expected success");
    assert.equal(calls.length, 2);
    assert.equal(result.jobs.some((job) => job.jobNumber === "1000"), true);
    assert.equal(result.jobs.some((job) => job.jobNumber === "2001"), true);
    assert.equal(result.jobs.length, 2);
  });

  it("paginates when HCP reports total_pages", async () => {
    const { calls } = mockFetch((url) => {
      const page = url.searchParams.get("page");
      if (page === "1") {
        return jsonResponse({
          total_pages: 2,
          jobs: [{ id: "a", invoice_number: "1", work_status: "scheduled" }],
        });
      }
      return jsonResponse({
        total_pages: 2,
        jobs: [{ id: "b", invoice_number: "2", work_status: "scheduled" }],
      });
    });

    const result = await fetchHcpOpenJobs(env);
    assert.equal(result.ok, true);
    if (!result.ok || result.skipped) throw new Error("expected success");
    assert.equal(calls.length, 2);
    assert.equal(result.pageCount, 2);
    assert.equal(result.jobs.length, 2);
  });

  it("passes through HCP 400 body text", async () => {
    mockFetch(() =>
      jsonResponse({ errors: { work_status: ["must be an array"] } }, 400, "Bad Request"),
    );
    const result = await fetchHcpOpenJobs(env);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected failure");
    assert.match(result.error, /400/);
    assert.match(result.error, /work_status must be an array/);
  });
});
