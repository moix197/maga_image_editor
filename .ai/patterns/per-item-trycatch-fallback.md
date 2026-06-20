# Per-item try/catch fallback in batch operations

Batch steps in the export path wrap **each item** in its own `try/catch` so one
bad item is skipped, not allowed to abort the whole operation. The catch is a
deliberate no-op (skip), not a rethrow.

**The convention:** when iterating over a collection where any single element can
fail independently — a load, a parse, a draw — put the `try/catch` *inside* the
loop, around the per-item work, and continue on failure. The export must always
produce *something*; a single broken overlay is degraded output, not a crash.

Sites (≥2 real uses):

- `apps/web/src/lib/canvas-post-pass.ts` — the overlay draw loop wraps each
  overlay's image load + draw; a failed overlay is skipped so it "must not blank
  the whole export."
- `apps/web/src/lib/export-helpers.ts` — `collectImageOverlayNodes` wraps each
  `JSON.parse` of a `data-overlay` payload; a malformed element is skipped rather
  than aborting the export.

**Why it's a pattern:** the same resilience shape already recurs across both
export files, on different failure modes (image load vs. JSON parse). New batch
steps in this path should follow it rather than letting one failing item throw
out of the loop.
