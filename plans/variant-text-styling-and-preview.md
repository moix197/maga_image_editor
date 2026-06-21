# Plan: Variant Text Styling and Preview

**Created:** 2026-06-21
**Branch:** feat/batch-template-ux
**Status:** not started

## Context

The prior plan (template-workspace-revamp, Phases 1–5, shipped on `feat/batch-template-ux`) delivered the unified batch workspace: a single `/batch` route, section-based side-nav, per-item text values (`itemTextValues`) with layer locks (`textLayerLocks`), the bulk text panel, and drag-and-drop reorder.

Three pain points remain:

1. **Results section big preview is broken after Generate All.** `compositeDataUrl` (bound to the big preview block) is set only by Generate Preview — Generate All fills `outputs[]` via `addOutput` and never touches `compositeDataUrl`. After a batch run the big preview block stays empty; the only way to see a result is in the small gallery thumbnails.

2. **Text tab editing model is inefficient.** `BulkTextPanel` renders all items stacked — one card per overlay, one input per text node. To edit many items you scroll a wall of inputs rather than selecting the items of interest and editing them together.

3. **No per-variant text styling.** All style properties (font family, size, color, weight, alignment, etc.) are shared on the template. A user who needs a different font size on one variant has no path; they must duplicate the template or hand-edit the export. The Template section's text style editor already exists but operates only on the shared template node — it is not wired to per-item overrides.

This plan resolves all three in three vertical slices plus a final verification, on the existing branch (no new worktree).

## Risk: medium

Phase 3 is the heaviest — schema v3 + migration chain + render-loop style application + full style controls UI wired per-variant. Splitting it into 3a/3b is available if it grows beyond ~4 files. The migration must chain v1→v2→v3 without forking the migration helpers; `migrateToV2` already exists and must not be duplicated.

## Dependencies & Risks

- Schema v3 (`SCHEMA_VERSION = 3`) is a one-way bump. The v1→v2→v3 migration chain must run through the single `migrateToV2` + new `migrateToV3` helpers shared by `zip-import.ts` and `idb-adapter.ts` — no forked copies (CLAUDE.md: reuse before reinvent).
- `use-batch-render.ts` is touched by Phase 3: it must apply BOTH per-item text content AND per-item style overrides before capture, and restore BOTH in the exception-safe `finally` block. Partial restore (content only, not style) is a regression.
- The existing Template text style editor (`TextStylePanel` / text style controls in the Template section) must be reused for per-variant styling (Phase 3). Building a separate style editor from scratch violates CLAUDE.md reuse-before-reinvent.
- `updateTextNode` is the editor mutation — Phase 3 must confirm it accepts style fields (`fontFamily`, `fontSize`, `color`, etc.) in addition to `content`, since the render loop will call it for both. If `updateTextNode` is content-only, a companion mutation (e.g., `updateTextNodeStyle`) may be needed from `@maga/editor` — assess before implementation.
- Phases 1 and 2 are frontend-only and independent of each other at the code level, but Phase 3 depends on Phase 2's selection state (`selectedOutputId`) being in place.
- The multi-select overlay UX (Phase 2) has no precedent yet in the codebase. The single-select pattern from `VariantStrip` + `activeOverlayId` is the closest prior art; extend it rather than introduce a new pattern (CLAUDE.md: inspect a similar existing implementation).
- No new dependencies may be added (CLAUDE.md: build our own before installing; minimize dependency footprint).

---

## Phases

### Phase 0: No worktree — work on current branch

**Mode:** hil
**Type:** config

Work happens directly on branch `feat/batch-template-ux` in the current checkout. The format spec requires Phase 0 to be worktree creation; this plan is a justified exception: the target branch already exists as the working checkout and adding a second worktree for the same branch is not possible. No `git worktree add` is needed or should be run.

**Steps:**

- [ ] Confirm active branch is `feat/batch-template-ux` (`git branch --show-current`)
- [ ] Confirm working tree is clean (`git status`)

No file changes. No automated tests (pure confirmation step — no testable logic introduced). No commit.

---

### Phase 1: Results big preview — auto-show first output + click-to-select thumbnail

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** After clicking Generate All, the big preview block in the Results section immediately shows the first output image (no manual intervention). Clicking any thumbnail in `BatchResultsGallery` swaps that output into the big block. The existing Generate Preview flow (single composite → `compositeDataUrl`) continues to work unchanged.
**Commit message:** `feat(workspace): results preview — auto-show first output + click-to-select thumbnail`

> UI implementation: use the `ui-ux-pro-max` skill (`--stack nextjs`) for all component and styling work in this phase.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add `selectedOutputId: string \| null` state (default `null`). Derive `previewDataUrl` = selected output's `outputBlobKey` → fall back to first output's `outputBlobKey` → fall back to `compositeDataUrl`. Replace the existing `compositeDataUrl`-only binding on the big preview block with `previewDataUrl`. Wire `onSelectOutput` handler that sets `selectedOutputId`. Pass handler down to `BatchResultsGallery`. Auto-select first output when `outputs` array changes from empty to non-empty (effect on `outputs.length`). |
| modify | `apps/web/src/components/batch/BatchResultsGallery.tsx` | Accept optional `onSelectOutput: (id: string) => void` prop. Pass it through to each `OutputCard`. Mark selected item (receive `selectedOutputId?: string` prop; add highlight class on matching card). |
| modify | `apps/web/src/components/batch/OutputCard.tsx` | Accept optional `onClick: () => void` prop; call it when the thumbnail or card body is clicked. Add keyboard-accessible `role="button"` / `tabIndex={0}` + `onKeyDown` Enter/Space handler (WCAG 2.1 AA). Active/selected visual state via `aria-pressed` or ring class when `isSelected` prop is true. |

**Steps:**

- [ ] Add `selectedOutputId` state to `BatchWorkspace.tsx`; write `useEffect` that sets it to `outputs[0]?.overlayAssetId ?? null` when `outputs` goes from 0 to non-zero (do not reset on every render — only the empty→non-empty transition); reset to `null` when `outputs` is cleared
- [ ] Derive `previewDataUrl` with the three-level fallback (selected → first → compositeDataUrl) as a `useMemo` or inline derived variable; if `selectedOutputId` is non-null but not found in the current `outputs` array (stale id after regeneration), fall back to `outputs[0]` then `compositeDataUrl`; replace the big preview block's `src` binding
- [ ] Extend `OutputCard` to accept `onClick`, `isSelected`; add accessible keyboard handler; style selected state with a ring or border using Tailwind utilities
- [ ] Extend `BatchResultsGallery` to accept and thread `onSelectOutput` + `selectedOutputId`; pass per-card `isSelected={card.overlayAssetId === selectedOutputId}` and `onClick={() => onSelectOutput(card.overlayAssetId)}`
- [ ] Wire `onSelectOutput` from `BatchWorkspace` → `BatchResultsGallery` → `OutputCard`
- [ ] Verify: Generate Preview still works (sets `compositeDataUrl`; if no output selected yet, big block uses it)
- [ ] Update `apps/web/README.md`: document Results section preview behavior

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/batch-results-gallery.test.tsx` | Renders one `OutputCard` per output; `onSelectOutput` called with correct `overlayAssetId` on click; selected card receives `isSelected=true`; keyboard Enter/Space fires onClick; when `outputs` is cleared (array set to `[]`), `selectedOutputId` becomes `null` and big preview falls back to `compositeDataUrl` (stale-id guard); when `selectedOutputId` points to an id not in the current `outputs` array, `previewDataUrl` falls back to `outputs[0]` then `compositeDataUrl` |
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | Assert that after a batch run `outputs` is non-empty; does not assert on `compositeDataUrl` (remains unchanged by Generate All — that is the whole root cause being fixed at the component level) |

**Verification:**

- [ ] Automated tests pass: `pnpm test`
- [ ] Manual: run Generate All with 3 overlays → big preview immediately shows output 1 without any click
- [ ] Manual: click thumbnail 2 → big preview swaps to output 2; click thumbnail 3 → swaps to output 3
- [ ] Manual: run Generate Preview (single composite) with no outputs → big preview still shows composite URL
- [ ] Manual: keyboard-tab to a thumbnail → Enter key selects it
- [ ] Manual: select thumbnail 2 → clear outputs (via Clear Project or re-run Generate All) → big preview falls back gracefully (no broken-image, no error); stale `selectedOutputId` does not persist after outputs cleared

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(workspace): results preview — auto-show first output + click-to-select thumbnail`
- [ ] Phase marked complete

---

### Phase 2: Text tab multi-select + bulk content editing

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** In the Text section, the user can select multiple variant items (checkboxes or multi-click); a single bulk editor row appears for each text layer; typing in that row updates the text content of ALL selected variants' unlocked layers simultaneously. Locked layers remain unaffected by bulk edit. Items with no selection default to showing all items' values (existing stacked view) so no regression for the current workflow.
**Commit message:** `feat(workspace): text tab multi-select — bulk content editing across selected variants`

> UI implementation: use the `ui-ux-pro-max` skill (`--stack nextjs`) for all component and styling work in this phase.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BulkTextPanel.tsx` | Add `selectedOverlayIds: Set<string>` internal state (or lifted to `BatchWorkspace`). Add a checkbox per item card for selection. When `selectedOverlayIds` is non-empty, render a "Bulk Edit" row per text node above the item cards (instead of or in addition to the stacked inputs); typing in the bulk row calls `setItemTextValue(id, nodeId, value)` for each selected id whose layer is unlocked. When nothing is selected, render original stacked view (no behavior regression). Select-all checkbox in the header. |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | If `selectedOverlayIds` state is needed at workspace level (to coordinate with other sections), lift it here. Otherwise keep it local to `BulkTextPanel`. Prefer local state (CLAUDE.md: thin entry points; no business logic in top-level components unless genuinely cross-cutting). |

**Steps:**

- [ ] Decide where `selectedOverlayIds` state lives: since no other section needs it yet, keep it local to `BulkTextPanel` (no premature lifting — CLAUDE.md: no speculative abstractions)
- [ ] Add checkbox to each item card in `BulkTextPanel`; clicking toggles that `overlayAssetId` in `selectedOverlayIds`
- [ ] Add select-all checkbox in the panel header; toggles all ids in/out of selection
- [ ] When `selectedOverlayIds.size > 0`: render a "Bulk Edit" section above the cards with one row per text node; each row has a controlled input whose `onChange` calls `setItemTextValue(id, nodeId, value)` for every `id` in `selectedOverlayIds` where `isLocked(nodeId) === false`; locked nodes show a disabled row with a lock icon
- [ ] When `selectedOverlayIds.size === 0`: render existing stacked view (unchanged)
- [ ] Bulk row placeholder: show "(multiple values)" when selected items have different existing values for that node; on first keystroke replace with new value for all selected
- [ ] Multi-select + locked layer: when a locked layer is in a multi-select group, the bulk row for that layer is disabled; its value does not change; bulk edits to other unlocked layers in the same selection are unaffected. Confirm this is consistent with Phase 3b's style panel (same lock check applies)
- [ ] Preserve lock toggle per layer (still per-node, not per-item)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/bulk-text-panel.test.tsx` | Checkbox toggles selection; select-all toggles all; with 2 items selected and an unlocked node, typing calls `setItemTextValue` for both; locked node in bulk edit is disabled and `setItemTextValue` is NOT called for it; diverging values across selected items shows "(multiple values)" placeholder; no-selection renders stacked view (existing tests still pass) |

**Verification:**

- [ ] Automated tests pass: `pnpm test`
- [ ] Manual: select 2 of 3 items; type in bulk row → both selected items update; unselected item unaffected
- [ ] Manual: lock a layer; select all items; bulk row for locked layer is disabled
- [ ] Manual: deselect all → panel reverts to stacked view with no regressions

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(workspace): text tab multi-select — bulk content editing across selected variants`
- [ ] Phase marked complete

---

### Phase 3a: Schema v3 + render-loop style application + setItemTextStyle mutation

**Risk:** high
**Mode:** afk
**Type:** mixed
**Success criteria:** After this phase a developer can call `setItemTextStyle(overlayAssetId, textNodeId, { fontSize: 24 })` via a temporary dev-only button wired in `BulkTextPanel` (removed in Phase 3b cleanup) and Generate All will render that variant's unlocked text layer at the overridden font size while other variants use the template size. The schema bump to v3 is in place; v1 ZIPs, v2 ZIPs, and IDB records from both previous schema versions load without error. The render-loop style application is exercisable end-to-end — the temporary button is the minimum UI surface that makes this phase a vertical slice. NOTE: `updateTextNode` signature compatibility is a hard gate — Step 1 must complete before any other implementation step in this phase begins; if the signature is content-only, `patchTextNode` must be added to `@maga/editor` and verified before proceeding.
**Commit message:** `feat(projects): schema v3 — itemTextStyles + migrateToV3 + render-loop style application`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `packages/projects/src/schema.ts` | Bump `SCHEMA_VERSION` to `3`. Add `itemTextStyles: Record<string, Record<string, Partial<TextStyle>>>` (overlayAssetId → textNodeId → style partial) to `BatchProject`. Add `migrateToV3(project: BatchProject): BatchProject` function — sets `itemTextStyles: {}` for any record missing it (default: no overrides). Chain: `migrateToV2` is unchanged; a new `migrateProject` top-level helper applies both migrations in order (`v1→v2→v3`). The existing `textLayerLocks` governs style overrides too — no new lock field. Export `TextStyle` from `@maga/editor` through `@maga/projects` if not already reexported, so callers don't reach across package boundaries. |
| modify | `packages/projects/src/zip-import.ts` | Run `migrateToV3` (via the shared `migrateProject` chain) after loading; emit `schemaVersion: 3` on save. Mirror the existing `migrateToV2` call site pattern — don't fork. |
| modify | `packages/projects/src/zip-export.ts` | Write `schemaVersion: 3` and `itemTextStyles` field. |
| modify | `packages/projects/src/idb-adapter.ts` | Run `migrateToV3` (via `migrateProject`) on load; same call-site pattern as existing v2 migration. |
| modify | `packages/projects/src/index.ts` | Export `migrateToV3` and the updated `BatchProject` type (including `itemTextStyles`). |
| modify (conditional) | `packages/editor/src/editor-state.ts` | Only if `updateTextNode` is content-only: add `patchTextNode(id: string, patch: Partial<TextNode>): EditorState` following the `immutable-state-mutation-functions` pattern. No change if `updateTextNode` already accepts style fields. |
| modify (conditional) | `packages/editor/src/index.ts` | Export `patchTextNode` if added. |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Add `setItemTextStyle(overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>): void` mutation — merges the partial into `itemTextStyles[overlayAssetId][textNodeId]`, analogous to `setItemTextValue`. Keep the function ≤15 lines (CLAUDE.md: small focused functions). |
| modify | `apps/web/src/hooks/use-item-text.ts` | Extend: expose `getTextStyle(overlayAssetId, textNodeId): Partial<TextStyle>` (reads from `itemTextStyles`) and `setTextStyle(style: Partial<TextStyle>)` (calls `setItemTextStyle`). Keep the hook thin (CLAUDE.md: thin entry points). |
| modify | `apps/web/src/hooks/use-batch-render.ts` | In the per-item try/finally block: after applying unlocked text content (`updateTextNode(id, { content })`), also apply the per-item style partial if `itemTextStyles[overlayAssetId][nodeId]` is non-empty (`updateTextNode(id, { ...stylePartial })`). Restore BOTH content AND style to template originals in the `finally` block. Read template originals (content + style) before the loop starts. Do NOT call `updateTextNode` twice if style and content can be merged in one call — confirm the mutation signature accepts a merged patch. If `updateTextNode` is content-only, assess whether `@maga/editor` needs a new `updateTextNodeStyle` transition or a unified `patchTextNode` — prefer the unified patch; add to `packages/editor` if absent. |
| modify | `packages/projects/README.md` | Document `schemaVersion 3`, `itemTextStyles` field, `migrateToV3`, migration chain, and lock model governing both content and style. |

**Steps:**

- [ ] **HARD GATE — do not proceed past this step until resolved.** Inspect `updateTextNode` in `packages/editor/src/editor-state.ts`: does its patch argument accept style fields (`fontFamily`, `fontSize`, `color`, `fontWeight`, `textAlign`, etc.) alongside `content`, or is it content-only? Two outcomes: (a) style fields accepted → document the confirmed signature and continue; (b) content-only → add `patchTextNode(id, patch: Partial<TextNode>)` to `packages/editor` following the `immutable-state-mutation-functions` pattern, export it from `packages/editor/src/index.ts`, write a unit test in `packages/editor/__tests__/editor-state.test.ts` confirming the patch merges style fields without mutating the original, and use `patchTextNode` everywhere below instead of `updateTextNode` for the combined content+style call. Record the outcome in a Step note before moving on.
- [ ] Add `TextStyle` type export path through `@maga/projects` if callers would otherwise import directly from `@maga/editor` (avoids cross-boundary imports from `apps/web` reaching past `@maga/projects`)
- [ ] Update `packages/projects/src/schema.ts`: add `itemTextStyles`, `migrateToV3`, and `migrateProject` chain; bump `SCHEMA_VERSION` to `3`
- [ ] Update `zip-import.ts`, `zip-export.ts`, `idb-adapter.ts` to use `migrateProject` chain — each call site is a one-line change mirroring the existing `migrateToV2` pattern
- [ ] Export updated types and helpers from `packages/projects/src/index.ts`
- [ ] Add `setItemTextStyle` mutation to `use-batch-project.ts` (≤15 lines, single responsibility)
- [ ] Extend `use-item-text.ts` with `getTextStyle` / `setTextStyle` (keep hook ≤50 lines total)
- [ ] Update `use-batch-render.ts` render loop: read template style originals for each text node before the loop; for each item, merge and apply content + style override in a single `updateTextNode` / `patchTextNode` call; restore in `finally`
- [ ] Update `packages/projects/README.md`
- [ ] **Vertical-slice smoke-test (required for phase to be exercisable):** wire a temporary "Override Style" button in `BulkTextPanel` (clearly marked `// TODO: remove in Phase 3b`) that calls `setItemTextStyle(firstOverlayId, firstTextNodeId, { fontSize: 28 })` on click; run Generate All; confirm the first item renders at 28px, all others at template size; confirm template is unchanged after the run. This button is the exercisable surface for this phase — Phase 3b replaces it with the real UI.
- [ ] Orphaned keys note: when a text node is deleted from the template or an overlay is removed, `itemTextStyles[overlayAssetId][textNodeId]` may hold a stale key. Behavior: stale keys are silently ignored by the render loop (no matching node → no mutation). No cleanup is added now (cheap to leak, expensive to coordinate); note this limitation in `packages/projects/README.md` and revisit if ZIP size becomes a concern.

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `packages/projects/__tests__/schema.test.ts` | `SCHEMA_VERSION === 3`; `BatchProject` has `itemTextStyles`; `migrateToV3` sets `itemTextStyles: {}` when missing; `migrateProject` chains v1→v2→v3 correctly (input v1 record exits as v3); **idempotency**: calling `migrateProject` on an already-v3 record returns it unchanged (`itemTextStyles` not reset); v2→v3 chain preserves existing `itemTextValues` and `textLayerLocks` |
| modify | `packages/projects/__tests__/zip-import.test.ts` | Loading a v1 ZIP produces v3 schema with `itemTextStyles: {}`; loading a v2 ZIP produces v3 with `itemTextStyles: {}`; v3 ZIP round-trips correctly; re-importing a v3 ZIP does not re-migrate (idempotent) |
| modify | `packages/projects/__tests__/zip-export.test.ts` | Export writes `schemaVersion: 3` and `itemTextStyles` field |
| modify | `packages/projects/__tests__/idb-adapter.test.ts` | Loading a schemaVersion 1 record applies full migration to v3; loading a v2 record applies v3 migration; loading an already-v3 record is idempotent |
| modify | `apps/web/src/__tests__/use-batch-project.test.ts` | `setItemTextStyle` merges partial style into `itemTextStyles[overlayId][nodeId]`; subsequent call merges (not replaces) with previous partial |
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | Render loop applies per-item style overrides for unlocked layers; locked layers use template style; template style originals are unchanged after a full batch run (immutability guard); **throw-restore test**: when `compositeFromElement` throws mid-capture, the `finally` block restores both content AND style fields of the affected item's text nodes to template originals (assert `updateTextNode`/`patchTextNode` restore calls include style fields, not only `content`) |
| modify (conditional) | `packages/editor/__tests__/editor-state.test.ts` | If `patchTextNode` is added: assert patch merges style fields into a copy of the node without mutating the original; partial patch does not overwrite unspecified fields |

**Verification:**

- [ ] Automated tests pass: `pnpm test`
- [ ] Manual (dev smoke): hardcoded `setItemTextStyle` call changes rendered output for the target variant; other variants unaffected
- [ ] Manual: import a v1 ZIP → no error; `itemTextStyles` empty; existing behavior preserved
- [ ] Manual: import a v2 ZIP → upgraded to v3; `itemTextStyles` empty; text values and locks preserved
- [ ] Manual: export a v3 project as ZIP; reimport → `itemTextStyles` round-trips correctly

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(projects): schema v3 — itemTextStyles + migrateToV3 + render-loop style application`
- [ ] Phase marked complete

---

### Phase 3b: Per-variant text styling UI — full style controls wired to selected variants

**Risk:** medium
**Mode:** afk
**Type:** frontend
**Success criteria:** In the Text section, when one or more variant items are selected, a styling panel (reusing the Template section's text style controls at full parity — font family, size, color, weight, alignment, and every field the template editor exposes) appears alongside the bulk content editor. Changing a style control applies the override to ALL selected variants' unlocked layers immediately. Locked layers are unaffected. Generating All renders each variant with its per-item style override applied.
**Commit message:** `feat(workspace): per-variant text styling — full style controls in text tab multi-select`

> UI implementation: use the `ui-ux-pro-max` skill (`--stack nextjs`) for all component and styling work in this phase.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BulkTextPanel.tsx` | When `selectedOverlayIds.size > 0`: render the existing Template text style controls (reuse the component/panel that drives template text styling — `TextStylePanel` or equivalent) below the bulk content row, per text node. The style panel's `onChange` callbacks call `setTextStyle(style)` from `use-item-text` for each selected id where the layer is unlocked. Show the panel in a "mixed" / empty state when selected items have diverging styles (no destructive overwrite until the user explicitly changes a control). |
| modify | `apps/web/src/hooks/use-item-text.ts` | If needed: extend to accept `selectedOverlayIds` for bulk style reads (compute merged/mixed state across multiple items for the style panel display). Keep the hook thin; extract any merge logic to a small helper in the same file. |

**Steps:**

- [ ] **Remove the Phase 3a temporary dev button** from `BulkTextPanel` (the `// TODO: remove in Phase 3b` override button) — this is the first step of 3b so it is never left in a shipped build
- [ ] Identify the exact component used for text styling in the Template section (likely `TextStylePanel` in `apps/web/src/components/text-style-panel.tsx` per the `.ai` index; confirm file path). This component must be reused without modification — if it requires refactoring to accept callbacks, scope refactoring to callback prop extraction only (CLAUDE.md: minimal changes, preserve existing behavior)
- [ ] Confirm `TextStylePanel` (or equivalent) is generic enough to accept callbacks — it should already accept style values + onChange callbacks since it's used in the Template editor. If it has hard-wired state or side effects, extract the pure presentational layer as a thin wrapper; do NOT duplicate it
- [ ] Wire `TextStylePanel` in the bulk edit area of `BulkTextPanel`: compute display style as the style of the first selected item's text node (or merged/mixed where divergent); on `onChange`, call `setTextStyle` for all selected unlocked items
- [ ] "Mixed" state: when selected items have different style values for a field, show placeholder or empty input (do not pick one arbitrarily); first user change in that field applies the new value to all selected items
- [ ] Locked layers: style panel row for a locked layer is disabled (same as content row); consistent with Phase 2's lock behavior
- [ ] Update `apps/web/README.md`: document per-variant text styling, lock model covering both content and style

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/bulk-text-panel.test.tsx` | With 2 items selected and an unlocked node: changing a style control calls `setItemTextStyle` for both; locked node style panel is disabled; no-selection hides the style panel |

**Verification:**

- [ ] Automated tests pass: `pnpm test`
- [ ] Manual: select 2 variants → style panel appears; change font size → both selected variants update; unselected variant unaffected
- [ ] Manual: generate All → selected variants render at overridden font size; others at template size
- [ ] Manual: lock a layer → style panel disabled for that layer's row; unlocking re-enables it
- [ ] Manual: select items with different existing font sizes → style panel shows empty/mixed state for size field; typing a new size applies to both

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(workspace): per-variant text styling — full style controls in text tab multi-select`
- [ ] Phase marked complete

---

### Phase 4: Final Verification

**Mode:** hil

**Overall success criteria:**

- Results section: Generate All immediately populates the big preview with output 1; clicking any gallery thumbnail swaps the big preview to that output; Generate Preview still binds to its compositeDataUrl as a fallback when no batch outputs exist
- Text tab: user can select multiple variant items via checkboxes; bulk content edit row applies to all selected unlocked layers at once; locked layers are unaffected
- Text tab: with variants selected, the full text style panel appears; changing any style property applies per-variant overrides to all selected unlocked layers; Generate All renders each variant with its own style
- Lock model: one lock per text layer governs both content AND style; locked = shared template value and style for all variants; unlocked = each variant can independently override both
- Schema v3: ZIP export writes `schemaVersion: 3` and `itemTextStyles`; reimport round-trips correctly; v1 and v2 ZIPs import without error (migration applied transparently); IDB records from any prior version load and migrate
- `pnpm test` passes with no regressions across all packages (`@maga/editor`, `@maga/projects`, `@maga/web`)
- No CLAUDE.md invariants violated: thin entry points, small focused functions, no new external dependencies, pnpm, packages own their concern (schema in `@maga/projects`, style type reuse from `@maga/editor`)
- No new circular dependencies between packages

**Steps:**

- [ ] Every preceding phase's Steps/Verification/Phase review checkboxes are ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent reviews the entire change end-to-end
- [ ] Any changes made in response to the final code-reviewer review have been reflected back into this plan file
- [ ] All tests pass: `pnpm test`
- [ ] No CLAUDE.md invariants violated
- [ ] Feature tested manually — golden path: upload 3 overlays; select 2 in Text tab; set different font size; type shared caption in bulk content row; Generate All → variants 1+2 have overridden style, variant 3 has template style; export ZIP; clear; reimport ZIP; verify `itemTextStyles` preserved
- [ ] Edge cases tested: 0 text nodes (bulk panel shows "No text layers" — existing empty-state preserved); all layers locked (style panel fully disabled); v1/v2 ZIP import (migration applied, no error); Generate All with no text overrides (no regression vs. prior behavior)
- [ ] Overall success criteria met
- [ ] All phase checkboxes above are ticked
- [ ] `sync-knowledge` skill run to update `.ai/` KB

---

## Documentation

| Change | Documentation location |
|---|---|
| Results preview auto-show + click-to-select behavior | `apps/web/README.md` |
| `OutputCard` onClick / `isSelected` props | `apps/web/README.md` |
| Text tab multi-select UX and bulk content edit | `apps/web/README.md` |
| `schemaVersion 3`, `itemTextStyles`, `migrateToV3`, migration chain | `packages/projects/README.md` |
| `setItemTextStyle` mutation in `use-batch-project` | `apps/web/README.md` |
| `getTextStyle` / `setTextStyle` in `use-item-text` | `apps/web/README.md` |
| Per-variant text styling controls wired to `TextStylePanel` | `apps/web/README.md` |
| Lock model: one lock covers content + style | `packages/projects/README.md` |

Documentation is added as a step within each relevant phase, not as a separate phase.

---

## Knowledge Base Impact

| `.ai/` artifact | Action | What it captures |
|---|---|---|
| `decisions/per-item-text-schema.md` | update | **Remove the constraint** "Override values are strings only; anything beyond text content belongs on the template" — this is now false. Replace with: per-item overrides carry both string content (`itemTextValues`) and style partials (`itemTextStyles`); `itemTextStyles` is `Record<overlayAssetId, Record<textNodeId, Partial<TextStyle>>>` mirroring the `itemTextValues` shape. Update schema version to v3. Update migration chain to v1→v2→v3 via `migrateProject` (which chains `migrateToV2` + `migrateToV3`). Note idempotency: `migrateProject` on a v3 record is a no-op. Note orphaned-key behavior: stale keys in `itemTextStyles` after node/overlay deletion are silently ignored. |
| `architecture.md` | update | Batch workspace section: change `SCHEMA_VERSION = 2` to `SCHEMA_VERSION = 3`; add `itemTextStyles` alongside `itemTextValues`; update the `migrateToV2` mention to `migrateProject` (chains v1→v2→v3); note the render loop applies both content and style overrides, and restores both in `finally` |
| `patterns/batch-render-text-patch.md` | update | Extend: per-item loop now reads template style originals for each text node before the loop; applies BOTH content AND per-item style partial in a single `updateTextNode`/`patchTextNode` call; restore in `finally` covers style fields in addition to content. Add note: throw mid-capture must not leave template style mutated — covered by the same `finally` as content. |
| `index.md` | update | `@maga/projects` responsibility line: change "schema v2 (overlay assets, per-item text, layer locks)" to "schema v3 (overlay assets, per-item text, per-item text styles, layer locks)" |

---

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| Phase 1 | `BatchResultsGallery` renders + `onSelectOutput` + `selectedOutputId` stale-id fallback | `apps/web/src/__tests__/batch-results-gallery.test.tsx` |
| Phase 1 | Render loop `outputs` non-empty after Generate All | `apps/web/src/__tests__/use-batch-render.test.ts` |
| Phase 2 | `BulkTextPanel` multi-select checkboxes + bulk content write + locked-in-multiselect disabled + diverging-values placeholder | `apps/web/src/__tests__/bulk-text-panel.test.tsx` |
| Phase 3a | `SCHEMA_VERSION === 3`, `itemTextStyles` shape, migration chain, idempotency | `packages/projects/__tests__/schema.test.ts` |
| Phase 3a | ZIP import: v1→v3 and v2→v3 migration; v3 idempotent re-import | `packages/projects/__tests__/zip-import.test.ts` |
| Phase 3a | ZIP export: writes schemaVersion 3 + `itemTextStyles` | `packages/projects/__tests__/zip-export.test.ts` |
| Phase 3a | IDB adapter: v1 and v2 record migration to v3; v3 idempotent | `packages/projects/__tests__/idb-adapter.test.ts` |
| Phase 3a | `setItemTextStyle` mutation merge semantics | `apps/web/src/__tests__/use-batch-project.test.ts` |
| Phase 3a | Render loop: style application + throw-restore covering style fields | `apps/web/src/__tests__/use-batch-render.test.ts` |
| Phase 3a | `patchTextNode` (if added): merges style fields without mutating original | `packages/editor/__tests__/editor-state.test.ts` |
| Phase 3b | `BulkTextPanel` style panel wiring + mixed state + locked rows | `apps/web/src/__tests__/bulk-text-panel.test.tsx` |

---

## Human Summary

**What and why:** This plan adds three improvements on top of the unified batch workspace shipped in the prior plan.

First, the Results section's big preview was broken after Generate All — this wires it to auto-show the first output and lets the user click thumbnails to swap the preview. A pure wiring fix with no schema changes.

Second, the Text tab's all-items-stacked layout is replaced with a select-then-edit model: the user picks which variants to edit (checkboxes), then edits content for all of them at once in a single bulk row. More efficient for large item sets.

Third — the largest piece — users can override text style properties (font, size, color, weight, alignment, every field the Template editor exposes) on a per-variant basis. A schema v3 bump adds `itemTextStyles` mirroring the existing `itemTextValues` structure. The render loop is extended to apply style overrides alongside content overrides before each capture, then restore both in the exception-safe `finally`. The existing Template text style panel is reused directly in the bulk editor (no duplicate UI). One lock per layer governs both content and style.

**How the phases connect:** Phase 1 is self-contained (Results UI fix). Phase 2 establishes the multi-select UX that Phase 3b's styling UI is built on top of. Phase 3a lays the data/persistence/render-loop foundation that Phase 3b's UI consumes; it is made exercisable by a temporary dev-only override button that proves the render path end-to-end before any real UI exists. Phase 3b opens with removing that button and wires the real `TextStylePanel`. Phase 4 is end-to-end manual + automated validation.

**End state:** A user who needs variant 2 to have a larger font and variant 3 to have a different color can select those items in the Text section, change the style controls once, and Generate All — each variant renders with its own styling while locked/shared layers stay consistent across all outputs.

**Key trade-offs:**
- Schema v3 is a one-way migration. v1 and v2 ZIPs remain importable but are upgraded on load. The `migrateProject` chain (`migrateToV2` + `migrateToV3`) is shared by ZIP import and IDB adapter — no forked copies.
- The lock model was explicitly kept as one lock governing both content and style (not separate content/style locks). This keeps the UI simple and the data model lean.
- Phase 3 is split into 3a (data + render) and 3b (UI) because the combined phase would touch 8+ files, violating the "≤3–4 files per phase" guideline from the format spec.
- `TextStylePanel` is reused without modification (or with only callback-prop extraction if needed). No duplicate style editor is built.
