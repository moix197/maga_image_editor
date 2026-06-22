# Text edit routing: per-item override vs. shared template, by lock state

Every text content/style edit in the batch workspace is routed by the target
layer's lock state. Lives in
`apps/web/src/components/batch/make-text-edit-handlers.ts` — a pure factory
(no React, no side effects beyond the passed callbacks).

`makeTextEditHandlers({ textLayerLocks, setItemTextValue, setItemTextStyle, updateTextNode })`
returns `{ routedSetItemTextValue, routedSetItemTextStyle }` — **drop-in
replacements** with the same signatures as the per-item setters, so callers
(BulkTextPanel / TextStylePanel) stay unaware of the routing.

**The routing, per edit:**
- **Unlocked layer** → per-item override: `setItemTextValue(overlayId, nodeId, value)`
  / `setItemTextStyle(overlayId, nodeId, patch)`. Only the active variant changes.
- **Locked layer** → shared template: `updateTextNode(nodeId, { content })` /
  `updateTextNode(nodeId, patch)` (`overlayId` is ignored). All variants change.

Lock resolution is `textLayerLocks[nodeId] ?? newTextLayerLockDefault` — the **same**
default-unlocked rule the preview path uses (see [[live-preview-derived-state]]) and
that `use-item-text` uses; keep all three in sync. `updateTextNode` accepts both a
`{ content }` patch and a `Partial<TextStyle>` patch (both are subsets of `TextNode`).

**Why a factory:** the lock decision is pure and identical for content and style,
so it lives in one tested helper rather than duplicated inline in BatchWorkspace.
The derived preview ([[live-preview-derived-state]]) re-renders the canvas off the
mutated map/template automatically — no extra wiring after an edit.
