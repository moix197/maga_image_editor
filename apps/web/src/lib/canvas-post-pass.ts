import type { OverlayNode } from "@maga/editor";

/** Converts a percentage-based coordinate to canvas pixels at the given pixelRatio. */
export function toCanvasPx(percent: number, dimension: number, pixelRatio: number): number {
  return (percent / 100) * dimension * pixelRatio;
}

/** Sets up a rotate-around-center transform: translate to center, rotate, translate back. */
function buildRotationTransform(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radians: number,
): void {
  ctx.translate(cx, cy);
  ctx.rotate(radians);
  ctx.translate(-cx, -cy);
}

/** Clips the current path to a rounded rectangle. */
function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
}

/** STUB (Phase 3): edge-feather alpha mask. No-op this phase. */
function applyFeatherMask(ctx: CanvasRenderingContext2D, node: OverlayNode, pr: number): void {
  void ctx;
  void node;
  void pr;
  // Implemented in Phase 3.
}

/** STUB (Phase 3): builds the four inset edge gradients for feather. No-op this phase. */
function buildEdgeGradients(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  featherPx: number,
): void {
  void ctx;
  void w;
  void h;
  void featherPx;
  // Implemented in Phase 3.
}

/** Draws one overlay image with opacity, cornerRadius, rotation, and dropShadow applied. */
function drawOverlayImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  node: OverlayNode,
  cW: number,
  cH: number,
  pr: number,
): void {
  const x = toCanvasPx(node.x, cW, pr);
  const y = toCanvasPx(node.y, cH, pr);
  const w = node.width * pr;
  const h = node.height * pr;
  const radius = (node.cornerRadius ?? 0) * pr;
  ctx.save();
  ctx.globalAlpha = node.opacity;
  buildRotationTransform(ctx, x + w / 2, y + h / 2, ((node.rotation ?? 0) * Math.PI) / 180);
  if (node.dropShadow) {
    ctx.shadowOffsetX = node.dropShadow.x * pr;
    ctx.shadowOffsetY = node.dropShadow.y * pr;
    ctx.shadowBlur = node.dropShadow.blur * pr;
    ctx.shadowColor = withAlpha(node.dropShadow.color, node.dropShadow.opacity);
  }
  if (radius > 0) clipRoundedRect(ctx, x, y, w, h, radius);
  ctx.drawImage(img, x, y, w, h);
  applyFeatherMask(ctx, node, pr);
  buildEdgeGradients(ctx, w, h, 0);
  ctx.restore();
}

/** Converts a #rrggbb color + alpha (0..1) to an rgba() string. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Re-draws image overlays onto the base PNG via a native canvas pass so that
 * opacity, corner radius, rotation, and drop shadow bake correctly into export.
 */
export async function applyImageOverlayPostPass(
  baseDataUrl: string,
  overlayNodes: OverlayNode[],
  containerW: number,
  containerH: number,
  pixelRatio: number,
): Promise<string> {
  const base = await loadImage(baseDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = containerW * pixelRatio;
  canvas.height = containerH * pixelRatio;
  const ctx = canvas.getContext("2d");
  if (!ctx) return baseDataUrl;
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

  const ordered = [...overlayNodes].sort((a, b) => a.zIndex - b.zIndex);
  for (const node of ordered) {
    const img = await loadImage(node.src);
    drawOverlayImage(ctx, img, node, containerW, containerH, pixelRatio);
  }
  return canvas.toDataURL("image/png");
}
