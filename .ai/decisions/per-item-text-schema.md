# Per-item text stored as keyed string overrides, not per-item state

**Decision:** Per-item text is stored as **input overrides**, not full editor
state. `itemTextValues` is `Record<overlayAssetId, Record<textNodeId, string>>`
in the projects schema (v2); a layer is shared or per-item via
`textLayerLocks` (`Record<textNodeId, boolean>`, `locked=true` ⇒ shared). The
template owns layout, styling, and the default text; the override only carries the
string an item replaces it with.

**Why:** Keeping overrides as plain strings keyed by asset + node makes the schema
lean and the render loop a patch-and-restore on the live template
(see [[batch-render-text-patch]]) instead of a deep clone per item. Layout/style
stay defined once on the template, so editing the template restyles every item.

**Rejected:** Storing a full per-item `EditorState` clone. That duplicates layout
and styling N times, makes a template edit fail to propagate, and bloats the
persisted project — for what is only a string substitution.

**Constraints it creates:**
- Override values are strings only; anything beyond text content belongs on the
  template, not in `itemTextValues`.
- Lock defaults are **dual** and load-bearing: a layer created new under v2
  defaults `locked=false` (per-item editable); a layer carried up by `migrateToV2`
  from v1 defaults `locked=true` (shared) to preserve v1's everything-shared
  behavior. `migrateToV2` (`packages/projects/src/schema.ts`) is the single source
  of these defaults and is shared by ZIP import and the IDB adapter — don't fork it.
- Bumping `SCHEMA_VERSION` is one-way: v1 records load through `migrateToV2`; never
  write v1 again.
