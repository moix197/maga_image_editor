# Image-overlay effects are baked in a native canvas post-pass

**Decision:** Export is a two-stage render. `html-to-image` captures the base
PNG of the editor DOM (`apps/web/src/lib/export-helpers.ts`), but image-overlay
visual effects — opacity, corner radius, rotation, drop shadow, edge feather —
are re-drawn afterward by a native `<canvas>` pass at `pixelRatio: 2`
(`apps/web/src/lib/canvas-post-pass.ts`). The overlays are hidden during the
base capture and composited back in by the post-pass.

**Why:** `html-to-image` rasterizes the DOM through an SVG `<foreignObject>`,
which silently drops the CSS that produces those effects — transforms,
`border-radius` clipping, `drop-shadow`/`filter`, and mask/gradient feathering
come out flat or missing, with no error. That non-obvious, silent fidelity loss
is what forced a second, deterministic canvas pass where each effect is painted
explicitly (rounded-rect clip, shadow off the silhouette, gradient feather mask)
instead of trusting the DOM rasterizer.

**Rejected:** Relying on `html-to-image` alone — it cannot reproduce the
effects. Switching to a different DOM-to-image library — every `foreignObject`-
based rasterizer shares the same limitation, and a heavier headless renderer was
not worth the dependency. See CLAUDE.md dependency-minimization.

**Constraints it creates:** Every overlay effect must be re-implementable with
canvas primitives, not just CSS — a CSS-only effect would not survive export.
Any new effect field is therefore a two-place change: the editor/UI side **and**
a corresponding bake in `canvas-post-pass.ts`; omitting the post-pass branch
means the effect renders on screen but vanishes on export. This is why effect
fields are opt-in and guarded — see [[effect-field-optional-properties]]. The
post-pass reads node data off the DOM via [[data-overlay-dom-serialization]].
