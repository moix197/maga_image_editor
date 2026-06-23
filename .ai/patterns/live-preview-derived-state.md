# Live preview: derived state (copy-on-read), not mutation

The batch canvas shows the active variant by **deriving** a fresh `EditorState`
from the shared template + the active overlay's overrides — a pure copy-on-read,
never a mutation of the shared template. Lives in
`apps/web/src/hooks/use-preview-editor-state.ts`.

```
usePreviewEditorState(
  base: EditorState,
  activeOverlayId: string | null,
  itemTextValues, itemTextStyles, textLayerLocks,
): EditorState
```

It maps `base.nodes`: for each unlocked text node it applies that overlay's
`itemTextValues[overlayId][nodeId]` (content) and `itemTextStyles[overlayId][nodeId]`
(style partial), spread onto a node copy; locked nodes pass through untouched. Lock
resolution is `textLayerLocks[node.id] ?? newTextLayerLockDefault` — a missing lock
defaults to **unlocked** (per-item editable), matching `use-item-text`. Result is
wrapped in a `{ ...base, nodes }` copy.

**Why derived, not mutate:** the preview must reflect a per-item override without
touching the shared template — switching variants, or selecting a node, must not
leak a previous variant's text into the template. Copy-on-read keeps `base`
authoritative and pristine; the derived object is throwaway render input.

**Memoization contract (load-bearing):** `useMemo` deps are exactly
`[base, activeOverlayId, itemTextValues, itemTextStyles, textLayerLocks]`. The dep
array is **deliberately minimal** so unrelated `editorState` churn (e.g.
`selectedNodeId` changes) does **not** re-derive the preview. Two early returns of
`base` itself (no copy) avoid allocating: when `activeOverlayId` is null, and when
the active overlay has no entries in either override map.

**Hard constraint — orthogonality to Generate All:** this is a **read-only**
preview path. The export/render path in `apps/web/src/hooks/use-batch-render.ts`
mutates the live template, captures the DOM, then restores it
(see [[batch-render-text-patch]]) — that mechanism is the source of truth for
output and must remain **untouched and unaffected** by anything here. Don't fold
the preview into the render loop or vice-versa: one is copy-on-read for display,
the other is mutate-capture-restore for fidelity. They share the override maps and
the lock semantics — **and the canvas element**, the one coupling that bites.

**The canvas `state` prop is the coupling point:** both paths render through the
same canvas, but the render loop mutates `editorState.state` while this hook's
output pins text to the active variant. If the canvas renders `previewEditorState`
during a run, the active-variant override **shadows the loop's per-item writes** and
every output gets the selected variant's text. So `BatchWorkspace` feeds the canvas
`isRunning ? editorState.state : previewEditorState` — the preview is bypassed for
the duration of Generate All. Don't route the render loop's capture through this
derived state.

**Don't regress** to mutating `base` for preview, to widening the `useMemo` deps
(re-derives on every selection change), or to routing preview through the render
loop's mutation path.
