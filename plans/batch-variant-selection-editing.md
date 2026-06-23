# Plan: Batch Variant-Selection Editing

**Created:** 2026-06-23
**Branch:** feat/batch-variant-selection-editing
**Status:** not started

## Context

The current batch workspace has a two-surface text editing model: a "Text" side-nav section (BulkTextPanel + per-layer lock toggles) and a "Template" section's inline ItemTextPanel. Locks route edits to either a shared template or per-variant overrides. This design is being replaced with a single variant-selection model: multi-select checkboxes on the VariantStrip, edits fanned out as partial patches across the selected set, and complete removal of the lock concept. Everything becomes per-variant overrides. The "Text" side-nav section and BulkTextPanel are deleted.

## Risk: high

## Dependencies & Risks

1. **No IDB migration gap (CORRECTED):** the original plan claimed `use-project-persistence.ts` never migrates on IDB load. Verified false — `use-project-persistence.ts:97` calls `loadProject`, which ends with `return migrateProject(project)` (`idb-adapter.ts:72`); `hydrateFromIdb` (line 99) only resolves blob keys on the already-migrated record. ZIP import is the same: `importProjectZip` → `zip-import.ts:29` `return migrateProject({...})`. Both ingress points already funnel through `migrateProject`, so adding `migrateToV4` to the chain upgrades existing v3 projects automatically. **No hook change needed** — the `use-project-persistence.ts` edit is dropped from Phase 1a.
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
**Success criteria:** A v3 project saved to IDB (or imported via ZIP) is automatically upgraded to v4 on load: the migrated *data* has no `textLayerLocks`, each previously-locked layer's template value/style is copied into every variant's `itemTextValues`/`itemTextStyles`, `SCHEMA_VERSION` becomes 4. Migration tests pass. No UI changes visible yet. **Additive-only:** the `textLayerLocks?` field stays on the `BatchProject` interface (now optional) so all ~20 existing consumers still compile; the field + helper removal happens in Phase 1b.

This phase is an allowed thin-infrastructure exception (schema-only, no user-facing surface) because Phase 1b depends on the v4 schema being in place. Migration already flows through `migrateProject` at both ingress points (`loadProject`, `importProjectZip`), so chaining `migrateToV4` upgrades existing projects automatically — no hook change.

**Commit message:** `feat(projects): schema v4 — migrateToV4 fans locked values into per-item overrides`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `packages/projects/src/schema.ts` | Add `migrateToV4` function; bump `SCHEMA_VERSION = 4 as const`; add `migrateToV4` to the `migrateProject` chain; make `textLayerLocks?` **optional** on `BatchProject` (do NOT remove it or its helpers yet — that is Phase 1b) |
| modify | `packages/projects/__tests__/idb-adapter.test.ts` | **Version bump only:** update `schemaVersion` expectations from 3 to 4 (the field + lock assertions stay — they are removed in Phase 1b) |
| modify | `packages/projects/__tests__/zip-export.test.ts` | **Version bump only:** update `schemaVersion` expectations from 3 to 4 (lock assertions stay — removed in Phase 1b) |
| modify | `apps/web/src/hooks/use-batch-project.ts` | **One-line guard only:** at ~line 103, default the now-optional field: `project.textLayerLocks ?? {}` (full lock-state removal is Phase 1b) |

**Steps:**
- [x] In `schema.ts`: change `textLayerLocks: Record<string, boolean>` to `textLayerLocks?: Record<string, boolean>` on the `BatchProject` interface (keep `newTextLayerLockDefault`/`migratedTextLayerLockDefault`/`migratedTextLayerLocks` — they are removed in Phase 1b)
- [x] Add `migrateToV4<T>(project: T)` that: collect all text node ids present in `project.template`; for each `nodeId` where `project.textLayerLocks?.[nodeId]` is true AND `nodeId` exists in the template (skip stale keys); for each overlay in `project.overlays` (if overlays is empty, skip loop entirely): set `itemTextValues[overlayId][nodeId]` only if NOT already set; set `itemTextStyles[overlayId][nodeId]` only if NOT already set; finally remove `textLayerLocks` from the returned data and set `schemaVersion: 4`. Match the generic style of the existing `migrateToV2`/`migrateToV3`
- [x] Bump `SCHEMA_VERSION = 4 as const`
- [x] Update `migrateProject` to chain `migrateToV4(migrateToV3(migrateToV2(project)))`
- [x] Version-bump ripple (unavoidable from the `SCHEMA_VERSION` bump): in `packages/projects/__tests__/idb-adapter.test.ts` and `__tests__/zip-export.test.ts`, update `schemaVersion` expectations 3→4 (keep all lock-related fixtures/assertions — those are removed in Phase 1b); in `apps/web/src/hooks/use-batch-project.ts` ~line 103, change to `project.textLayerLocks ?? {}` (one-line guard only). Note: idb-adapter post-load assertions reading `loaded.textLayerLocks` were changed to absence checks since `loadProject` migrates on read (strips locks).
- [x] Run `pnpm --filter @maga/projects test` (all green, not just schema.test.ts) and `pnpm tsc --noEmit` in `packages/projects` and `apps/web` (both green) — 48/48 pass, tsc clean

**Tests:**
| Action | File | What it covers |
|---|---|---|
| modify | `packages/projects/__tests__/schema.test.ts` | (1) v3 with 2 overlays, 1 locked layer → both overlays get value+style; (2) v3 with 0 overlays → no crash, `textLayerLocks` absent; (3) v3 with stale lock key (node not in template) → stale key not written; (4) v3 with existing `itemTextValues` entry for locked node → NOT overwritten; (5) already-v4 record → idempotent, no mutation; (6) `migrateProject` chains v1→v4 correctly |
| modify | `packages/projects/__tests__/zip-import.test.ts` | ZIP import of a v3 project (with locked layers) produces a v4 record without `textLayerLocks`; overlays contain expected per-item values |

**Verification:**
- [x] `pnpm --filter @maga/projects test` passes (all 6 cases above)
- [x] `pnpm tsc --noEmit` passes in `packages/projects` and `apps/web` (stays green — `textLayerLocks?` kept optional)
- [x] v3 fixture with 1 locked layer + 2 overlays: after `migrateProject`, migrated data has no `textLayerLocks`; both overlays' `itemTextValues`/`itemTextStyles` contain the locked layer's value/style
- [x] v3 fixture with 0 overlays: no crash, result is v4
- [x] v3 fixture with stale lock key: stale key absent from all `itemTextValues`/`itemTextStyles`
- [x] v3 fixture where overlay already has override for locked node: after migration, override unchanged

**Phase review:**
- [x] All Steps and Verification checkboxes above ticked
- [x] Reviewer handoff prompt emitted
- [x] Orchestrator cleared context and pasted handoff prompt
- [x] Code-reviewer agent verified this phase
- [x] Reviewer-driven changes reflected back into plan (purity nit on nested override copy noted for Phase 1b)
- [x] Tests written and passing (or no-tests justification accepted)
- [x] Documentation updated (JSDoc on `migrateToV4` matching v2/v3)
- [ ] Orchestrator approved
- [x] Changes committed: `feat(projects): schema v4 — migrateToV4 fans locked values into per-item overrides`
- [ ] Phase marked complete

---

### Phase 1b: Remove locks end-to-end (hooks, render, preview, UI removal)

**Risk:** high
**Mode:** afk
**Type:** mixed
**Success criteria:** The "Text" nav item is gone. Clicking Template section still lets users edit text; editing changes the active variant's per-variant override. "Generate All" produces correct per-variant output with no lock filtering. No TypeScript errors. Existing tests pass.
**Commit message:** `feat(batch): remove text-lock model end-to-end — drop Text section, BulkTextPanel, makeTextEditHandlers; all text layers per-variant`

**Note (moved from Phase 1a):** the `textLayerLocks?` field and its helpers were kept in Phase 1a so consumers stayed green. This phase removes the field + helpers from `schema.ts` AND every remaining consumer (apps/web lock code **plus** the packages/projects consumers below) in one atomic green commit.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `packages/projects/src/schema.ts` | Remove `textLayerLocks?` field from `BatchProject`; remove `newTextLayerLockDefault`, `migratedTextLayerLockDefault`, `migratedTextLayerLocks` helpers |
| modify | `packages/projects/src/index.ts` | Remove re-exports of `newTextLayerLockDefault`/`migratedTextLayerLockDefault`/`migratedTextLayerLocks` (whichever are exported) |
| modify | `packages/projects/src/zip-export.ts` | Remove `textLayerLocks: project.textLayerLocks` (and any other lock references) from the export record |
| modify | `packages/projects/__tests__/idb-adapter.test.ts` | Remove `textLayerLocks` from fixtures/assertions |
| modify | `packages/projects/__tests__/zip-export.test.ts` | Remove `textLayerLocks` from fixtures/assertions |
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
- [x] **Grep before delete:** run `grep -r "make-text-edit-handlers" apps/ packages/` — confirm ONLY `BatchWorkspace.tsx` imports it; if other callers exist, update them first before deleting
- [x] **Grep for lock references:** run `grep -rn "textLayerLocks\|TextLayerLock" apps/ packages/` — every hit must be removed/updated in this phase (the list below is the known set; if grep surfaces a file not listed, e.g. `apps/web/src/hooks/use-zip-export.ts`, update it too and note it)
- [x] In `packages/projects/src/schema.ts`: remove the `textLayerLocks?` field from `BatchProject`; remove `newTextLayerLockDefault`, `migratedTextLayerLockDefault`, `migratedTextLayerLocks`
- [x] **Purity nit (carried from 1a review):** in `migrateToV4`, make the nested per-overlay copy fully immutable — copy the nested override object (`{ ...(itemTextValues[overlay.id] ?? {}) }` and same for styles) before assigning, so the input record's nested objects are never mutated in place (matches `migrateToV2`/`migrateToV3` immutability)
- [x] In `packages/projects/src/index.ts`: drop the re-exports of the removed helpers
- [x] In `packages/projects/src/zip-export.ts`: drop `textLayerLocks` from the exported record; update `packages/projects/__tests__/idb-adapter.test.ts` and `__tests__/zip-export.test.ts` fixtures/assertions accordingly
- [x] Update `workspace-sections.ts`: remove "text" entry from SECTIONS and VALID_SECTIONS
- [x] Update `use-batch-project.ts`: drop `textLayerLocks` state/setter/return; drop `setTextLayerLock`
- [x] Update `use-item-text.ts`: drop `isLocked`/`toggleLock`; simplify `getTextValue`/`getTextStyle` to always look up per-item map directly (no lock check); these are the existing `setItemTextValue`/`setItemTextStyle` partial-merge setters — do NOT replace them with new setters
- [x] Update `use-preview-editor-state.ts`: remove `textLayerLocks` param; apply overrides to ALL text nodes (no lock filter); verify hook signature change propagates cleanly to all call sites
- [x] Update `use-batch-render.ts`: remove `unlockedTextLayers` filter; iterate ALL text nodes; verify `isRunning` guard in `BatchWorkspace` (`state={batchRender.isRunning ? editorState.state : previewEditorState}`) is NOT touched — add a comment noting it is load-bearing if it isn't already commented
- [x] Delete `make-text-edit-handlers.ts` (only after grep confirms no other callers)
- [x] Update `BatchWorkspace.tsx`: remove `makeTextEditHandlers` call; wire `setItemTextValue`/`setItemTextStyle` directly — fan-out logic belongs in a small helper function or hook (e.g. `useFanOutTextHandlers`), NOT inline in the JSX render body; confirm `isRunning` swap line is character-for-character unchanged
- [x] Update `BatchRightPanel.tsx`: remove BulkTextPanel branch and import; remove lock prop threading
- [x] Delete `BulkTextPanel.tsx`
- [x] Run `pnpm tsc --noEmit`

**Tests:**
| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | All text nodes are patched per-item (no lock filter); previously-"locked" node now appears in output; `isRunning` guard: during render, hook reads `editorState.state` not `previewEditorState`; restore still runs in finally |
| modify | `apps/web/src/__tests__/use-preview-editor-state.test.ts` | With `textLayerLocks` param removed, ALL text nodes receive per-item overrides (add a test with a previously-locked node to confirm it is now always applied) |

**Verification:**
- [x] `pnpm test` passes across all packages (orchestrator-verified: projects 47/47, web 258/258)
- [x] `pnpm tsc --noEmit` passes (orchestrator-verified clean in packages/projects + apps/web)
- [x] Nav renders 3 sections (assets, template, results) — "Text" tab absent (covered by `workspace-side-nav.test.tsx`, updated to expect 3 tabs)
- [x] Template section: editing a text node writes to the active variant's `itemTextValues`/`itemTextStyles`, not to a shared template path (review-confirmed routing)
- [x] **isRunning invariant:** during Generate All the canvas consumes `editorState.state`, not `previewEditorState` — confirmed unchanged (`BatchWorkspace.tsx:369`)
- [ ] Generate All: produced images reflect per-variant text overrides; no node is silently skipped — _live-visual; consolidated into Phase 3 manual smoke_
- [ ] Switching active variant shows that variant's per-item text on canvas — _live-visual; consolidated into Phase 3 manual smoke_
- [ ] **App is fully functional at end of 1b** — _live-visual; consolidated into Phase 3 manual smoke_

**Phase review:**
- [x] All Steps and Verification checkboxes above ticked (live-visual smoke deferred to Phase 3)
- [x] Reviewer handoff prompt emitted
- [x] Orchestrator cleared context and pasted handoff prompt
- [x] Code-reviewer agent verified this phase
- [x] Reviewer-driven changes reflected back into plan (purity nit applied; unused-import nit noted, tsc clean)
- [x] Tests written and passing (or no-tests justification accepted)
- [x] Documentation updated (load-bearing isRunning comment added; KB sync is Phase 3)
- [ ] Orchestrator approved
- [x] Changes committed: `feat(batch): remove text-lock model end-to-end — drop Text section, BulkTextPanel, makeTextEditHandlers; all text layers per-variant`
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
- [x] Extract fan-out logic into a dedicated hook `useFanOutTextHandlers` in `apps/web/src/hooks/use-fan-out-text-handlers.ts` — accepts `selectedVariantIds: Set<string>`, `setItemTextValue`, `setItemTextStyle`; returns `handleSetItemTextValue(nodeId, value)` and `handleSetItemTextStyle(nodeId, style)`, each under 15 lines; do NOT inline this logic in `BatchWorkspace` JSX
- [x] In `BatchWorkspace.tsx`: add `selectedVariantIds: Set<string>` state, default `new Set(activeOverlayId ? [activeOverlayId] : [])`; on `activeOverlayId` change, reset selection to `new Set([newActiveId])`; use `useFanOutTextHandlers` hook for fan-out; on variant deletion, prune `selectedVariantIds` to only ids that still exist in overlays, then ensure `activeOverlayId` (new active) is in the set — reconciliation extracted to pure `reconcileVariantSelection` helper in `apps/web/src/lib/variant-selection.ts` (fix commit `d78f747`)
- [x] Update `VariantStrip.tsx`: accept `selectedIds` + `onSelectionChange`; on each thumbnail, render `<input type="checkbox" className="h-4 w-4 cursor-pointer rounded border-border accent-primary" checked={selectedIds.has(id)} disabled={id === activeId} onChange={...} />`; "Select all" control: `<input type="checkbox">` that is `checked={selectedIds.size === allIds.length}` and calls `onSelectionChange(new Set(allIds))` / `onSelectionChange(new Set([activeId]))` on toggle — when there is exactly 1 variant, "Select all" must appear checked (1 of 1)
- [x] Wire `onSelectionChange` in `BatchWorkspace`: always ensure `activeOverlayId` is present in incoming set before `setState` (enforces invariant regardless of what caller passes)
- [x] Pass fan-out handlers to `ItemTextPanel` in Template section — done via `fanOutItemText` (spreads `itemText`, overrides `setTextValue`/`setTextStyle`) passed as the existing `itemText` prop; `BatchRightPanel` forwards it unchanged, so no `BatchRightPanel` edit was needed (cleaner than planned)
- [x] Run `pnpm tsc --noEmit`

**Tests:**
| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/variant-strip-selection.test.ts` | Checkbox checked state; active always checked+disabled; select-all checked when all selected; select-all checked when only 1 variant exists; `onSelectionChange` called with correct set; active id always present in emitted set |
| create | `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` | `handleSetItemTextValue` calls `setItemTextValue` once per selected id (3 selected → 3 calls); `handleSetItemTextStyle` merges partial style without clobbering other fields on each variant; active always included; variant deleted from selection → only remaining ids called |

**Verification:**
- [x] `pnpm test` passes (orchestrator-verified: web 277/277, projects 47/47)
- [x] `pnpm tsc --noEmit` passes (orchestrator-verified clean both packages)
- [x] Active thumbnail checkbox is checked and disabled (covered by `variant-strip-selection.test.ts`)
- [x] Select all → all variants in set (covered by selection tests)
- [x] Exactly 1 variant: checkbox checked+disabled, "Select all" checked (tested)
- [x] Switching active variant resets selection to only the new active (fixed `d78f747`; `variant-selection.test.ts` asserts A→D ⇒ {D})
- [x] Delete a checked (non-active) variant: deleted id pruned from selection, remaining selection intact (`variant-selection.test.ts`)
- [ ] Check 3 variants, change only color: those 3 show new color; each keeps content — _live-visual; Phase 3 manual smoke_
- [ ] Generate All still produces correct per-variant output; isRunning invariant preserved — _live-visual; Phase 3 manual smoke (isRunning line confirmed unchanged in review)_

**Phase review:**
- [x] All Steps and Verification checkboxes above ticked (live-visual smoke deferred to Phase 3)
- [x] Reviewer handoff prompt emitted
- [x] Orchestrator cleared context and pasted handoff prompt
- [x] Code-reviewer agent verified this phase (RED → fixed `d78f747` → re-review green)
- [x] Reviewer-driven changes reflected back into plan (selection-reset bug fixed; BatchRightPanel non-change documented)
- [x] Tests written and passing (or no-tests justification accepted)
- [x] Documentation updated (JSDoc on `useFanOutTextHandlers` + `reconcileVariantSelection`)
- [ ] Orchestrator approved
- [x] Changes committed: `feat(batch): VariantStrip multi-select — fan-out text/style edits across selected variants` (+ fix `d78f747`)
- [ ] Phase marked complete

---

### Phase 4: Per-variant text-node hiding (added during verification)

**Risk:** medium
**Mode:** afk
**Type:** frontend
**Success criteria:** Deleting a text layer (trash button) while one or more variants are selected HIDES that layer only for the selected variant(s) — other variants keep it. Hidden layers are excluded from the canvas preview AND from Generate All output for the variants they're hidden in. A show/hide (eye) toggle in the "Variant text" panel lets the user restore a hidden layer per active variant. Node existence stays in the shared template; only per-variant visibility changes. Images unaffected.
**Commit message:** `feat(batch): per-variant text-layer hiding — delete hides for selected variants, eye toggle restores`

**Design:**
- New per-variant store `itemHiddenNodeIds: Record<string, string[]>` (overlayId → hidden nodeIds), added as an OPTIONAL field on `BatchProject` (no SCHEMA_VERSION bump / no migration — absence means "nothing hidden"; default `?? {}` / `?? []` at read sites). Justification: purely additive, backward-compatible; avoids the version-assertion ripple a bump causes.
- Visibility is fanned across `selectedVariantIds` exactly like text value/style (reuse the fan-out pattern; ignore the passed overlay id, iterate selected).

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `packages/projects/src/schema.ts` | Add optional `itemHiddenNodeIds?: Record<string, string[]>` to `BatchProject` (no version bump) |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Add `itemHiddenNodeIds` state + `setItemNodeHidden(overlayId, nodeId, hidden)` setter (toggle a nodeId in the overlay's array, partial-merge like the other per-item setters); include `itemHiddenNodeIds` in the persisted record; default `{}` on load |
| modify | `apps/web/src/hooks/use-item-text.ts` | Add `isNodeHidden(overlayAssetId, nodeId): boolean` and `setNodeHidden(overlayAssetId, nodeId, hidden)` accessors (read/write the hidden store) |
| modify | `apps/web/src/hooks/use-fan-out-text-handlers.ts` | Add `handleSetNodeHidden(_overlayId, nodeId, hidden)` that iterates `selectedVariantIds` calling `setNodeHidden(id, nodeId, hidden)` |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Wire `setNodeHidden` into the fan-out (`fanOutItemText.setNodeHidden = fanOut.handleSetNodeHidden`); pass `itemHiddenNodeIds` to `usePreviewEditorState` and `useBatchRender` |
| modify | `apps/web/src/hooks/use-preview-editor-state.ts` | Accept `itemHiddenNodeIds`; filter out nodes hidden for `activeOverlayId` from the rendered node list |
| modify | `apps/web/src/hooks/use-batch-render.ts` | For each overlay, filter out that overlay's hidden nodes before rendering its frame |
| modify | `apps/web/src/components/batch/BatchRightPanel.tsx` | `TextStylePanel.onDelete`: when `activeOverlay` exists → `itemText.setNodeHidden(activeOverlay.id, nodeId, true)` (fan-out hide across selected) + deselect; else fall back to `editorState.removeNode`. In `ItemTextPanel`, add a per-node show/hide (eye) toggle reflecting `itemText.isNodeHidden(activeOverlay.id, nodeId)` for restore |

**Steps:**
- [x] schema.ts: add optional `itemHiddenNodeIds?: Record<string, string[]>`
- [x] use-batch-project.ts: state + `setItemNodeHidden` (toggle nodeId in `itemHiddenNodeIds[overlayId]`, immutable partial-merge, idempotent); include in persisted record; default `{}`
- [x] use-item-text.ts: `isNodeHidden` / `setNodeHidden`
- [x] use-fan-out-text-handlers.ts: `handleSetNodeHidden` fanning across `selectedVariantIds`
- [x] BatchWorkspace.tsx: add `setNodeHidden` to `fanOutItemText`; thread `itemHiddenNodeIds` into preview + render hooks; `isRunning` line untouched
- [x] use-preview-editor-state.ts: filter hidden nodes for active overlay
- [x] use-batch-render.ts: filter hidden nodes per overlay (hidden → opacity 0; restore resets via templateStyle)
- [x] BatchRightPanel.tsx: rewire `TextStylePanel.onDelete` to fan-out hide (fallback removeNode when no overlay); add eye toggle in `ItemTextPanel`
- [x] Run `pnpm tsc --noEmit`

**Tests:**
| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/item-node-hidden.test.ts` | `setItemNodeHidden` toggles per overlay without clobbering other overlays/nodes; fan-out `handleSetNodeHidden` hides across all selected ids; `isNodeHidden` reads correctly |
| modify | `apps/web/src/__tests__/hooks/use-preview-editor-state.test.ts` | A node hidden for the active overlay is excluded from the preview node list; non-hidden nodes remain |
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | A node hidden for overlay X is absent from X's rendered frame but present in overlay Y's frame |

**Verification:**
- [x] `pnpm test` + `pnpm tsc --noEmit` pass (orchestrator-verified: web 305/305, projects 47/47, tsc clean both)
- [x] Old project (no `itemHiddenNodeIds`) loads fine — nothing hidden (covered by tests)
- [x] isRunning invariant preserved; images unaffected (review-confirmed)
- [ ] Select 1 variant, delete a text layer → hidden only on that variant; other variants still show it — _live-visual; user smoke_
- [ ] Multi-select → delete → hidden on all selected (+active) — _live-visual; user smoke_
- [ ] Eye toggle restores a hidden layer for the active variant — _live-visual; user smoke_
- [ ] Generate All: hidden layers absent from their variants' output, present elsewhere — _live-visual; user smoke_

**Phase review:**
- [x] Code-reviewer verified (green; one cosmetic nit only)
- [x] Tests passing
- [ ] Orchestrator approved
- [x] Changes committed: `46164e9`
- [ ] Phase marked complete

---

### Phase 3: Final Verification

**Risk:** low
**Mode:** hil
**Type:** mixed
**Success criteria:** The "Text" nav section is gone. All text editing happens via the Template section (targeting selected variants). VariantStrip checkboxes let users fan edits across multiple variants. Existing projects (v3) load correctly with locks migrated into per-variant overrides. Generate All produces correct output. No TypeScript errors. KB updated.
**Commit message:** n/a — no new code changes; KB updates committed separately if needed

**Verification findings (fixed during manual smoke):**
- **Text-style edits were global (fixed `80c1625`).** Manual smoke A surfaced that text STYLE edits (color/font/size/shadow) applied to all variants: `TextStylePanel.onChange` was wired to `editorState.updateTextNode` (shared template). Phase 1b had rerouted text CONTENT to the per-item fan-out but missed style. Fix: route text-style edits through `itemText.setTextStyle` (fan-out across `selectedVariantIds`) and read the active variant's effective style (`{...baseNode, ...getTextStyle(activeOverlay.id, nodeId)}`) for the panel controls; fallback to template only when no overlays exist. Reviewed green. `TextStyle` already covered all fields — no schema change.
- **Images remain shared by design.** Only text is per-variant; per-variant image overrides were explicitly out of scope (deferred as a possible future feature).

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
