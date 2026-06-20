import { describe, it, expect } from "vitest";
import {
  SCHEMA_VERSION,
  newTextLayerLockDefault,
  migratedTextLayerLockDefault,
} from "../src/index";
import type { BatchProject } from "../src/index";
import type { NodeId } from "@maga/editor";

/** A minimal, valid project used to assert the schema shape at compile + runtime. */
function makeProject(overrides: Partial<BatchProject> = {}): BatchProject {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "project-1",
    name: "Test project",
    createdAt: 0,
    updatedAt: 0,
    background: { id: "bg", filename: "bg.png", blobKey: "blob-bg" },
    overlays: [],
    template: { nodes: [] },
    variableSlot: { overlayNodeId: "slot-node-id" as NodeId, width: 800, height: 600 },
    outputs: [],
    itemTextValues: {},
    textLayerLocks: {},
    ...overrides,
  };
}

describe("BatchProject schema", () => {
  it("satisfies the schema shape with all required fields", () => {
    const project = makeProject();
    expect(project).toMatchObject({
      schemaVersion: 2,
      id: "project-1",
      name: "Test project",
      createdAt: 0,
      updatedAt: 0,
      background: { id: "bg", filename: "bg.png", blobKey: "blob-bg" },
      overlays: [],
      template: { nodes: [] },
      variableSlot: { overlayNodeId: "slot-node-id", width: 800, height: 600 },
      outputs: [],
      itemTextValues: {},
      textLayerLocks: {},
    });
    expect(project.variableSlot?.overlayNodeId).toBe("slot-node-id");
    expect(project.variableSlot?.width).toBe(800);
    expect(project.variableSlot?.height).toBe(600);
  });

  it("has itemTextValues and textLayerLocks fields (schema v2)", () => {
    const project = makeProject({
      itemTextValues: { "ov-1": { "node-1": "hi" } },
      textLayerLocks: { "node-1": true },
    });
    expect(project.itemTextValues["ov-1"]?.["node-1"]).toBe("hi");
    expect(project.textLayerLocks["node-1"]).toBe(true);
  });

  it("new-layer lock helper defaults to false; migration helper defaults to true", () => {
    // Dual, intentionally opposite defaults.
    expect(newTextLayerLockDefault).toBe(false);
    expect(migratedTextLayerLockDefault).toBe(true);
  });

  it("validates a background-only draft with null template and null variableSlot", () => {
    const project = makeProject({ template: null, variableSlot: null });
    expect(project.schemaVersion).toBe(2);
    expect(project.template).toBeNull();
    expect(project.variableSlot).toBeNull();
    // background is still required and present
    expect(project.background).toEqual({ id: "bg", filename: "bg.png", blobKey: "blob-bg" });
  });

  it("schemaVersion equals 2", () => {
    expect(SCHEMA_VERSION).toBe(2);
    expect(makeProject().schemaVersion).toBe(2);
  });

  it("outputs defaults to an empty array", () => {
    expect(makeProject().outputs).toEqual([]);
  });

  it("accumulates generated outputs", () => {
    const project = makeProject({
      outputs: [
        { overlayAssetId: "ov-1", outputBlobKey: "blob-out-1", timestamp: 123 },
      ],
    });
    expect(project.outputs).toHaveLength(1);
    expect(project.outputs[0]).toEqual({
      overlayAssetId: "ov-1",
      outputBlobKey: "blob-out-1",
      timestamp: 123,
    });
  });
});
