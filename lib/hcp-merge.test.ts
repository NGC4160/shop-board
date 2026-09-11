import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasStaleHcpCompanyCustomerName,
  mergeHcpJobs,
  shouldFetchHcpJobs,
  shouldRunHcpClientFetch,
  STALE_HCP_COMPANY_CUSTOMER,
} from "./hcp-merge.ts";
import { mapHcpJob } from "./hcp.ts";
import { seedJobs } from "./jobs.ts";

describe("mapHcpJob", () => {
  it("maps invoice number, customer, and open work status", () => {
    const mapped = mapHcpJob({
      id: "abc",
      invoice_number: "1842",
      work_status: "in progress",
      customer: { first_name: "Mike", last_name: "Landry", mobile_number: "985-555-0142" },
      assigned_employees: [{ first_name: "Hayden", last_name: "Silva", role: "field_tech" }],
    });
    assert.ok(mapped);
    assert.equal(mapped?.jobNumber, "1842");
    assert.equal(mapped?.customerName, "Mike Landry");
    assert.equal(mapped?.status, "In Progress");
    assert.equal(mapped?.statusIsPipeline, false);
    assert.equal(mapped?.primaryTech, "Hayden Silva");
  });

  it("prefers an exact Jobs pipeline tag over coarse work_status", () => {
    const mapped = mapHcpJob({
      id: "abc",
      invoice_number: "1853",
      work_status: "in progress",
      tags: ["Awaiting QC"],
      customer: { first_name: "Robert", last_name: "Vicknair" },
    });
    assert.equal(mapped?.status, "Awaiting QC");
    assert.equal(mapped?.statusIsPipeline, true);
  });

  it("drops canceled jobs", () => {
    assert.equal(
      mapHcpJob({
        id: "x",
        invoice_number: "1",
        work_status: "user canceled",
        customer: { first_name: "A" },
      }),
      null,
    );
  });

  it("maps a person name even when HCP also sends the shop as company", () => {
    const mapped = mapHcpJob({
      id: "abc",
      invoice_number: "173128",
      work_status: "scheduled",
      customer: {
        first_name: "Mike",
        last_name: "Landry",
        company: "Neighborhood Golf Carts",
      },
    });
    assert.equal(mapped?.jobNumber, "173128");
    assert.equal(mapped?.customerName, "Mike Landry");
  });
});

describe("mergeHcpJobs", () => {
  it("updates customer/status from HCP without wiping next action or time", () => {
    const local = seedJobs.filter((job) => job.jobNumber === "1842");
    assert.equal(local.length, 1);
    const existing = local[0];
    const { jobs, added, updated } = mergeHcpJobs(local, [
      {
        hcpId: "hcp-1842",
        jobNumber: "1842",
        customerName: "Mike Landry Jr",
        phone: "985-555-0142",
        status: "Awaiting QC",
        statusIsPipeline: true,
        primaryTech: "Marlon Gray",
      },
    ]);
    assert.equal(added, 0);
    assert.equal(updated, 1);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].customerName, "Mike Landry Jr");
    assert.equal(jobs[0].status, "Awaiting QC");
    assert.equal(jobs[0].nextAction, existing.nextAction);
    assert.equal(jobs[0].timeExpectation, existing.timeExpectation);
    assert.equal(jobs[0].notes, existing.notes);
    assert.equal(jobs[0].primaryTech, existing.primaryTech);
    assert.equal(jobs[0].bay, existing.bay);
  });

  it("does not overwrite a shop pipeline status with coarse work_status", () => {
    const local = seedJobs.filter((job) => job.jobNumber === "1853");
    const { jobs } = mergeHcpJobs(local, [
      {
        hcpId: "hcp-1853",
        jobNumber: "1853",
        customerName: "Robert Vicknair",
        phone: "",
        status: "In Progress",
        statusIsPipeline: false,
        primaryTech: "",
      },
    ]);
    assert.equal(jobs[0].status, "Awaiting QC");
  });

  it("adds new HCP jobs and keeps local-only rows", () => {
    const local = seedJobs.filter((job) => job.jobNumber === "1842");
    const { jobs, added } = mergeHcpJobs(local, [
      {
        hcpId: "new",
        jobNumber: "1901",
        customerName: "New Customer",
        phone: "",
        status: "New Job",
        statusIsPipeline: true,
        primaryTech: "",
      },
    ]);
    assert.equal(added, 1);
    assert.equal(jobs.some((job) => job.jobNumber === "1842"), true);
    assert.equal(jobs.some((job) => job.jobNumber === "1901"), true);
  });

  it("treats only the exact shop company string as stale", () => {
    assert.equal(hasStaleHcpCompanyCustomerName([{ customerName: STALE_HCP_COMPANY_CUSTOMER }]), true);
    assert.equal(hasStaleHcpCompanyCustomerName([{ customerName: "neighborhood golf carts" }]), false);
    assert.equal(hasStaleHcpCompanyCustomerName([{ customerName: "Mike Landry" }]), false);
    assert.equal(hasStaleHcpCompanyCustomerName([]), false);
  });

  it("fetches when already synced today if a stale shop company name is still on the board", () => {
    const seven = Date.parse("2026-09-09T12:00:00.000Z");
    const noon = Date.parse("2026-09-09T17:00:00.000Z");
    assert.equal(
      shouldFetchHcpJobs(seven, [{ customerName: STALE_HCP_COMPANY_CUSTOMER }], noon),
      true,
    );
    assert.equal(shouldFetchHcpJobs(seven, [{ customerName: "Mike Landry" }], noon), false);
    assert.equal(
      shouldFetchHcpJobs(seven, [{ customerName: STALE_HCP_COMPANY_CUSTOMER }], noon, true),
      false,
    );
    const sixFifty = Date.parse("2026-09-09T11:50:00.000Z");
    assert.equal(
      shouldFetchHcpJobs(seven, [{ customerName: STALE_HCP_COMPANY_CUSTOMER }], sixFifty),
      true,
    );
  });

  it("force refresh fetches even when already synced today", () => {
    const seven = Date.parse("2026-09-09T12:00:00.000Z");
    const noon = Date.parse("2026-09-09T17:00:00.000Z");
    assert.equal(shouldRunHcpClientFetch(seven, [{ customerName: "Mike Landry" }], noon, false, false), false);
    assert.equal(shouldRunHcpClientFetch(seven, [{ customerName: "Mike Landry" }], noon, false, true), true);
  });

  it("overwrites a stale shop-as-customer name when syncing by job number", () => {
    const local = [
      {
        ...seedJobs[0],
        jobNumber: "173128",
        customerName: "Neighborhood Golf Carts",
      },
    ];
    const { jobs, updated } = mergeHcpJobs(local, [
      {
        hcpId: "hcp-173128",
        jobNumber: "173128",
        customerName: "Mike Landry",
        phone: "985-555-0142",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "",
      },
    ]);
    assert.equal(updated, 1);
    assert.equal(jobs[0].customerName, "Mike Landry");
    assert.equal(jobs[0].jobNumber, "173128");
  });

  it("does not invent a customer name when HCP sends an empty one", () => {
    const local = seedJobs.filter((job) => job.jobNumber === "1842");
    const { jobs, updated } = mergeHcpJobs(local, [
      {
        hcpId: "hcp-1842",
        jobNumber: "1842",
        customerName: "  ",
        phone: "",
        status: "In Progress",
        statusIsPipeline: false,
        primaryTech: "",
      },
    ]);
    assert.equal(updated, 0);
    assert.equal(jobs[0].customerName, "Mike Landry");
  });

  it("drops live Add-cart ghosts and does not keep epoch stage ages", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    const sharon = {
      ...seedJobs[1],
      statusChangedAt: 0,
      createdAt: 0,
    };
    const ghost = {
      ...seedJobs[0],
      id: "ghost-add",
      customerName: "",
      jobNumber: "",
    };
    const { jobs } = mergeHcpJobs([sharon, ghost], [], now);
    assert.equal(jobs.some((job) => job.id === "ghost-add"), false);
    assert.equal(jobs.some((job) => job.jobNumber === "1847"), true);
    const kept = jobs.find((job) => job.jobNumber === "1847");
    assert.ok(kept);
    assert.ok(now - kept.statusChangedAt < 400 * 86_400_000);
  });
});
