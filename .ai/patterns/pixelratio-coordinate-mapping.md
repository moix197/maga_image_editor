# pixelRatio-aware percent↔pixel coordinate mapping

Overlay node geometry is stored **resolution-independent**: position (`x`, `y`)
as a percentage of the container, size and effect magnitudes (width, height,
corner radius, shadow offset/blur, feather radius) in CSS pixels. The export
canvas, however, is rendered at `pixelRatio: 2` — twice the container's CSS
dimensions. So every value must be mapped onto that scaled canvas at bake time.

**The convention:** when baking a value onto the post-pass canvas
(`apps/web/src/lib/canvas-post-pass.ts`), always go through the pixelRatio.
Percentages convert via the shared `toCanvasPx(percent, dimension, pixelRatio)`
helper; absolute pixel magnitudes multiply by the same ratio (`* pr` — width,
height, `cornerRadius`, the `dropShadow` offsets/blur, `featherRadius`). The
ratio is threaded through every draw helper as `pr` for exactly this reason.

**Why pixelRatio matters:** it is the one factor that ties the stored,
device-independent units to the actual canvas pixels. Skip it on any single
value and that value renders at half scale relative to the rest — a shadow that
is too tight, a radius that is too small, an overlay placed off its intended
spot. The mapping is uniform precisely so no value is left in the wrong
coordinate space. The base PNG enters the same canvas already scaled
(`drawImage(base, 0, 0, canvas.width, canvas.height)`), so overlays must match
it.

**Upstream of the post-pass, the source bitmap must match too.** The post-pass
draws each overlay image at `node.width * pr` / `node.height * pr` — but
`drawImage` always stretches whatever bitmap it's given to that destination
size, regardless of the bitmap's own resolution. If the overlay's `src` was
rasterized at 1× (`coverCropDataUrl(src, slotW, slotH)`) while the post-pass
draws at `pr = 2`, that 1× bitmap gets upscaled 2× — soft output, even though
every coordinate in the post-pass itself is correctly pixelRatio-mapped.
`coverCropDataUrl`'s `scale` parameter exists to close this gap: callers pass
the same `pixelRatio` the post-pass will use, so the cropped bitmap already
has enough pixels and the post-pass draw is a same-size blit or a downscale,
never an upscale. See [[export-overlay-resolution]].
