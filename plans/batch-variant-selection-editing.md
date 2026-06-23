# Plan: Batch Variant-Selection Editing

**Created:** 2026-06-23
**Branch:** feat/batch-variant-selection-editing
**Status:** not started

## Context

The current batch workspace has a two-surface text editing model: a "Text" side-nav section (BulkTextPanel + per-layer lock toggles) and a "Template" section's inline ItemTextPanel. Locks route edits to either a shared template or per-variant overrides. This design is being replaced with a single variant-selection model: multi-select checkboxes on the VariantStrip, edits fanned out as partial patches across the selected set, and complete removal of the lock concept. Everything becomes per-variant overrides. The "Text" side-nav section and BulkTextPanel are deleted.

## Risk: high

## Dependencies & Risks

1. **IDB migration gap (CONFIRMED):** `use-project-persistence.ts` does NOT call `migrateProject` on IDB load. The JSDoc of `migrateProject` claims it's shared by both ZIP import and IDB load — but the hook only calls `hydrateFromIdb` (blob-key resolution only). The v3→v4 migration will NOT run for existing saved projects unless the hook explicitly calls `migrateProject`. Must fix in Phase 1a.
2. **isRunning canvas invariant (load-bearing):** `BatchWorkspace` renders `state={batchRender.isRunning ? editorState.state : previewEditorState}`. After lock removal, `usePreviewEditorState` no longer needs to filter by lock — it should apply all per-item overrides. This must continue to work after changes; the `isRunning` swap line must not be disturbed.
3. **Schema-only migration (Phase 1a) is an allowed thin-infrastructure exception** because Phase 1b depends on it being green first.
4. `make-text-edit-handlers.ts` factory becomes a routing layer to delete — callers must be updated to call per-item setters directly. **Grep step required before deletion:** confirm no file outside `BatchWorkspace.tsx` imports `make-text-edit-handlers` (plan step must include `grep -r "make-text-edit-handlers"` across `apps/` and `packages/`).
5. No shadcn Checkbox exists in this project; native `<input type="checkbox">` with class `h-4 w-4 cursor-pointer rounded border-border accent-primary` is the established pattern (reuse from BulkTextPanel before it is deleted; copy exact class string).
6. **Zero-variant/overlay edge case:** a v3 project may have locked layers but no overlays (empty project). `migrateToV4` must handle `overlays === []` gracefully — nothing to fan into; simply drop `textLayerLocks` and bump version. No iteration, no crash.
7. **Stale-key edge case:** a text node may have been deleted from the template after a lock entry was created. `migrateToV4` must skip any `textLayerLocks` key whose node id no longer exists in `project.template`; do not write orphan entries into `itemTextValues`/`itemTextStyles`.
8. **No-overwrite invariant:** if `itemTextValues[overlayId][nodeId]` already exists when migrating a locked layer, skip it. This is required for idempotency and to avoid clobbering user overrides on a v3→v4 re-migration (e.g. if migration runs twice due to a bug).
9. **Variant-deleted-while-selected edge case (Phase 2):** if a variant is deleted while it is in `selectedVariantIds`, the set must be pruned to only existing overlay ids. `onSelectionChange` and the deletion handler in `BatchWorkspace` must both ensure `activeOverlayId` (post-deletion, which may change) is added back.
10. **Active-only-variant checkbox:** when there is exactly one variant, its checkbox is checked AND disabled. The "Select all" checkbox must also appear checked (all = 1 of 1). Verify this edge case in VariantStrip tests.

---

## Phases

### Phase 0: Create worktree

**Risk:** low
**Mode:** hil
**Type:** config
**Success criteria:** A git worktree for `feat/batch-variant-selection-editing` is created and the working directory is confirmed clean.
**Commit message:** n/a — no code changes in this phase

**File changes:**
| Action | File | What changes |
|---|---|---|
| none | — | Worktree creation only; no source files modified |

**Steps:**
- [ ] Confirm branch name with user: `feat/batch-variant-selection-editing`
- [ ] Run `git worktree add ../maga_image_editor_batch-variant-selection-editing feat/batch-variant-selection-editing` (create from current HEAD or from main as appropriate)
- [ ] Verify the worktree directory exists and `git status` is clean inside it

**Tests:**
No automated tests — justified because: this phase creates only a git worktree; no source code is changed.

**Verification:**
- [ ] Worktree directory exists at the expected path
- [ ] `git status` inside the worktree shows a clean working tree on `feat/batch-variant-selection-editing`
- [ ] No unintended file modifications

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted
- [ ] Orchestrator cleared context and pasted handoff prompt
- [ ] Code-reviewer agent verified this phase
- [ ] Reviewer-driven changes reflected back into plan
- [ ] Tests written and passing (or no-tests justification accepted)
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: n/a
- [ ] Phase marked complete

---

### Phase 1a: Schema v3→v4 migration + IDB hydration fix

**Risk:** medium
**Mode:** afk
**Type:** typescript
**Success criteria:** A v3 project saved to IDB (or imported via ZIP) is automatically upgraded to v4 on load: `textLayerLocks` is absent, each previously-locked layer's template value/style is copied into every variant's `itemTextValues`/`itemTextStyles`, `SCHEMA_VERSION` becomes 4. Migration tests pass. No UI changes visible yet.

This phase is an allowed thin-infrastructure exception (schema-only, no user-facing surface) because Phase 1b depends on the v4 schema being in place.

**Commit message:** `feat(projects): schema v4 — drop textLayerLocks, fan locked values into per-item overrides; fix IDB migration gap`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `packages/projects/src/schema.ts` | Add `migrateToV4` function, bump `SCHEMA_VERSION = 4`, update `BatchProject` to remove `textLayerLocks`, update `migrateProject` chain to include `migrateToV4`, remove `newTextLayerLockDefault`/`migratedTextLayerLockDefault`/`textLayerLocks` field from `BatchProject` interface, remove `migratedTextLayerLocks` helper |
| modify | `apps/web/src/hooks/use-project-persistence.ts` | Import and call `migrateProject` on both IDB load path (after `loadProject`) and ZIP import path (after `importProjectZip`) |
| modify | `packages/projects/src/zip-import.ts` | Verify `normalizeNullableFields` still calls `migrateProject`; if already done, no change needed — just note it |

**Steps:**
- [ ] In `schema.ts`: remove `textLayerLocks: Record<string, boolean>` from `BatchProject` interface; remove `newTextLayerLockDefault`, `migratedTextLayerLockDefault`, `migratedTextLayerLocks`
- [ ] Add `migrateToV4<T>(project: T)` that: collect all text node ids present in `project.template`; for each `nodeId` where `project.textLayerLocks?.[nodeId]` is true AND `nodeId` exists in the template (skip stale keys); for each overlay in `project.overlays` (if overlays is empty, skip loop entirely): set `itemTextValues[overlayId][nodeId]` only if NOT already set; set `itemTextStyles[overlayId][nodeId]` only if NOT already set; finally remove `textLayerLocks` from the result and set `schemaVersion: 4`
- [ ] Bump `SCHEMA_VERSION = 4 as const`
- [ ] Update `migrateProject` to chain `migrateToV4(migrateToV3(migrateToV2(project)))`
- [ ] In `use-project-persistence.ts`: import `migrateProject` from `@maga/projects`; call it on `stored` before passing to `hydrateFromIdb`; call it on `imported` before passing to `hydrateFromBlobs`
- [ ] Verify `zip-import.ts` already calls `migrateProject` via `normalizeNullableFields` — if so, no double-migration (migrateProject is idempotent)
- [ ] Run `pnpm tsc --noEmit` across packages to ensure no type errors

**Tests:**
| Action | File | What it covers |
|---|---|---|
| modify | `packages/projects/__tests__/schema.test.ts` | (1) v3 with 2 overlays, 1 locked layer → both overlays get value+style; (2) v3 with 0 overlays → no crash, `textLayerLocks` absent; (3) v3 with stale lock key (node not in template) → stale key not written; (4) v3 with existing `itemTextValues` entry for locked node → NOT overwritten; (5) already-v4 record → idempotent, no mutation; (6) `migrateProject` chains v1→v4 correctly |
| modify | `packages/projects/__tests__/zip-import.test.ts` | ZIP import of a v3 project (with locked layers) produces a v4 record without `textLayerLocks`; overlays contain expected per-item values |

**Verification:**
- [ ] `pnpm --filter @maga/projects test` passes (all 6 cases above)
- [ ] `pnpm tsc --noEmit` passes in `packages/projects` and `apps/web`
- [ ] v3 fixture with 1 locked layer + 2 overlays: after `migrateProject`, `textLayerLocks` absent; both overlays' `itemTextValues`/`itemTextStyles` contain the locked layer's value/style
- [ ] v3 fixture with 0 overlays: no crash, result is v4
- [ ] v3 fixture with stale lock key: stale key absent from all `itemTextValues`/`itemTextStyles`
- [ ] v3 fixture where overlay already has override for locked node: after migration, override unchanged
- [ ] IDB load of a v3 project (manual): project loads as v4, no console errors, text edits work

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted
- [ ] Orchestrator cleared context and pasted handoff prompt
- [ ] Code-reviewer agent verified this phase
- [ ] Reviewer-driven changes reflected back into plan
- [ ] Tests written and passing (or no-tests justification accepted)
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `feat(projects): schema v4 — drop textLayerLocks, fan locked values into per-item overrides; fix IDB migration gap`
- [ ] Phase marked complete

---

### Phase 1b: Remove locks end-to-end (hooks, render, preview, UI removal)

**Risk:** high
**Mode:** afk
**Type:** mixed
**Success criteria:** The "Text" nav item is gone. Clicking Template section still lets users edit text; editing changes the active variant's per-variant override. "Generate All" produces correct per-variant output with no lock filtering. No TypeScript errors. Existing tests pass.
**Commit message:** `feat(batch): remove text-lock model end-to-end — drop Text section, BulkTextPanel, makeTextEditHandlers; all text layers per-variant`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/workspace-sections.ts` | Remove `"text"` from SECTIONS array and VALID_SECTIONS array; remove `Type` icon import |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Remove `textLayerLocks` state, `setTextLayerLock` setter, and their entries from the return object and interface |
| modify | `apps/web/src/hooks/use-item-text.ts` | Remove lock-related accessors: `isLocked`, `toggleLock`; remove lock resolution from `getTextValue`/`getTextStyle` (they now always return per-item overrides directly) |
| modify | `apps/web/src/hooks/use-preview-editor-state.ts` | Remove `textLayerLocks` parameter; remove lock-filter (apply per-item overrides for ALL text nodes, not just unlocked ones) |
| modify | `apps/web/src/hooks/use-batch-render.ts` | Remove `unlockedTextLayers` filter (lines ~46-53); all text layers are now per-item |
| delete | `apps/web/src/components/batch/make-text-edit-handlers.ts` | Lock-routing factory is obsolete; callers use per-item setters directly |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Remove `makeTextEditHandlers` usage (lines ~285-294); pass `setItemTextValue`/`setItemTextStyle` directly; remove `textLayerLocks` from all prop-threading; remove "text" section case from BatchRightPanel switch (or it falls through to null); verify `state={batchRender.isRunning ? editorState.state : previewEditorState}` line is UNCHANGED |
| modify | `apps/web/src/components/batch/BatchRightPanel.tsx` | Remove `BulkTextPanel` import and "text" section branch; remove lock-related props |
| delete | `apps/web/src/components/batch/BulkTextPanel.tsx` | Replaced by VariantStrip multi-select in Phase 2 |

**Steps:**
- [ ] **Grep before delete:** run `grep -r "make-text-edit-handlers" apps/ packages/` — confirm ONLY `BatchWorkspace.tsx` imports it; if other callers exist, update them first before deleting
- [ ] Update `workspace-sections.ts`: remove "text" entry from SECTIONS and VALID_SECTIONS
- [ ] Update `use-batch-project.ts`: drop `textLayerLocks` state/setter/return; drop `setTextLayerLock`
- [ ] Update `use-item-text.ts`: drop `isLocked`/`toggleLock`; simplify `getTextValue`/`getTextStyle` to always look up per-item map directly (no lock check); these are the existing `setItemTextValue`/`setItemTextStyle` partial-merge setters — do NOT replace them with new setters
- [ ] Update `use-preview-editor-state.ts`: remove `textLayerLocks` param; apply overrides to ALL text nodes (no lock filter); verify hook signature change propagates cleanly to all call sites
- [ ] Update `use-batch-render.ts`: remove `unlockedTextLayers` filter; iterate ALL text nodes; verify `isRunning` guard in `BatchWorkspace` (`state={batchRender.isRunning ? editorState.state : previewEditorState}`) is NOT touched — add a comment noting it is load-bearing if it isn't already commented
- [ ] Delete `make-text-edit-handlers.ts` (only after grep confirms no other callers)
- [ ] Update `BatchWorkspace.tsx`: remove `makeTextEditHandlers` call; wire `setItemTextValue`/`setItemTextStyle` directly — fan-out logic belongs in a small helper function or hook (e.g. `useFanOutTextHandlers`), NOT inline in the JSX render body; confirm `isRunning` swap line is character-for-character unchanged
- [ ] Update `BatchRightPanel.tsx`: remove BulkTextPanel branch and import; remove lock prop threading
- [ ] Delete `BulkTextPanel.tsx`
- [ ] Run `pnpm tsc --noEmit`

**Tests:**
| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | All text nodes are patched per-item (no lock filter); previously-"locked" node now appears in output; `isRunning` guard: during render, hook reads `editorState.state` not `previewEditorState`; restore still runs in finally |
| modify | `apps/web/src/__tests__/use-preview-editor-state.test.ts` | With `textLayerLocks` param removed, ALL text nodes receive per-item overrides (add a test with a previously-locked node to confirm it is now always applied) |

**Verification:**
- [ ] `pnpm test` passes across all packages
- [ ] `pnpm tsc --noEmit` passes
- [ ] Nav renders 3 sections (assets, template, results) — "Text" tab absent
- [ ] Template section: editing a text node writes to the active variant's `itemTextValues`/`itemTextStyles`, not to a shared template path
- [ ] Generate All: produced images reflect per-variant text overrides; no node is silently skipped
- [ ] Switching active variant shows that variant's per-item text on canvas (preview correct)
- [ ] **isRunning invariant:** during Generate All the canvas consumes `editorState.state`, not `previewEditorState` — confirm this line is unchanged in `BatchWorkspace.tsx` diff
- [ ] **App is fully functional at end of 1b** — users can edit text on the active variant with no regressions before Phase 2 begins

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted
- [ ] Orchestrator cleared context and pasted handoff prompt
- [ ] Code-reviewer agent verified this phase
- [ ] Reviewer-driven changes reflected back into plan
- [ ] Tests written and passing (or no-tests justification accepted)
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `feat(batch): remove text-lock model end-to-end — drop Text section, BulkTextPanel, makeTextEditHandlers; all text layers per-variant`
- [ ] Phase marked complete

---

### Phase 2: VariantStrip multi-select + fan-out editing

**Risk:** medium
**Mode:** afk
**Type:** frontend
**Success criteria:** Every thumbnail in VariantStrip shows a checkbox. Checking any subset fans text/style edits across all checked variants (plus the active one, which is always included and renders checked-and-disabled). "Select all" checks all. Changing only color on 3 checked variants changes color on those 3 and preserves each one's own content and other styles. Default state = only active variant in the edit set (no extra boxes ticked).
**Commit message:** `feat(batch): VariantStrip multi-select — fan-out text/style edits across selected variants`

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/hooks/use-fan-out-text-handlers.ts` | New hook: accepts `selectedVariantIds`, `setItemTextValue`, `setItemTextStyle`; returns fan-out `handleSetItemTextValue`/`handleSetItemTextStyle`; thin entry point, business logic here not in BatchWorkspace |
| modify | `apps/web/src/components/batch/VariantStrip.tsx` | Add `selectedIds: Set<string>` + `onSelectionChange: (ids: Set<string>) => void` props; render native checkbox on each thumbnail (active = checked+disabled); add "Select all" control; keep existing `onSelect` unchanged |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add `selectedVariantIds` state (Set<string>, defaults to `new Set([activeOverlayId])`); maintain invariant: active always in set; use `useFanOutTextHandlers`; prune set on variant deletion; pass to VariantStrip and fan-out handlers to right panel |
| modify | `apps/web/src/components/batch/BatchRightPanel.tsx` | Template section's ItemTextPanel receives fan-out handlers instead of single-item handlers; only handler props change, panel internals unchanged |

**Steps:**
- [ ] Extract fan-out logic into a dedicated hook `useFanOutTextHandlers` in `apps/web/src/hooks/use-fan-out-text-handlers.ts` — accepts `selectedVariantIds: Set<string>`, `setItemTextValue`, `setItemTextStyle`; returns `handleSetItemTextValue(nodeId, value)` and `handleSetItemTextStyle(nodeId, style)`, each under 15 lines; do NOT inline this logic in `BatchWorkspace` JSX
- [ ] In `BatchWorkspace.tsx`: add `selectedVariantIds: Set<string>` state, default `new Set(activeOverlayId ? [activeOverlayId] : [])`; on `activeOverlayId` change, reset selection to `new Set([newActiveId])`; use `useFanOutTextHandlers` hook for fan-out; on variant deletion, prune `selectedVariantIds` to only ids that still exist in overlays, then ensure `activeOverlayId` (new active) is in the set
- [ ] Update `VariantStrip.tsx`: accept `selectedIds` + `onSelectionChange`; on each thumbnail, render `<input type="checkbox" className="h-4 w-4 cursor-pointer rounded border-border accent-primary" checked={selectedIds.has(id)} disabled={id === activeId} onChange={...} />`; "Select all" control: `<input type="checkbox">` that is `checked={selectedIds.size === allIds.length}` and calls `onSelectionChange(new Set(allIds))` / `onSelectionChange(new Set([activeId]))` on toggle — when there is exactly 1 variant, "Select all" must appear checked (1 of 1)
- [ ] Wire `onSelectionChange` in `BatchWorkspace`: always ensure `activeOverlayId` is present in incoming set before `setState` (enforces invariant regardless of what caller passes)
- [ ] Pass fan-out handlers from `useFanOutTextHandlers` to `BatchRightPanel` and down to `ItemTextPanel` in Template section
- [ ] Run `pnpm tsc --noEmit`

**Tests:**
| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/variant-strip-selection.test.ts` | Checkbox checked state; active always checked+disabled; select-all checked when all selected; select-all checked when only 1 variant exists; `onSelectionChange` called with correct set; active id always present in emitted set |
| create | `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` | `handleSetItemTextValue` calls `setItemTextValue` once per selected id (3 selected → 3 calls); `handleSetItemTextStyle` merges partial style without clobbering other fields on each variant; active always included; variant deleted from selection → only remaining ids called |

**Verification:**
- [ ] `pnpm test` passes
- [ ] `pnpm tsc --noEmit` passes
- [ ] Check 3 variants, change only color: those 3 show new color; each keeps its own content; unchecked variants unchanged (manual smoke)
- [ ] Active thumbnail checkbox is checked and disabled (cannot uncheck)
- [ ] Select all → edit → all variants updated
- [ ] Exactly 1 variant: checkbox checked+disabled, "Select all" checked
- [ ] Switching active variant resets selection to only the new active
- [ ] Delete a checked (non-active) variant: deleted id pruned from selection, remaining selection intact
- [ ] Generate All still produces correct per-variant output; isRunning invariant preserved

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted
- [ ] Orchestrator cleared context and pasted handoff prompt
- [ ] Code-reviewer agent verified this phase
- [ ] Reviewer-driven changes reflected back into plan
- [ ] Tests written and passing (or no-tests justification accepted)
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `feat(batch): VariantStrip multi-select — fan-out text/style edits across selected variants`
- [ ] Phase marked complete

---

### Phase 3: Final Verification

**Risk:** low
**Mode:** hil
**Type:** mixed
**Success criteria:** The "Text" nav section is gone. All text editing happens via the Template section (targeting selected variants). VariantStrip checkboxes let users fan edits across multiple variants. Existing projects (v3) load correctly with locks migrated into per-variant overrides. Generate All produces correct output. No TypeScript errors. KB updated.
**Commit message:** n/a — no new code changes; KB updates committed separately if needed

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `.ai/index.md` | Remove/update "Batch text-edit routing" cross-cutting row; update `@maga/projects` module description (schema v4, no locks) |
| retire | `.ai/patterns/text-edit-lock-routing.md` | Marked superseded or deleted — replaced by variant-selection fan-out |
| modify | `.ai/patterns/live-preview-derived-state.md` | Remove `textLayerLocks` param from signature; note all text nodes now get per-item overrides |
| modify | `.ai/patterns/batch-render-text-patch.md` | Remove references to "unlocked text layers" filter; note all text nodes are now per-item |
| modify | `.ai/decisions/per-item-text-schema.md` | Note v4 schema, no `textLayerLocks`, migration path v1→v4, new fan-out edit model |

**Steps:**
- [ ] All preceding phase Steps/Verification/Phase review checkboxes ticked
- [ ] Reviewer handoff prompt emitted (scoped to end-to-end review)
- [ ] Orchestrator cleared context and pasted handoff prompt
- [ ] Code-reviewer reviews entire change end-to-end
- [ ] Reviewer-driven changes reflected back into plan
- [ ] All tests pass: `pnpm test`
- [ ] No CLAUDE.md invariants violated (thin entry points, small functions, no inline fan-out in JSX, no new dependency installed)
- [ ] **Manual smoke A (fresh project):** open fresh project; edit text in Template section — only active variant changes; check 2 extra variants; change color — exactly those 3 show new color, each keeps its own content; uncheck one; change content — only the 2 still checked update; Generate All — all per-variant images correct
- [ ] **Manual smoke B (v3 IDB):** load a v3 project from IDB — no `textLayerLocks` in state, text edits work, no console errors, canvas shows correct per-variant text
- [ ] **Manual smoke C (v3 ZIP):** ZIP import of a v3 project — same as smoke B
- [ ] **Manual smoke D (edge cases):** open project with exactly 1 variant — checkbox checked+disabled, "Select all" checked; delete a checked variant — set pruned, no crash; delete active variant — new active is in set
- [ ] KB sync: run `sync-knowledge` skill
- [ ] `.ai/index.md` updated: remove "Batch text-edit routing" cross-cutting row; update to describe variant-selection fan-out; update `@maga/projects` schema version row (v4)
- [ ] `.ai/patterns/text-edit-lock-routing.md` retired (marked superseded or deleted)
- [ ] `.ai/patterns/live-preview-derived-state.md` updated: remove `textLayerLocks` param; note all text nodes get per-item overrides; note `isRunning` invariant is preserved
- [ ] `.ai/patterns/batch-render-text-patch.md` updated: remove "unlocked text layers" language; note all text nodes are per-item
- [ ] `.ai/decisions/per-item-text-schema.md` updated: note v4 schema, no `textLayerLocks`, v1→v4 migration chain, fan-out edit model, `useFanOutTextHandlers` hook
- [ ] Overall success criteria met
- [ ] All phase checkboxes above ticked

**Tests:**
No automated tests — justified because: this phase is manual end-to-end verification and KB sync; all automated tests were covered and passing in earlier phases.

**Verification:**
- [ ] `pnpm test` passes across all packages
- [ ] `pnpm tsc --noEmit` passes
- [ ] Manual smoke (fresh project): text edit via Template section targets only active variant; multi-select fans edits; Generate All correct
- [ ] Manual smoke (v3 IDB load): no `textLayerLocks` in state, no console errors, text edits work
- [ ] Manual smoke (v3 ZIP import): same as IDB smoke
- [ ] KB artifacts updated and accurate

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted
- [ ] Orchestrator cleared context and pasted handoff prompt
- [ ] Code-reviewer agent verified this phase
- [ ] Reviewer-driven changes reflected back into plan
- [ ] Tests written and passing (or no-tests justification accepted)
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: n/a (or KB sync commit if applicable)
- [ ] Phase marked complete

---

## Documentation

| Change | Documentation location |
|---|---|
| Schema v4, `migrateToV4`, IDB migration fix | `packages/projects/README.md` (or inline JSDoc in `schema.ts`) |
| Remove text-lock routing | `apps/web/src/components/batch/README.md` or relevant component JSDoc |
| VariantStrip selection props | `apps/web/src/components/batch/VariantStrip.tsx` JSDoc on new props |

## Knowledge Base Impact

| `.ai/` artifact | Action | What it captures |
|---|---|---|
| `index.md` | update | Remove/update "Batch text-edit routing" row; update `@maga/projects` schema version row (v4); add `use-fan-out-text-handlers` hook row |
| `patterns/text-edit-lock-routing.md` | retire | Superseded by variant-selection fan-out |
| `patterns/live-preview-derived-state.md` | update | Remove `textLayerLocks` param; all text nodes get per-item overrides; note `isRunning` invariant preserved |
| `patterns/batch-render-text-patch.md` | update | Remove "unlocked text layers" language; all text nodes are per-item |
| `decisions/per-item-text-schema.md` | update | Schema v4, no `textLayerLocks`, v1→v4 migration chain, fan-out edit model, `useFanOutTextHandlers` hook, edge cases (zero-variant, stale-key, no-overwrite) |

## Tests (top-level mapping)

| Phase | Logic under test | Test file |
|---|---|---|
| Phase 1a | `migrateToV4`: fan-out, zero-overlays, stale keys, no-overwrite, idempotency, full chain | `packages/projects/__tests__/schema.test.ts` |
| Phase 1a | ZIP import of v3 project (with locks) produces v4 with correct per-item values | `packages/projects/__tests__/zip-import.test.ts` |
| Phase 1b | All text nodes patched per-item in render (no lock filter); `isRunning` guard correct | `apps/web/src/__tests__/use-batch-render.test.ts` |
| Phase 1b | Preview state: previously-locked node now always gets per-item override applied | `apps/web/src/__tests__/use-preview-editor-state.test.ts` |
| Phase 2 | VariantStrip: checkbox state, active disabled, select-all, single-variant case | `apps/web/src/__tests__/variant-strip-selection.test.ts` |
| Phase 2 | Fan-out hook: iterates all selected ids; partial style merge; deletion prune | `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` |

## Human Summary

We're replacing the two-surface text editing model (Text nav section + lock toggles) with a single variant-selection model. Editors check which variants they want to target directly on the VariantStrip thumbnails, then edits fan out as partial patches to only those variants.

Phase 1a is a thin schema migration: v3→v4 drops `textLayerLocks` by copying locked layers' values/styles into every variant's per-item overrides, and fixes the confirmed IDB hydration gap where `migrateProject` was never called on IDB load.

Phase 1b removes all lock-related code (the Text nav section, BulkTextPanel, makeTextEditHandlers, lock filtering in preview and render) so the workspace routes all text edits directly to per-item overrides. After this phase the app is fully functional with the active variant always as the edit target.

Phase 2 adds the multi-select UI to VariantStrip and the fan-out handlers in BatchWorkspace — users can now check multiple thumbnails and a single edit updates all of them simultaneously, with partial style merges preserving unedited fields on each variant.

Phase 3 is manual end-to-end verification and KB sync.

Key trade-off: by making everything per-variant, there's no longer a mechanism for "all variants share this text value." That use case now requires selecting all variants before editing — a deliberate choice accepted in the locked design decisions.
