# Overlay picker: reuse existing assets, 2+ picks auto-designate the variable slot

**Decision:** "Add Image Overlay" (`BatchRightPanel.tsx`) opens a picker
(`OverlayPickerDialog`) over the existing `overlays: ProjectAsset[]` when at
least one exists, instead of always forcing an OS file re-upload. Picking a
single asset inserts a plain static overlay node. Picking 2+ assets inserts
**one** overlay node and auto-enables **"Use as variable slot"** on it, with
the picked assets set as `selectedVariantIds` — so the new slot cycles through
exactly those assets. Zero overlays still goes straight to the OS file dialog
(unchanged), and "Upload new file" inside the picker falls through to the
existing upload path (same `validateImageFile`/`fileToDataUrl`, no second
upload code path).

**Why 2+ → one node, not stacked nodes:** The app's variable-slot model is a
single `VariableSlot` per project (`packages/projects/src/schema.ts`) — one
overlay node whose `src` is swapped per variant. "Auto-select the variable
slot" is only meaningful under that model if 2+ picks become variants of the
*same* slot, not N independent static nodes. This mirrors the existing
one-node-swapped-per-variant design rather than introducing a new multi-node
concept.

**Rejected alternative:** Stacking one static node per picked asset. Rejected
because it doesn't map to "variable slot" at all (nothing to designate — each
node would just show one fixed image) and would require a new multi-node
per-variant visibility model with no other use case driving it.

**Reused, not duplicated:** the slot designation goes through the existing
`setVariableSlotForNode(nodeId)` (extracted in `feat(editor): return new
overlay node id; add dialog primitive`) — the same mutual-exclusion path used
by the "Use as variable slot" checkbox. `handleAddOverlayFromAssets`
(`BatchWorkspace.tsx`) only decides *whether* to call it and *what* to select;
it does not reimplement clearing a prior slot or restoring its stashed `src`.

**Race avoided — deferred slot designation:** `addOverlayNode` returns the new
node's id synchronously (Phase 1 change), but the node itself only lands in
`editorState.state.nodes` once that `setState` actually commits and
re-renders. Calling `setVariableSlotForNode(nodeId)` immediately in the same
handler call finds nothing (`state.nodes.find` misses) and silently no-ops.
`handleAddOverlayFromAssets` instead stashes the pending id in a ref
(`pendingVariableSlotNodeIdRef`), and an effect keyed on
`editorState.state.nodes` calls `setVariableSlotForNode` once the node
actually appears — mirroring the existing `pendingRestore` effect's
set-state-in-effect pattern in the same file.

**Reconcile-effect hazard avoided:** `BatchWorkspace.tsx` has a
`selectedVariantIds` reconcile effect that resets the selection to
`{activeOverlayId}` whenever `activeOverlayId` (or the `overlays` array
reference) changes. The picker's 2+ path never touches `activeOverlayId` and
doesn't add/remove/reorder `overlays` (it only adds an editor *node*, not a
new `ProjectAsset`), so that effect's dependencies never change and it can't
clobber the picker's `setSelectedVariantIds(new Set(ids))` call.

**New dependency:** `@radix-ui/react-dialog` (Phase 1), consistent with the
existing Radix footprint (`Collapsible`, `Select`) — accepted for
focus-trap/a11y over a hand-rolled modal.
