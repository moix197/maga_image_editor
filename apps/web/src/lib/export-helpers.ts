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
