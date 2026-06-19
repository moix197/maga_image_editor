import JSZip from "jszip";
import type { BatchProject, GeneratedOutput, ProjectAsset } from "./schema";

/**
 * Maps a data URL's MIME type to a file extension. Falls back to `.bin` for an
 * unrecognised MIME so the entry name is still well-formed.
 */
function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

/** Extracts the MIME type from a `data:<mime>;base64,<data>` URL. */
function mimeFromDataUrl(dataUrl: string): string {
  return dataUrl.slice(5, dataUrl.indexOf(";"));
}

/**
 * Decodes the base64 payload of a `data:<mime>;base64,<data>` URL to raw bytes.
 * Pure: `atob` + `Uint8Array`, no external dependency. JSZip consumes these
 * bytes directly (a `Uint8Array` is handled identically across browser and node
 * runtimes, unlike `Blob`).
 */
function dataUrlToBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Converts a `data:<mime>;base64,<data>` URL to a {@link Blob}. Pure: uses
 * `atob` + `Uint8Array` with no external dependency.
 *
 * Exported for unit testing only — not part of the package's public surface
 * (it is not re-exported from `index.ts`).
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  return new Blob([dataUrlToBytes(dataUrl)], { type: mimeFromDataUrl(dataUrl) });
}

/** ZIP-relative path for the background file, extension derived from its MIME. */
function backgroundPath(dataUrl: string): string {
  return `background.${extensionForMime(mimeFromDataUrl(dataUrl))}`;
}

/**
 * ZIP-relative path for an overlay. Index-prefixed so identical upload
 * filenames never collide and ordering stays stable.
 */
function overlayPath(index: number, asset: ProjectAsset): string {
  return `overlays/${index}-${asset.filename}`;
}

/**
 * ZIP-relative path for a generated output. Index-prefixed (matching the
 * overlay convention) so duplicate overlay filenames never collide; extension
 * comes from the output data URL's own MIME.
 *
 * NOTE: outputs arrive as already-encoded data URLs from the render pipeline.
 * We preserve that upstream encoding (extension from MIME) rather than
 * decoding + re-encoding here — this package has no DOM/canvas. Alpha-based
 * format selection (PNG for transparent, JPEG for opaque) belongs upstream at
 * render time if ever needed, not in this serialization layer.
 */
function outputPath(index: number, overlay: ProjectAsset | undefined, dataUrl: string): string {
  const stem = (overlay?.filename ?? `output-${index}`).replace(/\.[^.]+$/, "");
  return `outputs/${index}-${stem}.${extensionForMime(mimeFromDataUrl(dataUrl))}`;
}

/**
 * Serializes the project for `project.json`, rewriting the in-memory raw data
 * URL refs (`background.blobKey`, each `overlays[i].blobKey`, each
 * `outputs[i].outputBlobKey`) to the ZIP-relative paths that match the layout.
 * The JSON never embeds data URLs, keeping it human-readable and clean for
 * future cloud mapping.
 */
function serializeProjectJson(
  project: BatchProject,
  backgroundDataUrl: string,
  overlayDataUrls: string[],
  outputDataUrls: string[],
): string {
  const overlays: ProjectAsset[] = project.overlays.map((overlay, index) => ({
    ...overlay,
    blobKey: overlayPath(index, overlay),
  }));

  const outputs: GeneratedOutput[] = project.outputs.map((output, index) => ({
    ...output,
    outputBlobKey: outputPath(
      index,
      project.overlays.find((o) => o.id === output.overlayAssetId),
      outputDataUrls[index] ?? "",
    ),
  }));

  const portable: BatchProject = {
    ...project,
    background: { ...project.background, blobKey: backgroundPath(backgroundDataUrl) },
    overlays,
    outputs,
  };

  return JSON.stringify(portable, null, 2);
}

/**
 * Builds a portable, self-contained project ZIP: `project.json` (with
 * relative-path asset refs), the background image, all overlays under
 * `overlays/`, and all generated composites under `outputs/`.
 *
 * The data URL arrays carry the actual bytes (the in-memory `project` holds raw
 * data URLs in its `blobKey`/`outputBlobKey` fields); callers pass them in the
 * same order as `project.overlays` / `project.outputs`.
 *
 * @example
 * const blob = await exportProjectZip(project, bgUrl, overlayUrls, outputUrls);
 * // -> Blob ready for URL.createObjectURL download
 */
export async function exportProjectZip(
  project: BatchProject,
  backgroundDataUrl: string,
  overlayDataUrls: string[],
  outputDataUrls: string[],
): Promise<Blob> {
  const zip = new JSZip();

  zip.file(
    "project.json",
    serializeProjectJson(project, backgroundDataUrl, overlayDataUrls, outputDataUrls),
  );

  zip.file(backgroundPath(backgroundDataUrl), dataUrlToBytes(backgroundDataUrl));

  project.overlays.forEach((overlay, index) => {
    const dataUrl = overlayDataUrls[index];
    if (dataUrl) zip.file(overlayPath(index, overlay), dataUrlToBytes(dataUrl));
  });

  project.outputs.forEach((output, index) => {
    const dataUrl = outputDataUrls[index];
    if (!dataUrl) return;
    const overlay = project.overlays.find((o) => o.id === output.overlayAssetId);
    zip.file(outputPath(index, overlay, dataUrl), dataUrlToBytes(dataUrl));
  });

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
