# Live preview: derived state (copy-on-read), not mutation

The batch canvas shows the active variant by **deriving** a fresh `EditorState`
from the shared template + the active overlay's overrides — a pure copy-on-read,
never a mutation of the shared template. Lives in
`apps/web/src/hooks/use-preview-editor-state.ts`.

```
usePreviewEditorState(
  base: EditorState,
  activeOverlayId: string | null,
  itemNodeOverrides: ItemNodeOverrides,
  variableSlotNodeId?, activeOverlayBlobKey?,
): EditorState
```

It maps `base.nodes`: **every** node — text **and** image overlay — gets that
overlay's unified override `itemNodeOverrides[overlayId][nodeId]` (a single
`NodeOverride`) applied. Text is per-item with no shared-vs-locked distinction (the
lock model was retired in schema v4; see [[per-item-text-schema]]). The merge
**strips the non-Node `hidden` flag, then spreads the whole override onto the
node** via one generic `stripHidden` helper — for text nodes `content`, the style
partial, **geometry (x/y) and size (width/height/fontSize)**; for image-overlay
nodes **geometry (x/y/width/height) and the full transform set (opacity, rotation,
cornerRadius, dropShadow, featherRadius, aspectRatioLocked)** — all fall through in
one spread, so any future overridable field flows automatically without touching the
merge. (Overlay style/transform edits route through the same fan-out as text style —
`OverlayControlsPanel.onChange` writes a per-variant `NodeOverride`, never the shared
template; see [[batch-render-text-patch]].) Hidden
**text** nodes (override `hidden: true`) are **filtered out** of the derived node
array entirely (not painted); overlay-hidden filtering is a later phase. The
variable-slot node's `src` is swapped to the active overlay's blob, **layered on
top of** any geometry override on that same node. Result is wrapped in a
`{ ...base, nodes }` copy.

**Why derived, not mutate:** the preview must reflect a per-item override without
touching the shared template — switching variants, or selecting a node, must not
leak a previous variant's text into the template. Copy-on-read keeps `base`
authoritative and pristine; the derived object is throwaway render input.

**Memoization contract (load-bearing):** the `useMemo` deps are exactly the inputs
above and nothing more. The dep array is **deliberately minimal** so unrelated
`editorState` churn (e.g. `selectedNodeId` changes) does **not** re-derive the
preview. An early return of `base` itself (no copy) avoids allocating when there is
no active overlay and nothing to override or hide.

**Hard constraint — orthogonality to Generate All:** this is a **read-only**
preview path. The export/render path in `apps/web/src/hooks/use-batch-render.ts`
mutates the live template, captures the DOM, then restores it
(see [[batch-render-text-patch]]) — that mechanism is the source of truth for
output and must remain **untouched and unaffected** by anything here. Don't fold
the preview into the render loop or vice-versa: one is copy-on-read for display,
the other is mutate-capture-restore for fidelity. They share the override maps and
the hidden-node map — **and the canvas element**, the one coupling that bites.

**The canvas `state` prop is the coupling point (load-bearing):** both paths render
through the same canvas, but the render loop mutates `editorState.state` while this
hook's output pins text to the active variant. If the canvas renders
`previewEditorState` during a run, the active-variant override **shadows the loop's
per-item writes** and every output gets the selected variant's text. So
`BatchWorkspace` feeds the canvas
`state={batchRender.isRunning ? editorState.state : previewEditorState}` — the
preview is bypassed for the duration of Generate All. Don't route the render loop's
capture through this derived state.

**Don't regress** to mutating `base` for preview, to widening the `useMemo` deps
(re-derives on every selection change), or to routing preview through the render
loop's mutation path.
