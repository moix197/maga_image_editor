import type { OverlayNode } from "@maga/editor";
import { withAlpha } from "./css-helpers";

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

/** Traces a rounded-rect path (clamped radius); radius 0 yields a plain rect. */
function traceRoundedRect(
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
  traceRoundedRect(ctx, x, y, w, h, r);
  ctx.clip();
}

/** Sets drop-shadow ctx props from a node's dropShadow config. */
function configureShadow(ctx: CanvasRenderingContext2D, shadow: NonNullable<OverlayNode["dropShadow"]>, pr: number): void {
  ctx.shadowOffsetX = shadow.x * pr;
  ctx.shadowOffsetY = shadow.y * pr;
  ctx.shadowBlur = shadow.blur * pr;
  ctx.shadowColor = withAlpha(shadow.color, shadow.opacity);
}

/** Clears all shadow ctx props so subsequent draws cast no shadow. */
function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
}

/**
 * Casts the drop shadow off the image's rounded silhouette OUTSIDE any clip,
 * then disables the shadow. The silhouette is a plain rect when radius is 0.
 */
function paintShadowSilhouette(
  ctx: CanvasRenderingContext2D,
  shadow: NonNullable<OverlayNode["dropShadow"]>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  pr: number,
): void {
  configureShadow(ctx, shadow, pr);
  traceRoundedRect(ctx, x, y, w, h, r);
  ctx.fill();
  clearShadow(ctx);
}

/**
 * Carves an inset alpha fade into the offscreen ctx via four edge gradients.
 * Each edge fades from transparent at the border to opaque `featherPx` inward;
 * `destination-in` keeps only the intersection, so all four edges soften.
 * featherPx is clamped so it never exceeds half the smaller dimension.
 */
function buildEdgeGradients(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  featherPx: number,
): void {
  const f = Math.min(featherPx, w / 2, h / 2);
  if (f <= 0) return;
  const edges: [number, number, number, number][] = [
    [0, 0, 0, f],
    [0, h, 0, h - f],
    [0, 0, f, 0],
    [w, 0, w - f, 0],
  ];
  ctx.globalCompositeOperation = "destination-in";
  for (const [x0, y0, x1, y1] of edges) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = "source-over";
}

/**
 * Draws the image into an offscreen canvas, feathers all four edges there, then
 * draws the feathered result back onto the main ctx at (x, y). No-op (plain draw)
 * when featherRadius is 0/undefined.
 */
function applyFeatherMask(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  node: OverlayNode,
  x: number,
  y: number,
  w: number,
  h: number,
  pr: number,
): void {
  const featherPx = (node.featherRadius ?? 0) * pr;
  if (featherPx <= 0) {
    ctx.drawImage(img, x, y, w, h);
    return;
  }
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const offCtx = off.getContext("2d");
  if (!offCtx) {
    ctx.drawImage(img, x, y, w, h);
    return;
  }
  offCtx.drawImage(img, 0, 0, w, h);
  buildEdgeGradients(offCtx, w, h, featherPx);
  ctx.drawImage(off, x, y);
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
  // Cast the shadow off the rounded silhouette first, OUTSIDE the clip, so the
  // corner-radius clip never truncates the (offset) drop shadow.
  if (node.dropShadow) paintShadowSilhouette(ctx, node.dropShadow, x, y, w, h, radius, pr);
  ctx.save();
  if (radius > 0) clipRoundedRect(ctx, x, y, w, h, radius);
  applyFeatherMask(ctx, img, node, x, y, w, h, pr);
  ctx.restore();
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only request CORS for remote http(s) sources. Forcing crossOrigin on
    // same-origin data:/blob: URLs can fail the load or taint the canvas
    // (breaking toDataURL). Overlay srcs in this app are data: URLs.
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
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
    // A single failed overlay must not blank the whole export — skip it.
    try {
      const img = await loadImage(node.src);
      drawOverlayImage(ctx, img, node, containerW, containerH, pixelRatio);
    } catch {
      // Skip overlays that fail to load/draw rather than aborting the export.
    }
  }
  return canvas.toDataURL("image/png");
}
