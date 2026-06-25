# Per-item node overrides stored as one unified keyed store (schema v5)

**Decision:** Per-item overrides are stored as **input overrides**, not full editor
state, in a **single unified store** on the projects schema (v5):

- `itemNodeOverrides: Record<overlayAssetId, Record<nodeId, NodeOverride>>` — one
  override value per `(overlay, node)`. `NodeOverride` is
  `Partial<Omit<TextNode & OverlayNode, "id">> & { hidden?: boolean }`: a partial
  of the overridable fields shared across both node kinds, plus an optional
  `hidden` flag. Content lives under `content`, the style/geometry fields spread
  flat, and visibility rides on `hidden`. A missing entry/field falls back to the
  template node's own value.

`TextStyle` is `Pick<TextNode, …>`, **defined in `@maga/projects`'s `schema.ts`**
and exported from `@maga/projects` — not reexported from `@maga/editor` (editor
was untouched). The package also exports the override helpers
`getNodeOverride` / `setNodeOverride` / `setNodeHidden` (immutable nested-map
writes) plus the thin reads `getTextValue` / `getTextStyle` / `isNodeHidden` over
the unified store.

### D1 — Unified store vs. additive per-kind maps

**Chosen: unified.** The v4 model carried three parallel text maps
(`itemTextValues`, `itemTextStyles`, `itemHiddenNodeIds`). Adding geometry/image
overrides on top would have multiplied the number of maps every consumer (preview
merge, fan-out, render apply-restore) reads and writes, forcing each to
special-case text vs image and geometry vs style. One `Partial<Node>`-shaped
override per `(overlay, node)` gives **one** read helper, **one** write helper,
**one** preview merge, **one** fan-out wrapper, and **one** render apply-restore —
for both node kinds and all fields. `itemHiddenNodeIds` already keyed by arbitrary
nodeId, so the collapse is shape-compatible; the render/preview loops iterate real
template nodes and only *read* the store, so stale keys stay harmless.

**Rejected:** additive per-kind maps (combinatorial map explosion, duplicated
merge logic); a full per-item `EditorState` clone (duplicates layout N times,
breaks template-layout propagation, bloats the project).

### D2 — How visibility is represented in the override value

`EditorNode` (TextNode / OverlayNode) has **no `hidden` field**, so visibility
cannot ride inside a plain `Partial<EditorNode>`. The override value is therefore
the wrapper `NodeOverride = Partial<Omit<TextNode & OverlayNode, "id">> & { hidden?: boolean }`.
`TextNode` and `OverlayNode` overlap only on `x`, `y`, `rotation`, `zIndex`,
`opacity` (all `number`), so the intersection is well-formed; under `Partial<…>`
every field is optional, so required-vs-optional divergence is inert. `hidden`
exists on neither node, so it cannot collide with a real field.

`hidden: true` means hidden for that variant; absent/`false` means visible. **The
merge path strips `hidden` before spreading the override onto a real Node** — the
preview *filters* the node out, the render sets `opacity: 0` — so the flag never
lands on a Node and never reaches the DOM.

**Why a wrapper over a sentinel (`opacity: 0` = hidden):** opacity is itself an
independently overridable field for both kinds; overloading `opacity: 0` would
collide with a legitimate partial-opacity override and lose the "transparent" vs
"hidden" distinction (preview must filter hidden nodes out, not just make them
transparent). A dedicated boolean keeps the two concerns orthogonal and preserves
the existing preview-filter / render-opacity:0 split (see
[[live-preview-derived-state]], [[batch-render-text-patch]]).

**Every node is per-item.** There is no shared-vs-locked distinction — the lock
model (`textLayerLocks`, the routing factory, the Text nav section) was removed in
v4. Uniform-across-items content/style simply isn't expressed as an override;
whatever the template node holds is the default.

**Rejected:** Storing a full per-item `EditorState` clone (duplicates layout,
breaks layout-edit propagation, bloats the persisted project — for what is only a
thin partial per item).

## Fan-out edit model (variant selection)

Edits apply to a **multi-selection** of variants, not the single active one.
`VariantStrip` carries checkboxes; `apps/web/src/hooks/use-fan-out-text-handlers.ts`
(`useFanOutTextHandlers`) wraps the unified setters so each text **value**,
**style**, and **visibility** edit loops over `selectedVariantIds`, writing the
same `NodeOverride` patch into every selected overlay via `setNodeOverride` /
`setNodeHidden`. Style edits are read back through the merged `effectiveNode` —
there is no separate shared-style path.

Selection reconciliation is the pure helper
`apps/web/src/lib/variant-selection.ts` (`reconcileVariantSelection`): switching the
active variant **resets** selection to `{active}`; deleting/reordering overlays
**prunes** stale ids and re-adds the active id. Selection is derived UI state, never
persisted.

**Read-side: both property panels display the active-variant merged value.** A
property panel is a controlled view of one node, but the source of truth for a
per-item field is `template ⊕ override`, not the template alone. So `BatchRightPanel`
feeds each panel an **effective node** = `{ ...templateNode, ...activeVariantOverride }`
with the non-Node `hidden` flag stripped: `TextStylePanel` gets `effectiveNode`
(from `getTextStyle`), `OverlayControlsPanel` gets `effectiveOverlayNode` (from
`getNodeOverride`). Without the merge, the panel would render the template's value
while the canvas shows the override — desync. The write side still fans the raw
`onChange` patch across `selectedVariantIds`; the merge is read-only. (Same strip
semantics as `usePreviewEditorState.stripHidden` and `getTextStyle`'s `hidden`
strip — see [[live-preview-derived-state]].)

## Per-variant node hiding

Visibility is the `hidden` flag on a node's `NodeOverride`. `use-item-text.ts`
exposes `isNodeHidden` / `setNodeHidden`; the fan-out `handleSetNodeHidden` hides a
node for all selected variants (trash button / overlay Delete), the eye-toggle
restores it. The preview filters **any** hidden node (text or overlay) out of the
derived array; the render loop hides them via `opacity: 0`
(see [[live-preview-derived-state]], [[batch-render-text-patch]]).

**Overlay hide (Phase 6):** `OverlayControlsPanel.onDelete` → `handleDeleteOverlayNode`
in `BatchWorkspace` now fans the `hidden: true` flag across selected variants via
`fanOut.handleSetNodeHidden`, instead of calling `editorState.removeNode` (which
would delete the template node). The template node survives; unselected variants keep
the overlay unchanged. A new **"Variant overlays"** `Collapsible` in `BatchRightPanel`
renders `ItemOverlayPanel` — a structural copy of `ItemTextPanel` — listing each
image-overlay node of the active overlay with an eye/EyeOff toggle wired to
`handleSetNodeHidden`. This is the sole un-hide entry point for overlay nodes
(the overlay panel unmounts on hide because hide clears the selection).

## Migration & constraints

- Migration is a **v1→v2→v3→v4→v5 chain** through `migrateProject`
  (`packages/projects/src/schema.ts`), which composes
  `migrateToV5(migrateToV4(migrateToV3(migrateToV2(p))))`. It is the single chain
  shared by ZIP import (`importProjectZip`) and the IDB adapter (`loadProject`) —
  don't fork it, and don't apply migration at any other ingress.
- **Version-literal monotonicity (load-bearing):** each step stamps the **literal**
  it produces (`migrateToV2` → 2, `migrateToV3` → 3, `migrateToV4` → 4,
  `migrateToV5` → 5), never `SCHEMA_VERSION`. `migrateToV2`/`migrateToV5` gate on
  their literal (`>= 2` / `>= 5`) for idempotency. Stamping `SCHEMA_VERSION` in an
  intermediate step would let a v2 record jump straight to the current version and
  skip the v3→v4 lock fan-out.
- `migrateToV2` introduces `textLayerLocks` (all template text layers locked, to
  preserve v1's everything-shared behavior); `migrateToV4` **consumes and drops**
  it, fanning each locked layer's template content + style into per-overlay text
  maps. `migrateToV5` then **collapses** those text maps (`itemTextValues`,
  `itemTextStyles`, `itemHiddenNodeIds`) into the unified `itemNodeOverrides` store
  and drops them. `textLayerLocks` and the three text maps now exist only as
  transient artifacts between steps — never on a persisted v5 record.
- **Edge cases in `migrateToV5` (load-bearing, mirror v4):**
  - *No-clobber* — an existing `itemNodeOverrides[overlay][node]` field is never
    overwritten by the fold.
  - *Idempotent* — a record already at v5 (`schemaVersion >= 5`) is returned as-is;
    re-running `migrateProject` on a v5 record is a no-op.
  - *Stale keys skipped* — collapse iterates the existing map keys only; an empty
    per-overlay map yields no override key (no spurious `{}` placeholder).
  - *Zero-overlay* — empty source maps fold into an empty `itemNodeOverrides`.
- Bumping `SCHEMA_VERSION` (now `5`) is one-way: older records load through
  `migrateProject`; never write a prior version again. `exportProjectZip` always
  writes `schemaVersion: 5` and serializes `itemNodeOverrides`.
- **Orphaned keys leak silently.** Deleting a node or overlay can leave a stale
  `itemNodeOverrides` key. The render loop iterates real template nodes and only
  *reads* the store, so a stale key with no matching node is never applied — no
  cleanup is performed (cheap to leak, expensive to coordinate); revisit only if
  ZIP size becomes a concern.
