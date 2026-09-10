import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyHcpJobs,
  createDraftJob,
  getBoardSnapshot,
  insertJob,
  loadSampleBoard,
  replaceBoard,
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

  it("does not blank a stored name when HCP sends an empty one", () => {
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
    assert.equal(updated, 0);
    assert.equal(getBoardSnapshot().jobs[0].customerName, "Neighborhood Golf Carts");
  });
});
