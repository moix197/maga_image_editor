import { describe, it, expect } from "vitest";
import {
  SCHEMA_VERSION,
  newTextLayerLockDefault,
  migratedTextLayerLockDefault,
  migrateToV3,
  migrateProject,
} from "../src/index";
import { migrateToV4 } from "../src/schema";
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
      schemaVersion: 4,
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
    expect(project.textLayerLocks?.["node-1"]).toBe(true);
  });

  it("new-layer lock helper defaults to false; migration helper defaults to true", () => {
    // Dual, intentionally opposite defaults.
    expect(newTextLayerLockDefault).toBe(false);
    expect(migratedTextLayerLockDefault).toBe(true);
  });

  it("validates a background-only draft with null template and null variableSlot", () => {
    const project = makeProject({ template: null, variableSlot: null });
    expect(project.schemaVersion).toBe(4);
    expect(project.template).toBeNull();
    expect(project.variableSlot).toBeNull();
    // background is still required and present
    expect(project.background).toEqual({ id: "bg", filename: "bg.png", blobKey: "blob-bg" });
  });

  it("schemaVersion equals 4", () => {
    expect(SCHEMA_VERSION).toBe(4);
    expect(makeProject().schemaVersion).toBe(4);
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

/** Builds a template text node with the given id, content, and style overrides. */
function textNode(id: string, content: string, style: Partial<Record<string, unknown>> = {}) {
  return {
    id: id as NodeId,
    content,
    x: 0,
    y: 0,
    rotation: 0,
    zIndex: 0,
    fontSize: 12,
    color: "#000",
    opacity: 1,
    fontFamily: "Arial",
    fontWeight: "normal",
    fontStyle: "normal",
    shadow: null,
    textBackground: null,
    ...style,
  };
}

describe("migration chain (v1 → v2 → v3 → v4)", () => {
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
      template: { nodes: [textNode("t1", "A")] },
      variableSlot: null,
      outputs: [],
    };
  }

  it("migrateToV3 sets itemTextStyles to {} when missing", () => {
    const v2 = { ...makeProject(), schemaVersion: 2 } as unknown as BatchProject;
    delete (v2 as { itemTextStyles?: unknown }).itemTextStyles;
    const migrated = migrateToV3(v2);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.itemTextStyles).toEqual({});
  });

  it("migrateToV3 is idempotent — never resets an existing itemTextStyles", () => {
    const existing = { "ov-1": { "node-1": { fontSize: 30 } } };
    const v3 = makeProject({ itemTextStyles: existing });
    const migrated = migrateToV3(v3);
    expect(migrated.itemTextStyles).toBe(existing);
  });

  it("migrateProject chains v1 → v4 (itemTextValues fanned, no textLayerLocks, itemTextStyles fanned)", () => {
    const migrated = migrateProject(makeV1() as unknown as BatchProject);
    expect(migrated.schemaVersion).toBe(4);
    // v1 had no overlays, so locks (t1 → true) drop with nothing to fan into.
    expect(migrated.itemTextValues).toEqual({});
    expect(migrated.itemTextStyles).toEqual({});
    expect("textLayerLocks" in migrated).toBe(false);
  });

  it("migrateProject is idempotent on an already-v4 record (no field reset)", () => {
    const v4 = makeProject({
      itemTextValues: { "ov-1": { t1: "v" } },
      itemTextStyles: { "ov-1": { t1: { fontSize: 18 } } },
    });
    delete (v4 as { textLayerLocks?: unknown }).textLayerLocks;
    const migrated = migrateProject(v4);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.itemTextValues).toEqual({ "ov-1": { t1: "v" } });
    expect(migrated.itemTextStyles).toEqual({ "ov-1": { t1: { fontSize: 18 } } });
    expect("textLayerLocks" in migrated).toBe(false);
  });
});

describe("migrateToV4 (lock → per-item fan-out)", () => {
  /** A v3 record with the given template nodes, overlays, and lock map. */
  function makeV3(overrides: Partial<BatchProject> = {}): BatchProject {
    return makeProject({ schemaVersion: 3 as BatchProject["schemaVersion"], ...overrides });
  }

  it("(1) fans a locked layer's value + style into every overlay", () => {
    const v3 = makeV3({
      template: { nodes: [textNode("t1", "Hello", { fontSize: 24, color: "#ff0000" })] },
      overlays: [
        { id: "ov-1", filename: "a.png", blobKey: "a" },
        { id: "ov-2", filename: "b.png", blobKey: "b" },
      ],
      textLayerLocks: { t1: true },
    });
    const migrated = migrateToV4(v3);
    expect(migrated.schemaVersion).toBe(4);
    expect("textLayerLocks" in migrated).toBe(false);
    expect(migrated.itemTextValues["ov-1"]?.t1).toBe("Hello");
    expect(migrated.itemTextValues["ov-2"]?.t1).toBe("Hello");
    expect(migrated.itemTextStyles["ov-1"]?.t1).toMatchObject({ fontSize: 24, color: "#ff0000" });
    expect(migrated.itemTextStyles["ov-2"]?.t1).toMatchObject({ fontSize: 24, color: "#ff0000" });
  });

  it("(2) zero overlays: no crash, drops textLayerLocks, bumps to v4", () => {
    const v3 = makeV3({
      template: { nodes: [textNode("t1", "Hello")] },
      overlays: [],
      textLayerLocks: { t1: true },
    });
    const migrated = migrateToV4(v3);
    expect(migrated.schemaVersion).toBe(4);
    expect("textLayerLocks" in migrated).toBe(false);
    expect(migrated.itemTextValues).toEqual({});
    expect(migrated.itemTextStyles).toEqual({});
  });

  it("(3) stale lock key (node not in template) is not written", () => {
    const v3 = makeV3({
      template: { nodes: [textNode("t1", "Hello")] },
      overlays: [{ id: "ov-1", filename: "a.png", blobKey: "a" }],
      textLayerLocks: { t1: true, ghost: true },
    });
    const migrated = migrateToV4(v3);
    expect(migrated.itemTextValues["ov-1"]?.t1).toBe("Hello");
    expect(migrated.itemTextValues["ov-1"]).not.toHaveProperty("ghost");
    expect(migrated.itemTextStyles["ov-1"]).not.toHaveProperty("ghost");
  });

  it("(4) existing per-item override for a locked node is NOT overwritten", () => {
    const v3 = makeV3({
      template: { nodes: [textNode("t1", "Template", { fontSize: 12 })] },
      overlays: [{ id: "ov-1", filename: "a.png", blobKey: "a" }],
      textLayerLocks: { t1: true },
      itemTextValues: { "ov-1": { t1: "Override" } },
      itemTextStyles: { "ov-1": { t1: { fontSize: 99 } } },
    });
    const migrated = migrateToV4(v3);
    expect(migrated.itemTextValues["ov-1"]?.t1).toBe("Override");
    expect(migrated.itemTextStyles["ov-1"]?.t1).toEqual({ fontSize: 99 });
  });

  it("(5) already-v4 record (no locks) is idempotent", () => {
    const v4 = makeV3({
      schemaVersion: 4,
      template: { nodes: [textNode("t1", "Hello")] },
      overlays: [{ id: "ov-1", filename: "a.png", blobKey: "a" }],
      itemTextValues: { "ov-1": { t1: "kept" } },
      itemTextStyles: { "ov-1": { t1: { fontSize: 8 } } },
    });
    delete (v4 as { textLayerLocks?: unknown }).textLayerLocks;
    const migrated = migrateToV4(v4);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.itemTextValues).toEqual({ "ov-1": { t1: "kept" } });
    expect(migrated.itemTextStyles).toEqual({ "ov-1": { t1: { fontSize: 8 } } });
    expect("textLayerLocks" in migrated).toBe(false);
  });

  it("an unlocked layer (lock=false) is not fanned out", () => {
    const v3 = makeV3({
      template: { nodes: [textNode("t1", "Hello")] },
      overlays: [{ id: "ov-1", filename: "a.png", blobKey: "a" }],
      textLayerLocks: { t1: false },
    });
    const migrated = migrateToV4(v3);
    expect(migrated.itemTextValues).toEqual({});
    expect(migrated.itemTextStyles).toEqual({});
  });
});
