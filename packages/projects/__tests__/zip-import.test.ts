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

    expect(imported.schemaVersion).toBe(1);
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

  it("throws ZipImportError on incompatible schemaVersion", async () => {
    const stale = { ...makeProject(), schemaVersion: 2 };
    const zipBlob = await zipWithProjectJson(JSON.stringify(stale));
    await expect(importProjectZip(zipBlob)).rejects.toThrow("Incompatible project version");
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
