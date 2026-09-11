import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyHcpJobs,
  createDraftJob,
  deleteJob,
  getBoardSnapshot,
  insertJob,
  loadSampleBoard,
  replaceBoard,
  undoDelete,
  updateJob,
} from "./board-store.ts";
import { boardStats } from "./filters.ts";
import { isBlankIdentity, seedJobs } from "./jobs.ts";

describe("Add cart ghost", () => {
  it("does not persist a blank draft or bump Open", () => {
    loadSampleBoard();
    const before = getBoardSnapshot().jobs.length;
    const openBefore = boardStats(getBoardSnapshot().jobs).open;
    const draft = createDraftJob();
    assert.equal(draft.customerName, "");
    assert.equal(draft.jobNumber, "");
    assert.equal(getBoardSnapshot().jobs.length, before);
    assert.equal(boardStats(getBoardSnapshot().jobs).open, openBefore);
    assert.equal(insertJob(draft), false);
    assert.equal(getBoardSnapshot().jobs.length, before);
    assert.equal(boardStats(getBoardSnapshot().jobs).open, openBefore);
  });

  it("blank identity is abandoned without counting as a board row", () => {
    loadSampleBoard();
    const openBefore = boardStats(getBoardSnapshot().jobs).open;
    const draft = createDraftJob();
    assert.equal(isBlankIdentity(draft), true);
    assert.equal(
      getBoardSnapshot().jobs.some((job) => job.id === draft.id),
      false,
    );
    assert.equal(boardStats(getBoardSnapshot().jobs).open, openBefore);
  });

  it("persists only after customer name and job # are valid", () => {
    loadSampleBoard();
    const before = getBoardSnapshot().jobs.length;
    const draft = {
      ...createDraftJob(),
      customerName: "QA No Ghost",
      jobNumber: "19992",
    };
    assert.equal(insertJob(draft), true);
    assert.equal(getBoardSnapshot().jobs.length, before + 1);
  });
});

describe("timeframe date", () => {
  it("stores an ISO date and can clear it", () => {
    loadSampleBoard();
    const id = getBoardSnapshot().jobs[0].id;
    assert.equal(updateJob(id, { timeExpectation: "2026-09-18" }), true);
    assert.equal(
      getBoardSnapshot().jobs.find((job) => job.id === id)?.timeExpectation,
      "2026-09-18",
    );
    assert.equal(updateJob(id, { timeExpectation: "" }), true);
    assert.equal(
      getBoardSnapshot().jobs.find((job) => job.id === id)?.timeExpectation,
      "",
    );
  });

  it("does not persist leftover phrases or junk numbers", () => {
    loadSampleBoard();
    const id = getBoardSnapshot().jobs[0].id;
    assert.equal(updateJob(id, { timeExpectation: "2026-09-18" }), true);
    assert.equal(updateJob(id, { timeExpectation: "999" }), true);
    assert.equal(
      getBoardSnapshot().jobs.find((job) => job.id === id)?.timeExpectation,
      "",
    );
  });
});

describe("board-only delete", () => {
  it("removes a row and can undo", () => {
    replaceBoard([seedJobs[0], seedJobs[1]]);
    const id = getBoardSnapshot().jobs[0].id;
    const number = getBoardSnapshot().jobs[0].jobNumber;
    assert.equal(deleteJob(id), true);
    assert.equal(getBoardSnapshot().jobs.some((job) => job.id === id), false);
    assert.equal(getBoardSnapshot().dismissedJobNumbers.includes(number), true);
    assert.equal(undoDelete(), true);
    assert.equal(getBoardSnapshot().jobs.some((job) => job.id === id), true);
    assert.equal(getBoardSnapshot().dismissedJobNumbers.includes(number), false);
  });

  it("does not re-add a dismissed job number from Housecall Pro", () => {
    replaceBoard([
      {
        ...seedJobs[0],
        jobNumber: "173128",
        customerName: "Mike Landry",
      },
    ]);
    const id = getBoardSnapshot().jobs[0].id;
    assert.equal(deleteJob(id), true);
    const { added, updated } = applyHcpJobs([
      {
        hcpId: "hcp-173128",
        jobNumber: "173128",
        customerName: "Mike Landry",
        phone: "",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "",
      },
    ]);
    assert.equal(added, 0);
    assert.equal(updated, 0);
    assert.equal(getBoardSnapshot().jobs.some((job) => job.jobNumber === "173128"), false);
  });

  it("clears a dismissal when the same job number is added locally", () => {
    replaceBoard([
      {
        ...seedJobs[0],
        jobNumber: "173128",
        customerName: "Mike Landry",
      },
    ]);
    assert.equal(deleteJob(getBoardSnapshot().jobs[0].id), true);
    const draft = {
      ...createDraftJob(),
      customerName: "Mike Landry",
      jobNumber: "173128",
    };
    assert.equal(insertJob(draft), true);
    assert.equal(getBoardSnapshot().dismissedJobNumbers.includes("173128"), false);
    assert.equal(getBoardSnapshot().jobs.some((job) => job.jobNumber === "173128"), true);
  });
});

describe("next step", () => {
  it("stores free text and can clear it", () => {
    loadSampleBoard();
    const id = getBoardSnapshot().jobs[0].id;
    assert.equal(updateJob(id, { nextAction: "Call Jesse about the controller" }), true);
    assert.equal(
      getBoardSnapshot().jobs.find((job) => job.id === id)?.nextAction,
      "Call Jesse about the controller",
    );
    assert.equal(updateJob(id, { nextAction: "" }), true);
    assert.equal(getBoardSnapshot().jobs.find((job) => job.id === id)?.nextAction, "");
  });
});

describe("applyHcpJobs customer merge", () => {
  it("overwrites Neighborhood Golf Carts when HCP sends a non-empty name", () => {
    replaceBoard([
      {
        ...seedJobs[0],
        jobNumber: "173128",
        customerName: "Neighborhood Golf Carts",
      },
    ]);
    const { updated } = applyHcpJobs([
      {
        hcpId: "hcp-173128",
        jobNumber: "173128",
        customerName: "Mike Landry",
        phone: "",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "",
      },
    ]);
    assert.equal(updated, 1);
    assert.equal(getBoardSnapshot().jobs[0].customerName, "Mike Landry");
    assert.equal(getBoardSnapshot().jobs[0].jobNumber, "173128");
  });

  it("clears a leftover shop name when HCP sends an empty one", () => {
    replaceBoard([
      {
        ...seedJobs[0],
        jobNumber: "173128",
        customerName: "Neighborhood Golf Carts",
      },
    ]);
    const { updated } = applyHcpJobs([
      {
        hcpId: "hcp-173128",
        jobNumber: "173128",
        customerName: "   ",
        phone: "",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "",
      },
    ]);
    assert.equal(updated, 1);
    assert.equal(getBoardSnapshot().jobs[0].customerName, "");
  });

  it("drops finished HCP orphans that are missing from the open pull", () => {
    replaceBoard([
      {
        ...seedJobs[0],
        id: "hcp-17429",
        jobNumber: "17429",
        customerName: "Neighborhood Golf Carts",
      },
      {
        ...seedJobs[1],
        id: "hcp-17447",
        jobNumber: "17447",
        customerName: "Neighborhood Golf Carts",
      },
      {
        ...seedJobs[2],
        jobNumber: "17428",
        customerName: "Susie Malloy",
        nextAction: "Text when ready",
      },
    ]);
    const { added, updated, removed } = applyHcpJobs([
      {
        hcpId: "hcp-17428",
        jobNumber: "17428",
        customerName: "Susie Malloy",
        phone: "",
        status: "Scheduled",
        statusIsPipeline: false,
        primaryTech: "",
      },
    ]);
    assert.equal(added, 0);
    assert.equal(updated, 0);
    assert.equal(removed, 2);
    const jobs = getBoardSnapshot().jobs;
    assert.equal(jobs.some((job) => job.jobNumber === "17429"), false);
    assert.equal(jobs.some((job) => job.jobNumber === "17447"), false);
    assert.equal(jobs.some((job) => job.jobNumber === "17428"), true);
    assert.equal(jobs.find((job) => job.jobNumber === "17428")?.nextAction, "Text when ready");
  });
});
