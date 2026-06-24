# Batch render: live-state text patch, capture, restore

The batch render loop applies per-item text by **mutating the live editor state,
capturing the painted DOM, then restoring the template** — never by capturing a
detached state clone. Lives in `apps/web/src/hooks/use-batch-render.ts`.

**The mechanism, per item:**

0. **Before the loop**, snapshot each text layer's template originals — `content`,
   style fields, **and geometry (x/y)** — so the restore has a known target that no
   item mutation can clobber.
1. For each text layer, write the item's override into the **live** editor state in
   a **single merged call**:
   `updateTextNode(layer.id, { ...patch, content: value })`. `updateTextNode`
   accepts `Partial<Omit<TextNode, "id">>`, so content and the per-item override
   partial (`itemNodeOverrides[overlayId][nodeId]` minus `content`/`hidden`) — which
   carries style **and geometry x/y** — go in one mutation. No separate style or
   position transition exists or is needed.
2. **Hidden nodes** (`itemHiddenNodeIds[overlay.id]`) are mutated to `opacity: 0`
   before capture so they don't paint — note the render path hides via opacity,
   whereas the preview path filters the node out entirely. Restored in the same
   `finally`.
3. `await waitTwoFrames()` so React repaints the canvas with the new text + style.
4. `compositeFromElement(canvasEl, …)` captures the **live DOM** — the text is
   read off the rendered element, which is why the mutations must hit live state.
5. In a `finally`, restore every layer to its template originals —
   `{ content, ...templateStyle }` (where `templateStyle` now also carries `x`/`y`)
   and `opacity`, not content alone.

Stale `itemNodeOverrides` keys are harmless here: the loop iterates real template
nodes and only *reads* the override store, so a key with no matching node is never
applied.

**Why it must be live state, not a clone:** `compositeFromElement` rasterizes the
real canvas element. A detached `EditorState` clone never reaches the DOM, so the
capture would show the template text, not the override — silently wrong output.
The patch has to land on the state the DOM actually renders.

**Load-bearing coupling — the canvas `state` prop:** the loop mutates
`editorState.state`, but the canvas normally renders `previewEditorState`
(see [[live-preview-derived-state]]), which re-pins every text node to the
**active** variant's `itemTextValues[activeOverlayId]`. That derived override
shadows the loop's per-item writes, so every captured frame shows the selected
variant's text — the exact bug this guards against. `BatchWorkspace` therefore
swaps the canvas source while rendering:
`state={batchRender.isRunning ? editorState.state : previewEditorState}`. The render
loop's mutations only reach the DOM because the canvas points at the live
`editorState.state` for the duration of the run.

**Why the restore is in `finally` (load-bearing):** the override is a *temporary*
mutation of the **shared** template, now spanning content, style, **geometry
(x/y)**, **and** the hidden-node opacity. If capture throws mid-loop without
restoring, the template stays mutated and the next item — and the user's template —
carry the wrong text, style, position, or a vanished layer. The `finally`
guarantees the template is never permanently mutated on a thrown capture; it must
restore the **style, geometry, and opacity fields too**, not just `content` (a
content-only restore leaves the template style, position, or visibility mutated — a
regression). (Each item also wraps its own work, in the
spirit of [[per-item-trycatch-fallback]], so one bad item degrades rather than
aborts.)

**Don't regress** to cloning state and compositing the clone, to a content-only
restore that leaks style/opacity mutation, or to mutating without a `finally`
restore. Each reintroduces one of the bugs above.
