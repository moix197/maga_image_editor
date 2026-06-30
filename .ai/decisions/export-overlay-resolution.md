# Overlay cover-crop scales with the export pixelRatio, clamped to source

**Decision:** `coverCropDataUrl` (`apps/web/src/lib/cover-crop.ts`) takes an
optional `scale` parameter — the caller's export `pixelRatio` — and crops at
`slotW*scale × slotH*scale` instead of always `slotW × slotH`. Both call sites
(`use-single-composite.ts`, `use-batch-render.ts`) pass the export's
`pixelRatio` (`2`). The crop size is clamped so it never exceeds the source
image's native pixel dimensions, and the clamp factor is floored at `1/scale`
so it never shrinks below the legacy (`scale=1`) size — `scale=1` (the
default) reproduces the pre-existing, unclamped behavior exactly.

**Why:** Overlays were pre-rasterized to 1× slot size, then the export
post-pass (`canvas-post-pass.ts`, `applyImageOverlayPostPass`) draws them at
`node.width * pixelRatio` (`pixelRatio: 2`) — an unconditional 2× upscale of
an already-rasterized bitmap, which is what produced the blur. The base image
never goes through this path (it's captured straight off the DOM by
`html-to-image` at the same `pixelRatio`), so only overlays looked soft.
Cropping at `slot * pixelRatio` up front supplies the post-pass with a
same-resolution (or higher) bitmap, so its draw is a no-op scale or a
downscale — never an upscale. Clamping to the source's native resolution
prevents a low-res overlay from being fabricated extra detail it doesn't have;
flooring the clamp at the legacy `scale=1` size prevents the clamp from ever
making quality *worse* than before for a small source.

**Follow-up fix — crop target must be the overlay's ACTUAL final draw size:**
Bumping the scale to `pixelRatio` wasn't sufficient on its own: the crop's
*target dimensions* (`slotW`/`slotH`) were still the stale `VariableSlot.width/
height` captured once, at the moment the slot was toggled
(`BatchWorkspace.tsx`, `handleToggleVariableSlot`). If a per-variant override
later enlarges that overlay node's `width`/`height` (`itemNodeOverrides`), the
post-pass (`canvas-post-pass.ts`) draws at the OVERRIDDEN `node.width/height *
pixelRatio` — bigger than the bitmap cropped at the stale slot size — so the
browser upscales the crop to fill the draw rect, reintroducing blur (and, if
the override changes the aspect ratio, stretch). Fix: in
`use-batch-render.ts`, `getEffectiveOverlayDimensions` resolves the slot
node's effective width/height by reading the same per-variant override
(`overlayTransformPatch`, reused — not duplicated) that `applyOverlayOverrides`
applies to the composited node array, falling back to `slot.width/height`
when no override touches that node. `coverCropDataUrl` is now called with
these effective dims as `slotW`/`slotH`, so the crop always tracks what the
post-pass will actually draw. `use-single-composite.ts` needed no equivalent
change: it has no `itemNodeOverrides` input, and `patchOverlays` there draws
the slot node straight from the un-overridden `template`, so `slot.width/
height` (captured from that same node) already equals the actual draw size.

**Residual limitation (not a bug):** a genuinely low-resolution source asset
is still clamped to its own native pixel dimensions by `clampedCropSize` — a
source image cannot be upscaled past the detail it actually contains. This
ceiling is inherent to the source asset, not a defect in the crop-target fix
above.

**Rejected:** A user-facing export-resolution setting. The 2× export ceiling
itself is unchanged — this is purely a bug fix to how overlays reach that
existing ceiling, not a new resolution control. Adding a setting would expand
scope for no requirement driving it.

**Constraints it creates:** `coverCropDataUrl`'s `scale` parameter must stay
in sync with whatever `pixelRatio` the export pipeline uses
(`export-helpers.ts`, currently a hardcoded `2` duplicated across that file —
no shared constant exists there yet). Each hook call site documents this with
a local `EXPORT_PIXEL_RATIO` constant and a comment pointing back to
`export-helpers.ts`; if the export `pixelRatio` ever changes, both hook
constants must be updated to match. The interactive editing canvas
(`overlay-node-layer.tsx`) never calls `coverCropDataUrl`, so it is unaffected
by this change. See also [[pixelratio-coordinate-mapping]] for how the post-
pass maps stored geometry onto the scaled canvas, and
[[canvas-post-pass-for-export-effects]] for why overlays are baked in a
separate canvas pass at all.
