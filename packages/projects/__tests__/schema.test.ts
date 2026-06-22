import { describe, it, expect } from "vitest";
import {
  SCHEMA_VERSION,
  newTextLayerLockDefault,
  migratedTextLayerLockDefault,
  migrateToV3,
  migrateProject,
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
    itemTextStyles: {},
    ...overrides,
  };
}

describe("BatchProject schema", () => {
  it("satisfies the schema shape with all required fields", () => {
    const project = makeProject();
    expect(project).toMatchObject({
      schemaVersion: 3,
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
      itemTextStyles: {},
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
    expect(project.schemaVersion).toBe(3);
    expect(project.template).toBeNull();
    expect(project.variableSlot).toBeNull();
    // background is still required and present
    expect(project.background).toEqual({ id: "bg", filename: "bg.png", blobKey: "blob-bg" });
  });

  it("schemaVersion equals 3", () => {
    expect(SCHEMA_VERSION).toBe(3);
    expect(makeProject().schemaVersion).toBe(3);
  });

  it("has an itemTextStyles field (schema v3)", () => {
    const project = makeProject({
      itemTextStyles: { "ov-1": { "node-1": { fontSize: 24 } } },
    });
    expect(project.itemTextStyles["ov-1"]?.["node-1"]).toEqual({ fontSize: 24 });
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

describe("migration chain (v1 → v2 → v3)", () => {
  /** A bare v1 record: schemaVersion 1, no v2/v3 fields, one text layer. */
  function makeV1() {
    return {
      schemaVersion: 1,
      id: "legacy",
      name: "Legacy",
      createdAt: 0,
      updatedAt: 0,
      background: { id: "bg", filename: "bg.png", blobKey: "blob-bg" },
      overlays: [],
      template: {
        nodes: [
          { id: "t1" as NodeId, content: "A", x: 0, y: 0, rotation: 0, zIndex: 0, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null },
        ],
      },
      variableSlot: null,
      outputs: [],
    };
  }

  it("migrateToV3 sets itemTextStyles to {} when missing", () => {
    const v2 = { ...makeProject(), schemaVersion: 2 } as unknown as BatchProject;
    delete (v2 as { itemTextStyles?: unknown }).itemTextStyles;
    const migrated = migrateToV3(v2);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.itemTextStyles).toEqual({});
  });

  it("migrateToV3 is idempotent — never resets an existing itemTextStyles", () => {
    const existing = { "ov-1": { "node-1": { fontSize: 30 } } };
    const v3 = makeProject({ itemTextStyles: existing });
    const migrated = migrateToV3(v3);
    expect(migrated.itemTextStyles).toBe(existing);
  });

  it("migrateProject chains v1 → v3 (itemTextValues {}, all locked, itemTextStyles {})", () => {
    const migrated = migrateProject(makeV1() as unknown as BatchProject);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.itemTextValues).toEqual({});
    expect(migrated.textLayerLocks).toEqual({ t1: true });
    expect(migrated.itemTextStyles).toEqual({});
  });

  it("migrateProject on a v2 record preserves itemTextValues + textLayerLocks, adds itemTextStyles", () => {
    const v2 = {
      ...makeProject(),
      schemaVersion: 2,
      itemTextValues: { "ov-1": { t1: "kept" } },
      textLayerLocks: { t1: false },
    } as unknown as BatchProject;
    delete (v2 as { itemTextStyles?: unknown }).itemTextStyles;
    const migrated = migrateProject(v2);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.itemTextValues).toEqual({ "ov-1": { t1: "kept" } });
    expect(migrated.textLayerLocks).toEqual({ t1: false });
    expect(migrated.itemTextStyles).toEqual({});
  });

  it("migrateProject is idempotent on an already-v3 record (no field reset)", () => {
    const v3 = makeProject({
      itemTextValues: { "ov-1": { t1: "v" } },
      textLayerLocks: { t1: true },
      itemTextStyles: { "ov-1": { t1: { fontSize: 18 } } },
    });
    const migrated = migrateProject(v3);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.itemTextValues).toEqual({ "ov-1": { t1: "v" } });
    expect(migrated.textLayerLocks).toEqual({ t1: true });
    expect(migrated.itemTextStyles).toEqual({ "ov-1": { t1: { fontSize: 18 } } });
  });
});
