# Per-item text stored as keyed content + style overrides, not per-item state

**Decision:** Per-item text is stored as **input overrides**, not full editor
state. Two parallel maps in the projects schema (v3), both keyed
`overlayAssetId → textNodeId`:
- `itemTextValues`: `Record<overlayAssetId, Record<textNodeId, string>>` — the
  string content an item replaces the template's default text with.
- `itemTextStyles`: `Record<overlayAssetId, Record<textNodeId, Partial<TextStyle>>>`
  — a per-item **style partial** (font, size, color, weight, etc.) that overrides
  the template node's style. Mirrors `itemTextValues`' shape exactly.

`TextStyle` is `Pick<TextNode, …>`, **defined in `@maga/projects`'s `schema.ts`**
and exported from `@maga/projects` — not reexported from `@maga/editor` (editor
was untouched). A layer is shared or per-item via `textLayerLocks`
(`Record<textNodeId, boolean>`, `locked=true` ⇒ shared); the **same lock governs
both content and style** — there is no separate style lock.

**Why:** Keeping overrides as partials keyed by asset + node makes the schema lean
and the render loop a patch-and-restore on the live template
(see [[batch-render-text-patch]]) instead of a deep clone per item. The template
owns layout and the default content+style; an unlocked layer's override only
carries the content string and/or style fields that item diverges on.

**Rejected:** Storing a full per-item `EditorState` clone. That duplicates layout
N times, makes a template layout edit fail to propagate, and bloats the persisted
project — for what is only content + a thin style partial per item.

**Constraints it creates:**
- Overrides carry content (`itemTextValues`) **and** style partials
  (`itemTextStyles`); both are per-item, gated by the same `textLayerLocks`.
  Anything that should be uniform across all items (layout, or any field a layer
  doesn't override) belongs on the template node, not in the override maps.
- Lock defaults are **dual** and load-bearing: a layer created new defaults
  `locked=false` (per-item editable); a layer carried up by `migrateToV2` from v1
  defaults `locked=true` (shared) to preserve v1's everything-shared behavior.
- Migration is a **v1→v2→v3 chain** through `migrateProject`
  (`packages/projects/src/schema.ts`), which composes `migrateToV3(migrateToV2(p))`.
  It is the single chain shared by ZIP import and the IDB adapter — don't fork it.
  `migrateToV2` is gated on literal version `2` (so a future bump never re-stamps a
  genuine v2 record); `migrateToV3` defaults `itemTextStyles` to `{}` only when
  missing. **Idempotent:** running `migrateProject` on an already-v3 record is a
  no-op (existing `itemTextValues`, `itemTextStyles`, and `textLayerLocks` are
  preserved, not reset).
- Bumping `SCHEMA_VERSION` (now `3`) is one-way: older records load through
  `migrateProject`; never write a prior version again.
- **Orphaned keys leak silently.** Deleting a text node or overlay can leave a
  stale `itemTextStyles[overlayAssetId][textNodeId]` (or `itemTextValues`) key.
  The render loop iterates real template nodes and only *reads* the override maps,
  so a stale key with no matching node is never applied — no cleanup is performed
  (cheap to leak, expensive to coordinate); revisit only if ZIP size becomes a
  concern.
