import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  openDb,
  saveProject,
  loadProject,
  saveBlob,
  loadBlob,
  deleteProject,
} from "../src/idb-adapter";
import { SCHEMA_VERSION, type BatchProject } from "../src/schema";
import type { NodeId } from "@maga/editor";

function makeProject(overrides: Partial<BatchProject> = {}): BatchProject {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "project-1",
    name: "Test project",
    createdAt: 0,
    updatedAt: 0,
    background: { id: "bg", filename: "bg.png", blobKey: "bg-key" },
    overlays: [],
    template: { nodes: [] },
    variableSlot: { overlayNodeId: "slot" as NodeId, width: 100, height: 100 },
    outputs: [],
    itemTextValues: {},
    itemTextStyles: {},
    ...overrides,
  };
}

beforeEach(() => {
  // Fresh in-memory IDB per test for isolation.
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("idb-adapter", () => {
  it("round-trips a project via saveProject + loadProject", async () => {
    const db = await openDb();
    const project = makeProject();
    await saveProject(db, project);
    const loaded = await loadProject(db, project.id);
    // The fixture is already a v4 record (no textLayerLocks); loadProject's
    // migration is a no-op, so it round-trips unchanged.
    expect(loaded).toEqual(project);
  });

  it("round-trips a background-only draft with null template + null variableSlot", async () => {
    const db = await openDb();
    const draft = makeProject({ template: null, variableSlot: null });
    await saveProject(db, draft);
    const loaded = await loadProject(db, draft.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.template).toBeNull();
    expect(loaded!.variableSlot).toBeNull();
    expect(loaded).toEqual(draft);
  });

  it("round-trips a Blob via saveBlob + loadBlob", async () => {
    const db = await openDb();
    const blob = new Blob(["hello"], { type: "text/plain" });
    await saveBlob(db, "k1", blob);
    const loaded = await loadBlob(db, "k1");
    expect(loaded).not.toBeNull();
    expect(await loaded!.text()).toBe("hello");
    expect(loaded!.type).toBe("text/plain");
  });

  it("loadProject returns null for an unknown id", async () => {
    const db = await openDb();
    expect(await loadProject(db, "missing")).toBeNull();
  });

  it("loadBlob returns null for an unknown key", async () => {
    const db = await openDb();
    expect(await loadBlob(db, "missing")).toBeNull();
  });

  it("deleteProject removes the entry", async () => {
    const db = await openDb();
    const project = makeProject();
    await saveProject(db, project);
    await deleteProject(db, project.id);
    expect(await loadProject(db, project.id)).toBeNull();
  });

  it("loadProject discards a record whose schemaVersion is newer than this build", async () => {
    const db = await openDb();
    const futuristic = { ...makeProject(), schemaVersion: 99 } as unknown as BatchProject;
    await saveProject(db, futuristic);
    expect(await loadProject(db, futuristic.id)).toBeNull();
  });

  it("loadProject migrates a stored v1 record to v4 (itemTextValues {}, no textLayerLocks, itemTextStyles {})", async () => {
    const db = await openDb();
    // A legacy v1 record: schemaVersion 1, no v2/v3 fields, two text layers.
    const v1 = {
      schemaVersion: 1,
      id: "legacy",
      name: "Legacy",
      createdAt: 0,
      updatedAt: 0,
      background: { id: "bg", filename: "bg.png", blobKey: "bg-key" },
      overlays: [],
      template: {
        nodes: [
          { id: "t1", content: "A", x: 0, y: 0, rotation: 0, zIndex: 0, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null },
          { id: "t2", content: "B", x: 0, y: 0, rotation: 0, zIndex: 1, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null },
        ],
      },
      variableSlot: null,
      outputs: [],
    } as unknown as BatchProject;
    await saveProject(db, v1);

    const loaded = await loadProject(db, "legacy");
    expect(loaded).not.toBeNull();
    expect(loaded!.schemaVersion).toBe(SCHEMA_VERSION);
    // v1 had no overlays, so the all-locked layers fan into nothing and the
    // lock map drops entirely on v4 migration.
    expect(loaded!.itemTextValues).toEqual({});
    expect("textLayerLocks" in loaded!).toBe(false);
    expect(loaded!.itemTextStyles).toEqual({});
  });

  it("loadProject migrates a stored v2 record to v4 (preserves values, drops locks, adds itemTextStyles {})", async () => {
    const db = await openDb();
    const v2 = {
      schemaVersion: 2,
      id: "v2rec",
      name: "V2",
      createdAt: 0,
      updatedAt: 0,
      background: { id: "bg", filename: "bg.png", blobKey: "bg-key" },
      overlays: [],
      template: { nodes: [] },
      variableSlot: null,
      outputs: [],
      itemTextValues: { "ov-1": { t1: "kept" } },
      textLayerLocks: { t1: false },
    } as unknown as BatchProject;
    await saveProject(db, v2);

    const loaded = await loadProject(db, "v2rec");
    expect(loaded).not.toBeNull();
    expect(loaded!.schemaVersion).toBe(SCHEMA_VERSION);
    // t1 was unlocked (false) so it is not fanned into per-item values; the
    // lock map drops on v4 migration.
    expect(loaded!.itemTextValues).toEqual({ "ov-1": { t1: "kept" } });
    expect("textLayerLocks" in loaded!).toBe(false);
    expect(loaded!.itemTextStyles).toEqual({});
  });

  it("loadProject is idempotent on an already-v4 record (itemTextStyles preserved)", async () => {
    const db = await openDb();
    const v3 = makeProject({ itemTextStyles: { "ov-1": { t1: { fontSize: 19 } } } });
    await saveProject(db, v3);

    const loaded = await loadProject(db, v3.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded!.itemTextStyles).toEqual({ "ov-1": { t1: { fontSize: 19 } } });
  });
});
