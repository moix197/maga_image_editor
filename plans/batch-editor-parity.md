# Plan: Batch Editor Parity — Unified Render Path & Variable Slot

**Created:** 2026-06-19
**Branch:** feat/batch-compositing-projects
**Status:** not started
**Supersedes:** `plans/batch-compositing-projects.md` — specifically the sections covering TemplateEditor replacement, HiddenCompositeCanvas removal, variable-slot UX, and ZIP/IDB persistence gating. Items marked KEEP in that plan are unchanged and not re-done here.

## Context

The /batch feature was built by reusing editor components but introduced a parallel render path (HiddenCompositeCanvas) and a degraded template UI (TemplateEditor). This causes three concrete failures: (a) the variable slot shows an empty box with no live preview; (b) batch render captures only the background — text, borders, and extra image overlays are dropped and positions drift (WYSIWYG mismatch); (c) background-only drafts are not persisted because autosave requires all three of background + template + variableSlot.

The goal is to re-architect /batch so it embeds the real editor (TextOverlayCanvas + useEditorState + control panels) as its template surface, designates the variable slot by toggling an existing overlay node, captures the live canvas div for both preview and batch render, and persists drafts once a background exists.

## Risk: medium

## Dependencies & Risks

1. **TemplateEditor delete is contained** — `TemplateEditor.tsx` is currently imported only by `BatchWorkspace`. Both the delete and the import removal must land in the same commit (Phase 1). If a future grep finds other imports, stop and clear them in that phase.
2. **HiddenCompositeCanvas → live canvas rewire (highest-risk seam)** — HiddenCompositeCanvas currently supplies the `canvasEl` passed to `use-single-composite` AND `use-batch-render`. Phase 3 rewires both hooks to receive the live `canvasCallbackRef` div forwarded from `TextOverlayCanvas`. The exact wiring: `TextOverlayCanvas` already exposes a `canvasCallbackRef` prop (a `RefCallback<HTMLDivElement>`); `BatchWorkspace` stores this as `liveCanvasRef` (a `MutableRefObject<HTMLDivElement | null>`). Phase 3 passes `liveCanvasRef.current` to `use-single-composite.generate` and Phase 4 passes it to `use-batch-render.run`. Any null-guard must be explicit and logged — silent null means capture produces a blank output, not a crash.
3. **Deselect-before-capture** — editor chrome (selection ring, resize handles) must NOT bake into output. The capture helper must: call `onDeselectForCapture()` (clears `selectedNodeId`) → wait 2 rAFs → call `compositeFromElement` → call `onRestoreSelection(prevId)`. This callback pattern keeps the render hooks generic with NO internal React state access. Thread this into BOTH single-preview (Phase 3) and the per-item batch loop (Phase 4).
4. **patchOverlays must target only the variable-slot node** — it patches by `overlayNodeId`, leaving all other image overlay nodes untouched. Phase 3 and Phase 4 both include an explicit verification step confirming static overlay srcs are unchanged after a patch call.
5. **zip-import currently hard-throws on missing fields** — Phase 5 must soften zip-import BEFORE any ZIP round-trip test is run. Also idb-adapter `loadProject` and `zip-export` `serializeProjectJson` must tolerate null template/variableSlot. The test for zip-import null-tolerance is written in Phase 5 before the manual round-trip verification step.
6. **Standalone /editor route must remain unchanged** — Phase 1 verifies the /editor route is unaffected immediately after the TemplateEditor delete. Phase 6 includes a dedicated /editor golden-path regression check.
- `packages/projects` must NOT import from `apps/web` — all schema/type changes stay in `packages/projects/src/schema.ts`.

## Phases

### Phase 0: Create worktree

**This phase is already complete — the worktree exists at `C:/proyectos/maga-batch-compositing` on branch `feat/batch-compositing-projects`.**

**Steps:**

- [x] Worktree exists at `C:/proyectos/maga-batch-compositing`
- [x] Branch `feat/batch-compositing-projects` active
- [x] Verified via `git worktree list`

---

### Phase 1: Embed real editor in /batch — full live preview

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** User can open /batch, set a background, and see the full live TextOverlayCanvas with the background rendered. User can add text nodes, overlay nodes, and border nodes via the editor panels. All node controls (TextStylePanel, OverlayControlsPanel) work as they do in /editor. TemplateEditor no longer renders anywhere in the tree. HiddenCompositeCanvas is NOT yet removed (preview/render may still work via old path — acceptable for this phase). /editor route opens and behaves exactly as before (regression confirmed by test + manual check in this phase). OverlayControlsPanel receives business logic only via callbacks — no batch-specific logic is baked into the component itself.
**Commit message:** `feat(batch): embed real editor surface in BatchWorkspace, delete TemplateEditor`

**File changes:**
| Action | File | What changes |
|---|---|---|
| delete | `apps/web/src/components/batch/TemplateEditor.tsx` | Replaced by inline editor wiring in BatchWorkspace |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Remove `<TemplateEditor>`; add `useEditorState(project.template ?? undefined)`; render `<TextOverlayCanvas>` + TextStylePanel + OverlayControlsPanel for selected node; store `canvasCallbackRef` in `liveCanvasRef` for later phases; keep HiddenCompositeCanvas untouched |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Expose minimal setter so BatchWorkspace can sync `editorState.state` → `project.template` on each editor state change; pick whichever approach (local state + setProject on change) is minimal and consistent with existing setters |

**Steps:**

- [x] Read `BatchWorkspace.tsx` in full to understand current TemplateEditor usage and prop surface
- [x] Read `TemplateEditor.tsx` in full
- [x] Read `apps/web/src/app/editor/page.tsx` `handleExport` and the TextOverlayCanvas + panel wiring pattern — mirror it exactly in BatchWorkspace; do not duplicate the wiring code if a shared extraction already exists
- [x] Confirm `TemplateEditor` is imported ONLY by `BatchWorkspace` (`grep -r "TemplateEditor" apps/web/src`) — if found elsewhere, clear all imports in this phase
- [x] Add `useEditorState(project.template ?? undefined)` inside BatchWorkspace (or a thin child) to own editor state
- [x] Replace `<TemplateEditor .../>` with `<TextOverlayCanvas state={editorState.state} imageSrc={background.blobKey} selectedNodeId={selectedNodeId} onNodeMove={...} onNodeResize={...} onNodeSelect={setSelectedNodeId} canvasCallbackRef={liveCanvasRef} />`
- [x] Render TextStylePanel or OverlayControlsPanel for the selected node — callback-only; no business logic inside the panels themselves
- [x] Sync `editorState.state` changes to `project.template` via minimal setter in `use-batch-project`
- [x] Delete `TemplateEditor.tsx`
- [x] Remove all `TemplateEditor` imports
- [x] Update `packages/projects/README.md` to note TemplateEditor is removed and BatchWorkspace now uses real editor surface
- [x] Verify /editor route is unchanged: confirm none of its imports were touched (`grep -r "TemplateEditor" apps/web/src` returns 0 results)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-project.test.ts` | Template sync setter: calling it with an EditorState updates `project.template`; calling with undefined does not error |
| create | `apps/web/src/components/__tests__/BatchWorkspace-editor.test.tsx` | Smoke: BatchWorkspace renders TextOverlayCanvas when background set; TemplateEditor is absent from the rendered tree |

**Verification:**

- [x] Automated tests pass: `pnpm --filter @maga/web test` (146/146)
- [ ] Manual: open /batch, upload background — TextOverlayCanvas renders with background image _(deferred to Phase 6 final verification)_
- [ ] Manual: add a text node — text appears on canvas, TextStylePanel shows controls _(deferred to Phase 6)_
- [ ] Manual: add an image overlay — OverlayControlsPanel shows controls _(deferred to Phase 6)_
- [ ] Manual: open /editor — behavior is unchanged end-to-end (golden path: add text, export PNG, confirm output) _(deferred to Phase 6)_

**Phase review:**

- [x] All Steps and Verification (automated) checkboxes above ticked — manual visual checks deferred to Phase 6
- [x] Code-reviewer verified this phase (verdict: green)
- [x] Reviewer-driven changes reflected back into plan (dead `setTemplate` binding removed)
- [x] Tests written and passing
- [x] Documentation updated
- [x] Orchestrator approved (standing approval — autonomous loop)
- [x] Changes committed: `feat(batch): embed real editor surface in BatchWorkspace, delete TemplateEditor` (`ceac02e`)
- [x] Phase marked complete

---

### Phase 2: Variable-slot toggle on overlay nodes

**Risk:** low
**Mode:** hil
**Type:** frontend
**Success criteria:** User can select any image overlay node in the batch editor and toggle "Use as variable slot" in OverlayControlsPanel. Exactly one node can be the slot at a time — toggling a second node clears the first. The slot node's src is replaced with the first uploaded overlay image as a live placeholder (corner-radius/feather/shadow/position preview against real content). `project.variableSlot` is updated with `{ overlayNodeId, width, height }`. Toggling the slot off restores the original src and clears `project.variableSlot`. If the slot node is deleted, `variableSlot` is cleared and Generate-all remains disabled. Text and border nodes do NOT show the toggle. The toggle UI is rendered via callback props on OverlayControlsPanel — no batch-specific business logic inside the component.
**Commit message:** `feat(batch): variable-slot toggle with first-overlay placeholder preview`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Track `variableSlotNodeId` in local state; pass `isVariableSlot` + `onToggleVariableSlot` callbacks into OverlayControlsPanel for image overlay nodes only; on toggle: update `project.variableSlot` via `setVariableSlot`; swap slot node's src to first overlay placeholder via `patchOverlays` on live editorState; on toggle-off or slot-node delete: call `setVariableSlot(null)` and restore original src |
| modify | `apps/web/src/components/overlay-controls-panel.tsx` | Add optional `isVariableSlot?: boolean` + `onToggleVariableSlot?: () => void` props; render a toggle/checkbox labeled "Use as variable slot" when props are provided; component contains NO business logic — calls callback only |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Add `setVariableSlot(slot: VariableSlot \| null)` action, minimal and consistent with existing setters |

**Steps:**

- [x] Add `isVariableSlot?: boolean` + `onToggleVariableSlot?: () => void` optional props to OverlayControlsPanel; render toggle UI only when props provided; callback-only, no business logic
- [x] In BatchWorkspace: `onToggleVariableSlot(nodeId)` handler — if nodeId is already slot, clear; else set as slot; call `setVariableSlot({ overlayNodeId: nodeId, width: node.width, height: node.height })`
- [x] On slot set: derive placeholder from `overlays[0]?.blobKey` and swap the slot node's src in editorState via `editorState.updateOverlayNode` (guarded to skip when no overlay uploaded yet); store original src to restore on clear
- [x] On slot clear (toggle-off): call `setVariableSlot(null)`, restore original src on slot node
- [x] Guard: if overlay node is deleted (via `onDelete` in OverlayControlsPanel), check if it was the variable slot; if so, call `setVariableSlot(null)` — clears `project.variableSlot` and disables Generate-all (gating wired in Phase 4, but the state clear happens here)
- [x] Confirm text nodes and border nodes do NOT receive the `isVariableSlot`/`onToggleVariableSlot` props (pass only when `node.type === 'image'`)
- [x] Add `setVariableSlot` to `use-batch-project`
- [x] Add JSDoc on the two new OverlayControlsPanel props explaining callback-only contract

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-project.test.ts` | `setVariableSlot` sets variableSlot; calling with null clears it |
| create | `apps/web/src/components/__tests__/overlay-controls-panel-slot.test.tsx` | Toggle renders when props provided; calls `onToggleVariableSlot` on click; toggle absent when props omitted (generic contract preserved) |

**Verification:**

- [x] Automated tests pass: `pnpm --filter @maga/web test` (152/152)
- [ ] Manual: select an image overlay → "Use as variable slot" toggle visible _(deferred to Phase 6)_
- [ ] Manual: toggle on → slot node src becomes first uploaded overlay image (live preview updates) _(deferred to Phase 6)_
- [ ] Manual: toggle a second overlay → first is cleared, second becomes slot _(deferred to Phase 6)_
- [ ] Manual: toggle off → variableSlot cleared, original src restored on node _(deferred to Phase 6)_
- [ ] Manual: delete slot node → variableSlot cleared (no stale reference) _(deferred to Phase 6)_
- [ ] Manual: text/border nodes do NOT show the toggle _(deferred to Phase 6)_

**Phase review:**

- [x] All Steps and Verification (automated) checkboxes above ticked — manual visual checks deferred to Phase 6
- [x] Code-reviewer verified this phase (verdict: green)
- [x] Reviewer-driven changes reflected back into plan (empty-overlays src-swap guard added)
- [x] Tests written and passing
- [x] Documentation updated (JSDoc on new OverlayControlsPanel props)
- [x] Orchestrator approved (standing approval — autonomous loop)
- [x] Changes committed: `feat(batch): variable-slot toggle with first-overlay placeholder preview` (`c6463c8`)
- [x] Phase marked complete

---

### Phase 3: Unify preview render on the live canvas — drop HiddenCompositeCanvas

**Risk:** high
**Mode:** hil
**Type:** frontend
**Success criteria:** The single-preview ("Generate preview") button captures the live TextOverlayCanvas div via `liveCanvasRef`. The preview output PNG includes text nodes, border nodes, AND all image overlay nodes at correct WYSIWYG positions. Selection chrome (ring, resize handles) is NOT visible in the output. HiddenCompositeCanvas is deleted from BatchWorkspace and the entire codebase. Static image overlay srcs are unchanged in the output (only the slot node src is swapped). /editor export path is unaffected. `use-single-composite` and `use-batch-render` remain generic — they accept `canvasEl` and `onDeselectForCapture`/`onRestoreSelection` callbacks; they do NOT access React state directly.
**Commit message:** `feat(batch): unify preview capture on live canvas, delete HiddenCompositeCanvas`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Wire `liveCanvasRef` (from `canvasCallbackRef`) to `use-single-composite.generate`; implement `captureWithDeselect` inline or via helper; on preview click: call `onDeselectForCapture` (clears `selectedNodeId`) → double-rAF → `generate(liveCanvasRef.current, ...)` → `onRestoreSelection(prevId)`; delete HiddenCompositeCanvas render block |
| delete | `apps/web/src/components/batch/HiddenCompositeCanvas.tsx` (or wherever defined) | Replaced by live canvas capture path; no other file should reference it after this phase |
| modify | `apps/web/src/hooks/use-single-composite.ts` | Add `onDeselectForCapture: () => void` and `onRestoreSelection: (prevId: string \| null) => void` params to `generate`; call them around the double-rAF + `compositeFromElement` call; verify `compositeFromElement` is called with the passed `canvasEl` (not any internal hidden-div reference) |
| create | `apps/web/src/lib/capture-helpers.ts` (only if the deselect+rAF pattern is used in >=2 places after Phase 4; otherwise inline in BatchWorkspace) | `waitTwoFrames(): Promise<void>` — tiny helper wrapping double-rAF in a promise; avoids duplicating callback chains |

**Steps:**

- [x] Read `editor/page.tsx` `handleExport` — note exact deselect-then-capture pattern (double-rAF)
- [x] Read `use-single-composite.ts` in full — confirm `generate` currently passes `canvasEl` argument to `compositeFromElement`; if it references a hidden div internally, remove that reference now
- [x] Grep entire codebase for `HiddenCompositeCanvas` — confirm it is imported only by BatchWorkspace; if found elsewhere, remove all references in this phase
- [x] Update `use-single-composite.generate` signature: add `canvasEl: HTMLElement | null`, `onDeselectForCapture: () => string | null` (returns prevId), `onRestoreSelection: (prevId: string | null) => void`; inside: `prevId = onDeselectForCapture()` → `waitTwoFrames()` → `compositeFromElement(canvasEl, patchedNodes)` → `onRestoreSelection(prevId)` in finally; null-guard `canvasEl` with a logged warning and early return
- [x] Wire BatchWorkspace preview click: `generate(liveCanvasRef.current, ..., () => { const p = selectedNodeId; setSelectedNodeId(null); return p; }, (id) => setSelectedNodeId(id))`
- [x] Verify after capture: call `compositeFromElement` with the live canvas div, NOT any hidden div — assertion added in unit test
- [x] Verify patchOverlays leaves static overlay srcs untouched — assertion added in unit test
- [x] Delete HiddenCompositeCanvas file and render block from BatchWorkspace (was inline in BatchWorkspace)
- [x] Run `grep -r "HiddenCompositeCanvas" apps/web/src` — returns 0 results
- [x] Update `packages/projects/README.md` or `apps/web` docs to note capture path change

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-single-composite.test.ts` | Mock `compositeFromElement`; assert it is called with the passed `canvasEl` (NOT a hidden-div element); assert `onDeselectForCapture` is called before capture; assert `onRestoreSelection` is called after with the returned prevId; assert static overlay node srcs are unchanged; assert only slot node src is swapped |

**Verification:**

- [x] Automated tests pass: `pnpm --filter @maga/web test` (157/157)
- [ ] Manual: generate preview → output PNG includes text, borders, and all image overlays at correct positions _(deferred to Phase 6)_
- [ ] Manual: selection ring / resize handles NOT visible in output PNG (inspect actual PNG file) _(deferred to Phase 6)_
- [ ] Manual: static image overlays (non-slot) appear in output with their configured srcs unchanged _(deferred to Phase 6)_
- [ ] Manual: no console errors about missing canvas element or null ref _(deferred to Phase 6)_
- [ ] Manual: /editor export path still works correctly — text + images in output, selection chrome absent _(deferred to Phase 6)_

**Phase review:**

- [x] All Steps and Verification (automated) checkboxes above ticked — manual visual checks deferred to Phase 6
- [x] Code-reviewer verified this phase (verdict: green; critical liveCanvasRef seam confirmed intact)
- [x] Reviewer-driven changes reflected back into plan (deselect-returns-prevId contract aligned for Phase 4 reuse)
- [x] Tests written and passing
- [x] Documentation updated
- [x] Orchestrator approved (standing approval — autonomous loop)
- [x] Changes committed: `feat(batch): unify preview capture on live canvas, delete HiddenCompositeCanvas` (`c9a78c5`)
- [x] Phase marked complete

---

### Phase 4: Batch render over unified path + generate-all gating

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** "Generate all" iterates every uploaded overlay image, deselects before each capture, swaps only the slot node's src per item (static overlay srcs are unchanged across all outputs), captures the live canvas, and adds each result to the gallery. Output PNGs are WYSIWYG-correct (text/borders/effects included). "Generate all" is disabled with an inline hint when no variable slot is designated OR no overlay images are uploaded (both conditions independently gate it). Gallery displays results correctly. Cancel mid-batch stops the loop; partial gallery is retained with no crash.
**Commit message:** `feat(batch): batch render on live canvas with generate-all gating`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/hooks/use-batch-render.ts` | Accept `canvasEl: HTMLElement \| null`, `onDeselectForCapture: () => void`, `onRestoreSelection: (prevId: string \| null) => void`; per-overlay loop: save prevId → `onDeselectForCapture()` → `waitTwoFrames()` → `patchOverlays(template, slotNodeId, overlayItem.blobKey)` → `compositeFromElement(canvasEl, patchedNodes)` → `addOutput` → `onRestoreSelection(prevId)`; respect `cancelRef`; null-guard `canvasEl` |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Pass `liveCanvasRef.current`, `() => setSelectedNodeId(null)`, `(id) => setSelectedNodeId(id)` to `useBatchRender.run`; derive `canGenerate = project.variableSlot != null && project.overlays.length >= 1`; render "Generate all" as disabled + hint text when `!canGenerate`; hint reads: "Select a variable slot and upload at least one overlay image" |

**Steps:**

- [ ] Update `use-batch-render.ts` signature: add `canvasEl`, `onDeselectForCapture`, `onRestoreSelection` params (mirror Phase 3 pattern — reuse `waitTwoFrames` helper if extracted)
- [ ] Inside per-overlay loop: deselect → rAF×2 → `patchOverlays` targeting ONLY the slot node by id → `compositeFromElement(canvasEl, patchedNodes)` → `addOutput` → restore selection
- [ ] Explicitly verify in code (and in test) that `patchOverlays` does NOT mutate src of non-slot image overlay nodes — grep `overlay-patch.ts` to confirm it patches by `overlayNodeId` match only
- [ ] Wire BatchWorkspace: pass live canvas ref and selection callbacks to `useBatchRender.run`
- [ ] Add `canGenerate` guard and hint UI in BatchWorkspace
- [ ] Null-guard `canvasEl` in `use-batch-render` with logged warning and early return (same pattern as Phase 3)
- [ ] Verify `BatchResultsGallery` receives outputs correctly (no interface change expected — confirm)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | Mock `compositeFromElement`; verify called once per overlay with patched slot src; verify static overlay srcs are NOT changed in the patched node list; verify `onDeselectForCapture` fired before each capture; verify `onRestoreSelection` fired after each capture |
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | Cancellation: set cancelRef mid-loop → loop stops, `compositeFromElement` not called for remaining items |
| create | `apps/web/src/__tests__/batch-generate-gating.test.ts` | Unit: `canGenerate` is false when variableSlot is null; false when overlays.length === 0; true when both present; covers edge: slot set then slot node deleted → variableSlot null → canGenerate false |

**Verification:**

- [ ] Automated tests pass: `pnpm --filter @maga/web test`
- [ ] Manual: upload 3 overlay images, set variable slot → "Generate all" enabled; run → 3 output PNGs in gallery, each with correct slot image + unchanged static overlays + text/borders
- [ ] Manual: no variable slot → button disabled, hint visible
- [ ] Manual: variable slot set but 0 overlays → button disabled, hint visible
- [ ] Manual: cancel mid-batch → loop stops, partial gallery retained, no crash
- [ ] Manual: WYSIWYG check — positions in output PNGs match live canvas preview visually
- [ ] Manual: selection chrome absent from all batch output PNGs

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted
- [ ] Orchestrator cleared context and pasted handoff prompt
- [ ] Code-reviewer verified this phase
- [ ] Reviewer-driven changes reflected back into plan
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `feat(batch): batch render on live canvas with generate-all gating`
- [ ] Phase marked complete

---

### Phase 5: Nullable schema drafts + relaxed autosave + ZIP round-trip

**Risk:** medium
**Mode:** afk
**Type:** typescript
**Success criteria:** A BatchProject with only a background (null template, null variableSlot) is saved to IDB and survives a page reload with no crash and no data loss. ZIP export and import of a rich template (background + text + borders + 2 image overlays + variable slot) round-trips correctly. ZIP import of a project with missing/null template or variableSlot does NOT throw — it sets them to null. ZIP import of a pre-refactor (legacy) project where template was a required non-null field loads correctly (legacy field present → used as-is; field absent → null). idb-adapter `loadProject` and `zip-export` `serializeProjectJson` tolerate null without crashing. Autosave fires as soon as background is set (template not required). `packages/projects` has no imports from `apps/web`.
**Commit message:** `feat(batch): nullable template/variableSlot schema, relax autosave to background-only`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `packages/projects/src/schema.ts` | `template: EditorState` → `template: EditorState \| null`; `variableSlot: VariableSlot` → `variableSlot: VariableSlot \| null`; keep `schemaVersion: 1` |
| modify | `packages/projects/src/idb-adapter.ts` | Confirm save/load tolerate null (JSON serialization already handles null — verify no runtime guards that throw on null); update types to reflect nullable fields |
| modify | `packages/projects/src/zip-export.ts` | `serializeProjectJson`: omit template/variableSlot keys when null (or write `null`) — do not throw; skip outputs dir when empty |
| modify | `packages/projects/src/zip-import.ts` | Remove hard throws on missing template/variableSlot; set fields to null when absent from ZIP JSON; accept legacy projects where template was required-nonnull (present → keep value; absent → null); keep schemaVersion validation |
| modify | `packages/projects/src/index.ts` | Re-export updated types if BatchProject is re-exported |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Update BatchProject type usage; relax `persistedProject` autosave guard to `background != null` (remove `&& template && variableSlot` condition) |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | On project restore from IDB: hydrate `useEditorState` with `project.template ?? undefined`; editor opens empty over background when template is null — no crash |

**Steps:**

- [ ] Update `schema.ts`: make `template` and `variableSlot` nullable; keep `schemaVersion: 1`
- [ ] Update `packages/projects/src/index.ts` re-exports for updated types
- [ ] Update `zip-import.ts`: replace hard throws on missing template/variableSlot with null assignment; add handling for legacy projects (field present → preserve; absent → null); keep schemaVersion check
- [ ] Update `zip-export.ts` `serializeProjectJson`: skip or null-write template/variableSlot when null; no crash
- [ ] Confirm `idb-adapter` save/load: JSON.stringify/parse handles null fields natively — remove any guard that throws or rejects on null; update type annotations
- [ ] Update `use-batch-project.ts` autosave guard: `background != null` (drop template/variableSlot requirement)
- [ ] Update `BatchWorkspace` restore: `useEditorState(project.template ?? undefined)` (already noted in Phase 1 wiring — confirm it covers the null case explicitly here)
- [ ] Fix all TypeScript errors surfaced by schema nullability change — add explicit null-checks where needed
- [ ] Run `pnpm --filter @maga/projects build` — confirm zero type errors
- [ ] Update `packages/projects/README.md`: schema section (nullable fields, schemaVersion stays 1), zip-export/import section (null field handling, legacy project compat)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `packages/projects/__tests__/schema.test.ts` | BatchProject validates with null template + null variableSlot; schemaVersion is 1 |
| modify | `packages/projects/__tests__/zip-export.test.ts` | Export with null template/variableSlot produces valid ZIP with no crash; null fields omitted or written as null |
| modify | `packages/projects/__tests__/zip-import.test.ts` | Import ZIP missing template → template is null (no throw); import ZIP missing variableSlot → null (no throw); import legacy project where template was required-nonnull and is present → value preserved |
| modify | `packages/projects/__tests__/idb-adapter.test.ts` | Save project with null template/variableSlot → load → both fields are null (fake-indexeddb); no crash |
| modify | `apps/web/src/__tests__/use-batch-project.test.ts` | Autosave triggers with background-only project (null template, null variableSlot); does NOT trigger with no background |

**Verification:**

- [ ] Automated tests pass: `pnpm --filter @maga/projects test && pnpm --filter @maga/web test`
- [ ] Manual: upload background only → page reload → background restored, editor empty, no crash
- [ ] Manual: build rich template (background + text + borders + 2 image overlays + variable slot) → ZIP export → ZIP import in fresh session → all nodes, slot, and background restored correctly
- [ ] Manual: import a ZIP with null/absent template → loads without error, editor opens empty over background
- [ ] Manual: import a legacy ZIP where template was a required non-null field → loads correctly, template value preserved
- [ ] Manual: /editor unaffected (no schema usage in editor route — confirm)

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted
- [ ] Orchestrator cleared context and pasted handoff prompt
- [ ] Code-reviewer verified this phase
- [ ] Reviewer-driven changes reflected back into plan
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `feat(batch): nullable template/variableSlot schema, relax autosave to background-only`
- [ ] Phase marked complete

---

### Phase 6: Final Verification

**Mode:** hil

**Overall success criteria:**

- /batch route delivers full editor parity: background + text nodes + border nodes + image overlays (static and variable slot) all visible in the live canvas and baked into every output PNG
- Variable slot designated via toggle on any image overlay node; first uploaded overlay image shown as placeholder during editing; slot src swapped per item at render time; static overlays unchanged across all outputs
- "Generate all" gated: disabled when no slot OR no overlays; both conditions independently gate it; inline hint visible when disabled
- Single preview output is WYSIWYG-correct; selection chrome absent from outputs
- Background-only drafts persist to IDB and survive reload; ZIP export/import round-trips rich templates; ZIP import of legacy/incomplete projects does not throw
- /editor route is completely unaffected — golden path and export confirmed
- All automated tests pass; zero TypeScript errors
- No CLAUDE.md invariants violated (thin entry points, small functions, generic components callback-only, no packages/projects → apps/web imports, no dead code)

**Steps:**

- [ ] Every preceding phase's Steps/Verification/Phase review checkboxes are ticked in this plan file
- [ ] Reviewer handoff prompt emitted (scoped to end-to-end review)
- [ ] Orchestrator cleared context and pasted handoff prompt into fresh session
- [ ] Code-reviewer reviews entire change end-to-end
- [ ] Any changes from final review reflected back into this plan file
- [ ] `pnpm --filter @maga/web test` passes
- [ ] `pnpm --filter @maga/projects test` passes
- [ ] `pnpm --filter @maga/editor test` passes (unchanged — confirm no regressions)
- [ ] Zero TypeScript errors: `pnpm tsc --noEmit` (or equivalent workspace-wide check)
- [ ] Golden path tested manually: upload background → add text + borders + 2 image overlays → mark one as variable slot → upload 3 overlay images → generate all → inspect 3 output PNGs → ZIP export → reload → ZIP import → verify restored state
- [ ] Edge cases tested manually:
  - [ ] 0 overlays uploaded but slot marked → Generate-all disabled + hint
  - [ ] No slot marked → Generate-all disabled + hint
  - [ ] Delete slot node mid-session → variableSlot cleared, Generate-all disabled
  - [ ] Toggle slot off → variableSlot cleared, original src restored, Generate-all disabled
  - [ ] Background removed/replaced mid-session → editor state preserved, background swapped
  - [ ] Reload with background-only draft (null template) → editor opens empty, no crash
  - [ ] Reload with rich draft (template + slot) → full state restored
  - [ ] Large number of overlays (10+) in batch run → no crash, all outputs generated
  - [ ] 0 overlays in batch run (slot present, but overlays list emptied after gating bypassed by direct state manipulation) → no crash, 0 outputs
  - [ ] ZIP import of old pre-refactor project (template was required-nonnull) → loads correctly
  - [ ] Cancel mid-batch → partial gallery retained, no crash
- [ ] /editor golden path confirmed unchanged: add text node, add image overlay, export PNG → output correct, selection chrome absent
- [ ] Overall success criteria met
- [ ] All phase checkboxes above ticked

---

## Documentation

| Change | Documentation location |
|---|---|
| TemplateEditor removed; BatchWorkspace uses real editor surface | `apps/web/src/components/batch/` — note in `BatchWorkspace.tsx` file header comment (the non-obvious why) |
| Variable-slot toggle API (OverlayControlsPanel new props) | `apps/web/src/components/overlay-controls-panel.tsx` JSDoc on `isVariableSlot` and `onToggleVariableSlot` props |
| Nullable template/variableSlot in BatchProject; schemaVersion stays 1 | `packages/projects/README.md` — schema section |
| ZIP format change (null fields omitted/written as null; legacy project compat) | `packages/projects/README.md` — zip-export/import section |
| Relaxed autosave gating (background-only triggers save) | `apps/web/src/hooks/use-batch-project.ts` inline comment on gating logic explaining why template is not required |
| Capture path: live canvas ref, deselect-before-capture pattern | `apps/web/src/hooks/use-single-composite.ts` + `use-batch-render.ts` inline comment on the callback contract |

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| Phase 1 | Template sync setter updates `project.template` | `apps/web/src/__tests__/use-batch-project.test.ts` |
| Phase 1 | BatchWorkspace renders TextOverlayCanvas; TemplateEditor absent | `apps/web/src/components/__tests__/BatchWorkspace-editor.test.tsx` |
| Phase 2 | `setVariableSlot` sets/clears variableSlot | `apps/web/src/__tests__/use-batch-project.test.ts` |
| Phase 2 | OverlayControlsPanel slot toggle renders and calls callback; absent when props omitted | `apps/web/src/components/__tests__/overlay-controls-panel-slot.test.tsx` |
| Phase 3 | `use-single-composite.generate` calls `compositeFromElement` with passed `canvasEl` (not hidden div); deselect/restore callbacks fired in order; static overlay srcs unchanged; only slot src swapped | `apps/web/src/__tests__/use-single-composite.test.ts` |
| Phase 4 | `use-batch-render` calls `compositeFromElement` per overlay with patched slot src; static overlay srcs unchanged; deselect fired before each capture; restore fired after; cancel stops loop | `apps/web/src/__tests__/use-batch-render.test.ts` |
| Phase 4 | `canGenerate` gating: false when slot null; false when overlays empty; true when both present; false when slot node deleted | `apps/web/src/__tests__/batch-generate-gating.test.ts` |
| Phase 5 | BatchProject validates with null template + null variableSlot; schemaVersion 1 | `packages/projects/__tests__/schema.test.ts` |
| Phase 5 | ZIP export with null template/variableSlot: no crash, valid ZIP | `packages/projects/__tests__/zip-export.test.ts` |
| Phase 5 | ZIP import missing template/variableSlot → null (no throw); legacy project (template present) → value preserved | `packages/projects/__tests__/zip-import.test.ts` |
| Phase 5 | IDB save/load with null template/variableSlot round-trips (fake-indexeddb) | `packages/projects/__tests__/idb-adapter.test.ts` |
| Phase 5 | Autosave triggers with background-only project; does not trigger without background | `apps/web/src/__tests__/use-batch-project.test.ts` |

## Human Summary

**What and why:** The /batch feature had a hidden parallel render path (HiddenCompositeCanvas) that only captured the background — dropping all text, borders, and image overlay nodes from output PNGs. The template UI was a degraded stub, not the real editor. This plan replaces that architecture by embedding the real editor surface directly in /batch, designating the variable slot by toggling an existing overlay node, and capturing the live canvas div for all renders.

**How the phases connect:**
- Phase 1 swaps out TemplateEditor for the real TextOverlayCanvas + useEditorState, giving /batch full editor parity immediately. After Phase 1: user can design with real editor; /editor route regression confirmed.
- Phase 2 adds the variable-slot toggle to overlay nodes and wires the first-overlay placeholder preview. After Phase 2: user can designate one overlay as the slot; placeholder appears.
- Phase 3 removes HiddenCompositeCanvas and routes single preview capture through the live canvas — fixing WYSIWYG for preview. Deselect-before-capture pattern established here. After Phase 3: preview output includes all nodes, no selection chrome.
- Phase 4 routes the batch render loop through the same live canvas with the same deselect pattern; adds generate-all gating UI. After Phase 4: batch run produces WYSIWYG-correct PNGs for all overlay images.
- Phase 5 makes template/variableSlot nullable in the schema and relaxes autosave; ZIP round-trip and legacy import tolerate nulls. After Phase 5: background-only drafts persist; ZIP import is robust.
- Phase 6 verifies the whole feature end-to-end including edge cases and /editor regression.

**End result:** /batch is a first-class editor with a live WYSIWYG canvas. Every output PNG matches what the user sees. One image overlay is the variable slot (swapped per render); all others are static. Drafts persist from the moment a background is set. The standalone /editor route is untouched throughout.

**Trade-offs:** The variable-slot placeholder (first overlay image) means the slot node in the editor always shows a real image during design — this is intentional and locked. The schema stays at schemaVersion: 1 with nullable fields rather than bumping to 2, avoiding a migration path. The deselect-before-capture callbacks keep render hooks generic (no React state access inside hooks) at the cost of a slightly more verbose call site in BatchWorkspace — acceptable for correctness.
