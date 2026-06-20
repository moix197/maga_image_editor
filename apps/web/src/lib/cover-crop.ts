/**
 * Center-crop `src` to exactly `slotW × slotH` using cover-fit math.
 *
 * WHY pre-crop here instead of inside the post-pass:
 * `applyImageOverlayPostPass` reads `node.src` to load the image it draws.
 * It has no cover-fit logic — it draws the image at the node's own width/height.
 * Pre-cropping replaces the node's src with an already-fitted data URL so the
 * post-pass just blits it at 1:1 without any distortion or transparent bars.
 */
export async function coverCropDataUrl(
  src: string,
  slotW: number,
  slotH: number,
): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.max(slotW / img.naturalWidth, slotH / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const drawX = (slotW - drawW) / 2;
  const drawY = (slotH - drawH) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = slotW;
  canvas.height = slotH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context");
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  return canvas.toDataURL("image/png");
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
