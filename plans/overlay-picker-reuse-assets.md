# Plan: Reuse Existing Overlay Assets When Adding an Image Overlay

**Created:** 2026-07-01
**Branch:** feat/overlay-picker-from-assets
**Shape:** Sequential
**Status:** draft

## Context

Today, **Add Image Overlay** always opens the OS file picker — there is no way to
reuse an image the user already uploaded. But the app already holds those images
as `overlays: ProjectAsset[]` (the per-variant swap images) with display-only
thumbnail grids (`AssetList`, `VariantStrip`).

New behavior:

- **Add Image Overlay** → if overlay assets exist, open a **picker dialog** of
  those assets; if none exist, fall straight through to the OS file dialog
  (today's behavior, unchanged).
- The picker is a **multi-selectable** thumbnail grid + an **Upload new file**
  button (fallback to today's upload path) + Cancel/Add.
- On Add:
  - **1 selected** → insert a static overlay node (`src = asset.blobKey`).
  - **2+ selected** → insert **one** overlay node, **auto-enable "Use as
    variable slot"** on it, and set the picked assets as the active variants
    (`selectedVariantIds`) → each output cycles through them.

### Resolved decisions (locked with user)

- **Multi-select → one node as variable slot cycling the picked overlays as
  variants** (not stacked separate nodes) — LOCKED.
- **Picker-first with an in-dialog "Upload new file" fallback**; zero-asset case
  still goes straight to the OS file dialog — LOCKED.
- **Modal primitive: add `@radix-ui/react-dialog` (shadcn dialog)** — consistent
  with existing Radix use (`Collapsible`, `Select`); gives focus-trap + a11y for
  free — LOCKED over a hand-rolled modal.

### Confirmed source locations (verified by research, not assumed)

| Artifact | Path |
|---|---|
| "Add Image Overlay" button + hidden file input | `apps/web/src/components/batch/BatchRightPanel.tsx:114-126` (button `:114`; `onChange` with stray `await` at `:123`) |
| Overlay-node file handler | `apps/web/src/components/batch/BatchWorkspace.tsx:172-180` (`handleOverlayFile` → `validateImageFile` → `addOverlayNode`) |
| `addOverlayNode` wrapper (returns **void** today) | `apps/web/src/hooks/use-editor-state.ts:30-35` |
| Node factory (returns node w/ fresh id) | `packages/editor/src/editor-state.ts:34-36` (`createOverlayNode` → `makeNodeId()`) |
| Overlay asset array + shape | `apps/web/src/hooks/use-batch-project.ts:42-47` (state); `ProjectAsset { id; filename; blobKey }` at `packages/projects/src/schema.ts:56-63` |
| `VariableSlot` schema (single slot) | `packages/projects/src/schema.ts:70-77` (`{ overlayNodeId; width; height }`) |
| Variable-slot toggle handler | `apps/web/src/components/batch/BatchWorkspace.tsx:206-237` (`handleToggleVariableSlot`; mutual-exclusion `:220-225`; `originalSlotSrcRef`; local mirror `variableSlotNodeId` `useState` `:128`) |
| `selectedVariantIds` source of truth | `apps/web/src/components/batch/BatchWorkspace.tsx:47-49` (`useState<Set<string>>`, `setSelectedVariantIds`) |
| Selection reconcile effect (**resets to `{activeId}` on active change**) | `apps/web/src/components/batch/BatchWorkspace.tsx:80-93` |
| Selection threading | passed to `VariantStrip` via `onSelectionChange` `:473-478`; into `useFanOutTextHandlers` `:318` |
| `reconcileVariantSelection` | `apps/web/src/lib/variant-selection.ts:16-30` |
| Thumbnail-grid patterns to reuse | `VariantStrip.tsx:63-104` (`<img src={overlay.blobKey}>`, checkbox multi-select), `AssetList.tsx:54-83` (responsive grid) |
| Existing shadcn wrappers to mirror | `apps/web/src/components/ui/` (has `select.tsx`, `collapsible.tsx` — Radix-wrapped; **no `dialog.tsx`**) |
| Validation + data-url helpers | `apps/web/src/lib/image-helpers.ts` (`validateImageFile`, `fileToDataUrl`) |

## Risk: medium

The behavior lives in `BatchWorkspace.tsx`, wiring three existing but interacting
pieces (node creation → variable slot → variant selection). The main hazard is
the reconcile effect clobbering the programmatic variant selection — see
Dependencies & Risks.

## Dependencies & Risks

- **Reconcile effect clobbers selection.** `BatchWorkspace.tsx:80-93` resets
  `selectedVariantIds` to `new Set([activeId])` whenever `activeOverlayId`
  changes. The 2+-select auto-selection must run **without** switching the active
  overlay (or be ordered so the reconcile can't overwrite it). Keep the active
  overlay untouched; only set the selection set.
- **`addOverlayNode` gives no id back.** The `use-editor-state.ts:30-35` wrapper
  discards the created node. The factory (`createOverlayNode`) already returns
  the node with its id — the enabling change is to surface `node.id` from the
  wrapper (Phase 1). Reading it back from `state.nodes` after an async
  `setState` is racy — do **not** rely on that.
- **Single `VariableSlot`.** Designating the new node as the slot must go through
  the existing mutual-exclusion path (`handleToggleVariableSlot` clears any prior
  slot and restores its `src`) — reuse that logic, don't duplicate it. Extract
  the "set slot for a given node id" core into `setVariableSlotForNode(nodeId)`
  and have both the checkbox toggle and the picker call it.
- **Node sizing unchanged.** Picked images become nodes at today's default
  100×100 (no intrinsic-aspect fit), matching the current upload flow. Aspect
  behavior is governed by the existing `aspectRatioLocked` logic once the image
  loads; no new sizing work in this plan.
- **Upload-new parity.** The in-dialog "Upload new file" button must reuse the
  existing hidden `<input type="file">` + `handleOverlayFile` path (same
  `accept` set, same `validateImageFile` guard) — no second upload code path.
- **New dependency.** Adding `@radix-ui/react-dialog` is consistent with the
  existing Radix footprint; confirm the installed Radix version line matches the
  other `@radix-ui/*` packages already in `apps/web/package.json`.

---

## Phases

### Phase 0 — Branch Setup

**Risk:** low
**Mode:** hil
**Type:** config
**Success criteria:** Branch `feat/overlay-picker-from-assets` off `main`; existing tests green on the clean branch.
**Commit message:** *(no commit — setup only)*

**Steps:**

- [ ] Confirm branch name and base ref (`main`) with the user
- [ ] Create branch `feat/overlay-picker-from-assets` (worktree optional, per house convention)
- [ ] `pnpm install`
- [ ] `pnpm --filter @maga/web test` exits 0 on the clean branch

**Verification:**

- [ ] On the correct branch; `pnpm --filter @maga/web test` exits 0

---

### Phase 1 — Plumbing: return new node id + add shadcn dialog primitive

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** `addOverlayNode` returns the created node's id; a reusable `ui/dialog.tsx` (Radix) exists and renders; `handleToggleVariableSlot` still behaves identically after the slot-setter extraction. All gates green.
**Commit message:** `feat(editor): return new overlay node id; add dialog primitive`

### File changes

| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/hooks/use-editor-state.ts` | `addOverlayNode` (`:30-35`) captures the `createOverlayNode(...)` result and returns `node.id` (factory already builds it); keep the `setState` append unchanged |
| add | `apps/web/src/components/ui/dialog.tsx` | shadcn dialog wrapping `@radix-ui/react-dialog`, mirroring the existing `select.tsx`/`collapsible.tsx` wrapper conventions (styling, `cn`, forwardRef) |
| modify | `apps/web/package.json` | add `@radix-ui/react-dialog` at the version line matching sibling `@radix-ui/*` deps |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Extract the slot-designation core of `handleToggleVariableSlot` (`:206-237`) into `setVariableSlotForNode(nodeId)` (captures width/height, stashes original `src`, clears prior slot via existing mutual-exclusion); `handleToggleVariableSlot` calls it — no behavior change |

### Steps

- [x] Change `addOverlayNode` to return `node.id`; update its type. Confirm no existing caller breaks on the now-non-void return
- [x] `pnpm --filter @maga/web add @radix-ui/react-dialog`
- [x] Add `ui/dialog.tsx` mirroring existing shadcn wrappers
- [x] Extract `setVariableSlotForNode(nodeId)` from `handleToggleVariableSlot`; verify the toggle path is unchanged
- [x] Update `.ai/` (index row noting `addOverlayNode` now returns the node id)

### Tests

| Action | File | What it covers |
|---|---|---|
| modify | editor-state / use-editor-state test (existing suite for the hook, if present; else add a focused unit) | `addOverlayNode` returns a non-empty id matching the appended node |

### Verification

- [x] `pnpm --filter @maga/web test` exits 0
- [x] `pnpm --filter @maga/web exec tsc --noEmit` exits 0
- [ ] Manual: existing "Use as variable slot" checkbox still toggles correctly (extraction is behavior-preserving) _(deferred to Phase 4 manual)_

**Phase review:**

- [x] All Steps/Verification ticked
- [x] Code-reviewer agent verified this phase
- [x] Tests written and passing
- [x] Documentation updated
- [x] Changes committed

---

### Phase 2 — OverlayPickerDialog component

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** A self-contained `OverlayPickerDialog` renders a multi-selectable thumbnail grid of `ProjectAsset[]`, an "Upload new file" button, and Cancel/Add. It emits selected asset ids on Add and fires an upload callback on "Upload new file" — no business logic inside (callbacks only, per CLAUDE.md).
**Commit message:** `feat(batch): add overlay-picker dialog (select existing or upload)`

### File changes

| Action | File | What changes |
|---|---|---|
| add | `apps/web/src/components/batch/OverlayPickerDialog.tsx` | Controlled dialog (`open`, `onOpenChange`) over `ui/dialog.tsx`; props: `assets: ProjectAsset[]`, `onConfirm(ids: string[])`, `onUploadNew()`. Reuses the `VariantStrip`/`AssetList` thumbnail pattern (`<img src={asset.blobKey}>`) with per-thumbnail checkbox multi-select and a select-all-free local `Set<string>`; Add disabled when empty. Purely presentational — all effects via callbacks |

### Steps

- [x] Build `OverlayPickerDialog` reusing the existing thumbnail-grid markup/classes
- [x] Local `useState<Set<string>>` for in-dialog selection; toggle per thumbnail; reset on open/close
- [x] "Upload new file" button calls `onUploadNew()` and closes the dialog
- [x] "Add" calls `onConfirm([...selected])` and closes; disabled when selection empty
- [x] Update `.ai/` (new component in the batch-workspace architecture doc + index row)

### Tests

| Action | File | What it covers |
|---|---|---|
| add | `apps/web/src/components/batch/__tests__/OverlayPickerDialog.test.tsx` | Renders one thumbnail per asset; toggling checkboxes accumulates ids; "Add" fires `onConfirm` with the selected id set; "Upload new file" fires `onUploadNew`; "Add" disabled with empty selection |

### Verification

- [x] `pnpm --filter @maga/web test` exits 0
- [x] `pnpm --filter @maga/web exec tsc --noEmit` exits 0

**Phase review:**

- [x] All Steps/Verification ticked
- [x] Code-reviewer agent verified this phase
- [x] Tests written and passing
- [x] Documentation updated
- [x] Changes committed

---

### Phase 3 — Integration: open picker from the button; create node(s) + auto-slot

**Risk:** medium
**Mode:** afk
**Type:** frontend
**Success criteria:** QA with ≥1 uploaded overlay clicks **Add Image Overlay** → the picker opens. Picking **one** inserts that image as an overlay node. Picking **two or more** inserts one node with **"Use as variable slot" auto-enabled** and those assets set as the active variants (each output shows a different one). **Upload new file** still imports via the existing flow. With **zero** overlays, the button goes straight to the OS file dialog (unchanged).
**Commit message:** `feat(batch): reuse existing overlays when adding an image overlay`

### File changes

| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BatchRightPanel.tsx` | **Add Image Overlay** button: when `overlays.length > 0`, open the picker (new `open` state) instead of clicking the file input; when `0`, keep clicking the input. Render `OverlayPickerDialog`. Keep the hidden `<input type="file">` for the upload-new path. Fix the stray `await` at `:123` (drop the no-op `await` or make the handler async-correct) |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add `handleAddOverlayFromAssets(ids: string[])`: **1 id** → `addOverlayNode({ src: asset.blobKey, x:10, y:10 })`; **2+ ids** → `const nodeId = addOverlayNode({ src: firstAsset.blobKey, x:10, y:10 })` then `setVariableSlotForNode(nodeId)` and `setSelectedVariantIds(new Set(ids))` **without changing `activeOverlayId`** (avoid the reconcile reset at `:80-93`). Thread `overlays`, the handler, and the upload-new trigger down to `BatchRightPanel` |
| add (optional) | `apps/web/src/lib/overlay-from-assets.ts` | Small pure helper resolving `ids → { nodeSrc, makeVariableSlot: boolean, variantIds }` so the 1-vs-2+ decision is unit-testable and the handler stays thin |

### Steps

- [ ] Lift/confirm props so `BatchRightPanel` gets `overlays`, `onAddOverlayFromAssets`, and the existing upload trigger
- [ ] Button branches on `overlays.length`; render `OverlayPickerDialog`; wire `onConfirm` → `handleAddOverlayFromAssets`, `onUploadNew` → existing file-input click
- [ ] Implement `handleAddOverlayFromAssets` (1 vs 2+) reusing `setVariableSlotForNode`; **do not** touch `activeOverlayId`
- [ ] Order the 2+ path so the reconcile effect can't clobber `selectedVariantIds` (set selection after node creation; active overlay unchanged)
- [ ] Fix the stray `await` diagnostic at `BatchRightPanel.tsx:123`
- [ ] Update `.ai/` (behavior: picker + 2+→auto variable slot; decision doc)

### Tests

| Action | File | What it covers |
|---|---|---|
| add | `apps/web/src/__tests__/lib/overlay-from-assets.test.ts` (if the helper is extracted) | 1 id → static node intent, no slot; 2+ ids → slot + variant-id set |
| modify | BatchWorkspace / BatchRightPanel RTL suite (existing) | Button opens picker when assets exist; goes to file input when none; confirming 2+ enables the variable slot and sets the selection |

### Verification

- [ ] `pnpm --filter @maga/web test` exits 0
- [ ] `pnpm --filter @maga/web exec tsc --noEmit` exits 0
- [ ] Manual: 1 pick → node with that image; 2+ picks → one node, slot on, outputs cycle the picked overlays _(deferred to Phase 4 manual)_
- [ ] Manual: upload-new still works; zero-asset case opens the OS dialog directly _(deferred to Phase 4 manual)_
- [ ] Manual: active overlay/variant preview not disrupted by the auto-selection _(deferred to Phase 4 manual)_

**Phase review:**

- [ ] All Steps/Verification ticked
- [ ] Code-reviewer agent verified this phase
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Changes committed

---

### Phase 4 — Final Verification + KB Sync

**Runs after all other phases.**
**Mode:** hil
**Type:** docs

**Overall success criteria:**

- The picker flow works end-to-end; all gates green; `.ai/` reflects the picker,
  the `addOverlayNode` id return, and the 2+→auto-variable-slot rule; no
  regression to the existing upload path, the variable-slot checkbox, or variant
  selection/preview.

**Steps:**

- [ ] Confirm every preceding phase's checkboxes are ticked
- [ ] Run all gates:
  ```
  pnpm --filter @maga/web test
  pnpm --filter @maga/web exec tsc --noEmit
  pnpm --filter @maga/web build
  ```
- [ ] Manual happy path: pick 1, pick 2+, upload-new, zero-asset direct dialog
- [ ] Manual regression: existing variable-slot checkbox toggle; variant strip selection; saved-project overlays render unchanged
- [ ] Verify `.ai/` updates from Phases 1–3 are present and consistent

**Verification:**

- [ ] All gates exit 0
- [ ] `.ai/` KB synced
- [ ] No CLAUDE.md invariants violated (pnpm, thin entry points, reuse, `.ai/` synced, callbacks-only generic component)
- [ ] Overall success criteria met

---

## Knowledge Base Impact

| `.ai/` artifact | Action | What it captures |
|---|---|---|
| `index.md` | update | New overlay-picker flow; `addOverlayNode` now returns the node id; pointer to the picker component |
| `architecture.md` (Batch workspace section) | update | Adding an image overlay can reuse existing `overlays` assets; `OverlayPickerDialog`; 2+→variable-slot path |
| `decisions/overlay-picker-reuse-assets.md` | create | Why picker-first with upload fallback; why 2+ selection auto-designates the single variable slot and sets `selectedVariantIds` (mirrors the one-node-swapped-per-variant model); rejected alternative (stacking separate nodes); Radix dialog dependency choice |

Documentation is added as a step within each relevant phase, not as a separate phase.

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| Phase 1 | `addOverlayNode` returns the appended node's id | hook/editor-state suite |
| Phase 2 | Picker multi-select, confirm-with-ids, upload-new callback, empty-disabled | `OverlayPickerDialog.test.tsx` |
| Phase 3 | 1-vs-2+ decision; picker opens vs direct file dialog; 2+ enables slot + sets selection | `overlay-from-assets.test.ts` + BatchWorkspace/RightPanel RTL |
| Phase 4 | — (gates + manual only) | — |

## Human Summary

- **What & why:** Adding an image overlay always forces a re-upload even when the
  image is already in your assets. This adds a picker so you can reuse existing
  overlays; picking several turns the new overlay into a variable slot that cycles
  through them across outputs.
- **Phase 0:** Branch + install.
- **Phase 1 (plumbing):** Return the new node's id from `addOverlayNode`, add a
  Radix-based `dialog` primitive, and extract a reusable `setVariableSlotForNode`
  from the existing toggle — all behavior-preserving.
- **Phase 2 (component):** A presentational `OverlayPickerDialog` — multi-select
  thumbnail grid + "Upload new file" + Add/Cancel, callbacks only.
- **Phase 3 (integration):** The button opens the picker when assets exist; 1 pick
  inserts a static node, 2+ picks insert one node with the variable slot
  auto-enabled and those assets set as the active variants; upload-new and the
  zero-asset direct dialog are preserved. Also clears the stray `await` warning.
- **Phase 4:** Gates, manual end-to-end, `.ai/` sync.
- **Key trade-off:** 2+ selection maps to the app's single-variable-slot model
  (one node, `src` swapped per variant) rather than stacking multiple nodes — the
  only interpretation where "auto-select the variable slot" is meaningful. The
  new `@radix-ui/react-dialog` dependency is accepted for a11y/focus-trap,
  consistent with the existing Radix footprint.
