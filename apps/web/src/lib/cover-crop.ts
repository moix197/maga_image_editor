/**
 * Center-crop `src` to `slotW*scale × slotH*scale` using cover-fit math.
 *
 * WHY pre-crop here instead of inside the post-pass:
 * `applyImageOverlayPostPass` reads `node.src` to load the image it draws.
 * It has no cover-fit logic — it draws the image at the node's own width/height
 * (scaled by the export pixelRatio). Pre-cropping replaces the node's src with
 * an already-fitted data URL so the post-pass just blits it without any
 * distortion or transparent bars.
 *
 * `scale` is the caller's pixelRatio (e.g. the export's 2×): cropping at
 * `slot * scale` instead of `slot * 1` supplies the post-pass with a
 * full-resolution bitmap instead of one it has to upscale, which is what was
 * causing blurry overlays on export. Output is clamped to the source image's
 * native pixel dimensions so a low-res source is never upscaled past its own
 * resolution. Default `scale = 1` preserves prior callers' framing exactly
 * (clamping is a no-op whenever the requested size already fits the source).
 */
export async function coverCropDataUrl(
  src: string,
  slotW: number,
  slotH: number,
  scale = 1,
): Promise<string> {
  const img = await loadImage(src);
  const { canvasW, canvasH } = clampedCropSize(slotW, slotH, scale, img.naturalWidth, img.naturalHeight);
  const fit = Math.max(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
  const drawW = img.naturalWidth * fit;
  const drawH = img.naturalHeight * fit;
  const drawX = (canvasW - drawW) / 2;
  const drawY = (canvasH - drawH) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context");
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  return canvas.toDataURL("image/png");
}

/**
 * Scales `slotW × slotH` by `scale`, clamped so neither output dimension
 * exceeds the source's native pixels — the slot's aspect ratio is preserved
 * (both dimensions shrink together) rather than letting one axis clamp
 * independently, which would distort the cover-fit framing.
 *
 * The clamp factor is floored at `1/scale`, i.e. the output never shrinks
 * below the legacy `slotW × slotH` (scale=1) size. This makes `scale=1`
 * reproduce the pre-existing, unclamped behavior exactly (including its
 * accepted upscaling of sources smaller than the slot) and ensures a larger
 * `scale` only ever trims the *extra* resolution it requests — never
 * regresses quality below what scale=1 already produced.
 */
function clampedCropSize(
  slotW: number,
  slotH: number,
  scale: number,
  naturalW: number,
  naturalH: number,
): { canvasW: number; canvasH: number } {
  const targetW = slotW * scale;
  const targetH = slotH * scale;
  const noUpscaleFactor = Math.min(1, naturalW / targetW, naturalH / targetH);
  const factor = Math.max(noUpscaleFactor, 1 / scale);
  return { canvasW: targetW * factor, canvasH: targetH * factor };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
