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

  it("loadProject discards a record with a mismatched schemaVersion", async () => {
    const db = await openDb();
    const stale = { ...makeProject(), schemaVersion: 2 } as unknown as BatchProject;
    await saveProject(db, stale);
    expect(await loadProject(db, stale.id)).toBeNull();
  });
});
