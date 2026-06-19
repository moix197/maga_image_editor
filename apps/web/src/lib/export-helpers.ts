import * as htmlToImage from "html-to-image";
import type { OverlayNode } from "@maga/editor";
import { applyImageOverlayPostPass } from "./canvas-post-pass";

/** Reads image-overlay node geometry/effects serialized on `data-post-pass` elements. */
function collectImageOverlayNodes(el: HTMLElement): OverlayNode[] {
  const els = el.querySelectorAll<HTMLElement>('[data-post-pass="true"]');
  const nodes: OverlayNode[] = [];
  els.forEach((node) => {
    const raw = node.dataset.overlay;
    if (raw) nodes.push(JSON.parse(raw) as OverlayNode);
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

export async function exportCanvasElement(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  await document.fonts.ready;
  const imageOverlayNodes = collectImageOverlayNodes(el);
  const restore = suppressPostPassNodes(el);
  let baseDataUrl: string;
  try {
    baseDataUrl = await htmlToImage.toPng(el, { pixelRatio: 2 });
  } finally {
    restore();
  }
  const dataUrl = await applyImageOverlayPostPass(
    baseDataUrl,
    imageOverlayNodes,
    el.offsetWidth,
    el.offsetHeight,
    2,
  );
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
