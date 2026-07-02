# Alignment smart guides live in a pure `@maga/editor` module

**Decision:** All snap math (`packages/editor/src/snap-guides.ts`:
`resolveSnap`, `resolveEqualSpacingSnap`, `resolveSizeMatchSnap`) is pure and
DOM-free — inputs and outputs are plain canvas-space `SnapBox`/`Size` values.
`@maga/web` measures the DOM (including live-measuring auto-sized `TextNode`s
that have no stored width/height) and passes plain data in; it also owns all
guide-line DOM rendering and the drag/resize wiring.

**Why:** Follows the existing `@maga/editor` framework-free boundary (see
[[framework-free-editor-package]]) — this is testable with plain Vitest, no
render harness, same as the rest of the package.

Scale-aware threshold: `resolveSnap`/`resolveEqualSpacingSnap`/
`resolveSizeMatchSnap` all take `thresholdPx` + `scale` and convert internally
via `thresholdPx / scale`, reusing the *same* `zoom` value the resize-math fix
in [[viewport-zoom]] uses — one scale source, so a guide triggers at a
consistent **on-screen** distance (default 8px) regardless of zoom level,
rather than a fixed canvas-space distance that would feel loose when zoomed in
and twitchy when zoomed out.

Rotation: a `SnapBox` is always treated as its upright (un-rotated)
axis-aligned bounding box — the module carries no rotation field. Rotated-box
snap targets would need true oriented-rectangle math for correctness; deferred
until a real use case demands it (see CLAUDE.md "no speculative abstractions").

Staged target scope, in commit order: image/canvas center+edges → sibling
node center+edges (with caller-side self-exclusion, since the module has no
identity concept to exclude by) → equal-spacing among 3+ elements → resize
size-match. Equal-spacing landed last and was flagged in the plan as the most
separable/optional scope — it requires a same-row/column neighbor on *both*
sides (`crossAxisOverlaps` gate) to avoid false positives from unrelated boxes
that happen to be near in one axis.

Resize size-match (`resolveSizeMatchSnap`) resolves width/height
**independently** and returns a guide `position` as if the box sat at the
origin (the module has no box-placement concept) — the caller remaps it to the
resizing node's actual canvas-space edge. It shares only the `SnapGuide` type
and DOM guide-rendering path with move-guide snapping; the two are otherwise
independent, so resize guides can never affect move behavior or vice versa.
When an overlay's aspect ratio is locked, `constrainResizeToRatio` always
re-derives height from width — so a height-axis (`"horizontal"`) size guide is
dropped in `overlay-node-layer.tsx` whenever `ratio !== undefined`, since the
final rendered height won't actually equal the matched value the guide would
claim (`apps/web/src/components/overlay-node-layer.tsx` around
`constrainResizeToRatio`/`finalSize`; regression test in
`apps/web/src/__tests__/resize-snap.test.tsx`).

Move-guide snap reuses the existing fan-out path unchanged: a snap adjusts the
dragged position before the normal `onNodeMove` call, so it persists exactly
like any other move — no new persistence or fan-out rule was added for
snapping.

Guide-line DOM elements carry `data-guide-line` and are cleared on
pointer-up/cancel; `apps/web/src/lib/export-helpers.ts`'s `stripGuideLines`
additionally strips any `[data-guide-line]` node from a capture subtree as a
second line of defense (belt-and-suspenders — in practice none should ever be
present at export time, but this makes the invariant structural, not just
timing-based). See [[canvas-guide-export-isolation]] test coverage for the
non-contamination proof.

**Rejected:** True rotated-bounding-box snap targets (adds real complexity for
a case not yet requested). A second independent scale/threshold system for
guides instead of sharing `zoomScale` with resize (would let guide-trigger
distance and resize-drag feel drift apart at non-1x zoom). Coupling
resize-guide and move-guide code paths to share logic beyond the `SnapGuide`
type (they solve different problems — position vs. size — and forcing a shared
abstraction before a second real overlap would be speculative).

**Constraints it creates:** No DOM/browser API may enter
`packages/editor/src/snap-guides.ts`; all measurement and rendering stays in
`@maga/web`. Callers must self-exclude the dragged/resized node's own box
before calling any `computeSiblingSnapTargets`/`resolveSizeMatchSnap`
caller-side collection. Any new box-derived interaction on the canvas that
introduces guide lines must render them with `data-guide-line` so
`stripGuideLines` continues to structurally guarantee export non-contamination.
