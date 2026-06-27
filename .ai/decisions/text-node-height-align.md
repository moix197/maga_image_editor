# Decision: TextNode height + horizontal/vertical align

**Date:** 2026-06-26
**Branch:** feat/text-node-height-align

## What was decided

`TextNode` gains three optional layout fields: `height?: number`,
`textAlign?: "left" | "center" | "right"`, and
`verticalAlign?: "top" | "middle" | "bottom"`. Height is a fixed box height set
by the canvas resize handle (a single bottom-right corner handle — see below) or
the panel input; `textAlign`/`verticalAlign` are panel toggles. No schema version
bump — all three are optional, absent = legacy behavior. `NodeOverride` already
accepts them (`Partial<Omit<TextNode & OverlayNode, "id">>`).

## Rationale

### Overflow visible — height is a min-box, not a clip

Setting `height` applies `height: <n>px` with `overflow: visible` on the root
div. Height exists to give `verticalAlign` something to position within; it is a
positioning box, not a clipping viewport. Text that exceeds the height spills
**below** the box — no clip, no scrollbar. This keeps overflowed content
readable rather than silently hidden.

### No min-height clamp — intentional divergence from width's 20px floor

The corner handle clamps height with `Math.max(0, ...)` only — no min-height
floor. This deliberately diverges from the width clamp's `Math.max(20, ...)`.
Width has a floor because a zero-width box becomes invisible and unselectable;
height does not, because `overflow: visible` keeps the (overflowed) text painted
and the node selectable even at a 0px box. Allowing 0 height is harmless and
avoids an arbitrary minimum.

### textAlign / verticalAlign route as STYLE, unlike width / height

`width` and `height` are layout/geometry — excluded from the `TextStyle` Pick
and routed via `setNodeOverride`. `textAlign` and `verticalAlign` are added to
the `TextStyle` Pick (`packages/projects/src/schema.ts`) and routed via
`setTextStyle` / `handleSetItemTextStyle`. They are visual style properties that
fan out with the rest of the text style, not box geometry. This keeps the
geometry-vs-style routing split consistent with how each field is conceptually
classified, even though all four live on `TextNode`.

### Flex layout conditional on height — don't break auto-size nodes

`verticalAlign` is implemented by making the root div `display: flex;
flexDirection: column` with mapped `justifyContent`, applied **only when
`height !== undefined`**. Without a fixed height the root div stays in normal
block flow (no flex). A flex column on an auto-sizing node would change wrapping
and width-fit behavior; gating flex on a defined height keeps every node without
a height rendering exactly as before. The panel's vertical-align toggle is
disabled while `height` is `undefined` to reflect that the field has no effect
there.

### Single corner resize handle — match the image/overlay box

Width and height were first shipped as two separate handles (a square on the
right edge, a square on the bottom edge). This diverged from `OverlayNodeLayer`,
whose box has one `se-resize` square at the bottom-right corner that resizes both
axes. The bottom strip was also invisible and overlapped the text, so it was hard
to discover and grab. Consolidated to a **single bottom-right corner handle**
matching the image box: one drag computes `dw`/`dh` and fires both `onResize` and
`onHeightResize`; the two `setNodeOverride` patches merge functionally. Tradeoff:
a horizontal-only corner drag now also locks the current height (the corner owns
both axes). The width/height clamps (`Math.max(20, …)` / `Math.max(0, …)`) are
unchanged. Clearing height back to auto is still available via the panel input.

### Phase ordering — verticalAlign depends on the height/flex root

`verticalAlign` is meaningless without a fixed-height flex root, so height
(Phase 1) had to land before vertical align (Phase 3): height introduces the
fixed box and the flex root that vertical align justifies content within.
Horizontal align (Phase 2) is independent (pure CSS `textAlign`) and sits
between them.
