# New overlay nodes default to locked aspect ratio

**Decision:** New overlay nodes are created with `aspectRatioLocked: true`. The
default lives in `DEFAULT_OVERLAY_NODE` in `packages/editor/src/defaults.ts`.

**Why:** Non-obvious UX default. Most users resize image overlays
proportionally, so starting locked matches the common case and avoids
accidental distortion on the first drag. The default is intentionally localized
to overlay creation — nothing else assumes it.

**Rejected:** Defaulting unlocked (free resize). It surprises users with
distorted images on the typical proportional-resize gesture, making the
common path the one that needs extra effort.

**Constraints it creates:** The default belongs in
`packages/editor/src/defaults.ts`. The aspect-lock *logic* (how a locked resize
is constrained) is intentionally **not** documented here — only the default is
recorded. See [[aspect-ratio-intrinsic-lock]] for how a locked resize
constrains to the image's intrinsic ratio across both resize paths.
