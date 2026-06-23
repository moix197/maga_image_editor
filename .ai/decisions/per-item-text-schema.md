# Per-item text stored as keyed content + style overrides, not per-item state

**Decision:** Per-item text is stored as **input overrides**, not full editor
state. Two parallel maps in the projects schema (v4), both keyed
`overlayAssetId → textNodeId`:
- `itemTextValues`: `Record<overlayAssetId, Record<textNodeId, string>>` — the
  string content an item replaces the template's default text with. Missing entry
  falls back to the template node's own content.
- `itemTextStyles`: `Record<overlayAssetId, Record<textNodeId, Partial<TextStyle>>>`
  — a per-item **style partial** (font, size, color, weight, etc.) that overrides
  the template node's style. Mirrors `itemTextValues`' shape exactly.

`TextStyle` is `Pick<TextNode, …>`, **defined in `@maga/projects`'s `schema.ts`**
and exported from `@maga/projects` — not reexported from `@maga/editor` (editor
was untouched).

**Every text layer is per-item.** There is no shared-vs-locked distinction — the
lock model (`textLayerLocks`, the routing factory, the Text nav section) was
**removed in v4**. Uniform-across-items text simply isn't expressed as a layer
override; whatever the template node holds is the default, and per-overlay maps
diverge from it.

**Why no locks:** the lock concept forced every edit through a shared-vs-per-item
routing decision and a separate "Text" panel. Collapsing to per-item-only makes the
edit model uniform: every text edit writes an override for the *selected* variants,
read back through the merged preview. The template still owns layout and the default
content+style; an override only carries the content string and/or style fields an
item diverges on — so the render loop stays a patch-and-restore on the live template
(see [[batch-render-text-patch]]), not a deep clone per item.

**Rejected:** Storing a full per-item `EditorState` clone. That duplicates layout
N times, makes a template layout edit fail to propagate, and bloats the persisted
project — for what is only content + a thin style partial per item.

## Fan-out edit model (variant selection)

Edits apply to a **multi-selection** of variants, not the single active one.
`VariantStrip` carries checkboxes; `apps/web/src/hooks/use-fan-out-text-handlers.ts`
(`useFanOutTextHandlers`) wraps the per-item setters so each text **value**,
**style**, and **visibility** edit loops over `selectedVariantIds`, writing the same
override into every selected overlay. Style edits route per-variant via
`setItemTextStyle` and are read back through the merged `effectiveNode` — there is no
separate shared-style path.

Selection reconciliation is the pure helper
`apps/web/src/lib/variant-selection.ts` (`reconcileVariantSelection`): switching the
active variant **resets** selection to `{active}`; deleting/reordering overlays
**prunes** stale ids and re-adds the active id. Selection is derived UI state, never
persisted.

## Per-variant text-layer hiding (optional, no version bump)

`itemHiddenNodeIds?: Record<overlayAssetId, nodeId[]>` — **optional**, added without
bumping `SCHEMA_VERSION` because absence reads as `{}`/`[]` everywhere
(backward-compatible; old records load unchanged). `use-item-text.ts` exposes
`isNodeHidden` / `setNodeHidden`; the fan-out `handleSetNodeHidden` hides a layer for
all selected variants (trash button), the eye-toggle restores it. The preview filters
hidden nodes out of the derived array; the render loop hides them via `opacity: 0`
(see [[live-preview-derived-state]], [[batch-render-text-patch]]).

## Migration & constraints

- Migration is a **v1→v2→v3→v4 chain** through `migrateProject`
  (`packages/projects/src/schema.ts`), which composes
  `migrateToV4(migrateToV3(migrateToV2(p)))`. It is the single chain shared by ZIP
  import (`importProjectZip`) and the IDB adapter (`loadProject`) — don't fork it,
  and don't apply migration at any other ingress.
- `migrateToV2` introduces `textLayerLocks` (all template text layers locked, to
  preserve v1's everything-shared behavior); `migrateToV4` **consumes and drops** it,
  fanning each locked layer's template `content` + style into every overlay's
  `itemTextValues` / `itemTextStyles`. `textLayerLocks` now exists only as a
  transient artifact between those two steps — never on a persisted v4 record.
- **Edge cases in `migrateToV4` (load-bearing):**
  - *Stale lock key* — a `textLayerLocks` entry whose node isn't a current template
    text node is skipped (never written).
  - *No-overwrite / idempotent* — a locked layer's value/style is written into an
    overlay **only if that overlay doesn't already have one**, so re-running never
    clobbers a real per-item edit. Running `migrateProject` on a v4 record is a no-op.
  - *Zero-overlay* — the per-overlay loop simply does nothing; locks drop, no crash.
- Bumping `SCHEMA_VERSION` (now `4`) is one-way: older records load through
  `migrateProject`; never write a prior version again. `itemHiddenNodeIds` is the
  exception that proves the rule — a purely additive optional field needs no bump.
- **Orphaned keys leak silently.** Deleting a text node or overlay can leave a stale
  `itemTextValues` / `itemTextStyles` / `itemHiddenNodeIds` key. The render loop
  iterates real template nodes and only *reads* the maps, so a stale key with no
  matching node is never applied — no cleanup is performed (cheap to leak, expensive
  to coordinate); revisit only if ZIP size becomes a concern.
