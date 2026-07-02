import * as htmlToImage from "html-to-image";
import type { OverlayNode } from "@maga/editor";
import { applyImageOverlayPostPass } from "./canvas-post-pass";

/** Device-pixel scale all exports (and their overlay crops) rasterize at. */
export const EXPORT_PIXEL_RATIO = 2;

/** Reads image-overlay node geometry/effects serialized on `data-post-pass` elements. */
function collectImageOverlayNodes(el: HTMLElement): OverlayNode[] {
  const els = el.querySelectorAll<HTMLElement>('[data-post-pass="true"]');
  const nodes: OverlayNode[] = [];
  els.forEach((node) => {
    const raw = node.dataset.overlay;
    if (!raw) return;
    try {
      nodes.push(JSON.parse(raw) as OverlayNode);
    } catch {
      // Skip elements with malformed data-overlay rather than aborting the export.
    }
  });
  return nodes;
}

/**
 * Removes any transient smart-guide line elements from a capture subtree before
 * rasterizing. Guide lines are cleared on pointer-up/drag-cancel, so in practice
 * none are ever present at export time — this is belt-and-suspenders structural
 * enforcement of the guide non-contamination invariant, independent of the
 * "export never runs mid-drag" timing assumption (see plan "export
 * non-contamination (b)"). Always strips; asserts in dev when one is found.
 */
export function stripGuideLines(el: HTMLElement): void {
  const guides = el.querySelectorAll("[data-guide-line]");
  if (guides.length > 0 && process.env.NODE_ENV !== "production") {
    console.error(
      `export-helpers: ${guides.length} [data-guide-line] element(s) present at capture time; stripping.`,
    );
  }
  guides.forEach((node) => node.remove());
}

/** Hides post-pass overlays during base capture so they are not double-composited. */
function suppressPostPassNodes(el: HTMLElement): () => void {
  const els = el.querySelectorAll<HTMLElement>('[data-post-pass="true"]');
  const previous: string[] = [];
  els.forEach((node) => {
    previous.push(node.style.opacity);
    node.style.opacity = "0";
  });
  return () => els.forEach((node, i) => (node.style.opacity = previous[i] ?? ""));
}

/**
 * Composites an element + explicit overlay nodes into a data URL without
 * triggering a file download. Used by use-single-composite to generate a
 * preview: the caller supplies the already-patched overlay nodes (with
 * cover-cropped src) so no DOM re-render is required before calling.
 */
export async function compositeFromElement(
  el: HTMLElement,
  overlayNodes: OverlayNode[],
): Promise<string> {
  await document.fonts.ready;
  stripGuideLines(el);
  const restore = suppressPostPassNodes(el);
  let baseDataUrl: string;
  try {
    baseDataUrl = await htmlToImage.toPng(el, { pixelRatio: EXPORT_PIXEL_RATIO });
  } finally {
    restore();
  }
  return applyImageOverlayPostPass(
    baseDataUrl,
    overlayNodes,
    el.offsetWidth,
    el.offsetHeight,
    EXPORT_PIXEL_RATIO,
  );
}

export async function exportCanvasElement(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  await document.fonts.ready;
  stripGuideLines(el);
  const imageOverlayNodes = collectImageOverlayNodes(el);
  const restore = suppressPostPassNodes(el);
  let baseDataUrl: string;
  try {
    baseDataUrl = await htmlToImage.toPng(el, { pixelRatio: EXPORT_PIXEL_RATIO });
  } finally {
    restore();
  }
  const dataUrl = await applyImageOverlayPostPass(
    baseDataUrl,
    imageOverlayNodes,
    el.offsetWidth,
    el.offsetHeight,
    EXPORT_PIXEL_RATIO,
  );
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
