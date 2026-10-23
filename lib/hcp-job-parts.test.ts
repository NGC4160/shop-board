import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
