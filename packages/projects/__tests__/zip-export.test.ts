import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { exportProjectZip } from "../src/zip-export";
import { SCHEMA_VERSION } from "../src/schema";
import type { BatchProject } from "../src/schema";
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
    itemTextValues: {},
    textLayerLocks: {},
    itemTextStyles: {},
    ...overrides,
  };
}

async function readProjectJson(blob: Blob): Promise<{ raw: string; parsed: BatchProject }> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const entry = zip.file("project.json");
  if (!entry) throw new Error("project.json missing");
  const raw = await entry.async("string");
  return { raw, parsed: JSON.parse(raw) as BatchProject };
}

describe("exportProjectZip", () => {
  it("produces a non-empty ZIP with a valid versioned project.json", async () => {
    const blob = await exportProjectZip(makeProject(), PNG_DATA_URL, [], []);
    expect(blob.size).toBeGreaterThan(0);

    const { parsed } = await readProjectJson(blob);
    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.id).toBe("project-1");
    expect(parsed.background).toBeDefined();
  });

  it("writes schemaVersion 4 and the v3 field (itemTextStyles) alongside v2 fields", async () => {
    const project = makeProject({
      itemTextValues: { "ov-1": { "node-1": "hello" } },
      textLayerLocks: { "node-1": false },
      itemTextStyles: { "ov-1": { "node-1": { fontSize: 32 } } },
    });
    const blob = await exportProjectZip(project, PNG_DATA_URL, [], []);
    const { parsed } = await readProjectJson(blob);

    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.itemTextValues).toEqual({ "ov-1": { "node-1": "hello" } });
    expect(parsed.textLayerLocks).toEqual({ "node-1": false });
    expect(parsed.itemTextStyles).toEqual({ "ov-1": { "node-1": { fontSize: 32 } } });
  });

  it("forces schemaVersion 4 on export even if the in-memory record is older", async () => {
    const stale = { ...makeProject(), schemaVersion: 1 as unknown as BatchProject["schemaVersion"] };
    const blob = await exportProjectZip(stale, PNG_DATA_URL, [], []);
    const { parsed } = await readProjectJson(blob);
    expect(parsed.schemaVersion).toBe(4);
  });

  it("includes one entry per overlay and per output", async () => {
    const project = makeProject({
      overlays: [
        { id: "o1", filename: "a.png", blobKey: PNG_DATA_URL },
        { id: "o2", filename: "b.png", blobKey: PNG_DATA_URL },
      ],
      outputs: [
        { overlayAssetId: "o1", outputBlobKey: PNG_DATA_URL, timestamp: 1 },
        { overlayAssetId: "o2", outputBlobKey: PNG_DATA_URL, timestamp: 2 },
      ],
    });

    const blob = await exportProjectZip(
      project,
      PNG_DATA_URL,
      [PNG_DATA_URL, PNG_DATA_URL],
      [PNG_DATA_URL, PNG_DATA_URL],
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    const overlayFiles = Object.keys(zip.files).filter((p) => p.startsWith("overlays/") && !p.endsWith("/"));
    const outputFiles = Object.keys(zip.files).filter((p) => p.startsWith("outputs/") && !p.endsWith("/"));
    expect(overlayFiles).toHaveLength(2);
    expect(outputFiles).toHaveLength(2);
  });

  it("rewrites refs in project.json to relative paths (no data: URLs)", async () => {
    const project = makeProject({
      overlays: [{ id: "o1", filename: "a.png", blobKey: PNG_DATA_URL }],
      outputs: [{ overlayAssetId: "o1", outputBlobKey: PNG_DATA_URL, timestamp: 1 }],
    });

    const blob = await exportProjectZip(project, PNG_DATA_URL, [PNG_DATA_URL], [PNG_DATA_URL]);
    const { raw, parsed } = await readProjectJson(blob);

    expect(raw).not.toContain("data:");
    expect(parsed.background.blobKey).toBe("background.png");
    expect(parsed.overlays[0]?.blobKey).toBe("overlays/0-a.png");
    expect(parsed.outputs[0]?.outputBlobKey).toBe("outputs/0-a.png");
  });

  it("exports a background-only draft (null template + null variableSlot) without crashing", async () => {
    const project = makeProject({ template: null, variableSlot: null });

    const blob = await exportProjectZip(project, PNG_DATA_URL, [], []);
    expect(blob.size).toBeGreaterThan(0);

    const { raw, parsed } = await readProjectJson(blob);
    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.template).toBeNull();
    expect(parsed.variableSlot).toBeNull();
    // null fields are written natively as JSON null
    expect(raw).toContain('"template": null');
    expect(raw).toContain('"variableSlot": null');

    // no outputs → no outputs/ directory entries
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const outputFiles = Object.keys(zip.files).filter((p) => p.startsWith("outputs/"));
    expect(outputFiles).toHaveLength(0);
  });

  it("avoids collisions when two overlays share a filename", async () => {
    const project = makeProject({
      overlays: [
        { id: "o1", filename: "same.png", blobKey: PNG_DATA_URL },
        { id: "o2", filename: "same.png", blobKey: PNG_DATA_URL },
      ],
      outputs: [
        { overlayAssetId: "o1", outputBlobKey: PNG_DATA_URL, timestamp: 1 },
        { overlayAssetId: "o2", outputBlobKey: PNG_DATA_URL, timestamp: 2 },
      ],
    });

    const blob = await exportProjectZip(
      project,
      PNG_DATA_URL,
      [PNG_DATA_URL, PNG_DATA_URL],
      [PNG_DATA_URL, PNG_DATA_URL],
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    const outputFiles = Object.keys(zip.files).filter((p) => p.startsWith("outputs/") && !p.endsWith("/"));
    expect(new Set(outputFiles).size).toBe(2);
    expect(outputFiles).toContain("outputs/0-same.png");
    expect(outputFiles).toContain("outputs/1-same.png");
  });
});
