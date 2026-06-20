# Batch render: live-state text patch, capture, restore

The batch render loop applies per-item text by **mutating the live editor state,
capturing the painted DOM, then restoring the template** — never by capturing a
detached state clone. Lives in `apps/web/src/hooks/use-batch-render.ts`.

**The mechanism, per item:**

1. For each unlocked text layer, write the item's override into the **live**
   editor state (`updateTextNode(layer.id, { content: value })`).
2. `await waitTwoFrames()` so React repaints the canvas with the new text.
3. `compositeFromElement(canvasEl, …)` captures the **live DOM** — the text is
   read off the rendered element, which is why steps 1–2 must hit live state.
4. In a `finally`, restore every layer to its template value.

**Why it must be live state, not a clone:** `compositeFromElement` rasterizes the
real canvas element. A detached `EditorState` clone never reaches the DOM, so the
capture would show the template text, not the override — silently wrong output.
The patch has to land on the state the DOM actually renders.

**Why the restore is in `finally` (load-bearing):** the override is a *temporary*
mutation of the **shared** template. If capture throws mid-loop without restoring,
the template stays mutated and the next item — and the user's template — carry the
wrong text. The `finally` guarantees the template is never permanently mutated,
even on a thrown capture. (Each item also wraps its own work, in the spirit of
[[per-item-trycatch-fallback]], so one bad item degrades rather than aborts.)

**Don't regress** to cloning state and compositing the clone, or to mutating
without a `finally` restore. Both reintroduce the exact bugs above.
