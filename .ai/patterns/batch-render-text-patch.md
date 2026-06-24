# Batch render: live-state node patch, capture, restore

The batch render loop applies per-item overrides by **mutating the live editor
state, capturing the painted DOM, then restoring the template** — never by
capturing a detached state clone. Spans both **text** nodes (content/style/geometry,
via `updateTextNode`) and **image-overlay** nodes (geometry **and the full
transform set** — opacity, rotation, cornerRadius, dropShadow, featherRadius,
aspectRatioLocked — via `updateOverlayNode`). Lives in
`apps/web/src/hooks/use-batch-render.ts`.

**The mechanism, per item:**

0. **Before the loop**, snapshot every node's template originals — for text layers
   `content`, style fields, **geometry (x/y), and size (width/height/fontSize)**;
   for overlay nodes the **full transform set (x/y/width/height + opacity, rotation,
   cornerRadius, dropShadow, featherRadius, aspectRatioLocked)** — so the restore has a
   known target that no item mutation can clobber. (`width`/`height` are not
   declared on `TextNode`, so they snapshot as `undefined` for plain text; the keys
   are still captured so an override can never leak — restoring `undefined` is a
   no-op. Text and overlay snapshots are **separate** lists because they restore via
   different setters.)
1. For each text layer, write the item's override into the **live** editor state in
   a **single merged call**:
   `updateTextNode(layer.id, { ...patch, content: value })`. `updateTextNode`
   accepts `Partial<Omit<TextNode, "id">>`, so content and the per-item override
   partial (`itemNodeOverrides[overlayId][nodeId]` minus `content`/`hidden`) — which
   carries style, **geometry x/y, and size (width/height/fontSize)** — go in one
   mutation. No separate style, position, or size transition exists or is needed.
1b. For each overlay node with an override, write its **transform fields**
   (geometry x/y/width/height **plus** opacity/rotation/cornerRadius/dropShadow/
   featherRadius/aspectRatioLocked — the full `OverlayControlsPanel` surface) into
   the live state via `updateOverlayNode(id, patch)` — a **separate setter** from
   text (`updateTextNode` and `updateOverlayNode` are both blind `{...n, ...patch}`
   spreads in `packages/editor`, so the snapshot-restore behaves identically across
   both). `dropShadow` is an object field; it rides through the spread whole.
   Overlays are **not** folded into the text path.
2. **Hidden nodes** — text or image overlay — are set to `opacity: 0` before capture
   so they don't paint (render path hides via opacity; preview path filters the node
   out entirely). For text, `updateTextNode(id, { opacity: 0 })`. For overlay nodes,
   `updateOverlayNode(id, { opacity: 0 })` on the live state **and**
   `applyOverlayOverrides` forces `patch.opacity = 0` on the composited post-pass array
   (since image overlays are not read from the live DOM — see below). Restored in the
   same `finally` from the full template snapshot.
3. `await waitTwoFrames()` so React repaints the canvas with the new text + style.
4. `compositeFromElement(canvasEl, …)` captures the **live DOM** — the text is
   read off the rendered element, which is why the mutations must hit live state.
5. In a `finally`, restore every layer to its template originals — text via
   `updateTextNode({ content, ...templateStyle })` (where `templateStyle` also
   carries `x`/`y`/size) and `opacity`, not content alone; **overlay** nodes via
   `updateOverlayNode(id, templateTransform)` (the full geometry + transform
   snapshot — including `dropShadow`, which restores to `undefined` when the
   template had no shadow).

Stale `itemNodeOverrides` keys are harmless here: the loop iterates real template
nodes and only *reads* the override store, so a key with no matching node is never
applied.

**Why it must be live state, not a clone:** `compositeFromElement` rasterizes the
real canvas element. A detached `EditorState` clone never reaches the DOM, so the
capture would show the template text, not the override — silently wrong output.
The patch has to land on the state the DOM actually renders.

**Image overlays are NOT read from the live DOM (load-bearing).** `compositeFromElement`
suppresses the image-overlay DOM elements (opacity 0) and instead composites them
in a **post-pass** from the explicit `overlayNodes` array it is handed —
`patchOverlays(template, …)`. So mutating overlay geometry via `updateOverlayNode`
keeps the *preview* DOM consistent but does **not** reach the output by itself; the
per-item overlay override must **also** be spread onto that `overlayNodes` array
(`applyOverlayOverrides`, which now spreads the **full transform set**, not just
geometry) before `compositeFromElement`, or the rendered overlay keeps the template
geometry/transform. This asymmetry (text from live DOM, image overlays
from the node array) is the reason the overlay path patches **two** places — live
state for preview fidelity, the post-pass array for output correctness.

**Load-bearing coupling — the canvas `state` prop:** the loop mutates
`editorState.state`, but the canvas normally renders `previewEditorState`
(see [[live-preview-derived-state]]), which re-pins every node to the
**active** variant's `itemNodeOverrides[activeOverlayId]`. That derived override
shadows the loop's per-item writes, so every captured frame shows the selected
variant's text — the exact bug this guards against. `BatchWorkspace` therefore
swaps the canvas source while rendering:
`state={batchRender.isRunning ? editorState.state : previewEditorState}`. The render
loop's mutations only reach the DOM because the canvas points at the live
`editorState.state` for the duration of the run.

**Why the restore is in `finally` (load-bearing):** the override is a *temporary*
mutation of the **shared** template, now spanning text content/style/**geometry
(x/y)/size**, **overlay geometry + transforms (x/y/width/height, opacity, rotation,
cornerRadius, dropShadow, featherRadius, aspectRatioLocked)**, **and** the
hidden-node opacity. If capture throws mid-loop without restoring, the template stays mutated
and the next item — and the user's template — carry the wrong text, style, position,
size, or a vanished layer. The `finally` guarantees the template is never
permanently mutated on a thrown capture; it must restore the **style, geometry
(text and overlay), and opacity fields too**, not just `content` (a content-only
restore leaves the template style, position, or visibility mutated — a regression).
(Each item also wraps its own work, in the spirit of [[per-item-trycatch-fallback]],
so one bad item degrades rather than aborts.)

**Don't regress** to cloning state and compositing the clone, to a content-only
restore that leaks style/opacity mutation, or to mutating without a `finally`
restore. Each reintroduces one of the bugs above.
