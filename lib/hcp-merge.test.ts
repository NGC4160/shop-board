import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasMissingHcpScheduledStarts,
  hasStaleHcpCompanyCustomerName,
  isHcpTrackedJob,
  mergeHcpJobs,
  nextCustomerNameFromHcp,
  nextHcpScheduledStartAt,
  shouldFetchHcpJobs,
  shouldRunHcpClientFetch,
  STALE_HCP_COMPANY_CUSTOMER,
} from "./hcp-merge.ts";
import { mapHcpJob } from "./hcp.ts";
import { seedJobs, upgradeJob } from "./jobs.ts";

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
    assert.equal(mapped?.scheduledStart, null);
    assert.equal(mapped?.schedulePresent, false);
  });

  it("maps schedule.scheduled_start when HCP sends a real timestamp", () => {
    const mapped = mapHcpJob({
      id: "abc",
      invoice_number: "1842",
      work_status: "in progress",
      created_at: "2026-01-01T00:00:00Z",
      schedule: { scheduled_start: "2026-04-02T14:15:22Z" },
      customer: { first_name: "Mike", last_name: "Landry" },
    });
    assert.equal(mapped?.scheduledStart, Date.parse("2026-04-02T14:15:22Z"));
    assert.equal(mapped?.schedulePresent, true);
  });

  it("does not use created_at as Date started", () => {
    const mapped = mapHcpJob({
      id: "abc",
      invoice_number: "1842",
      work_status: "in progress",
      created_at: "2026-04-02T14:15:22Z",
      customer: { first_name: "Mike", last_name: "Landry" },
    });
    assert.equal(mapped?.scheduledStart, null);
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
    assert.equal(jobs.find((job) => job.jobNumber === "1901")?.hcpScheduledStartAt, null);
  });

  it("stores HCP schedule.scheduled_start on new jobs and keeps it when later payloads omit schedule", () => {
    const started = Date.parse("2026-02-10T16:00:00Z");
    const first = mergeHcpJobs([], [
      {
        hcpId: "new",
        jobNumber: "1901",
        customerName: "New Customer",
        phone: "",
        status: "New Job",
        statusIsPipeline: true,
        primaryTech: "",
        scheduledStart: started,
        schedulePresent: true,
      },
    ]);
    assert.equal(first.jobs[0].hcpScheduledStartAt, started);
    const second = mergeHcpJobs(first.jobs, [
      {
        hcpId: "new",
        jobNumber: "1901",
        customerName: "New Customer",
        phone: "",
        status: "New Job",
        statusIsPipeline: true,
        primaryTech: "",
        scheduledStart: null,
        schedulePresent: false,
      },
    ]);
    assert.equal(second.jobs[0].hcpScheduledStartAt, started);
  });

  it("fills a null stored Date started from incoming schedule.scheduled_start", () => {
    const started = Date.parse("2025-02-06T21:55:00.000Z");
    const local = [
      {
        ...seedJobs[0],
        id: "hcp-job_645",
        jobNumber: "645",
        customerName: "Alexis Hocevar",
        phone: "5044163775",
        status: "Scheduled",
        hcpScheduledStartAt: null,
        history: [{ at: 1, kind: "created" as const, text: "Added from Housecall Pro" }],
      },
    ];
    const { jobs, updated } = mergeHcpJobs(local, [
      {
        hcpId: "job_645",
        jobNumber: "645",
        customerName: "Alexis Hocevar",
        phone: "5044163775",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "Marlon Gray",
        scheduledStart: started,
        schedulePresent: true,
      },
    ]);
    assert.equal(jobs[0].hcpScheduledStartAt, started);
    assert.equal(updated, 1);
  });

  it("clears a stored Date started when HCP includes schedule with an empty start", () => {
    const started = Date.parse("2026-02-10T16:00:00Z");
    const first = mergeHcpJobs([], [
      {
        hcpId: "new",
        jobNumber: "1901",
        customerName: "New Customer",
        phone: "",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "",
        scheduledStart: started,
        schedulePresent: true,
      },
    ]);
    const second = mergeHcpJobs(first.jobs, [
      {
        hcpId: "new",
        jobNumber: "1901",
        customerName: "New Customer",
        phone: "",
        status: "Unscheduled",
        statusIsPipeline: true,
        primaryTech: "",
        scheduledStart: null,
        schedulePresent: true,
      },
    ]);
    assert.equal(second.jobs[0].hcpScheduledStartAt, null);
  });

  it("does not invent a Date started from created_at, board createdAt, or sync time", () => {
    const local = seedJobs.filter((job) => job.jobNumber === "1842");
    assert.equal(local[0].hcpScheduledStartAt, null);
    const { jobs } = mergeHcpJobs(local, [
      {
        hcpId: "hcp-1842",
        jobNumber: "1842",
        customerName: "Mike Landry",
        phone: "",
        status: "In Progress",
        statusIsPipeline: false,
        primaryTech: "",
      },
    ]);
    assert.equal(jobs[0].hcpScheduledStartAt, null);
    assert.notEqual(jobs[0].hcpScheduledStartAt, jobs[0].createdAt);
    const upgraded = upgradeJob({ ...local[0], hcpCreatedAt: 1_700_000_000_000, hcpScheduledStartAt: undefined });
    assert.equal(upgraded?.hcpScheduledStartAt, null);
    assert.equal(nextHcpScheduledStartAt(null, null), null);
    assert.equal(nextHcpScheduledStartAt(undefined, 1_700_000_000_000), 1_700_000_000_000);
    assert.equal(nextHcpScheduledStartAt(null, 1_700_000_000_000, true), null);
    assert.equal(nextHcpScheduledStartAt(1_700_000_000_000, 1_600_000_000_000, true), null);
  });

  it("clears Date started when HCP is Unscheduled even if leftover scheduled_start is present", () => {
    const leftover = Date.parse("2026-09-14T16:00:00.000Z");
    const first = mergeHcpJobs([], [
      {
        hcpId: "job_fortenberry",
        jobNumber: "173112",
        customerName: "Joe Fortenberry",
        phone: "",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "Hayden Silva",
        scheduledStart: leftover,
        schedulePresent: true,
      },
    ]);
    assert.equal(first.jobs[0].hcpScheduledStartAt, leftover);
    const second = mergeHcpJobs(first.jobs, [
      {
        hcpId: "job_fortenberry",
        jobNumber: "173112",
        customerName: "Joe Fortenberry",
        phone: "",
        status: "Unscheduled",
        statusIsPipeline: false,
        primaryTech: "Hayden Silva",
        scheduledStart: leftover,
        schedulePresent: true,
      },
    ]);
    assert.equal(second.jobs[0].status, "Scheduled");
    assert.equal(second.jobs[0].hcpScheduledStartAt, null);
  });

  it("clears Date started when the board stays Unscheduled (live Graham / Fortenberry)", () => {
    const grahamStart = Date.parse("2026-09-11T15:30:00.000Z");
    const fortnStart = Date.parse("2026-09-14T16:00:00.000Z");
    const local = [
      {
        ...seedJobs[0],
        id: "hcp-job_17266-2",
        jobNumber: "17266-2",
        customerName: "Von Graham",
        status: "Unscheduled",
        primaryTech: "Unassigned",
        hcpScheduledStartAt: grahamStart,
        history: [{ at: 1, kind: "created" as const, text: "Added from Housecall Pro" }],
      },
      {
        ...seedJobs[0],
        id: "hcp-job_173112",
        jobNumber: "173112",
        customerName: "Joe Fortenberry",
        status: "Unscheduled",
        primaryTech: "Unassigned",
        hcpScheduledStartAt: fortnStart,
        history: [{ at: 1, kind: "created" as const, text: "Added from Housecall Pro" }],
      },
    ];
    const { jobs, updated } = mergeHcpJobs(local, [
      {
        hcpId: "job_17266-2",
        jobNumber: "17266-2",
        customerName: "Von Graham",
        phone: "",
        status: "In Progress",
        statusIsPipeline: false,
        primaryTech: "Hayden Silva",
        scheduledStart: grahamStart,
        schedulePresent: true,
      },
      {
        hcpId: "job_173112",
        jobNumber: "173112",
        customerName: "Joe Fortenberry",
        phone: "",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "Hayden Silva",
        scheduledStart: fortnStart,
        schedulePresent: true,
      },
    ]);
    const graham = jobs.find((job) => job.jobNumber === "17266-2");
    const fortn = jobs.find((job) => job.jobNumber === "173112");
    assert.equal(graham?.status, "Unscheduled");
    assert.equal(graham?.hcpScheduledStartAt, null);
    assert.equal(fortn?.status, "Unscheduled");
    assert.equal(fortn?.hcpScheduledStartAt, null);
    assert.equal(updated, 2);
  });

  it("keeps Date started on Scheduled / In Progress when HCP sends a real start", () => {
    const started = Date.parse("2025-02-06T21:55:00.000Z");
    const { jobs } = mergeHcpJobs(
      [
        {
          ...seedJobs[0],
          id: "hcp-job_645",
          jobNumber: "645",
          customerName: "Alexis Hocevar",
          status: "Scheduled",
          hcpScheduledStartAt: null,
          history: [{ at: 1, kind: "created" as const, text: "Added from Housecall Pro" }],
        },
      ],
      [
        {
          hcpId: "job_645",
          jobNumber: "645",
          customerName: "Alexis Hocevar",
          phone: "",
          status: "Scheduled",
          statusIsPipeline: false,
          primaryTech: "Marlon Gray",
          scheduledStart: started,
          schedulePresent: true,
        },
      ],
    );
    assert.equal(jobs[0].status, "Scheduled");
    assert.equal(jobs[0].hcpScheduledStartAt, started);
  });

  it("clears a stored start when a later payload omits schedule after the job is Unscheduled", () => {
    const started = Date.parse("2026-09-11T15:30:00.000Z");
    const first = mergeHcpJobs([], [
      {
        hcpId: "job_graham",
        jobNumber: "17266-2",
        customerName: "Von Graham",
        phone: "",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "",
        scheduledStart: started,
        schedulePresent: true,
      },
    ]);
    const second = mergeHcpJobs(first.jobs, [
      {
        hcpId: "job_graham",
        jobNumber: "17266-2",
        customerName: "Von Graham",
        phone: "",
        status: "Unscheduled",
        statusIsPipeline: true,
        primaryTech: "",
        scheduledStart: null,
        schedulePresent: false,
      },
    ]);
    assert.equal(second.jobs[0].status, "Unscheduled");
    assert.equal(second.jobs[0].hcpScheduledStartAt, null);
  });

  it("treats the shop company string and close variants as stale", () => {
    assert.equal(hasStaleHcpCompanyCustomerName([{ customerName: STALE_HCP_COMPANY_CUSTOMER }]), true);
    assert.equal(hasStaleHcpCompanyCustomerName([{ customerName: "neighborhood golf carts" }]), true);
    assert.equal(hasStaleHcpCompanyCustomerName([{ customerName: "Neighborhood Golf Carts LLC" }]), true);
    assert.equal(hasStaleHcpCompanyCustomerName([{ customerName: "Mike Landry" }]), false);
    assert.equal(hasStaleHcpCompanyCustomerName([]), false);
  });

  it("detects HCP Scheduled / In Progress rows missing a stored schedule start", () => {
    const staleScheduled = {
      id: "hcp-job_645",
      customerName: "Alexis Hocevar",
      status: "Scheduled",
      hcpScheduledStartAt: null,
      history: [{ text: "Added from Housecall Pro" }],
    };
    const staleInProgress = {
      id: "hcp-job_562",
      customerName: "Tommy Brunett",
      status: "In Progress",
      hcpScheduledStartAt: null,
      history: [{ text: "Added from Housecall Pro" }],
    };
    const filled = { ...staleScheduled, hcpScheduledStartAt: 1_738_883_700_000 };
    const unscheduled = {
      id: "hcp-job_1",
      customerName: "Diane Rodrigue",
      status: "Unscheduled",
      hcpScheduledStartAt: null,
      history: [{ text: "Added from Housecall Pro" }],
    };
    const localSeed = seedJobs.find((job) => job.jobNumber === "1849");
    assert.ok(localSeed);
    assert.equal(hasMissingHcpScheduledStarts([staleScheduled]), true);
    assert.equal(hasMissingHcpScheduledStarts([staleInProgress]), true);
    assert.equal(hasMissingHcpScheduledStarts([filled]), false);
    assert.equal(hasMissingHcpScheduledStarts([unscheduled]), false);
    assert.equal(hasMissingHcpScheduledStarts([localSeed]), false);
    assert.equal(hasMissingHcpScheduledStarts(seedJobs), false);
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
      shouldFetchHcpJobs(
        seven,
        [
          {
            id: "hcp-job_645",
            customerName: "Alexis Hocevar",
            status: "Scheduled",
            hcpScheduledStartAt: null,
            history: [{ text: "Added from Housecall Pro" }],
          },
        ],
        noon,
      ),
      true,
    );
    assert.equal(
      shouldFetchHcpJobs(
        seven,
        [
          {
            id: "hcp-job_645",
            customerName: "Alexis Hocevar",
            status: "Scheduled",
            hcpScheduledStartAt: null,
            history: [{ text: "Added from Housecall Pro" }],
          },
        ],
        noon,
        true,
      ),
      false,
    );
    assert.equal(
      shouldFetchHcpJobs(
        seven,
        [
          {
            id: "seed-1849",
            customerName: "Fairway Estates",
            status: "Scheduled",
            hcpScheduledStartAt: null,
          },
        ],
        noon,
      ),
      false,
    );
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

  it("drops finished HCP jobs and shop-name orphans that are not in the open pull", () => {
    const now = Date.parse("2026-09-11T12:00:00Z");
    const open = {
      ...seedJobs[0],
      jobNumber: "17428",
      customerName: "Susie Malloy",
      nextAction: "Call when parts come in",
      timeExpectation: "2026-09-18",
      history: [
        { at: now - 1000, kind: "created" as const, text: "Added from Housecall Pro" },
      ],
    };
    const finishedShopName = {
      ...seedJobs[0],
      id: "hcp-17429",
      jobNumber: "17429",
      customerName: "Neighborhood Golf Carts",
      nextAction: "Do not keep this",
    };
    const finishedPerson = {
      ...seedJobs[1],
      id: "local-17447",
      jobNumber: "17447",
      customerName: "Christopher Falvey",
      history: [
        { at: now - 2000, kind: "created" as const, text: "Added from Housecall Pro" },
      ],
    };
    const localOnly = {
      ...seedJobs[2],
      id: "local-add",
      jobNumber: "19992",
      customerName: "Walk-in Cart",
      nextAction: "Write up in Housecall",
    };
    const { jobs, added, updated, removed } = mergeHcpJobs(
      [open, finishedShopName, finishedPerson, localOnly],
      [
        {
          hcpId: "hcp-17428",
          jobNumber: "17428",
          customerName: "Susie Malloy",
          phone: "",
          status: "In Progress",
          statusIsPipeline: false,
          primaryTech: "",
        },
      ],
      now,
    );
    assert.equal(added, 0);
    assert.equal(updated, 0);
    assert.equal(removed, 2);
    assert.deepEqual(
      jobs.map((job) => job.jobNumber).sort(),
      ["17428", "19992"],
    );
    const keptOpen = jobs.find((job) => job.jobNumber === "17428");
    assert.equal(keptOpen?.nextAction, "Call when parts come in");
    assert.equal(keptOpen?.timeExpectation, "2026-09-18");
    assert.equal(jobs.some((job) => job.jobNumber === "17429"), false);
    assert.equal(jobs.some((job) => job.jobNumber === "17447"), false);
  });

  it("clears a leftover shop customer name when HCP sends an empty one", () => {
    const local = [
      {
        ...seedJobs[0],
        jobNumber: "17428",
        customerName: "Neighborhood Golf Carts, LLC",
      },
    ];
    const { jobs, updated } = mergeHcpJobs(local, [
      {
        hcpId: "hcp-17428",
        jobNumber: "17428",
        customerName: "  ",
        phone: "",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "",
      },
    ]);
    assert.equal(updated, 1);
    assert.equal(jobs[0].customerName, "");
  });

  it("classifies HCP-tracked rows and shop-name overwrite", () => {
    assert.equal(isHcpTrackedJob({ id: "hcp-abc" }), true);
    assert.equal(isHcpTrackedJob({ id: "seed-1842", history: [] }), false);
    assert.equal(
      isHcpTrackedJob({
        id: "local-1",
        history: [{ text: "Added from Housecall Pro" }],
      }),
      true,
    );
    assert.equal(nextCustomerNameFromHcp("Brent Leguin", "Neighborhood Golf Carts"), "Brent Leguin");
    assert.equal(nextCustomerNameFromHcp("  ", "Neighborhood Golf Carts"), "");
    assert.equal(nextCustomerNameFromHcp("", "Susie Malloy"), "Susie Malloy");
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
