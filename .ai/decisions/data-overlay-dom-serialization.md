# Overlay node data is serialized onto the DOM as `data-overlay` JSON

**Decision:** Each image-overlay element that needs export baking is tagged
`data-post-pass="true"` and carries its full node state as a JSON string in a
`data-overlay` dataset attribute. The export path reads geometry and effects by
querying those elements and `JSON.parse`-ing `node.dataset.overlay` back into
`OverlayNode` — see `collectImageOverlayNodes` in
`apps/web/src/lib/export-helpers.ts`.

**Why:** The canvas post-pass ([[canvas-post-pass-for-export-effects]]) is plain
DOM/canvas code with no access to the React tree — it runs after capture, off a
detached `<canvas>`. It still needs each overlay's percentage coordinates,
size, rotation, and effect fields. Serializing that state onto the element it
describes lets the non-React pass recover every node by walking the DOM, with no
bridge into component state.

**Rejected:** Threading node state into the post-pass through React refs or a
shared store. That would couple the framework-free export step back to the React
lifecycle, defeating the point of a standalone canvas pass, and would force the
export code to be invoked from inside the render tree.

**Constraints it creates:** The `data-overlay` payload shape is a contract
between the overlay render layer (which writes it) and `canvas-post-pass.ts`
(which consumes the parsed `OverlayNode`). The two must agree on the serialized
fields — a field the post-pass bakes must actually be present in the JSON. A
malformed payload is skipped, not fatal (see [[per-item-trycatch-fallback]]),
so a serialization bug degrades silently rather than aborting the export.
