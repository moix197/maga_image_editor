import JSZip from "jszip";
import { SCHEMA_VERSION, type BatchProject } from "./schema";

/**
 * Thrown when a ZIP cannot be imported: missing/corrupt `project.json` or an
 * incompatible `schemaVersion`. Typed so callers can distinguish import
 * failures from unexpected errors and surface a friendly banner.
 */
export class ZipImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipImportError";
  }
}

/**
 * Normalizes nullable fields after parsing. `template` and `variableSlot` are
 * optional in the JSON (background-only drafts omit them); a legacy project that
 * carries a non-null value keeps it as-is, while an absent field becomes `null`.
 * This replaces the previous hard-throw-on-missing behavior so incomplete and
 * pre-refactor projects import without crashing.
 */
function normalizeNullableFields(project: BatchProject): BatchProject {
  return {
    ...project,
    template: project.template ?? null,
    variableSlot: project.variableSlot ?? null,
  };
}

/** Parses the ZIP's `project.json`, throwing {@link ZipImportError} on any fault. */
async function parseProjectJson(zip: JSZip): Promise<BatchProject> {
  const entry = zip.file("project.json");
  if (!entry) throw new ZipImportError("project.json is missing from the ZIP");

  let project: BatchProject;
  try {
    project = JSON.parse(await entry.async("string")) as BatchProject;
  } catch {
    throw new ZipImportError("project.json is corrupt or not valid JSON");
  }

  if (project?.schemaVersion !== SCHEMA_VERSION) {
    throw new ZipImportError("Incompatible project version");
  }
  return normalizeNullableFields(project);
}

/**
 * Collects the blob behind each project ref into a Map keyed by the ZIP-relative
 * path stored in the project JSON (`background.<ext>`, `overlays/<i>-...`,
 * `outputs/<i>-...`). Keying the Map by the same path the project refs use keeps
 * blobs reconciled with how the imported project references them.
 */
async function extractBlobs(zip: JSZip, project: BatchProject): Promise<Map<string, Blob>> {
  const paths = [
    project.background.blobKey,
    ...project.overlays.map((o) => o.blobKey),
    ...project.outputs.map((o) => o.outputBlobKey),
  ];

  const blobs = new Map<string, Blob>();
  for (const path of paths) {
    const entry = zip.file(path);
    if (entry) blobs.set(path, await entry.async("blob"));
  }
  return blobs;
}

/**
 * Reads a previously exported project ZIP back into an in-memory project plus a
 * `path -> Blob` map. Validates `schemaVersion` immediately after parsing
 * `project.json`; throws {@link ZipImportError} on missing/corrupt JSON or an
 * incompatible version.
 *
 * @example
 * const { project, blobs } = await importProjectZip(file);
 * // blobs.get(project.background.blobKey) -> the background Blob
 */
export async function importProjectZip(
  zipBlob: Blob,
): Promise<{ project: BatchProject; blobs: Map<string, Blob> }> {
  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
  const project = await parseProjectJson(zip);
  const blobs = await extractBlobs(zip, project);
  return { project, blobs };
}
