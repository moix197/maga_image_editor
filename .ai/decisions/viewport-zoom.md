# Canvas viewport zoom is a CSS `transform: scale()` wrapper, ephemeral

**Decision:** Zoom (25%–400%, `apps/web/src/hooks/use-canvas-zoom.ts`) is a CSS
`transform: scale()` on a wrapper `div` that is a strict **ancestor** of the
`canvasCallbackRef` div `TextOverlayCanvas` binds — never the same element,
never a resize of the underlying image. Zoom state (`useState` in the hook) is
never persisted to `@maga/projects` or IndexedDB.

**Why:** `html-to-image` rasterizes exactly the `canvasCallbackRef` div at
export time. Keeping the scale transform one level *above* that div means the
transform structurally cannot enter export geometry — there is no code path by
which a zoom level could leak into an exported image, verified by
`apps/web/src/__tests__/canvas-zoom-export-isolation.test.tsx`. Making zoom
ephemeral avoids a second per-project "view state" concept in the schema for a
value that's purely a viewing convenience, not project content — nothing about
zoom belongs in what gets exported or saved.

The resize handlers (`text-node-layer.tsx`, `overlay-node-layer.tsx`) compute
`dw`/`dh` from raw `clientX`/`clientY` pixel deltas, which are screen-space and
therefore already inflated/deflated by the CSS scale — they divide by
`zoomScale` before applying the delta. Move handlers didn't need this fix: they
work in percent-of-container coordinates, which the scale transform doesn't
affect.

**Rejected:** Resizing the base image itself to "zoom" (would mutate real
content dimensions, risking export-quality loss and requiring every downstream
consumer of image size to know about a view-only concept). A second zoom-aware
coordinate system for resize math, instead of a single `zoomScale` divisor
(would create two sources of truth for scale — this plan's snap-guide
threshold math also reads the same `zoom` value, so a single source keeps
guide-triggering distance visually consistent with resize behavior at any
zoom level).

**Constraints it creates:** No project/export code path may read from or write
to `useCanvasZoom`'s state. Any new pixel-delta-based interaction on the canvas
(not percent-based) must divide by `zoomScale`, the same way resize does. The
scale-transform wrapper must remain a strict ancestor of, and never merge with,
the `canvasCallbackRef` div.
