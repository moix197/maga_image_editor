# Locked aspect-ratio resize constrains to the image's intrinsic ratio

**Decision:** When `aspectRatioLocked` is true, both resize paths — the Size
panel inputs (`overlay-controls-panel.tsx`'s `applyAspectRatioLock`) and the
corner-drag handle (`overlay-node-layer.tsx`'s `handleResizePointerMove`, plus
`BatchWorkspace.tsx`'s `handleNodeResize` fan-out write) — constrain the
dependent dimension to the image's **intrinsic** (natural) W:H ratio, not the
blue selection box's current (possibly drifted) ratio. Convention:
width drives height (`height = width / intrinsicRatio`).

**Why:** The box is a `<div>` sized from `node.width`/`node.height`; the
`<img>` inside uses `objectFit: "contain"`. If the box ratio diverges from the
image's natural ratio, the image letterboxes inside the box. Locking to the
box's own (already-drifted) ratio — the old behavior — does nothing to fix or
prevent that drift. Locking to the image's natural ratio keeps the box hugging
the image with no letterboxing.

**Storage:** A module-scoped `Map<nodeId, ratio>` in `overlay-node-layer.tsx`
(`getIntrinsicRatio` / `recordIntrinsicRatio`), populated on `<img onLoad>`
from `naturalWidth`/`naturalHeight`. Both `overlay-controls-panel.tsx` and
`BatchWorkspace.tsx` import `getIntrinsicRatio` directly — **not** a new
persisted field on `OverlayNode` and **not** prop-drilled through
`text-overlay-canvas.tsx` / `BatchRightPanel.tsx`. A new persisted field would
touch the `packages/projects` v1→v5 migration chain for no real benefit, since
the ratio is cheap to re-derive each session from the already-loaded `<img>`.
The module-scoped map also avoids adding props to the two pass-through
components that sit between `OverlayNodeLayer` and `OverlayControlsPanel` in
the tree.

**Fallback:** A node with no entry yet (image not loaded, or `<img onLoad>`
hasn't fired) behaves as unconstrained — both `applyAspectRatioLock` and
`constrainResizeToRatio` return the patch/dimensions untouched rather than
falling back to the box's current ratio.

**Shared helper:** `constrainResizeToRatio(width, height, ratio)`, exported
from `overlay-node-layer.tsx`, floors both dimensions at 20px and applies the
width-drives-height rule. Used by both the corner-drag handler and
`BatchWorkspace.handleNodeResize`, so the floor + ratio logic isn't duplicated
across the two write paths.

**Rejected:** Storing the ratio as a new `OverlayNode` field (rejected —
migration-chain cost for a cheaply re-derivable value). Prop-drilling the
ratio map through `BatchWorkspace` state (rejected — module scope is simpler
given `OverlayNodeLayer` and `OverlayControlsPanel` are siblings several
levels apart in the tree, with no other shared state need to justify a
context/hook).

**See also:** [[aspect-ratio-locked-default]] (scoped to the *default value*
of `aspectRatioLocked`, not this constraint logic).
