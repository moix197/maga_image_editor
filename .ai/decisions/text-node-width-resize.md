# Decision: TextNode width resize (Phase 1)

**Date:** 2026-06-26
**Branch:** feat/text-box-resize-inline-edit

## What was decided

`TextNode` gains an optional `width?: number` field. A right-edge drag handle on the canvas and a Width input in the right panel both set it. Height stays auto-growing (no explicit height field).

## Rationale

### Width-only (not width+height)

Height is intentionally excluded. Text nodes auto-grow vertically to fit wrapped content — forcing an explicit height would clip text or leave visual gaps. Only width needs to be set by the user; height follows naturally from the font size, line count, and width.

### min-width clamp of 20px

Mirrors the 20px clamp used by `OverlayNodeLayer`'s SE-resize handle (`Math.max(20, ...)`). Prevents the box from collapsing to zero and becoming unselectable.

### TextStyle Pick whitelist — width excluded permanently

`TextStyle` in `packages/projects/src/schema.ts` is a `Pick<TextNode, …>` of the _styleable_ fields only (font, color, opacity, shadow, textBackground). `width` is a **layout** field, not a style field, and must not be added to the Pick.

Consequence: `itemText.setTextStyle(...)` would silently drop a `{ width }` patch. Resolution: `BatchRightPanel.onChange` splits the patch — `width` is forwarded via `itemText.setNodeOverride(overlayId, nodeId, { width })` directly; the remaining style keys go through `setTextStyle`. This split is permanent and intentional.

### No schema version bump

`width?: number` is optional. Old projects with no `width` field on a `TextNode` load identically — the absent field means auto-size, which was the previous behavior. No migration step is needed; the existing `NodeOverride` type already supports `width` (it is `Partial<Omit<TextNode & OverlayNode, "id">>`, and `TextNode.width` now exists there).

### textBackground full-box fill

The `textBackground` wrapper was changed from `<span style={buildBackgroundSpanStyle(bg)}>` (inline, per-line hugging) to `<span style={{ display: "block", width: "100%", … }}>` (block, fills the full box). When no `width` is set, `width: 100%` on the block span still collapses to content width because the parent div also auto-sizes — no stretched empty box.

### Fan-out routing

Width resize during active per-variant selection fans out to all selected variants via `fanOut.handleSetNodeOverride` — the same path used by moves and overlay resizes. No additional logic was needed; `handleSetNodeOverride` already handles fan-out targeting.
