import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION } from "../src/index";
import type { BatchProject } from "../src/index";
import type { NodeId } from "@maga/editor";

/** A minimal, valid v1 project used to assert the schema shape at compile + runtime. */
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
    ...overrides,
  };
}

describe("BatchProject schema", () => {
  it("satisfies the schema shape with all required fields", () => {
    const project = makeProject();
    expect(project).toMatchObject({
      schemaVersion: 1,
      id: "project-1",
      name: "Test project",
      createdAt: 0,
      updatedAt: 0,
      background: { id: "bg", filename: "bg.png", blobKey: "blob-bg" },
      overlays: [],
      template: { nodes: [] },
      variableSlot: { overlayNodeId: "slot-node-id", width: 800, height: 600 },
      outputs: [],
    });
    expect(project.variableSlot.overlayNodeId).toBe("slot-node-id");
    expect(project.variableSlot.width).toBe(800);
    expect(project.variableSlot.height).toBe(600);
  });

  it("schemaVersion equals 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(makeProject().schemaVersion).toBe(1);
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
