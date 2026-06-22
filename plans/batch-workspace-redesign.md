# Plan: Batch Workspace Persistent Canvas + Live Preview Redesign

**Created:** 2026-06-22
**Branch:** `feat/batch-workspace-redesign`
**Status:** not started

## Context

The `/batch` workspace currently swaps the entire center content area per section — the template canvas is only visible when the Template section is active, and per-item text/style overrides are not reflected on the canvas without a full apply→capture→restore mutation cycle. This creates a fragmented editing experience: users cannot see a live preview of their per-variant overrides while switching between the Assets, Template, and Text sections.

This plan redesigns the `/batch` workspace to: (1) keep a persistent template canvas always visible in the center column; (2) add a contextual right-hand properties panel whose content switches per active section; (3) introduce a derived-state live preview hook so per-item overrides render on the canvas in real time without mutating the shared editor state; and (4) wire edit routing so unlocked-layer edits write to per-item overrides while locked-layer edits write to the shared template — matching the existing one-lock-per-layer model. Generate All behavior and `?section=` routing are unchanged.

## Risk: medium

Layout restructure touches BatchWorkspace (the main wiring component) but leaves all pure presenter components, hooks, and the Generate All path untouched. The derived-state hook is new, isolated, and memoized — it cannot corrupt the live editor state.

## Dependencies & Risks

- **EditorState is local React state** (not a global store). The derived state hook must take the base EditorState as a plain value and return a new memoized object — it must never mutate the input.
- **Generate All snapshot/restore** in `use-batch-render.ts` must not be touched. The derived-state preview path is read-only and orthogonal to the mutation path used during rendering.
- **`?section=` query param** must continue working — existing tests in `workspace-side-nav.test.tsx` assert it. Minimal change to WorkspaceSideNav.
- **`apps/web/src/app/batch/page.tsx`** wraps content in `mx-auto max-w-5xl` — this container must be relaxed for the 3-column layout without breaking other pages.
- **BulkTextPanel and VariantStrip** are pure presenters; they must stay pure (callback-only) — no business logic added inside them.
- Phase 3 layout restructure is the highest surface-area change. Risk is medium because it is purely presentational with no new state or data flow.
- Phase ordering is load-bearing: Phase 1 (derived state) must land before Phase 2 (edit routing) which must land before Phase 3 (layout shell), because Phase 3 relies on both being wired correctly.
- **Reuse invariants:** `TextOverlayCanvas`, `TextStylePanel`, `BulkTextPanel`, `VariantStrip`, and `use-item-text` are used as-is — no internal changes. `use-batch-render`'s apply/capture/restore path is not touched; Generate All behavior is byte-for-byte identical. No schema change (v3 already shipped). Business logic stays in hooks, not in `page.tsx` or `BatchWorkspace.tsx` render bodies. The derived-state hook is a pure, testable function (no side effects, no mutations).

## Phases

### Phase 1: Live preview derived-state hook + auto-select first variant

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** Load `/batch` with at least one overlay/variant — the canvas immediately shows the first variant's background image and any per-item text/style overrides applied to unlocked layers, without waiting for any user action. Clicking a different variant in the VariantStrip updates the canvas live. The shared editor state is never mutated during preview.
**Commit message:** `feat(batch): live preview derived-state hook + auto-select first variant`

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/hooks/use-preview-editor-state.ts` | Pure selector: `(base: EditorState, activeOverlayId: string \| null, itemTextValues: ItemTextValues, itemTextStyles: ItemTextStyles, textLayerLocks: TextLayerLocks) => EditorState`. Returns memoized derived EditorState with per-item overrides applied to unlocked text layers only. Uses `useMemo`. |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add `activeOverlayId` state (useState, initialized via `useEffect` to `overlays[0]?.id` on mount and when overlays change if current selection is no longer valid). Thread `activeOverlayId` + `setActiveOverlayId` to VariantStrip's `onSelect`. Call `usePreviewEditorState` and pass derived state to the canvas that already exists in the template block. |

**Steps:**

- [x] Read `apps/web/src/hooks/use-editor-state.ts` and `packages/editor/src/editor-state.ts` to understand EditorState shape and `updateTextNode` signature
- [x] Read `apps/web/src/hooks/use-batch-project.ts` to understand `itemTextValues`, `itemTextStyles`, `textLayerLocks` types and map shapes
- [x] Read `apps/web/src/hooks/use-item-text.ts` to understand `getTextValue` / `getTextStyle` retrieval pattern
- [x] Create `apps/web/src/hooks/use-preview-editor-state.ts`:
  - Accept `(base, activeOverlayId, itemTextValues, itemTextStyles, textLayerLocks)`
  - Early-return `base` (memoized) when `activeOverlayId` is null
  - For each text node in `base.nodes`: if `textLayerLocks[nodeId]` is falsy, apply `itemTextValues[activeOverlayId]?.[nodeId]` (content) and `itemTextStyles[activeOverlayId]?.[nodeId]` (style patch) via the same pure transition used by updateTextNode; otherwise leave the node untouched
  - Wrap entire computation in `useMemo` with deps `[base, activeOverlayId, itemTextValues, itemTextStyles, textLayerLocks]` — dep array must be minimal so unrelated `editorState` changes (e.g. `selectedNodeId` updates) do NOT re-derive the preview
- [x] In `BatchWorkspace.tsx`, add `activeOverlayId` state (`useState<string | null>(null)`)
- [x] Add `useEffect` that sets `activeOverlayId` to `overlays[0]?.id ?? null` on mount and whenever `overlays` changes (only update if the current `activeOverlayId` is no longer in `overlays`)
- [x] Call `usePreviewEditorState` with the correct arguments and store as `previewEditorState`
- [x] In the existing template-section block, pass `previewEditorState` (instead of the raw editor state) to `TextOverlayCanvas`
- [x] Wire VariantStrip's `onSelect` to `setActiveOverlayId`
- [x] Write unit tests (see Tests)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/hooks/use-preview-editor-state.test.ts` | (1) unlocked layer gets per-item content override applied; (2) unlocked layer gets per-item style override applied; (3) locked layer retains template value regardless of per-item override; (4) returns base state unchanged when activeOverlayId is null; (5) memoization — same reference returned when deps unchanged; (6) variant with empty override map returns base state unchanged (no crash); (7) selectedNodeId change on editorState does NOT cause a new derived object (memoization key check) |

**Verification:**

- [x] Automated tests pass: `pnpm --filter @maga/web test`
- [ ] Load `/batch` with variants; canvas shows first variant's image and per-item text overrides without clicking anything
- [ ] Click a different variant in VariantStrip; canvas updates immediately
- [ ] Open browser devtools; confirm `editorState` (the base) is never mutated (e.g., add a breakpoint or console.log inside `updateTextNode` — it must not fire during canvas render)
- [ ] Edge case: zero variants → canvas shows bare template, no crash, no auto-select fires
- [ ] Edge case: active variant whose override map is empty → canvas shows template values unchanged
- [ ] Edge case: switch variant while a text node is selected → `selectedNodeId` persists, canvas re-derives from new `activeOverlayId`

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [x] Code-reviewer agent has verified this phase
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [x] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [x] Changes committed: `feat(batch): live preview derived-state hook + auto-select first variant`
- [ ] Phase marked complete

---

### Phase 2: Edit routing — per-item vs shared template

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** Edit text content or style on an unlocked layer in the Text/BulkTextPanel — only the active variant's canvas updates; other variants are unaffected. Edit text content or style on a locked layer — the shared template updates and all variants reflect the change on the canvas. Generate All still produces correct composites (behavior unchanged from before this plan).
**Commit message:** `feat(batch): route text/style edits to per-item override or shared template based on lock state`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add/update edit handlers passed to BulkTextPanel (and any TextStylePanel instances in the text section): for each `(nodeId, value/patch)` edit, check `textLayerLocks[nodeId]` — if unlocked, call `setItemTextValue(activeOverlayId, nodeId, value)` / `setItemTextStyle(activeOverlayId, nodeId, patch)`; if locked, call `updateTextNode(nodeId, { content: value })` / `updateTextNode(nodeId, patch)`. Extract handler logic into a small named helper `makeTextEditHandlers` (≤30 lines) inside the file or a co-located helper if it exceeds that. |

**Steps:**

- [ ] Read `apps/web/src/hooks/use-batch-project.ts` to confirm signatures of `setItemTextValue` and `setItemTextStyle`
- [ ] Read `apps/web/src/hooks/use-editor-state.ts` to confirm `updateTextNode` signature
- [ ] Read `apps/web/src/components/batch/BulkTextPanel.tsx` to understand what edit callbacks it expects
- [ ] In `BatchWorkspace.tsx`, create `handleTextContentEdit(nodeId: string, value: string)`: if `textLayerLocks[nodeId]` → `updateTextNode(nodeId, { content: value })`; else → `setItemTextValue(activeOverlayId!, nodeId, value)`
- [ ] Create `handleTextStyleEdit(nodeId: string, patch: Partial<TextStyle>)`: if locked → `updateTextNode(nodeId, patch)`; else → `setItemTextStyle(activeOverlayId!, nodeId, patch)`
- [ ] Pass `handleTextContentEdit` and `handleTextStyleEdit` as callbacks to BulkTextPanel / TextStylePanel in the text section
- [ ] Verify the derived state from Phase 1 automatically re-renders the canvas after each edit (no additional wiring needed)
- [ ] Write unit tests (see Tests)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/hooks/use-batch-edit-handlers.test.ts` | Extract `makeTextEditHandlers` (or equivalent pure logic) to a testable helper. Tests: (1) unlocked content edit calls `setItemTextValue`, NOT `updateTextNode`; (2) unlocked style edit calls `setItemTextStyle`, NOT `updateTextNode`; (3) locked content edit calls `updateTextNode`, NOT `setItemTextValue`; (4) locked style edit calls `updateTextNode`, NOT `setItemTextStyle`; (5) no-op when `activeOverlayId` is null and layer is unlocked |

**Verification:**

- [ ] Automated tests pass: `pnpm --filter @maga/web test`
- [ ] Edit text on unlocked layer with variant A selected → variant A's canvas updates; switch to variant B → variant B shows original text
- [ ] Toggle lock on a layer, edit text → all variants in VariantStrip show updated text
- [ ] Run Generate All → output composites are still correct (same as pre-plan behavior)
- [ ] Confirm existing test `apps/web/src/__tests__/use-batch-render.test.ts` still passes
- [ ] Edge case: `activeOverlayId` is null (no variants) → handlers are no-ops, no crash
- [ ] Edge case: locked layer edit with `activeOverlayId` set → `updateTextNode` called, per-item maps untouched

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(batch): route text/style edits to per-item override or shared template based on lock state`
- [ ] Phase marked complete

---

### Phase 3: 3-column persistent layout shell + VariantStrip below canvas

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** Navigating between Assets, Template, and Text sections keeps the canvas visible in the center column at all times — it never disappears. The VariantStrip is always visible directly below the canvas in those three sections. Each section shows correct content in the right panel (Assets: asset list + upload zone; Template: template/overlay controls; Text: BulkTextPanel stacked/scrollable in ~20rem column). Switching to Results: BatchResultsGallery fills the center full-width and the right panel collapses or shows a summary. Switching back from Results restores the canvas. On narrow screens (< md breakpoint) the right panel stacks below the canvas. The `?section=` query-param navigation continues to work and `workspace-side-nav.test.tsx` still passes.
**Commit message:** `feat(batch): 3-column persistent layout shell with VariantStrip below canvas`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/app/batch/page.tsx` | Remove or increase `max-w-5xl` container constraint to allow the 3-column layout to use available width. |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Restructure render: outer flex row — (a) left: existing WorkspaceSideNav; (b) center column: `<main className="flex flex-col flex-1 min-w-0">` containing TextOverlayCanvas (always rendered for non-Results sections, hidden via `hidden` class for Results) + VariantStrip below (always rendered for non-Results sections); (c) right: `<aside className="w-80 shrink-0 ...">` whose inner content switches on `activeSection` — Assets renders AssetList+AssetUploadZone, Template renders overlay/template controls, Text renders BulkTextPanel (scrollable), Results collapses (`hidden`) or shows a narrow summary. For Results section, BatchResultsGallery renders in the center column replacing the canvas (swap with `hidden`/`block` or conditional render). Right panel on narrow: add `flex-col md:flex-row` on the outer row so right panel stacks below on mobile. |
| create | `apps/web/src/components/batch/BatchRightPanel.tsx` | Thin shell that accepts `activeSection` + per-section props and renders the correct panel content. Keeps BatchWorkspace render concise and each section's panel independently readable. Pure component — all callbacks passed as props. |

**Steps:**

- [ ] Read `apps/web/src/app/batch/page.tsx` to understand the current container setup
- [ ] Read `apps/web/src/components/batch/BatchWorkspace.tsx` lines 341–496 (the conditional section blocks) to map current structure before restructuring
- [ ] Read `apps/web/src/components/batch/AssetList.tsx` and the AssetUploadZone to confirm props
- [ ] Read `apps/web/src/components/batch/BatchResultsGallery.tsx` to confirm it assumes full-width and has no internal width constraint
- [ ] In `page.tsx`, remove `max-w-5xl` (or replace with `max-w-screen-2xl`) and remove horizontal centering (`mx-auto`) if it would constrain the 3-column layout
- [ ] Create `apps/web/src/components/batch/BatchRightPanel.tsx`: accepts `{ activeSection, ...per-section props }`, renders the matching panel content via a simple switch/if chain — no business logic, no direct state access
- [ ] Restructure `BatchWorkspace.tsx` render into the 3-column shell:
  - Outer: `<div className="flex h-full">` (or inherit existing layout)
  - Left: WorkspaceSideNav (unchanged)
  - Center: `<main className="flex flex-col flex-1 min-w-0 overflow-hidden">` — contains: (non-Results) canvas `<div className="flex-1 relative">` + VariantStrip `<div className="shrink-0">` ; (Results) `<div className="flex-1">` with BatchResultsGallery
  - Right: `<BatchRightPanel activeSection={activeSection} ... />` — hidden (`hidden md:block` or collapsing div) when Results active
  - Responsive wrapper: `<div className="flex flex-col md:flex-row h-full">` so center+right stack vertically on narrow screens
- [ ] Ensure `?section=` param still drives `activeSection` exactly as before (no change to WorkspaceSideNav or resolveSection)
- [ ] Spot-check that `workspace-side-nav.test.tsx` still passes without modification

**Tests:**

No new automated tests — justified because: this phase is a pure layout restructure. No new business logic is introduced. All state, hooks, and edit handlers are unchanged and already covered by Phase 1 and Phase 2 tests. The existing `workspace-side-nav.test.tsx` and `BatchWorkspace-editor.test.tsx` suites cover navigation and wiring; they must continue to pass (verified below). Visual layout correctness and responsive stacking require human inspection and cannot be mechanically verified by vitest.

**Verification:**

- [ ] Existing test suites pass: `pnpm --filter @maga/web test` (must include `workspace-side-nav.test.tsx` and `BatchWorkspace-editor.test.tsx`)
- [ ] TypeScript clean: `pnpm --filter @maga/web build` (or `pnpm --filter @maga/web tsc --noEmit` if build is not fast) — zero type errors
- [ ] Navigate to `/batch?section=assets` — canvas visible center, Assets panel visible right
- [ ] Navigate to `/batch?section=template` — canvas visible center, template/overlay controls visible right
- [ ] Navigate to `/batch?section=text` — canvas visible center, BulkTextPanel visible right (scrollable)
- [ ] Navigate to `/batch?section=results` — BatchResultsGallery fills center, right panel absent/collapsed
- [ ] Navigate back from results to text — canvas reappears
- [ ] VariantStrip visible below canvas in assets/template/text sections
- [ ] Resize browser to mobile width (< md breakpoint) — right panel stacks below canvas, no overflow
- [ ] `?section=` query param updates when clicking WorkspaceSideNav items
- [ ] Direct URL `/batch?section=results` works without JS navigation
- [ ] Select a text node, switch sections, switch back — `selectedNodeId` is still the same node
- [ ] Zero-variants edge case: page loads without crash; canvas shows bare template; VariantStrip renders empty/gracefully

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing (or no-tests justification accepted)
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(batch): 3-column persistent layout shell with VariantStrip below canvas`
- [ ] Phase marked complete

---

### Phase 4: .ai/ KB sync

**Risk:** low
**Mode:** afk
**Type:** docs
**Success criteria:** `.ai/` accurately reflects the new 3-column layout shell, the derived preview path (use-preview-editor-state), and the edit routing logic. No orphaned references remain. `index.md` has a row for the new hook.
**Commit message:** `docs(ai): KB sync — batch workspace redesign: 3-column shell, live preview derived state`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/.ai/architecture.md` (or nearest equivalent) | Add section describing the 3-column batch layout shell: left nav, center persistent canvas + VariantStrip, right contextual panel. Document that Results replaces center canvas with full-width gallery. |
| create | `apps/web/.ai/patterns/live-preview-derived-state.md` | Decision-oriented entry: why derived state (not mutation) is used for live preview; the hook signature and memoization contract; the constraint that Generate All mutation path must never be affected. |
| modify | `apps/web/.ai/index.md` (or project-level `.ai/index.md`) | Add row for `use-preview-editor-state` hook pointing to pattern doc and hook file path. |

**Steps:**

- [ ] Read current `.ai/index.md` to locate the correct file and understand existing row format
- [ ] Read existing `apps/web/.ai/architecture.md` (or equivalent) to find the batch workspace section and extend it
- [ ] Write `apps/web/.ai/patterns/live-preview-derived-state.md` capturing the why, the hook contract, and the constraint
- [ ] Update `.ai/index.md` with new hook row
- [ ] Update architecture doc with 3-column layout description
- [ ] Grep for any `.ai/` references to old batch layout (e.g., "canvas only in template block") and update/remove them

**Tests:**

No automated tests — justified because: pure documentation change, no executable logic.

**Verification:**

- [ ] `grep -r "canvas only in template" apps/web/.ai/` returns no results
- [ ] `.ai/index.md` contains a row for `use-preview-editor-state`
- [ ] `apps/web/.ai/patterns/live-preview-derived-state.md` exists
- [ ] No orphaned `.ai/` references to the old section-swap layout remain

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing (or no-tests justification accepted)
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `docs(ai): KB sync — batch workspace redesign: 3-column shell, live preview derived state`
- [ ] Phase marked complete

---

### Phase 5: Final Verification

**This phase runs after all other phases are complete.**
**Mode:** hil

**Overall success criteria:**

- Load `/batch` → first variant auto-selected; canvas shows that variant's background image + per-item text/style overrides applied to unlocked layers.
- Click another variant in VariantStrip → canvas updates live with no flicker or mutation of shared state.
- Edit text content on an unlocked layer in the Text section → only the active variant's canvas updates; other variants retain their values.
- Edit text on a locked layer → shared template updates; all variants reflect the change.
- Edit text style (font, size, color) on unlocked layer → active variant updates live.
- Switch to Assets section → canvas and VariantStrip still visible; Assets panel visible in right column.
- Switch to Template section → canvas and VariantStrip still visible; template/overlay controls in right column.
- Switch to Results section → BatchResultsGallery fills center full-width; right panel absent/collapsed.
- Switch back from Results to any other section → canvas reappears.
- Run Generate All → output composites are correct and unchanged from pre-plan behavior.
- `?section=` query param updates on nav click; direct URL navigation to `?section=results` works.
- All automated tests pass: `cd apps/web && pnpm test`.
- `.ai/` updated with 3-column layout, derived-state pattern, and index row.

**Steps:**

- [ ] Every preceding phase's Steps / Verification / Phase review checkboxes are ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review of all phases)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent reviews the entire change end-to-end
- [ ] Any changes made in response to the final code-reviewer review have been reflected back into this plan file
- [ ] All tests pass: `pnpm --filter @maga/web test`
- [ ] No CLAUDE.md invariants violated (pnpm only, thin entry points, no new external deps, reuse before reinvent, functions ≤30 lines, generic components callback-only)
- [ ] Feature tested manually — golden path: auto-select → live preview → per-item edit → locked edit → section switching → Results → Generate All
- [ ] Edge cases tested manually: zero variants (canvas shows bare template); single variant; all layers locked; rapid variant switching
- [ ] Overall success criteria met
- [ ] All phase checkboxes above are ticked

## Documentation

| Change | Documentation location |
|---|---|
| `use-preview-editor-state` hook (new) | `apps/web/.ai/patterns/live-preview-derived-state.md` (created in Phase 4) |
| Edit routing logic (per-item vs shared) | `apps/web/.ai/architecture.md` — batch edit routing section (Phase 4) |
| 3-column layout shell + persistent canvas | `apps/web/.ai/architecture.md` — batch layout section (Phase 4) |
| Results section full-width takeover | `apps/web/.ai/architecture.md` — batch layout section (Phase 4) |
| New `BatchRightPanel` component | `apps/web/.ai/index.md` — component row (Phase 4) |
| `use-preview-editor-state` in index | `apps/web/.ai/index.md` — hook row (Phase 4) |

Documentation is added as a step within Phase 4 (KB sync).

## Knowledge Base Impact

| `.ai/` artifact | Action | What it captures |
|---|---|---|
| `apps/web/.ai/index.md` | update | New row: `use-preview-editor-state` hook path + one-line purpose |
| `apps/web/.ai/index.md` | update | New row: `BatchRightPanel` component path |
| `apps/web/.ai/architecture.md` | update | 3-column layout shell description; persistent canvas contract; Results full-width takeover rule |
| `apps/web/.ai/patterns/live-preview-derived-state.md` | create | Why derived state (not mutation) for preview; hook signature + memoization contract; constraint that Generate All mutation path is orthogonal and must not be affected |
| Any existing `.ai/` entry describing canvas as "template-section only" | retire/update | Now superseded — canvas is persistent across Assets/Template/Text |

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| Phase 1 | `usePreviewEditorState` — applies unlocked overrides; skips locked layers; returns base when no active variant; memoizes on unchanged deps | `apps/web/src/__tests__/hooks/use-preview-editor-state.test.ts` |
| Phase 2 | Edit handler routing — unlocked content→setItemTextValue; unlocked style→setItemTextStyle; locked content→updateTextNode; locked style→updateTextNode; no-op when no active variant | `apps/web/src/__tests__/hooks/use-batch-edit-handlers.test.ts` |
| Phase 3 | No automated tests — pure layout restructure; existing `workspace-side-nav.test.tsx` and `BatchWorkspace-editor.test.tsx` cover navigation and wiring | — |
| Phase 4 | No automated tests — pure docs change | — |

## Human Summary

**What and why:** The `/batch` workspace currently hides the canvas unless you're in the Template section, and per-variant text overrides aren't visible without running Generate All. This plan wires in a persistent 3-column layout (left nav, center canvas always on, right contextual panel) and a real-time derived-state preview — so you always see what your selected variant looks like as you edit.

**How the phases connect:**
- **Phase 1** lays the foundation: a pure `usePreviewEditorState` hook that merges per-item overrides onto a copy of the base EditorState without mutating it, plus auto-selecting the first variant on load. The canvas in the existing template block now shows a live preview.
- **Phase 2** wires edit routing: unlocked-layer edits write to per-item overrides (only the active variant changes); locked-layer edits write to the shared template (all variants reflect). Because Phase 1's derived state re-derives on every state change, the canvas updates automatically — no extra wiring.
- **Phase 3** restructures the shell into the permanent 3-column layout. The canvas moves from "only visible in Template section" to "always visible in center." The VariantStrip sits below it. The right column shows the section-appropriate controls. Results gets special treatment: gallery fills the full center.
- **Phase 4** syncs the `.ai/` knowledge base to reflect the new architecture and pattern.

**End result:** Users land on `/batch`, see the first variant previewed on the canvas immediately, switch variants to compare, edit text or styles and see changes live, flip between sections without losing the canvas, and hit Generate All to produce composites — exactly the same as before but with the preview always present. Generate All behavior and `?section=` routing are untouched throughout.

**Key trade-offs:**
- Derived state (copy-on-read) over mutation: slightly more memory per render, but zero risk of corrupting the shared template or breaking Generate All.
- Lock = shared/per-item switch: reuses the existing one-lock-per-layer model rather than introducing a new concept.
- No new external dependencies; no schema changes.
