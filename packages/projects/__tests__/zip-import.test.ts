import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { exportProjectZip } from "../src/zip-export";
import { importProjectZip, ZipImportError } from "../src/zip-import";
import { SCHEMA_VERSION, type BatchProject } from "../src/schema";
import type { NodeId } from "@maga/editor";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function makeProject(overrides: Partial<BatchProject> = {}): BatchProject {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "project-1",
    name: "Test project",
    createdAt: 0,
    updatedAt: 0,
    background: { id: "bg", filename: "bg.png", blobKey: PNG_DATA_URL },
    overlays: [],
    template: { nodes: [] },
    variableSlot: { overlayNodeId: "slot" as NodeId, width: 100, height: 100 },
    outputs: [],
    itemNodeOverrides: {},
    ...overrides,
  };
}

/** Builds a ZIP with an explicit project.json string (for corruption cases). */
async function zipWithProjectJson(json: string | null): Promise<Blob> {
  const zip = new JSZip();
  if (json !== null) zip.file("project.json", json);
  return zip.generateAsync({ type: "blob" });
}

describe("importProjectZip", () => {
  it("round-trips a project exported by exportProjectZip", async () => {
    const project = makeProject({
      overlays: [
        { id: "o1", filename: "a.png", blobKey: PNG_DATA_URL },
        { id: "o2", filename: "b.png", blobKey: PNG_DATA_URL },
      ],
    });
    const zipBlob = await exportProjectZip(
      project,
      PNG_DATA_URL,
      [PNG_DATA_URL, PNG_DATA_URL],
      [],
    );

    const { project: imported, blobs } = await importProjectZip(zipBlob);

    expect(imported.schemaVersion).toBe(5);
    expect(imported.background.blobKey).toBe("background.png");
    expect(imported.overlays.map((o) => o.blobKey)).toEqual([
      "overlays/0-a.png",
      "overlays/1-b.png",
    ]);
    // blobs Map is keyed by the same relative paths the project refs use.
    expect(blobs.has("background.png")).toBe(true);
    expect(blobs.has("overlays/0-a.png")).toBe(true);
    expect(blobs.has("overlays/1-b.png")).toBe(true);
    expect(blobs.get("background.png")).toBeInstanceOf(Blob);
  });

  it("throws ZipImportError when project.json is missing", async () => {
    const zipBlob = await zipWithProjectJson(null);
    await expect(importProjectZip(zipBlob)).rejects.toBeInstanceOf(ZipImportError);
  });

  it("throws ZipImportError when project.json is corrupt JSON", async () => {
    const zipBlob = await zipWithProjectJson("{ not valid json");
    await expect(importProjectZip(zipBlob)).rejects.toBeInstanceOf(ZipImportError);
  });

  it("throws ZipImportError on a schemaVersion newer than this build", async () => {
    const futuristic = { ...makeProject(), schemaVersion: 99 };
    const zipBlob = await zipWithProjectJson(JSON.stringify(futuristic));
    await expect(importProjectZip(zipBlob)).rejects.toThrow("Incompatible project version");
  });

  it("migrates a v1 ZIP to v5: empty itemNodeOverrides, no textLayerLocks", async () => {
    // A legacy v1 project: schemaVersion 1, no v2/v3 fields, template with two
    // text layers and no overlays. Migration drops textLayerLocks; with zero
    // overlays there is nothing to fan into, so the unified store stays empty.
    const v1 = {
      schemaVersion: 1,
      id: "legacy",
      name: "Legacy",
      createdAt: 0,
      updatedAt: 0,
      background: { id: "bg", filename: "bg.png", blobKey: PNG_DATA_URL },
      overlays: [],
      template: {
        nodes: [
          { id: "t1" as NodeId, content: "A", x: 0, y: 0, rotation: 0, zIndex: 0, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null },
          { id: "t2" as NodeId, content: "B", x: 0, y: 0, rotation: 0, zIndex: 1, fontSize: 12, color: "#000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null },
        ],
      },
      variableSlot: null,
      outputs: [],
    };
    const zipBlob = await zipWithProjectJson(JSON.stringify(v1));

    const { project: imported } = await importProjectZip(zipBlob);

    expect(imported.schemaVersion).toBe(5);
    expect(imported.itemNodeOverrides).toEqual({});
    expect("textLayerLocks" in imported).toBe(false);
    expect("itemTextValues" in imported).toBe(false);
  });

  it("migrates a v3 ZIP with locked layers to v5: locks fan into unified overrides", async () => {
    // A v3 project with one locked text layer and two overlays. The chain copies
    // the locked layer's template value + style into each overlay, then collapses
    // them into the unified itemNodeOverrides store and drops textLayerLocks.
    const v3 = {
      schemaVersion: 3,
      id: "v3",
      name: "V3",
      createdAt: 0,
      updatedAt: 0,
      background: { id: "bg", filename: "bg.png", blobKey: PNG_DATA_URL },
      overlays: [
        { id: "ov-1", filename: "a.png", blobKey: PNG_DATA_URL },
        { id: "ov-2", filename: "b.png", blobKey: PNG_DATA_URL },
      ],
      template: {
        nodes: [
          { id: "t1" as NodeId, content: "Shared", x: 0, y: 0, rotation: 0, zIndex: 0, fontSize: 24, color: "#ff0000", opacity: 1, fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", shadow: null, textBackground: null },
        ],
      },
      variableSlot: null,
      outputs: [],
      itemTextValues: {},
      textLayerLocks: { t1: true },
      itemTextStyles: {},
    };
    const zipBlob = await zipWithProjectJson(JSON.stringify(v3));

    const { project: imported } = await importProjectZip(zipBlob);

    expect(imported.schemaVersion).toBe(5);
    expect("textLayerLocks" in imported).toBe(false);
    expect(imported.itemNodeOverrides["ov-1"]?.t1?.content).toBe("Shared");
    expect(imported.itemNodeOverrides["ov-2"]?.t1?.content).toBe("Shared");
    expect(imported.itemNodeOverrides["ov-1"]?.t1).toMatchObject({ fontSize: 24, color: "#ff0000" });
    expect(imported.itemNodeOverrides["ov-2"]?.t1).toMatchObject({ fontSize: 24, color: "#ff0000" });
  });

  it("round-trips a v5 project's itemNodeOverrides", async () => {
    const project = makeProject({
      itemNodeOverrides: { "ov-1": { t1: { content: "x", fontSize: 30, color: "#ff0000" } } },
    });
    const zipBlob = await exportProjectZip(project, PNG_DATA_URL, [], []);

    const { project: imported } = await importProjectZip(zipBlob);
    expect(imported.schemaVersion).toBe(5);
    expect(imported.itemNodeOverrides).toEqual({
      "ov-1": { t1: { content: "x", fontSize: 30, color: "#ff0000" } },
    });
  });

  it("re-importing a v5 ZIP does not re-migrate (idempotent)", async () => {
    const project = makeProject({
      itemNodeOverrides: { "ov-1": { t1: { fontSize: 22 } } },
    });
    const firstZip = await exportProjectZip(project, PNG_DATA_URL, [], []);
    const { project: once } = await importProjectZip(firstZip);
    const secondZip = await exportProjectZip(once, PNG_DATA_URL, [], []);
    const { project: twice } = await importProjectZip(secondZip);

    expect(twice.schemaVersion).toBe(5);
    expect(twice.itemNodeOverrides).toEqual({ "ov-1": { t1: { fontSize: 22 } } });
  });

  it("sets template to null (no throw) when project.json omits it", async () => {
    const { template: _omitTemplate, ...withoutTemplate } = makeProject();
    const zipBlob = await zipWithProjectJson(JSON.stringify(withoutTemplate));

    const { project: imported } = await importProjectZip(zipBlob);
    expect(imported.template).toBeNull();
    // variableSlot was present, so it is preserved
    expect(imported.variableSlot).toEqual({ overlayNodeId: "slot", width: 100, height: 100 });
  });

  it("sets variableSlot to null (no throw) when project.json omits it", async () => {
    const { variableSlot: _omitSlot, ...withoutSlot } = makeProject();
    const zipBlob = await zipWithProjectJson(JSON.stringify(withoutSlot));

    const { project: imported } = await importProjectZip(zipBlob);
    expect(imported.variableSlot).toBeNull();
  });

  it("sets both null (no throw) for a background-only draft", async () => {
    const draft = makeProject({ template: null, variableSlot: null });
    const zipBlob = await exportProjectZip(draft, PNG_DATA_URL, [], []);

    const { project: imported } = await importProjectZip(zipBlob);
    expect(imported.template).toBeNull();
    expect(imported.variableSlot).toBeNull();
  });

  it("preserves a legacy project's non-null template value when present", async () => {
    // Pre-refactor projects always carried a non-null template; that value must
    // survive import unchanged. A node with a marker id proves the value (not a
    // freshly-defaulted empty template) round-trips.
    const legacyTemplate = {
      nodes: [{ id: "legacy-node" as NodeId, type: "text", text: "legacy" }],
    } as unknown as BatchProject["template"];
    const legacy = makeProject({ template: legacyTemplate });
    const zipBlob = await zipWithProjectJson(JSON.stringify(legacy));

    const { project: imported } = await importProjectZip(zipBlob);
    expect(imported.template).toEqual(legacyTemplate);
  });
});
