import { describe, it, expect } from "vitest";
import {
  SCHEMA_VERSION,
  migrateToV3,
  migrateProject,
} from "../src/index";
import { migrateToV4, migrateToV5 } from "../src/schema";
import type { BatchProject } from "../src/index";
import type { NodeId } from "@maga/editor";

/**
 * Migration-input fixtures carry the retired v4 maps (`itemTextValues`,
 * `itemTextStyles`, `itemHiddenNodeIds`) and the transient `textLayerLocks`,
 * none of which the current {@link BatchProject} type declares. This loosened
 * shape lets fixtures attach them.
 */
type ProjectWithLocks = Partial<Omit<BatchProject, "schemaVersion">> & {
  schemaVersion?: number;
  textLayerLocks?: Record<string, boolean>;
  itemTextValues?: Record<string, Record<string, string>>;
  itemTextStyles?: Record<string, Record<string, Record<string, unknown>>>;
  itemHiddenNodeIds?: Record<string, string[]>;
};

/** A minimal, valid v5 project used to assert the schema shape at compile + runtime. */
function makeProject(overrides: ProjectWithLocks = {}): BatchProject {
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
    itemNodeOverrides: {},
    ...overrides,
  } as BatchProject;
}

describe("BatchProject schema", () => {
  it("satisfies the schema shape with all required fields", () => {
    const project = makeProject();
    expect(project).toMatchObject({
      schemaVersion: 5,
      id: "project-1",
      name: "Test project",
      createdAt: 0,
      updatedAt: 0,
      background: { id: "bg", filename: "bg.png", blobKey: "blob-bg" },
      overlays: [],
      template: { nodes: [] },
      variableSlot: { overlayNodeId: "slot-node-id", width: 800, height: 600 },
      outputs: [],
      itemNodeOverrides: {},
    });
    expect("textLayerLocks" in project).toBe(false);
    expect(project.variableSlot?.overlayNodeId).toBe("slot-node-id");
    expect(project.variableSlot?.width).toBe(800);
    expect(project.variableSlot?.height).toBe(600);
  });

  it("has an itemNodeOverrides field and no legacy text maps (schema v5)", () => {
    const project = makeProject({
      itemNodeOverrides: { "ov-1": { "node-1": { content: "hi" } } },
    });
    expect(project.itemNodeOverrides["ov-1"]?.["node-1"]).toEqual({ content: "hi" });
    expect("itemTextValues" in project).toBe(false);
    expect("itemTextStyles" in project).toBe(false);
    expect("itemHiddenNodeIds" in project).toBe(false);
  });

  it("validates a background-only draft with null template and null variableSlot", () => {
    const project = makeProject({ template: null, variableSlot: null });
    expect(project.schemaVersion).toBe(5);
    expect(project.template).toBeNull();
    expect(project.variableSlot).toBeNull();
    // background is still required and present
    expect(project.background).toEqual({ id: "bg", filename: "bg.png", blobKey: "blob-bg" });
  });

  it("schemaVersion equals 5", () => {
    expect(SCHEMA_VERSION).toBe(5);
    expect(makeProject().schemaVersion).toBe(5);
  });

  it("carries content + style + hidden in a single override value", () => {
    const project = makeProject({
      itemNodeOverrides: { "ov-1": { "node-1": { content: "x", fontSize: 24, hidden: true } } },
    });
    expect(project.itemNodeOverrides["ov-1"]?.["node-1"]).toEqual({
      content: "x",
      fontSize: 24,
      hidden: true,
    });
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

/** A v3-shaped fixture (carries the v3/v4 text maps + optional locks). */
function makeV3WithMaps(overrides: ProjectWithLocks = {}) {
  return {
    schemaVersion: 3,
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
    itemTextStyles: {},
    ...overrides,
  } as unknown as Parameters<typeof migrateToV4>[0];
}

describe("migration chain (v1 → v2 → v3 → v4 → v5)", () => {
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

  it("migrateToV3 sets itemTextStyles to {} when missing and stamps the v3 literal", () => {
    const v2 = {
      schemaVersion: 2,
      itemTextValues: {},
    } as Parameters<typeof migrateToV3>[0];
    const migrated = migrateToV3(v2);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.itemTextStyles).toEqual({});
  });

  it("migrateToV3 is idempotent — never resets an existing itemTextStyles", () => {
    const existing = { "ov-1": { "node-1": { fontSize: 30 } } };
    const v3 = { schemaVersion: 3, itemTextStyles: existing } as Parameters<typeof migrateToV3>[0];
    const migrated = migrateToV3(v3);
    expect(migrated.itemTextStyles).toBe(existing);
  });

  it("migrateProject chains v1 → v5 (no legacy maps, empty unified store)", () => {
    const migrated = migrateProject(makeV1() as unknown as BatchProject);
    expect(migrated.schemaVersion).toBe(5);
    // v1 had no overlays, so locks (t1 → true) drop with nothing to fan into.
    expect(migrated.itemNodeOverrides).toEqual({});
    expect("textLayerLocks" in migrated).toBe(false);
    expect("itemTextValues" in migrated).toBe(false);
    expect("itemTextStyles" in migrated).toBe(false);
  });

  it("FULL CHAIN: a v2 record lands at v5 with its v3→v4 fan-out collapsed into itemNodeOverrides", () => {
    // Guards the version-literal monotonicity fix: migrateToV3 must NOT jump a v2
    // record straight to 5, skipping the v3→v4 lock fan-out. A v2 record with one
    // locked layer + one overlay must surface that layer's content/style as a
    // unified override on the overlay after the full chain.
    const v2 = {
      schemaVersion: 2,
      id: "v2",
      name: "V2",
      createdAt: 0,
      updatedAt: 0,
      background: { id: "bg", filename: "bg.png", blobKey: "blob-bg" },
      overlays: [{ id: "ov-1", filename: "a.png", blobKey: "a" }],
      template: { nodes: [textNode("t1", "Shared", { fontSize: 24, color: "#ff0000" })] },
      variableSlot: null,
      outputs: [],
      itemTextValues: {},
      textLayerLocks: { t1: true },
    } as unknown as BatchProject;

    const migrated = migrateProject(v2);
    expect(migrated.schemaVersion).toBe(5);
    expect("textLayerLocks" in migrated).toBe(false);
    const override = migrated.itemNodeOverrides["ov-1"]?.t1;
    expect(override?.content).toBe("Shared");
    expect(override).toMatchObject({ fontSize: 24, color: "#ff0000" });
  });

  it("migrateProject is idempotent on an already-v5 record (no field reset)", () => {
    const v5 = makeProject({
      itemNodeOverrides: { "ov-1": { t1: { content: "v", fontSize: 18 } } },
    });
    const migrated = migrateProject(v5);
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.itemNodeOverrides).toEqual({ "ov-1": { t1: { content: "v", fontSize: 18 } } });
    expect("textLayerLocks" in migrated).toBe(false);
  });
});

describe("migrateToV4 (lock → per-item fan-out)", () => {
  it("(1) fans a locked layer's value + style into every overlay", () => {
    const v3 = makeV3WithMaps({
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
    const v3 = makeV3WithMaps({
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
    const v3 = makeV3WithMaps({
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
    const v3 = makeV3WithMaps({
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
    const v4 = makeV3WithMaps({
      schemaVersion: 4,
      template: { nodes: [textNode("t1", "Hello")] },
      overlays: [{ id: "ov-1", filename: "a.png", blobKey: "a" }],
      itemTextValues: { "ov-1": { t1: "kept" } },
      itemTextStyles: { "ov-1": { t1: { fontSize: 8 } } },
    });
    const migrated = migrateToV4(v4);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.itemTextValues).toEqual({ "ov-1": { t1: "kept" } });
    expect(migrated.itemTextStyles).toEqual({ "ov-1": { t1: { fontSize: 8 } } });
    expect("textLayerLocks" in migrated).toBe(false);
  });

  it("an unlocked layer (lock=false) is not fanned out", () => {
    const v3 = makeV3WithMaps({
      template: { nodes: [textNode("t1", "Hello")] },
      overlays: [{ id: "ov-1", filename: "a.png", blobKey: "a" }],
      textLayerLocks: { t1: false },
    });
    const migrated = migrateToV4(v3);
    expect(migrated.itemTextValues).toEqual({});
    expect(migrated.itemTextStyles).toEqual({});
  });
});

describe("migrateToV5 (collapse 3 text maps → unified itemNodeOverrides)", () => {
  /** A v4-shaped fixture carrying the three text maps to collapse. */
  function makeV4(overrides: ProjectWithLocks = {}) {
    return {
      schemaVersion: 4,
      id: "project-1",
      name: "Test project",
      createdAt: 0,
      updatedAt: 0,
      background: { id: "bg", filename: "bg.png", blobKey: "blob-bg" },
      overlays: [],
      template: { nodes: [] },
      variableSlot: null,
      outputs: [],
      itemTextValues: {},
      itemTextStyles: {},
      itemHiddenNodeIds: {},
      ...overrides,
    } as unknown as Parameters<typeof migrateToV5>[0];
  }

  it("(1) collapses content + style + hidden into one override per (overlay, node)", () => {
    const v4 = makeV4({
      itemTextValues: { "ov-1": { t1: "Hello" } },
      itemTextStyles: { "ov-1": { t1: { fontSize: 24, color: "#ff0000" } } },
      itemHiddenNodeIds: { "ov-1": ["t2"] },
    });
    const migrated = migrateToV5(v4);
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.itemNodeOverrides["ov-1"]?.t1).toEqual({
      content: "Hello",
      fontSize: 24,
      color: "#ff0000",
    });
    expect(migrated.itemNodeOverrides["ov-1"]?.t2).toEqual({ hidden: true });
    // legacy maps dropped
    expect("itemTextValues" in migrated).toBe(false);
    expect("itemTextStyles" in migrated).toBe(false);
    expect("itemHiddenNodeIds" in migrated).toBe(false);
  });

  it("(2) hidden nodeId → hidden: true on the override", () => {
    const v4 = makeV4({ itemHiddenNodeIds: { "ov-1": ["t1"] } });
    const migrated = migrateToV5(v4);
    expect(migrated.itemNodeOverrides["ov-1"]?.t1).toEqual({ hidden: true });
  });

  it("(3) zero-overlay safe: empty maps fold to empty itemNodeOverrides", () => {
    const migrated = migrateToV5(makeV4());
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.itemNodeOverrides).toEqual({});
  });

  it("(4) no-clobber: an existing itemNodeOverrides field is never overwritten", () => {
    const v4 = makeV4({
      itemTextValues: { "ov-1": { t1: "FromMap" } },
      itemTextStyles: { "ov-1": { t1: { fontSize: 99 } } },
      itemNodeOverrides: { "ov-1": { t1: { content: "Existing", fontSize: 12 } } },
    });
    const migrated = migrateToV5(v4);
    expect(migrated.itemNodeOverrides["ov-1"]?.t1).toEqual({ content: "Existing", fontSize: 12 });
  });

  it("(5) idempotent: a v5 record is returned as-is (re-run is a no-op)", () => {
    const v5 = {
      schemaVersion: 5,
      itemNodeOverrides: { "ov-1": { t1: { content: "kept", fontSize: 18 } } },
    } as unknown as Parameters<typeof migrateToV5>[0];
    const migrated = migrateToV5(v5);
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.itemNodeOverrides).toEqual({ "ov-1": { t1: { content: "kept", fontSize: 18 } } });
  });

  it("(6) stale keys produce no spurious overrides", () => {
    const v4 = makeV4({
      itemTextValues: { "ghost-overlay": {} },
    });
    const migrated = migrateToV5(v4);
    // an empty per-overlay map has no inner entries, so no override key is
    // created — the unified store stays empty (no spurious {} placeholder).
    expect(migrated.itemNodeOverrides["ghost-overlay"]).toBeUndefined();
    expect(migrated.itemNodeOverrides).toEqual({});
  });

  it("(7) content + hidden for the same node coexist on one override", () => {
    const v4 = makeV4({
      itemTextValues: { "ov-1": { t1: "Hello" } },
      itemHiddenNodeIds: { "ov-1": ["t1"] },
    });
    const migrated = migrateToV5(v4);
    expect(migrated.itemNodeOverrides["ov-1"]?.t1).toEqual({ content: "Hello", hidden: true });
  });
});
