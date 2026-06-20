# Plan: Template Workspace Revamp

**Created:** 2026-06-20
**Branch:** feat/batch-template-ux
**Status:** in progress

## Context

The current batch editor is split across two separate routes (`/editor` and `/batch`) with no shared navigation model, a broken multi-variant preview (only the first overlay is ever rendered in the editable canvas), no per-item text values (all text is shared via the single `template: EditorState`), no bulk text editing surface, and no drag-and-drop reordering for either batch items or canvas layers. Global actions (Export ZIP, Clear Project) strand below the gallery far from the primary workflow buttons above the canvas.

This plan unifies the product into one template workspace: a single route with section-based side-nav, a consolidated actions bar, live per-variant preview editing, per-item text with lockable layers, a bulk text panel, and drag-and-drop reorder on both the items list and the layer stack.

## Risk: high

BatchWorkspace.tsx is the hot file — nearly every phase touches it. The schema extension (Phase 3) requires a migration path for existing ZIP/IDB records (schemaVersion 1 → 2). The DnD phase (Phase 5) must justify or reject a new dependency against the CLAUDE.md "build our own first" rule.

## Dependencies & Risks

- `BatchWorkspace.tsx` is touched by Phases 1–5; each phase must leave it in a working state before the next begins.
- Schema migration (Phase 3) affects ZIP export/import and IDB adapter — regressions possible in `zip-import.ts`, `zip-export.ts`, `idb-adapter.ts`.
- The variant-strip canvas switch (Phase 2) replaces the `overlays[0]` placeholder hack; any code that assumes first-overlay-as-default must be audited.
- DnD for layer reorder must reuse `reorderNode` from `packages/editor` — no new z-order logic. DnD for items list must not add a library unless building it natively is clearly impractical.
- `/editor` redirect (Phase 1) breaks the existing `editor/page.tsx` route — any deep links to `/editor` must be 301-redirected.
- `SCHEMA_VERSION` is exported from `@maga/projects`; bumping it to `2` is a breaking change for any in-progress IDB records. The migration must default missing fields gracefully.
- UI phases (1, 2, 4, 5) must be executed with the `ui-ux-pro-max` skill (`--stack nextjs`) per CLAUDE.md.

---

## Phases

### Phase 0: Create worktree

**This phase is always first. No exceptions.**

Create a git worktree for this plan's branch.

**Steps:**

- [ ] Confirm branch name (`feature/template-workspace-revamp`) and base ref (`feat/batch-template-ux`) with the user
- [ ] Run `git worktree add ../maga-workspace-revamp -b feature/template-workspace-revamp feat/batch-template-ux`
- [ ] Verify worktree is active and on the correct branch (`git worktree list`)

---

### Phase 1: Unified workspace shell

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** User navigates to `/batch` and sees a side-nav with section tabs (Assets / Template / Text / Results); all global actions (Generate Preview, Generate All, Cancel, Import ZIP, Export ZIP, Clear Project) appear in one consolidated actions bar above the canvas rather than stranded below the gallery; navigating to `/editor` redirects to `/batch`.
**Commit message:** `feat(workspace): unified shell — side-nav sections, consolidated actions bar, /editor redirect`

> UI implementation: use `ui-ux-pro-max` skill (`--stack nextjs`) for design and component work in this phase.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/app/editor/page.tsx` | Replace page body with Next.js `redirect('/batch')` (permanent) |
| modify | `apps/web/src/app/batch/layout.tsx` | Add side-nav shell using Tailwind `--sidebar-*` tokens; render section slot |
| create | `apps/web/src/components/batch/WorkspaceSideNav.tsx` | Section-based nav component (Assets / Template / Text / Results); uses shadcn/ui primitives |
| create | `apps/web/src/components/batch/WorkspaceActionsBar.tsx` | Consolidated actions bar; receives action callbacks as props (no business logic inside) |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Wire `WorkspaceSideNav` and `WorkspaceActionsBar`; remove stranded Export ZIP / Clear Project buttons from below gallery; remove duplicate Add/Generate buttons from above canvas; route section state |
| modify | `apps/web/src/app/page.tsx` | Update any `/editor` links to `/batch` |

**Steps:**

- [x] Add permanent redirect in `apps/web/src/app/editor/page.tsx` using Next.js `redirect()` from `next/navigation`
- [x] Update home `apps/web/src/app/page.tsx` — change any `/editor` href to `/batch`
- [x] Implement `WorkspaceSideNav.tsx` — sections: Assets, Template, Text, Results; active section in URL search param (`?section=assets` etc.) so links are shareable; uses shadcn/ui Tab or nav primitives; no business logic
- [x] Implement `WorkspaceActionsBar.tsx` — accepts callbacks for all six actions; groups them semantically (primary: Generate Preview / Generate All / Cancel; secondary: Import ZIP / Export ZIP / Clear Project); no business logic, no redirects
- [x] Refactor `BatchWorkspace.tsx` to render `WorkspaceActionsBar` at top, pass all action handlers; remove the stranded bottom buttons; render section content based on active section param
- [x] Apply Tailwind `--sidebar-*` CSS tokens in `batch/layout.tsx` (they already exist in `globals.css` but are unused)
- [x] Update `apps/web/README.md` — document new route structure and section nav

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/editor-page.test.tsx` | Mock `next/navigation`'s `redirect` and assert it is called with `'/batch'`; Next.js `redirect()` throws `NEXT_REDIRECT` so a plain render assertion is not sufficient — mock the import and verify the call |
| create | `apps/web/src/__tests__/workspace-actions-bar.test.tsx` | Renders all six action buttons; each callback fires on click; disabled state propagates |
| create | `apps/web/src/__tests__/workspace-side-nav.test.tsx` | Renders four sections; clicking a section updates the active state; no business logic side effects |

**Verification:**

- [x] Automated tests for this phase pass: `pnpm test`
- [ ] Manual: navigate to `/editor` — browser lands on `/batch`
- [ ] Manual: all six action buttons visible in the actions bar; none appear below the gallery
- [ ] Manual: clicking each side-nav section switches the displayed content area
- [ ] Manual: Tailwind sidebar tokens visually applied (sidebar width, background match design)

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file (manual smoke-tests deferred to end-of-plan revision)
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn (N/A — afk subagent execution)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session (N/A — afk subagent execution)
- [x] Code-reviewer agent has verified this phase
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [x] Tests for this phase written and passing
- [x] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase (deferred to end-of-plan revision)
- [x] Changes committed: `feat(workspace): unified shell — side-nav sections, consolidated actions bar, /editor redirect`
- [x] Phase marked complete

---

### Phase 2: Multi-variant editable preview

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** User sees a variant strip listing all uploaded overlay images; clicking any item switches the live editable canvas to show that overlay's image in the overlay slot (not just `overlays[0]`); the variant strip highlights the active item. Note: canvas position and styling are shared across all items (single template); only the overlay image source diverges per item at this phase (per-item text divergence is Phase 3).
**Commit message:** `feat(workspace): multi-variant editable preview — variant strip + per-item canvas switch`

> UI implementation: use `ui-ux-pro-max` skill (`--stack nextjs`) for design and component work in this phase.

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/components/batch/VariantStrip.tsx` | Horizontal/vertical thumbnail strip; accepts `overlays: ProjectAsset[]`, `activeId: string|null`, `onSelect: (id: string) => void`; highlights active item; no business logic |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add `activeOverlayId` state (default: `overlays[0]?.id ?? null`); pass active overlay's resolved blob URL to `TextOverlayCanvas` as the overlay src; render `VariantStrip` |
| modify | `apps/web/src/hooks/use-single-composite.ts` | Accept optional `overlayAssetId` param so caller controls which overlay is composited for the live preview; preserve existing default (first overlay) for backward compat |

**Steps:**

- [x] Add `activeOverlayId: string | null` state to `BatchWorkspace.tsx`; initialize to `overlays[0]?.id ?? null`; update when `overlays` list changes (if active is removed, fall back to first)
- [x] Thread `activeOverlayId` into the canvas — resolve the matching `ProjectAsset` from `overlays`, pass its blob URL as the overlay source to `TextOverlayCanvas` (replacing the hardcoded `overlays[0]` reference)
- [x] Update `use-single-composite.ts` to accept an explicit `overlayAssetId` override; keep backward-compatible default so all existing call sites still compile
- [x] Implement `VariantStrip.tsx` — renders thumbnails from blob URLs; highlights active; fires `onSelect`; pure presentational (no hooks, no state)
- [x] Render `VariantStrip` inside `BatchWorkspace.tsx` above or beside the canvas; wire `onSelect` to set `activeOverlayId`
- [x] Ensure Generate All render loop is NOT affected — `use-batch-render.ts` iterates all overlays independently; the `activeOverlayId` only controls the preview canvas

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-single-composite.test.ts` | New cases: explicit `overlayAssetId` selects correct overlay; default still uses first |
| create | `apps/web/src/__tests__/variant-strip.test.tsx` | Renders one thumbnail per overlay; `onSelect` called with correct id; active item has highlight class |
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | Assert render loop still iterates ALL overlays regardless of `activeOverlayId` |

**Verification:**

- [x] Automated tests for this phase pass: `pnpm test`
- [ ] Manual: upload 3 overlays; variant strip shows 3 thumbnails; clicking each switches the canvas to show that item's overlay image
- [ ] Manual: template layout edits (move/resize overlay node) apply to ALL items — this is expected; per-item content divergence (text) is Phase 3
- [ ] Manual: Generate All still produces outputs for ALL overlays (not just active)

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file (manual smoke-tests deferred to end-of-plan revision)
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn (N/A — afk subagent execution)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session (N/A — afk subagent execution)
- [x] Code-reviewer agent has verified this phase
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [x] Tests for this phase written and passing
- [ ] Documentation updated (VariantStrip + canvas-switch README docs deferred — no doc step in Phase 2 scope; rolled into closeout)
- [ ] Orchestrator (user) has verified and approved this phase (deferred to end-of-plan revision)
- [x] Changes committed: `feat(workspace): multi-variant editable preview — variant strip + per-item canvas switch`
- [x] Phase marked complete

---

### Phase 3: Per-item text + locks (schema v2)

**Risk:** high
**Mode:** afk
**Type:** mixed
**Success criteria:** User can type a different caption per batch item in the property panel while editing that item's canvas; one text layer can be "locked" (same value for all items) via a toggle; Generate All captures each item with its own unlocked text values applied; existing ZIP files and IDB records from schemaVersion 1 load without error (migration defaults to all-locked, no overrides).
**Commit message:** `feat(projects): schema v2 — per-item text values + layer locks + render-loop application`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `packages/projects/src/schema.ts` | Bump `SCHEMA_VERSION` to `2`; add `itemTextValues: Record<string, Record<string, string>>` (overlayAssetId → textNodeId → value) and `textLayerLocks: Record<string, boolean>` (textNodeId → locked) to `BatchProject`. Default semantics: NEW text layers default `locked=false` (per-image). Migration default for v1→v2 is `locked=true` for all existing layers (preserves prior shared-text behavior). These are OPPOSITE defaults — new vs. migrated. |
| modify | `packages/projects/src/zip-import.ts` | `normalizeNullableFields` migration: if `schemaVersion < 2`, set `itemTextValues: {}` and `textLayerLocks: {}` with all text layer IDs defaulting to locked=true |
| modify | `packages/projects/src/zip-export.ts` | `serializeProjectJson`: write new fields; emit `schemaVersion: 2` |
| modify | `packages/projects/src/idb-adapter.ts` | Read migration: apply same v1→v2 defaults on load for stored records missing the new fields |
| create | `apps/web/src/hooks/use-item-text.ts` | Thin hook: reads/writes `itemTextValues[overlayAssetId][textNodeId]` via `use-batch-project`'s mutation API; exposes `getTextValue`, `setTextValue`, `isLocked`, `toggleLock` |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Add mutations: `setItemTextValue(overlayAssetId, textNodeId, value)`, `setTextLayerLock(textNodeId, locked)` |
| modify | `apps/web/src/hooks/use-batch-render.ts` | Before each item's composite capture: for each unlocked text node, call the existing `updateTextNode` mutation to write that item's override value into the LIVE editor state; await a rAF/next-tick so React re-paints the DOM; call `compositeFromElement` (which captures the live canvas DOM); then immediately restore the original template text value via `updateTextNode`. The shared template is NEVER permanently mutated — this mirrors the existing variable-slot placeholder pattern and the deselect-before-capture + restore pattern already in this hook. A detached EditorState clone must NOT be used — it never reaches the DOM. |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | In Template/Text section: render per-item text inputs for active overlay using `use-item-text`; show lock toggle per text layer |
| modify | `packages/projects/README.md` | Document schemaVersion 2, new fields, migration path |

**Steps:**

- [ ] Update `packages/projects/src/schema.ts`: bump `SCHEMA_VERSION` to `2`; add `itemTextValues` and `textLayerLocks` fields to `BatchProject` type with required declarations
- [ ] Add v1→v2 migration in `zip-import.ts` `normalizeNullableFields`: detect `schemaVersion === 1` (or missing), populate defaults (`itemTextValues: {}`, all text nodes locked via `textLayerLocks`)
- [ ] Mirror same migration in `idb-adapter.ts` for records loaded from IndexedDB
- [ ] Update `zip-export.ts` to serialize new fields and write `schemaVersion: 2`
- [ ] Add `setItemTextValue` and `setTextLayerLock` mutations to `use-batch-project.ts` (keep mutations small, one responsibility each)
- [ ] Create `use-item-text.ts` — wraps the two new mutations + reads from project state; <30 lines
- [ ] Update `use-batch-render.ts` render loop: for each overlay item, (1) call `updateTextNode` for each unlocked text node with that item's override value into the LIVE editor state; (2) `await` a requestAnimationFrame / next-tick so React re-renders the canvas DOM; (3) call `compositeFromElement` to capture; (4) call `updateTextNode` again to restore each node's original template value. Reuse the existing deselect-before-capture and restore pattern already present in the hook. Do NOT use a detached EditorState clone — it never reaches the DOM and `compositeFromElement` captures only the live canvas.
- [ ] Wire text inputs + lock toggles in `BatchWorkspace.tsx` for the active overlay; use `use-item-text` hook; reuse shadcn/ui `Input`, `Label`, `Button` (lock toggle icon)
- [ ] Update `packages/projects/README.md` schema section

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `packages/projects/__tests__/schema.test.ts` | `SCHEMA_VERSION === 2`; `BatchProject` type has `itemTextValues` and `textLayerLocks`; design-note assertion: new layer helper defaults `locked=false`, migration helper defaults `locked=true` |
| modify | `packages/projects/__tests__/zip-import.test.ts` | Loading a v1 ZIP produces `itemTextValues: {}` and all text nodes locked |
| modify | `packages/projects/__tests__/zip-export.test.ts` | Export writes `schemaVersion: 2` and new fields |
| modify | `packages/projects/__tests__/idb-adapter.test.ts` | Loading a schemaVersion 1 record applies migration defaults |
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | Render loop applies per-item unlocked text values; locked nodes use template value; (a) shared template text node values are UNCHANGED after a full batch run (template immutability guard); (b) each captured item received its own per-item text override during capture (verified via `updateTextNode` call args) |
| modify | `apps/web/src/__tests__/use-batch-project.test.ts` | `setItemTextValue` and `setTextLayerLock` mutations update state correctly; newly-added text layer defaults `locked=false`; migrated v1 layer defaults `locked=true` |

**Verification:**

- [ ] Automated tests for this phase pass: `pnpm test`
- [ ] Manual: set different text values per overlay item; Generate All — inspect outputs have correct per-item text
- [ ] Manual: lock a text layer — all items show same value; unlocked layer shows per-item value
- [ ] Manual: export ZIP with v2 project; reimport — values and locks preserved
- [ ] Manual: import a legacy v1 ZIP — no error; all layers default to locked; no text overrides

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(projects): schema v2 — per-item text values + layer locks + render-loop application`
- [ ] Phase marked complete

---

### Phase 4: Bulk text panel

**Risk:** low
**Mode:** hil
**Type:** frontend
**Success criteria:** User opens the "Text" section in the side-nav and sees all batch items stacked vertically, each showing that item's text inputs (one input per text layer); lock toggles appear per layer; changing a value updates only that item (unless locked); the panel reuses the template's text styling (font, size, color) as display context, not as an editable field.
**Commit message:** `feat(workspace): bulk text panel — all-items stacked text editor with per-layer lock toggles`

> UI implementation: use `ui-ux-pro-max` skill (`--stack nextjs`) for design and component work in this phase.

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/components/batch/BulkTextPanel.tsx` | Stacked list of items × text layers; reads `overlays`, `template`, `itemTextValues`, `textLayerLocks`; renders one `Input` per (item, unlocked-text-node) pair; renders lock toggles; calls `setItemTextValue` / `setTextLayerLock` via callbacks; no business logic internal |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Render `BulkTextPanel` in the "Text" section; pass project state and mutation callbacks |

**Steps:**

- [ ] Design `BulkTextPanel.tsx` layout: outer list = one card per overlay item; inner list = one row per text node in `template`; each row: text node label (from node id or a display name), lock icon toggle, `Input` (disabled if locked, showing shared template value; enabled if unlocked, showing per-item override or falling back to template value)
- [ ] Style using shadcn/ui `Input`, `Label`, `Button` (lock toggle), `Card` or `Separator` for item boundaries; use template's text node styling (font family, size, color) as a visual preview label beside each input — do NOT allow editing those style fields here (that belongs in Template section)
- [ ] Wire `BulkTextPanel` into `BatchWorkspace.tsx` "Text" section; pass `overlays`, `template`, `itemTextValues`, `textLayerLocks`, `setItemTextValue`, `setTextLayerLock`
- [ ] Locked row: show shared value from template as placeholder; input disabled; clicking lock toggle unlocks and enables per-item editing
- [ ] Unlocked row: show per-item value from `itemTextValues[overlayAssetId][textNodeId]` or fallback to template value as placeholder

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/bulk-text-panel.test.tsx` | Renders one section per overlay; one input per text layer; locked inputs are disabled; unlocked inputs are enabled; typing calls `setItemTextValue`; clicking lock toggle calls `setTextLayerLock` |

**Verification:**

- [ ] Automated tests for this phase pass: `pnpm test`
- [ ] Manual: upload 3 overlays with 2 text layers; Text section shows 3 stacked cards with 2 inputs each
- [ ] Manual: lock one layer — all 3 cards show that row disabled; unlock — all 3 show enabled inputs
- [ ] Manual: edit a value in card 2 — card 1 and 3 are unaffected; Generate All confirms per-item text in outputs

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(workspace): bulk text panel — all-items stacked text editor with per-layer lock toggles`
- [ ] Phase marked complete

---

### Phase 5: Drag-and-drop reorder (items list + layer stack)

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** User drags overlay thumbnails in the Assets section to reorder them (output order follows); user drags layers in the Template section to reorder their z-index; both are independent and work without installing a new DnD library (native pointer/HTML5 DnD); a new library is permitted only with explicit justification in the phase steps.
**Commit message:** `feat(workspace): drag-and-drop reorder — batch items list and template layer stack`

> UI implementation: use `ui-ux-pro-max` skill (`--stack nextjs`) for design and component work in this phase.
> DnD dependency decision: assess native HTML5 drag-and-drop vs. pointer events (existing in-canvas drag uses pointer events). If a library is needed, justify explicitly in the steps and add it to the plan's Dependencies & Risks section.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/AssetList.tsx` | Add native HTML5 drag-and-drop (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) to reorder `overlays`; fires `onReorder(newOrder: ProjectAsset[])` callback |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Add `reorderOverlays(newOrder: ProjectAsset[])` mutation — replaces `overlays` array in project state |
| create | `apps/web/src/components/batch/LayerStackPanel.tsx` | Lists template nodes sorted by zIndex; each row has a drag handle; uses `reorderNode` from `packages/editor` via callback prop; no z-order logic of its own |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Wire `AssetList` `onReorder` to `reorderOverlays`; render `LayerStackPanel` in Template section; pass `reorderNode` callback |

**Steps:**

- [ ] Evaluate native HTML5 DnD vs. pointer events for both surfaces. Decision criteria: existing canvas drag uses pointer events (`pointermove`/`pointerup`) for precision; list reorder is coarser and HTML5 DnD is sufficient without a library. **If evaluation concludes a library is necessary**, add it here with justification and update Dependencies & Risks.
- [ ] Implement HTML5 DnD on `AssetList.tsx`: `draggable={true}` on each item; track drag source index in `onDragStart`; compute target index in `onDrop`; fire `onReorder` with reordered array; add drop-target highlight via class toggle
- [ ] Add `reorderOverlays` mutation to `use-batch-project.ts` (replaces the `overlays` array; single responsibility; <15 lines)
- [ ] Implement `LayerStackPanel.tsx`: read `template.nodes` sorted by `zIndex`; each row has a drag handle icon (lucide-react `GripVertical`); on drop, compute up/down moves and call `reorderNode` (from `packages/editor`) once per swap needed to reach target position; do NOT reimplement z-order logic
- [ ] Wire `LayerStackPanel` in Template section of `BatchWorkspace.tsx`; pass `reorderNode` dispatch callback
- [ ] Verify `use-batch-render.ts` uses `zIndex`-sorted node order — it already uses canvas sort; confirm no change needed

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-project.test.ts` | `reorderOverlays` mutation replaces overlays array in correct order |
| create | `apps/web/src/__tests__/asset-list-dnd.test.tsx` | Simulates drag-start + drop; `onReorder` called with correct new order |
| create | `apps/web/src/__tests__/layer-stack-panel.test.tsx` | Renders nodes sorted by zIndex; simulating drop calls `reorderNode` with correct direction |

**Verification:**

- [ ] Automated tests for this phase pass: `pnpm test`
- [ ] Manual: drag overlay thumbnails to reorder; Generate All outputs match new order
- [ ] Manual: drag layers in Template section; canvas z-order updates immediately
- [ ] Manual: DnD is keyboard-accessible (or limitation documented with planned fix)
- [ ] Manual: no new npm/pnpm dependency added (or justification present in steps)

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(workspace): drag-and-drop reorder — batch items list and template layer stack`
- [ ] Phase marked complete

---

### Phase 6: Final Verification

**Mode:** hil

**Overall success criteria:**

- `/editor` permanently redirects to `/batch`; no user-facing link targets `/editor`
- Side-nav sections (Assets / Template / Text / Results) render and switch correctly
- All six global actions are in the consolidated actions bar; none strand below the gallery
- Variant strip lets user switch the live editable canvas to any uploaded overlay
- Per-item text values persist per overlay; locked layers share the template value across all items; Generate All applies correct values per item
- Bulk text panel shows all items × all text layers; lock toggles work; panel is the canonical text editing surface
- Drag reorder works independently for both the overlay items list (affects output order) and the template layer stack (affects z-index)
- All existing `pnpm test` suites pass; no regressions in cartoonize, export, cover-crop, or persistence flows
- No new circular dependencies between `packages/` and `apps/web/`
- schemaVersion 2 ZIPs export and reimport cleanly; schemaVersion 1 ZIPs import without error

**Steps:**

- [ ] Every preceding phase's Steps/Verification/Phase review checkboxes are ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent reviews the entire change end-to-end
- [ ] Any changes made in response to the final code-reviewer review have been reflected back into this plan file
- [ ] All tests pass: `pnpm test`
- [ ] No CLAUDE.md invariants violated (thin entry points, no circular deps, reuse before reinvent, pnpm only)
- [ ] Feature tested manually — golden path: upload 3 overlays, set per-item text, lock one layer, reorder items, reorder layers, Generate All, export ZIP, clear, reimport ZIP, verify all state restored
- [ ] Edge cases tested: 1 overlay (variant strip degenerate case), 0 text nodes (bulk panel empty state), remove active overlay (strip falls back to first), import v1 ZIP (migration applied)
- [ ] Overall success criteria met
- [ ] All phase checkboxes above are ticked
- [ ] `sync-knowledge` skill run to update `.ai/` KB

---

## Documentation

| Change | Documentation location |
|---|---|
| `/editor` redirect + new route structure | `apps/web/README.md` |
| Side-nav sections, WorkspaceActionsBar, WorkspaceSideNav components | `apps/web/README.md` |
| VariantStrip component + canvas switch behavior | `apps/web/README.md` |
| schemaVersion 2: `itemTextValues`, `textLayerLocks`, migration | `packages/projects/README.md` |
| `use-item-text` hook API | `apps/web/README.md` |
| BulkTextPanel component | `apps/web/README.md` |
| DnD approach decision (native vs. library) | `apps/web/README.md` + `.ai/` decision record |
| `reorderOverlays` mutation | `apps/web/README.md` |

Documentation is added as a step within each relevant phase, not as a separate phase.

---

## Knowledge Base Impact

| `.ai/` artifact | Action | What it captures |
|---|---|---|
| `index.md` | update | Add rows for: batch workspace architecture, per-item text model, schema v2; the `.ai/` KB currently has NO batch/projects coverage (seeded before batch merged) — this plan adds it |
| `decisions/template-workspace-unified-route.md` | create | Why `/editor` was folded into `/batch`; rejected alternative (keep two routes) |
| `decisions/per-item-text-schema.md` | create | Why `itemTextValues` is keyed by `overlayAssetId` + `textNodeId`; rejected alternative (per-item EditorState clone); lock semantics; dual defaults: `locked=false` for new layers, `locked=true` for v1-migrated layers |
| `decisions/dnd-library-choice.md` | create | Native HTML5 DnD chosen (or library + justification if evaluation in Phase 5 overturns it) |
| `architecture/batch-workspace.md` | create | Batch/projects module overview: workspace route, overlay asset model, schema v2 shape, render loop text-patch mechanism, IDB/ZIP persistence. This is new `.ai/` coverage — no prior KB file exists for batch. |
| `patterns/batch-render-text-patch.md` | create | Documents the live-state mutate → rAF → capture → restore pattern so future contributors do not regress to detached-clone approach |

All `.ai/` updates are executed by the `sync-knowledge` skill at Phase 6 closeout, not manually.

---

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| Phase 1 | `/editor` page redirect | `apps/web/src/__tests__/editor-page.test.tsx` |
| Phase 1 | `WorkspaceActionsBar` renders + fires callbacks | `apps/web/src/__tests__/workspace-actions-bar.test.tsx` |
| Phase 1 | `WorkspaceSideNav` section switching | `apps/web/src/__tests__/workspace-side-nav.test.tsx` |
| Phase 2 | `use-single-composite` explicit overlayAssetId | `apps/web/src/__tests__/use-single-composite.test.ts` |
| Phase 2 | `VariantStrip` renders + onSelect | `apps/web/src/__tests__/variant-strip.test.tsx` |
| Phase 2 | Render loop iterates all overlays | `apps/web/src/__tests__/use-batch-render.test.ts` |
| Phase 3 | `SCHEMA_VERSION === 2`, type shape | `packages/projects/__tests__/schema.test.ts` |
| Phase 3 | ZIP import v1 migration defaults | `packages/projects/__tests__/zip-import.test.ts` |
| Phase 3 | ZIP export writes v2 fields | `packages/projects/__tests__/zip-export.test.ts` |
| Phase 3 | IDB load v1 record migration | `packages/projects/__tests__/idb-adapter.test.ts` |
| Phase 3 | Render loop applies per-item unlocked text; shared template unchanged after batch run | `apps/web/src/__tests__/use-batch-render.test.ts` |
| Phase 3 | `setItemTextValue` / `setTextLayerLock` mutations; new layer `locked=false`, migrated layer `locked=true` | `apps/web/src/__tests__/use-batch-project.test.ts` |
| Phase 4 | `BulkTextPanel` render + interactions | `apps/web/src/__tests__/bulk-text-panel.test.tsx` |
| Phase 5 | `reorderOverlays` mutation | `apps/web/src/__tests__/use-batch-project.test.ts` |
| Phase 5 | `AssetList` DnD fires onReorder | `apps/web/src/__tests__/asset-list-dnd.test.tsx` |
| Phase 5 | `LayerStackPanel` drop calls reorderNode | `apps/web/src/__tests__/layer-stack-panel.test.tsx` |

---

## Human Summary

**What and why:** The batch image editor today is two separate routes that don't share navigation, has a broken canvas preview (only ever shows the first overlay), no per-item text (everything shared), no bulk editing surface, and global action buttons scattered vertically. This plan consolidates everything into one workspace with clear sections.

**How the phases connect:**
- Phase 1 builds the shell — unified navigation and a sane actions bar. After this, the app has one coherent place to work.
- Phase 2 adds live per-variant preview — the user can finally SEE each overlay on the canvas, not just in a read-only gallery.
- Phase 3 adds the data model and render logic for per-item text — the foundation that Phase 4 builds UI on top of.
- Phase 4 adds the bulk text panel — a fast way to edit all items' text in one scrollable view without switching between canvas states.
- Phase 5 adds drag-and-drop reorder for both the items list and the canvas layer stack.
- Phase 6 is end-to-end manual + automated validation.

**End state:** One `/batch` workspace where the user loads a background, uploads N overlay images, sets a template (layers, text styles), edits per-item text values in a bulk panel, reorders items and layers by dragging, previews each variant live on the canvas, generates all outputs, and exports a ZIP — all without ever leaving the page or losing context.

**Key trade-offs:**
- schemaVersion bump to 2 is a one-way migration; v1 ZIPs remain importable but will be upgraded on load.
- Native HTML5 DnD is the default DnD strategy; a library is permitted only if the Phase 5 evaluation finds it genuinely impractical (touch support gap, accessibility gap, etc.).
- Per-item text is stored as INPUT (string overrides keyed by asset+node), not as full per-item EditorState clones — keeps the schema lean and the render loop patch-and-restore instead of deep-clone-heavy.
