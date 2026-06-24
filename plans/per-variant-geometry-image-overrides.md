# Plan: Per-variant geometry & image overrides (unified node-override store, schema v5)

**Created:** 2026-06-24
**Branch:** feat/per-variant-geometry-image-overrides
**Status:** not started

## Context

Today the batch workspace lets per-variant overrides cover **text only**:
content (`itemTextValues`), style (`itemTextStyles`), and visibility
(`itemHiddenNodeIds`) — three parallel maps in schema v4. Moving, resizing,
restyling, or hiding an **image overlay** still mutates the *shared template*
(via `editorState.updateOverlayNode` / `removeNode`), so it leaks to every
variant. Text **geometry** (x/y/size) likewise has no per-variant path — only
content and the thin style partial are per-item.

This plan extends per-variant overrides to cover **node geometry and image
overlays end-to-end**: dragging/resizing/restyling/hiding a text *or* image
node affects only the selected variants (fanned across `selectedVariantIds`,
active always included), never the shared template.

To do this without three more parallel maps per node kind, we **collapse the
three text stores into one unified store** `itemNodeOverrides:
Record<overlayId, Record<nodeId, NodeOverride>>` and migrate v4 → v5. One merge
path (preview), one fan-out path (edits), one apply-restore path (render),
shared by text and images.

## Risk: high

Touches the load-bearing canvas-source coupling, the Generate All
apply-restore loop, and a schema migration that collapses three persisted maps
into one. A regression here silently corrupts rendered output (wrong
text/geometry/image per variant) or leaks per-variant edits into the shared
template. Mitigated by vertical slicing (each phase observable + tested) and by
making Phase 1 regression-safe (all existing text behavior preserved through
the new store before any new surface is added).

## Dependencies & Risks

- **Canvas-source invariant (load-bearing).** `BatchWorkspace` ~line 410:
  `state={batchRender.isRunning ? editorState.state : previewEditorState}`.
  `previewEditorState` re-pins to the active variant and MUST stay bypassed
  during a run; the render loop mutates `editorState.state`. Any new
  geometry/image application in render must go through the **live**
  `editorState`, not the derived preview. Do not reroute capture through the
  preview path.
- **Apply-then-restore-in-`finally` (load-bearing).** New geometry/image/hidden
  application in the render loop must snapshot the **full template original**
  for each touched node before mutating, and restore it in `finally` — guarding
  a mid-capture throw from leaving the template permanently mutated. Extend the
  existing snapshot, do not add a parallel restore mechanism.
- **Backward-compatible load.** Existing v4 projects with no geometry/image
  overrides must override nothing after migration. The v4 → v5 migration must
  be **idempotent and no-clobber** (mirror the v3 → v4 edge cases: zero
  overlays, stale keys skipped, existing override never overwritten, re-run is
  a no-op).
- **Fan-out semantics.** Active variant always in the selected set; edits fan
  across `selectedVariantIds` only. `reconcileVariantSelection`
  (`apps/web/src/lib/variant-selection.ts`) stays **unchanged**;
  `useFanOutTextHandlers` is **generalized** (not forked) to fan a node-override
  patch.
- **Order-sensitive:** schema/migration/helpers (Phase 1) must land before any
  edit-rerouting phase, because every later phase reads/writes the unified
  store.
- **Single migration ingress.** v4 → v5 is appended to the `migrateProject`
  chain only; ZIP import and the IDB adapter share it. Do not fork or add a
  second migration entry point.

## Decision Record

### D1 — Unified override store vs. additive geometry/image maps

**Chosen: unified.** Introduce one store
`itemNodeOverrides: Record<overlayId, Record<nodeId, NodeOverride>>` and
**migrate v4 → v5**, collapsing `itemTextValues`, `itemTextStyles`, and
`itemHiddenNodeIds` into it.

**Why:** The alternative (keep the three text maps, add parallel
`itemTextGeometry`, `itemOverlayGeometry`, `itemOverlayStyles`,
`itemOverlayHidden`, …) multiplies the number of maps the preview merge,
fan-out, and render loop must each read/write, and forces every consumer to
special-case text vs image and geometry vs style. A single
`Partial<Node>`-shaped override per (overlay, node) gives **one** read helper,
**one** write helper, **one** merge in the preview, **one** fan-out wrapper,
and **one** apply-restore in render — for *both* node kinds and *all* fields.
`itemHiddenNodeIds` already keys by arbitrary nodeId (not just text), so the
collapse is shape-compatible. The render/preview loops already iterate real
template nodes and only *read* the maps, so stale keys remain harmless under
the unified store.

**Rejected:** additive maps (combinatorial map explosion, duplicated merge
logic, more migration surface later); full per-item `EditorState` clone
(already rejected in [[per-item-text-schema]]: duplicates layout N times, breaks
template-layout propagation, bloats the project).

### D2 — How visibility is represented in the override value

`EditorNode` (TextNode / OverlayNode) has **no `hidden` field**, so visibility
cannot ride inside a plain `Partial<EditorNode>`.

**Chosen:** the override value is a small wrapper type
`NodeOverride = Partial<Omit<TextNode & OverlayNode, "id">> & { hidden?: boolean }`
— a `Partial` of overridable fields shared/unioned across both node kinds **plus
an optional `hidden` flag** that is *not* a Node field. `id` is `Omit`ted (the
key is the nodeId).

**Field-collision check (verified against `packages/editor/src/types.ts`):**
`TextNode` and `OverlayNode` overlap on `x`, `y`, `rotation`, `zIndex`,
`opacity` — and every shared field has the **same type** (`number`), so the
intersection `TextNode & OverlayNode` is well-formed with **no conflicting-type
collisions**. (`rotation`/`zIndex` are required on `TextNode` but optional on
`OverlayNode`; under `Partial<…>` every field is optional regardless, so the
divergence is inert.) `hidden` exists on neither node, so it cannot collide with
a real field. The wrapper is sound for both kinds. `hidden: true` means hidden for that variant;
absent/`false` means visible. The merge path strips `hidden` before spreading
onto the node (preview filters the node out; render sets `opacity: 0`), so the
flag never lands on a real Node and never reaches the DOM as an attribute.

**Why a wrapper over a sentinel (e.g. `opacity: 0` as "hidden"):** opacity is a
real, independently overridable field for both text and image overlays — a user
can legitimately set a partial opacity per variant. Overloading `opacity: 0` to
mean "hidden" would collide with that and lose the distinction between
"transparent" and "hidden" (preview must *filter* hidden nodes out, not just
make them transparent — a 0-opacity node still occupies selection/hit-testing).
A dedicated boolean keeps the two concerns orthogonal and preserves the
existing preview-filters / render-opacity:0 split documented in
[[live-preview-derived-state]] and [[batch-render-text-patch]].

**Why a wrapper over a discriminated `{ patch; hidden }` object:** the flat
`Partial<…> & { hidden? }` shape is the minimal delta from today's three maps,
keeps the merge a single spread, and reads naturally at call sites. `hidden` is
the only non-Node key, so collision risk is nil.

## Phases

### Phase 0: Create worktree

**This phase is always first. No exceptions.** (Mandated by
`.claude/skills/plan-sequential/SKILL.md` format-rule #1.)

Create a git worktree for this plan's branch (`feat/per-variant-geometry-image-overrides`,
base `main`). Always confirm worktree creation with the user before running.

**Note — implicit under `/execute-prd`:** if executed via `/execute-prd`, this
phase is handled automatically by its preflight (`execute-prd/SKILL.md` Phase 0
step 6 / Rule 2): the skill detects-or-creates the worktree, never ticks these
checkboxes, and starts phase iteration at Phase 1. The steps below are the
manual-execution path; they are documentation-only under `/execute-prd` — there
is no conflict, the section is intentionally retained per the format spec.

**Steps:**

- [ ] Confirm branch name (`feat/per-variant-geometry-image-overrides`) and base
      ref (`main`) with the user
- [ ] Run `git worktree add ../per-variant-geometry-image-overrides -b feat/per-variant-geometry-image-overrides main`
- [ ] Verify worktree is active and on the correct branch (`git worktree list`)

---

### Phase 1: Unified `itemNodeOverrides` store + v4 → v5 migration (regression-safe)

**Risk:** high
**Mode:** afk
**Type:** typescript
**Success criteria:** A migrated v4 project loads and **every existing
per-variant text behavior is preserved through the new unified store**: on the
batch workspace a user can still edit a text layer's content/style and
hide/restore a text layer for selected variants, and Generate All still renders
those per-variant text overrides correctly. No new UI surface yet — this slice
is observable because all current text features keep working end-to-end after
the store collapse + migration.

**Justification for thin-infra slice (allowed exception):** This is a
schema-only refactor with **no behavior change** — the one permitted
infra-prereq phase. It is made observable/regression-safe by rewiring the
existing text consumers (preview merge, fan-out, render apply-restore, per-item
helpers) onto the unified store in the same phase, so the acid test passes:
after this phase, all current per-variant text behavior still works on a
migrated project, now through `itemNodeOverrides`.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `packages/projects/src/schema.ts` | Add `NodeOverride` type (`Partial<…overridable fields…> & { hidden?: boolean }`); add `itemNodeOverrides: Record<string, Record<string, NodeOverride>>` to `BatchProject`; remove `itemTextValues`/`itemTextStyles`/`itemHiddenNodeIds` from the persisted v5 interface; bump `SCHEMA_VERSION` 4→5; add `migrateToV5` to the `migrateProject` chain (collapse the 3 maps into `itemNodeOverrides`, no-clobber + idempotent). |
| modify | `packages/projects/src/index.ts` | Replace `getTextValue`/`getTextStyle`/`setItemTextValue`/`setItemTextStyle`/`setItemNodeHidden` with unified `getNodeOverride`/`setNodeOverride`/`setNodeHidden` (immutable nested-map updates); keep thin text-content/style read shims if still ergonomic, implemented atop the unified store. |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Replace the three item* maps + their loop-over-overlayId setters with a single `itemNodeOverrides` state + unified `setNodeOverride`/`setNodeHidden`. |
| modify | `apps/web/src/hooks/use-item-text.ts` | Re-implement `getTextValue`/`getTextStyle`/`isNodeHidden`/`setNodeHidden` atop `itemNodeOverrides` (content/style read out of the unified override; hidden out of `hidden` flag). |
| modify | `apps/web/src/hooks/use-fan-out-text-handlers.ts` | Point the existing text-value/style/hidden fan-out wrappers at the unified setters (no signature change to callers yet — full generalization lands in Phase 2). |
| modify | `apps/web/src/hooks/use-preview-editor-state.ts` | Read content/style/hidden from `itemNodeOverrides[activeOverlayId][nodeId]` instead of the three maps; preserve early-return-base and minimal `useMemo` deps. |
| modify | `apps/web/src/hooks/use-batch-render.ts` | Read per-item content/style/hidden from `itemNodeOverrides` instead of the three maps; snapshot/apply/restore behavior identical. |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Update the wiring of the renamed store/setters/preview args (no new entry-point logic yet). |
| modify | `packages/projects/src/zip-export.ts` | **(scope-add, discovered during exec)** `serializeProjectJson` reads/emits `itemTextValues`/`itemTextStyles`; serialize `itemNodeOverrides` instead (ZIP is a shared migration ingress per Dependencies & Risks). |
| modify | `apps/web/src/hooks/use-zip-export.ts` | **(scope-add)** `ProjectState` + `assembleProject` build the three old maps; build `itemNodeOverrides` instead. |
| modify | `apps/web/src/__tests__/use-batch-project.test.ts` | **(scope-add)** update assertions from old API to unified store. |
| modify | `apps/web/src/__tests__/item-node-hidden.test.ts` | **(scope-add)** update to unified `setNodeHidden`/`hidden` flag. |
| modify | `apps/web/src/__tests__/hooks/use-preview-editor-state.test.ts` | **(scope-add)** update to read overrides from `itemNodeOverrides`. |
| modify | `apps/web/src/components/__tests__/BatchRightPanel-style-routing.test.tsx` | **(scope-add)** update setter-shape assertions to unified store. |
| modify | `apps/web/src/__tests__/use-project-persistence.test.ts` | **(scope-add)** build projects with `itemNodeOverrides`. |
| modify | `packages/projects/__tests__/idb-adapter.test.ts` | **(scope-add)** migrated-output assertions now expect v5 + `itemNodeOverrides`. |
| modify | `packages/projects/__tests__/zip-import.test.ts` | **(scope-add)** migrated-output assertions → `itemNodeOverrides`. |
| modify | `packages/projects/__tests__/zip-export.test.ts` | **(scope-add)** expect `schemaVersion: 5` + serialized `itemNodeOverrides`. |
| modify | `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` | **(scope-add)** unified setter arg contract (`setNodeOverride`/`setNodeHidden`). |
| modify | `packages/projects/README.md` | **(scope-add)** document unified `NodeOverride` API + schema v5 (per Documentation table). |

**Steps:**

- [x] Define `NodeOverride` and `itemNodeOverrides` in `schema.ts`; bump `SCHEMA_VERSION` to 5.
- [x] Write `migrateToV5(p)`: for each overlay key present across the three v4 maps, fold `content` → `NodeOverride.content`, the style partial → spread into the override, and each hidden nodeId → `hidden: true`; **no-clobber** (never overwrite an existing `itemNodeOverrides[overlay][node]` field), **idempotent** (re-run on a v5 record is a no-op), **stale keys skipped**, **zero-overlay** safe; drop the three old maps. Append to `migrateProject` chain after `migrateToV4`.
  - **Guard the version-literal monotonicity:** today `migrateToV3` sets `schemaVersion: SCHEMA_VERSION` (currently `4`) while `migrateToV4` sets the literal `4` (schema.ts ~lines 214, 269). Bumping `SCHEMA_VERSION` to 5 would make `migrateToV3` jump a v2 record straight to 5, skipping the v3→v4 fan-out. Fix `migrateToV3` to set the **literal** `3`, and have only `migrateToV5` (the new last link) set the literal `5`, so the chain steps 2→3→4→5 monotonically. Mirror the existing `migrateToV4` version-gate pattern in `migrateToV5` (gate on `schemaVersion >= 5` → return as-is for idempotency).
- [x] Add unified helpers `getNodeOverride`/`setNodeOverride`/`setNodeHidden` to `@maga/projects`; keep `getTextValue`/`getTextStyle` as thin reads over the unified store if callers still want them.
- [x] Rewire `use-batch-project`, `use-item-text`, `use-fan-out-text-handlers`, `use-preview-editor-state`, `use-batch-render`, and `BatchWorkspace` onto the unified store **with no observable text behavior change**.
- [x] Update `.ai/decisions/per-item-text-schema.md` → rename/retitle to schema v5: unified `itemNodeOverrides`, the v4→v5 collapse, the `hidden`-flag representation (D2). Update `.ai/index.md` `@maga/projects` row to "schema v5 (unified per-item node overrides …), v1→v5 chain".

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `packages/projects/__tests__/schema.test.ts` | v4→v5 migration: 3-map collapse correctness; **no-clobber** (existing `itemNodeOverrides` field never overwritten); **idempotent** (re-run on v5 = no-op); **stale key skipped**; **zero-overlay** safe; hidden nodeIds → `hidden: true`; SCHEMA_VERSION asserted 5. **Full-chain test:** a **v2** record run through `migrateProject` lands at v5 with its v3→v4 fan-out applied (guards the version-literal monotonicity fix — `migrateToV3` must not skip straight to 5). Mirror the v4 edge-case block (lines ~184-272). |
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | Update existing text-value/style/hidden phases to source from `itemNodeOverrides`; assert apply/restore `updateTextNode` call shape unchanged. |

**Verification:**

- [x] Automated tests pass: `pnpm test` (run in `packages/projects` and `apps/web`). — projects 55/55, web 305/305; both `tsc --noEmit` clean.
- [ ] Load an existing v4 project: text content/style edits + hide/restore for selected variants still work; Generate All renders per-variant text correctly (manual smoke).

**Phase review:**

- [ ] All Steps and Verification checkboxes ticked in the plan file
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn — N/A under `/execute-prd` (code-reviewer subagent used instead).
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session — N/A under `/execute-prd`.
- [x] Code-reviewer agent has verified this phase — verdict green (nits: stale JSDoc link fixed; residual `{hidden:false}` noted for later).
- [x] Reviewer-driven changes reflected back into this plan file
- [x] Tests written and passing
- [x] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [x] Changes committed: `refactor(projects): collapse v4 text maps into unified itemNodeOverrides (schema v5)` — code commit f406e30; plan checkboxes + JSDoc nit in orchestrator follow-up commit.
- [ ] Phase marked complete

---

### Phase 2: Text position per-variant (drag) end-to-end

**Risk:** high
**Mode:** mixed
**Type:** mixed
**Success criteria:** Dragging a **text** node on the canvas writes an x/y
override for the **selected variants only** (active always included), not the
shared template. The move persists, the preview shows it for the active
variant, other (unselected) variants stay put, and Generate All renders each
selected variant at its overridden position.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/hooks/use-fan-out-text-handlers.ts` | **Generalize** to expose a `handleSetNodeOverride(_overlayId, nodeId, patch: NodeOverride)` that loops `selectedVariantIds` and calls `setNodeOverride`; keep existing text-value/style/hidden wrappers as thin callers of it. |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Reroute `handleNodeMove` (~lines 170-178): for a **text** node, call the fan-out `handleSetNodeOverride(activeOverlayId, nodeId, { x, y })` instead of `editorState.updateTextNode`. (Image nodes still hit the template until Phase 4.) |
| modify | `apps/web/src/hooks/use-preview-editor-state.ts` | When merging, spread the override's geometry (x/y) onto text nodes (already spreading style — extend to all overridable fields). |
| modify | `apps/web/src/hooks/use-batch-render.ts` | In the apply step, the merged `updateTextNode` call already takes a `Partial<TextNode>`; include x/y from the override. Extend the **pre-loop snapshot** to capture x/y so `finally` restores position too. |

**Steps:**

- [x] Generalize `useFanOutTextHandlers` to a node-override fan-out; re-express the text-value/style/hidden handlers on top of it.
- [x] Reroute `handleNodeMove` for text nodes through the fan-out override (no `editorState.updateTextNode` for per-variant edits).
- [x] Extend preview merge to apply override geometry to text nodes. (Already generic strip-hidden-then-spread — x/y flows through.)
- [x] Extend render apply + `finally` restore to include x/y in the snapshot/patch.
- [x] Update `.ai/patterns/live-preview-derived-state.md` and `.ai/patterns/batch-render-text-patch.md`: the merge/apply now carries geometry (x/y), not just content+style.

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | New phase: text position override applied before capture and restored in `finally`; snapshot includes x/y; assert `updateTextNode.mock.calls` apply/restore order + shape. |
| modify | `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` | (File exists today.) Add a case: `handleSetNodeOverride` fans the patch across every id in `selectedVariantIds`; ignores the passed overlayId. Keep the existing text-value/style/hidden cases green (they assert the thin wrappers still call through). |
| create | `apps/web/src/__tests__/use-preview-editor-state.test.ts` | (File does NOT exist today — create it.) Override x/y is applied to the active variant's text node; unselected variants unchanged; early-return-base preserved when no overrides. |

**Verification:**

- [x] Automated tests pass: `pnpm test` in `apps/web`. — 314/314 pass; `tsc --noEmit` clean.
- [ ] Manual: select two variants, drag a text node; both move, the third stays; Generate All output shows the moved position only on the two (smoke).

**Phase review:**

- [ ] All Steps and Verification checkboxes ticked in the plan file
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn — N/A under `/execute-prd` (code-reviewer subagent used).
- [x] Orchestrator cleared context and pasted the handoff prompt into a fresh session — N/A under `/execute-prd`.
- [x] Code-reviewer agent has verified this phase — verdict green (only cosmetic non-blocking nits).
- [x] Reviewer-driven changes reflected back into this plan file
- [x] Tests written and passing
- [x] Documentation updated
- [ ] Orchestrator (user) has verified and approved this phase
- [x] Changes committed: `feat(batch): per-variant text position (drag) via unified node overrides` — commit a8ae1bf.
- [ ] Phase marked complete

---

### Phase 3: Text size per-variant (resize) end-to-end

**Risk:** medium
**Mode:** mixed
**Type:** mixed
**Success criteria:** Resizing a **text** node (width/height/fontSize) on the
canvas writes a size override for the **selected variants only**. Persists,
previews on the active variant, leaves unselected variants unchanged, and
Generate All renders each selected variant at its overridden size.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Reroute `handleNodeResize` (~lines 170-178) for **text** nodes through `handleSetNodeOverride(activeOverlayId, nodeId, { width, height })` instead of `editorState.updateTextNode`. (**Exec note:** the canvas resize handler only provides `{ width, height }`; `fontSize` is not a resize input — it's set via the style panel, already per-variant since Phase 1. Text canvas-resize is also not wired today — `TextNodeLayer` has no resize handle — so this reroute is correct + future-proof but inert for text until a handle exists.) |
| modify | `apps/web/src/hooks/use-preview-editor-state.ts` | Already spreads full override (Phase 2) — confirm size fields flow through; no new code if generic. |
| modify | `apps/web/src/hooks/use-batch-render.ts` | Extend pre-loop snapshot + restore to cover width/height/fontSize (or confirm covered by the generic field set from Phase 2). |

**Steps:**

- [x] Reroute `handleNodeResize` for text nodes through the fan-out override.
- [x] Confirm preview merge + render snapshot/restore already cover size fields generically; add fields if the merge is field-listed rather than full-spread. (Preview already generic; render snapshot extended for width/height — fontSize already covered.)
- [x] Update the two pattern docs only if the field set widened beyond what Phase 2 noted. (Widened "geometry" → "geometry/size".)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | Text size override applied + restored; snapshot includes width/height/fontSize. |
| modify | `apps/web/src/__tests__/use-preview-editor-state.test.ts` | Size override applied to active variant's text node. |

**Verification:**

- [x] Automated tests pass: `pnpm test` in `apps/web`. — 320/320 pass; `tsc --noEmit` clean.
- [ ] Manual: resize a text node on selected variants; size diverges per selection; Generate All confirms (smoke). — **Note:** text canvas-resize is not wired today (no `TextNodeLayer` handle); per-variant text size is exercised via the style panel `fontSize` (already per-variant). Smoke applies once a text resize handle exists.

**Phase review:**

- [ ] All Steps and Verification checkboxes ticked in the plan file
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn — N/A under `/execute-prd`.
- [x] Orchestrator cleared context and pasted the handoff prompt into a fresh session — N/A under `/execute-prd`.
- [x] Code-reviewer agent has verified this phase — verdict green (plan-only nit reconciled: fan `{width,height}`, not fontSize).
- [x] Reviewer-driven changes reflected back into this plan file
- [x] Tests written and passing
- [x] Documentation updated (if applicable)
- [ ] Orchestrator (user) has verified and approved this phase
- [x] Changes committed: `feat(batch): per-variant text size (resize) via unified node overrides` — commit 7040c5c.
- [ ] Phase marked complete

---

### Phase 4: Image overlay geometry (position + size) end-to-end

**Risk:** high
**Mode:** mixed
**Type:** mixed
**Success criteria:** Dragging or resizing an **image overlay** node writes
x/y/width/height overrides for the **selected variants only**, not the shared
template. Persists, previews on the active variant, leaves unselected variants
unchanged, and Generate All renders each selected variant's overlay at its
overridden geometry.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Reroute `handleNodeMove` / `handleNodeResize` for **overlay** nodes through `handleSetNodeOverride` (currently they hit `editorState.updateOverlayNode`). Branch on node kind so text and image both fan out. |
| modify | `apps/web/src/hooks/use-preview-editor-state.ts` | Apply the override patch to **overlay** nodes too (today only text nodes get overrides merged); spread x/y/width/height. Preserve early-return-base. |
| modify | `apps/web/src/hooks/use-batch-render.ts` | Add an overlay apply-restore path: snapshot each touched overlay node's template original, mutate the **live** state via `editorState.updateOverlayNode` with the override patch before capture, restore in `finally`. Mirror the text apply-restore shape. |

**Steps:**

- [ ] Branch `handleNodeMove`/`handleNodeResize` on node kind; route overlay nodes through the fan-out override.
- [ ] Extend the preview merge to apply overrides to overlay nodes (not just text).
- [ ] Add the overlay snapshot + `updateOverlayNode` apply + `finally` restore in the render loop, following the existing text pattern (full template snapshot, guard throws).
- [ ] Update `.ai/patterns/live-preview-derived-state.md` and `.ai/patterns/batch-render-text-patch.md`: merge/apply-restore now spans **overlay** nodes (geometry), via `updateOverlayNode`.

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | New overlay phase: overlay geometry override applied via `updateOverlayNode` before capture, restored in `finally`; assert apply/restore order + shape (mirror the text assertions, add `updateOverlayNode.mock.calls`). |
| modify | `apps/web/src/__tests__/use-preview-editor-state.test.ts` | Overlay node gets x/y/width/height override applied for the active variant; unselected variants unchanged. |

**Verification:**

- [ ] Automated tests pass: `pnpm test` in `apps/web`.
- [ ] Manual: move/resize an image overlay on selected variants only; template + other variants unchanged; Generate All confirms per-variant overlay geometry (smoke).

**Phase review:**

- [ ] All Steps and Verification checkboxes ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Reviewer-driven changes reflected back into this plan file
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(batch): per-variant image overlay geometry via unified node overrides`
- [ ] Phase marked complete

---

### Phase 5: Image overlay style/transform per-variant (OverlayControlsPanel) end-to-end

**Risk:** high
**Mode:** mixed
**Type:** mixed
**Success criteria:** Every transform `OverlayControlsPanel` exposes — opacity,
rotation, cornerRadius, dropShadow, featherRadius, aspectRatioLocked — applied
to an image overlay writes an override for the **selected variants only**.
Persists, previews on the active variant, leaves unselected variants unchanged,
and Generate All renders each selected variant's overlay with its transforms.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BatchRightPanel.tsx` | Reroute `OverlayControlsPanel` `onChange` (~lines 181-191) from `editorState.updateOverlayNode` (direct template mutation) to the fan-out `handleSetNodeOverride(activeOverlayId, nodeId, patch)`. Mirror how `TextStylePanel` (~lines 141-178) already routes per-variant when an overlay context exists. |
| modify | `apps/web/src/hooks/use-batch-render.ts` | Ensure the overlay apply-restore snapshot/patch (Phase 4) covers the transform fields (opacity/rotation/cornerRadius/dropShadow/featherRadius/aspectRatioLocked), not just geometry. |
| modify | `apps/web/src/hooks/use-preview-editor-state.ts` | Confirm the overlay override spread covers transform fields (generic spread should already). |

**Steps:**

- [ ] Reroute `OverlayControlsPanel.onChange` through the fan-out override.
- [ ] Ensure render snapshot/restore covers all overlay transform fields.
- [ ] Confirm preview merge spreads transform fields onto overlay nodes.
- [ ] Update `.ai/index.md` cross-cutting rows + `.ai/patterns/*` to note overlay style/transform is now per-variant (no longer a direct template mutation).

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | Overlay transform override (e.g. opacity, rotation, dropShadow) applied + restored; snapshot covers transform fields. |
| modify | `apps/web/src/__tests__/use-preview-editor-state.test.ts` | Overlay transform override applied to active variant; unselected variants unchanged. |

**Verification:**

- [ ] Automated tests pass: `pnpm test` in `apps/web`.
- [ ] Manual: change opacity/rotation/cornerRadius/dropShadow/featherRadius/aspectRatioLocked on selected variants; template + other variants unchanged; Generate All confirms (smoke).

**Phase review:**

- [ ] All Steps and Verification checkboxes ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Reviewer-driven changes reflected back into this plan file
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(batch): per-variant image overlay style/transform via OverlayControlsPanel fan-out`
- [ ] Phase marked complete

---

### Phase 6: Image overlay visibility (delete/hide) per-variant end-to-end

**Risk:** medium
**Mode:** mixed
**Type:** mixed
**Success criteria:** Deleting/hiding an **image overlay** (via
`OverlayControlsPanel.onDelete` / `handleDeleteOverlayNode`) hides it for the
**selected variants only** through the unified `hidden` flag — the template node
survives, unselected variants keep the overlay, and the new **"Variant overlays"
eye-toggle** (in `BatchRightPanel`, mirroring "Variant text") restores it.
Preview filters the hidden overlay out; Generate All renders it with
`opacity: 0` for the hidden variants only.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Reroute `handleDeleteOverlayNode` (~lines 214-222) from `editorState.removeNode` (deletes the template node) to the fan-out `handleSetNodeHidden(activeOverlayId, nodeId, true)`. |
| modify | `apps/web/src/components/batch/BatchRightPanel.tsx` | (1) Point `OverlayControlsPanel.onDelete` (~line 184, `onDeleteOverlayNode`) at the per-variant hide handler — hiding clears the selection, so the panel unmounts and CANNOT host the restore control. (2) Add a new `ItemOverlayPanel` list component (a structural copy of the existing `ItemTextPanel`, ~lines 220-263) rendered inside a new `Collapsible title="Variant overlays"` next to the existing "Variant text" collapsible (~lines 196-207); it lists the template's **overlay** nodes for the `activeOverlay`, each with an eye/eye-off toggle calling `handleSetNodeHidden(activeOverlay.id, node.id, !hidden)`. This is the un-hide entry point — confirmed absent today (`OverlayControlsPanel` exposes only a destructive Delete button, no eye-toggle; the text eye-toggle lives only in `ItemTextPanel`, keyed to text nodes). |
| modify | `apps/web/src/hooks/use-preview-editor-state.ts` | Filter **overlay** nodes out when `hidden` is set for the active overlay (today only text nodes are filtered). |
| modify | `apps/web/src/hooks/use-batch-render.ts` | Set `opacity: 0` on hidden **overlay** nodes before capture; restore in `finally` (mirror the hidden-text path). |

**Steps:**

- [ ] Reroute `handleDeleteOverlayNode` + `OverlayControlsPanel.onDelete` to the per-variant hide handler.
- [ ] Extend preview filter to overlay nodes flagged `hidden`.
- [ ] Extend render hide (`opacity: 0`) + `finally` restore to overlay nodes.
- [ ] Add the restore affordance: build `ItemOverlayPanel` (structural copy of `ItemTextPanel`) — a "Variant overlays" `Collapsible` listing the active overlay's image-overlay nodes, each with an eye/eye-off toggle wired to `handleSetNodeHidden`. This is required (not conditional): `OverlayControlsPanel` has no eye-toggle, and hide clears selection so the panel can't host one. Reuse the existing `Eye`/`EyeOff` icons + button markup from `ItemTextPanel`; factor the shared per-node row into a small helper if it reads cleanly, otherwise mirror it.
- [ ] Update `.ai/decisions/per-item-text-schema.md` (now v5) + the two pattern docs: hidden now covers overlays too; preview filters / render opacity:0 path unchanged in mechanism.

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/use-batch-render.test.ts` | Hidden overlay → `opacity: 0` before capture, restored in `finally`. |
| modify | `apps/web/src/__tests__/use-preview-editor-state.test.ts` | Hidden overlay filtered out of derived nodes for the active variant; visible for unselected variants. |
| create | `apps/web/src/__tests__/item-overlay-panel.test.tsx` | `ItemOverlayPanel` renders an eye-toggle per overlay node; clicking a hidden overlay's eye calls `handleSetNodeHidden(overlayId, nodeId, false)` (restore). Mirror `overlay-controls-panel.test.tsx` / `item-node-hidden.test.ts` harness. |

**Verification:**

- [ ] Automated tests pass: `pnpm test` in `apps/web`.
- [ ] Manual: delete/hide an overlay on selected variants; template node survives, other variants keep it, eye restores; Generate All shows it hidden only for the hidden variants (smoke).

**Phase review:**

- [ ] All Steps and Verification checkboxes ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Reviewer-driven changes reflected back into this plan file
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(batch): per-variant image overlay visibility (hide/restore) via unified hidden flag`
- [ ] Phase marked complete

---

### Phase 7: Final Verification

**This phase runs after all other phases are complete.**
**Mode:** hil

**Overall success criteria:**

- [ ] Moving/resizing/restyling/hiding a **text** OR **image** node on the batch
      canvas affects **only the selected variants** (active always included),
      never the shared template; unselected variants and the template stay
      pristine.
- [ ] An existing **v4 project** loads through `migrateProject` and overrides
      nothing it didn't already override (idempotent, no-clobber); a freshly
      created v5 project round-trips through ZIP + IDB unchanged.
- [ ] **Generate All** renders each variant with its own per-variant geometry,
      image transforms, and visibility — verified against the expected output
      for a multi-variant project.
- [ ] CLAUDE.md invariants intact: pnpm only; entry points thin (logic in
      hooks/helpers); reuse-before-reinvent (fan-out + reconcile reused, not
      forked); `.ai/` docs synced (schema v5 decision, both patterns updated,
      index row updated).

**Steps:**

- [ ] Every preceding phase's Steps/Verification/Phase-review checkboxes are ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent reviews the entire change end-to-end
- [ ] Reviewer-driven changes reflected back into this plan file
- [ ] All tests pass: `pnpm test` (`packages/projects` + `apps/web`)
- [ ] Re-confirm the canvas-source invariant (`state={batchRender.isRunning ? editorState.state : previewEditorState}`) is unchanged
- [ ] No CLAUDE.md invariants violated
- [ ] Feature tested manually (golden path: text + image geometry/style/hide across a 3-variant project; edge cases: v4 load, zero overlays, hide+restore, Generate All)
- [ ] Overall success criteria met
- [ ] All phase checkboxes above are ticked

## Documentation

| Change | Documentation location |
| ------ | ---------------------- |
| Unified `itemNodeOverrides` store; v4→v5 migration; `hidden`-flag representation | `.ai/decisions/per-item-text-schema.md` (retitle to schema v5) |
| Preview merge now applies geometry + image transforms + hidden to text **and** overlay nodes | `.ai/patterns/live-preview-derived-state.md` |
| Render apply-restore now spans geometry, overlay transforms, and overlay hidden via `updateOverlayNode` | `.ai/patterns/batch-render-text-patch.md` |
| `@maga/projects` schema version + responsibility; cross-cutting fan-out/preview/hiding rows | `.ai/index.md` |
| Package public-API surface (`getNodeOverride`/`setNodeOverride`/`setNodeHidden`, `NodeOverride`) | `packages/projects/README.md` (if present) |

## Knowledge Base Impact

| `.ai/` artifact | Action | What it captures |
| --------------- | ------ | ---------------- |
| `decisions/per-item-text-schema.md` | update | Schema v5: unified `itemNodeOverrides` (D1 unified-vs-additive rationale), `hidden`-flag representation (D2), v4→v5 migration edge cases. Supersedes the v4 three-map description. |
| `patterns/live-preview-derived-state.md` | update | Merge now applies a single `NodeOverride` patch (geometry/size/transform + filter-on-hidden) to **both** text and overlay nodes; minimal-deps + early-return-base contracts preserved. |
| `patterns/batch-render-text-patch.md` | update | Apply-restore now covers geometry, overlay transforms, and overlay hidden (`updateOverlayNode`, `opacity:0`); full-snapshot restore in `finally` extended to the new fields. |
| `index.md` | update | `@maga/projects` row → schema v5 (unified per-item node overrides), v1→v5 chain; cross-cutting fan-out/preview/hiding rows note text **and** image coverage. |

## Tests

| Phase | Logic under test | Test file |
| ----- | ---------------- | --------- |
| Phase 1 | v4→v5 migration: collapse, no-clobber, idempotent, stale-key, zero-overlay, SCHEMA_VERSION=5 | `packages/projects/__tests__/schema.test.ts` |
| Phase 1 | Existing text apply/restore sourced from `itemNodeOverrides` (no behavior change) | `apps/web/src/__tests__/use-batch-render.test.ts` |
| Phase 2 | Fan-out node-override across `selectedVariantIds` | `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` |
| Phase 2 | Text position override: preview merge + render apply/restore | `apps/web/src/__tests__/use-preview-editor-state.test.ts`, `apps/web/src/__tests__/use-batch-render.test.ts` |
| Phase 3 | Text size override: preview merge + render apply/restore | same two files |
| Phase 4 | Overlay geometry override via `updateOverlayNode`: preview + render apply/restore | same two files |
| Phase 5 | Overlay transform overrides: preview + render apply/restore | same two files |
| Phase 6 | Overlay hidden: preview filter + render `opacity:0` restore | same two files |
| Phase 6 | `ItemOverlayPanel` eye-toggle restore affordance | `apps/web/src/__tests__/item-overlay-panel.test.tsx` |

## Human Summary

**What & why:** The batch workspace currently personalizes only *text* per
variant; image overlays and text geometry leak edits to the shared template. We
extend per-variant overrides to cover **node geometry (position + size) and the
full image-overlay surface** (geometry, all transforms, and visibility), so an
edit on selected variants stays on those variants.

**How the phases connect:** Phase 1 is a schema refactor — it collapses the
three text maps into one unified `itemNodeOverrides` store and migrates v4→v5,
while keeping all existing text behavior working (so it's observable and
regression-safe). Phases 2–6 are vertical slices, each adding one user-visible
capability end-to-end (drag text → resize text → move/resize image → restyle
image → hide image), reusing the same fan-out, preview-merge, and
render-apply-restore plumbing. The final phase verifies the whole thing against
a real multi-variant Generate All and a v4 project load.

**Key trade-offs:** We chose a single unified override store over additive
per-kind maps (one merge/fan-out/render path instead of many — D1), and a
dedicated `hidden` boolean wrapper over overloading `opacity:0` (keeps
"transparent" and "hidden" distinct, preserves the preview-filter vs
render-opacity split — D2). The migration is one-way, idempotent, and
no-clobber, mirroring the proven v3→v4 edge-case handling.
