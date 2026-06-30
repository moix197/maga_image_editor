# Plan: Fix Overlay Import (JPG), Export Blur, and Aspect-Lock Selection Box

**Created:** 2026-06-30
**Branch:** fix/overlay-import-export-aspect
**Shape:** Sequential
**Status:** not started

## Context

Three independent bug fixes reported against the image editor:

1. **JPG import blocked** — the "Add Image Overlay" button's file picker filters
   out JPG/JPEG (and WebP/GIF) files; users can only pick PNG/SVG.
2. **Overlay blur on export** — exporting at large sizes renders the *overlay*
   image fuzzy even when the source overlay is high-resolution; the base image
   stays sharp.
3. **Aspect-lock selection box drift** — when "lock aspect ratio" is enabled and
   the image is enlarged, the blue selection box should keep the image's aspect
   ratio but doesn't (it letterboxes via `objectFit: contain`).

Each fix is a self-contained vertical slice with its own QA-exercisable outcome.
They are ordered to avoid a file conflict: Phases 1 and 3 both touch
`BatchWorkspace.tsx`, so they run sequentially, not in parallel.

### Confirmed source locations (verified by research, not assumed)

| Artifact | Path |
|---|---|
| Image-overlay file input (`accept`) | `apps/web/src/components/batch/BatchRightPanel.tsx:115-126` (button `:114`, accept at `:118`) |
| Overlay-node file handler | `apps/web/src/components/batch/BatchWorkspace.tsx:170-172` (`handleOverlayFile`, no validation today) |
| Shared validation helper | `apps/web/src/lib/image-helpers.ts:1-12` (`ALLOWED_TYPES` line 1 = `jpeg/png/webp/gif`, no SVG today; `validateImageFile` lines 4-12) |
| Good `accept` reference | `apps/web/src/components/batch/AssetUploadZone.tsx:92` (`accept={accept}` binding; prop default at `:15` is `image/jpeg,image/png,image/webp,image/gif`, no SVG) |
| `validateImageFile` consumer | `apps/web/src/components/image-uploader.tsx:26` (inside `processFile`, lines 25-32; component is not mounted on any live route today) |
| Cover-crop helper | `apps/web/src/lib/cover-crop.ts:10-29` (`coverCropDataUrl(src, slotW, slotH)`; canvas sized to `slotW × slotH` at `:23-24`) |
| Single render hook | `apps/web/src/hooks/use-single-composite.ts:83` (only `coverCropDataUrl` call in the file) |
| Batch render hook | `apps/web/src/hooks/use-batch-render.ts:283` (only `coverCropDataUrl` call in the file) |
| Export post-pass | `apps/web/src/lib/canvas-post-pass.ts:159-160` (`drawOverlayImage`, `w/h = node.width/height * pr`), `:201-202` (`applyImageOverlayPostPass` canvas sizing) |
| Export pixelRatio (hardcoded 2×, no shared constant — literal `2` duplicated 4×) | `apps/web/src/lib/export-helpers.ts:46,68,72-78` |
| `VariableSlot` schema (unrelated to aspect-lock) | `packages/projects/src/schema.ts:70-77` |
| `OverlayNode` type (`aspectRatioLocked?: boolean`) | `packages/editor/src/types.ts:54-67` (field at `:67`); default value in `DEFAULT_OVERLAY_NODE`, `packages/editor/src/defaults.ts` |
| Overlay node layer (blue box, drag) | `apps/web/src/components/overlay-node-layer.tsx:40-41` (`buildOverlayStyle` size), `:67` (`objectFit: contain`), `:117-122` (`handleResizePointerMove`, no lock applied), `:142-144` (outline) |
| Overlay controls (lock + inputs) | `apps/web/src/components/overlay-controls-panel.tsx:52-63` (`applyAspectRatioLock` — preserves box's *current* ratio), `:131-174` (Size inputs) |
| Handle-drag resize handler | `apps/web/src/components/batch/BatchWorkspace.tsx:183-190` (`handleNodeResize`, writes via `fanOut.handleSetNodeOverride`, no lock logic); wired at `:440` (`onNodeResize={handleNodeResize}`) |
| Canvas wiring | `apps/web/src/components/text-overlay-canvas.tsx:68` (`onResize={(w, h) => onNodeResize(node.id, w, h)}`) |

## Risk: medium

Phase 2 (export pipeline) is the riskiest — it touches the coordinate contract
shared between `coverCropDataUrl` and the post-pass, and must not balloon
export memory. (No separate on-screen preview is at risk — see Dependencies &
Risks.) Phases 1 and 3 are low/medium.

## Dependencies & Risks

- **Phase 1 ↔ Phase 3 share `BatchWorkspace.tsx`.** Run in order; do not
  parallelize. Phase 1 edits `handleOverlayFile` (~`:170`), Phase 3 edits
  `handleNodeResize` (~`:183`) — distinct functions, but same file.
- **`image-helpers.ts` has other callers.** `validateImageFile` is used by
  `image-uploader.tsx:26`. Extending `ALLOWED_TYPES` (SVG, `image/jpg`) must not
  regress that caller — confirm SVG is acceptable there, or scope the SVG
  allowance to the overlay path only.
- **`accept` vs MIME mismatch.** Some OSes report JPG as non-standard
  `image/jpg`; the OS picker filters by `accept`, runtime validation filters by
  `file.type`. Cover both: include `image/jpeg` in `accept` (browsers map `.jpg`
  to `image/jpeg` for the dialog) and treat `image/jpg` as valid in the guard.
- **Export memory/perf.** Cropping overlays at `slot * pixelRatio` (2×) quadruples
  overlay bitmap area vs today. Acceptable for sharpness, but verify large
  exports still complete and file size stays reasonable.
- **No separate on-screen preview to protect — confirmed.** `coverCropDataUrl`
  has exactly two call sites (`use-single-composite.ts:83`,
  `use-batch-render.ts:283`), each independent, uncached, and each already
  feeding a `pixelRatio: 2` consumer (`compositeFromElement` /
  `exportCanvasElement` in `export-helpers.ts`). There is no lower-res preview
  to keep separate — both call sites are raster-generation paths (single
  export, batch export) that already suffer the same blur today. Bump the
  scale at **both** call sites unconditionally; no "export-only" branch is
  needed, and the interactive editing canvas (`overlay-node-layer.tsx`) never
  calls `coverCropDataUrl` at all, so it's unaffected either way.
- **Intrinsic ratio source.** The `<img>` natural W/H is currently read
  nowhere in the codebase (no `naturalWidth`/`onLoad` usage anywhere under
  `apps/web/src` or `packages/*`). Store it in a component-level ref/Map keyed
  by node id (populated on `<img onLoad>`), **not** a new persisted field on
  `OverlayNode` — `packages/editor/src/types.ts` already has
  `aspectRatioLocked`, but adding a *new* field would touch the
  `packages/projects` v1→v5 migration chain for no real benefit, since the
  ratio is cheaply re-derivable from the already-loaded `<img>` each session.
  Fall back to the current (unconstrained) behavior for a node whose ratio
  isn't in the map yet (e.g. image not yet loaded).

---

## Phases

### Phase 0 — Worktree Setup

**Risk:** low
**Mode:** hil
**Type:** config
**Success criteria:** Isolated worktree on `fix/overlay-import-export-aspect` is active and existing tests pass green on the clean branch.
**Commit message:** *(no commit — setup only)*

**Steps:**

- [ ] Confirm branch name and base ref (`main`) with the user
- [ ] `git worktree add ../maga-overlay-fixes -b fix/overlay-import-export-aspect main`
- [ ] `cd ../maga-overlay-fixes && pnpm install`
- [ ] `pnpm --filter @maga/web test` exits 0 on the clean branch

**Tests:**

No automated tests — justified because: pure worktree scaffolding with no behavior change.

**Verification:**

- [ ] `git worktree list` shows the new worktree on the correct branch
- [ ] `pnpm --filter @maga/web test` exits 0

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked
- [ ] Orchestrator approved

---

### Phase 1 — Image-overlay import accepts JPG/WebP/GIF (and keeps SVG)

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** QA clicks "Add Image Overlay" and the file dialog allows selecting `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, and `.svg`; selecting a JPG imports it as an overlay node. Selecting an unsupported file (e.g. `.pdf`) is rejected gracefully (no crash, no broken node).
**Commit message:** `fix(overlay): accept jpg/webp/gif in image-overlay import`

### Root cause (confirmed)

`validateImageFile`'s `ALLOWED_TYPES` (`image-helpers.ts:1`) already includes
`image/jpeg, image/png, image/webp, image/gif` — JPEG is **not** currently
rejected by the validator. The block is entirely at the OS file-picker layer:
`BatchRightPanel.tsx:118`'s `accept="image/png,image/svg+xml"` never lets the
user select a `.jpg` in the dialog. Separately, `handleOverlayFile`
(`BatchWorkspace.tsx:170-172`) calls `validateImageFile` **zero times today**
— any file that does get past `accept` (e.g. a drag-drop bypassing the
dialog) goes straight to `fileToDataUrl` with no guard at all.

### Resolved decisions baked in

- **Accept set:** `image/jpeg, image/png, image/webp, image/gif, image/svg+xml`
  (JPEG/PNG/WebP/GIF **plus** keep existing SVG support) — LOCKED.
- **Add a runtime guard** in `handleOverlayFile` for parity with
  `image-uploader.tsx`, so a dragged/edge-case file that bypasses `accept` is
  validated before becoming a node (closes the zero-validation gap above).
- **Treat `image/jpg` as valid** (non-standard MIME some OSes emit for JPG).

### File changes

| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/batch/BatchRightPanel.tsx` | Change `accept` at `:118` from `image/png,image/svg+xml` to `image/jpeg,image/png,image/webp,image/gif,image/svg+xml` |
| modify | `apps/web/src/lib/image-helpers.ts` | Extend `ALLOWED_TYPES` (currently `jpeg/png/webp/gif`, line 1) to add `image/svg+xml` and accept `image/jpg` as a jpeg alias; existing 4 entries are untouched so `image-uploader` does not regress |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | In `handleOverlayFile` (`:170-172`), guard with `validateImageFile(file)` before `fileToDataUrl`; on invalid, no-op (or surface existing error path) instead of creating a node |
| modify | `apps/web/src/__tests__/lib/image-helpers.test.ts` | Extend existing suite with new allowed types — see Tests |

### Steps

- [x] Update `accept` at `BatchRightPanel.tsx:118` to the locked 5-type list
- [x] Extend `ALLOWED_TYPES` in `image-helpers.ts` to add `image/svg+xml` and treat `image/jpg` as jpeg; verify `image-uploader.tsx` still behaves (SVG now allowed there too — that component is currently unmounted on any live route, so the practical blast radius is zero today, but confirm the data-url `<img>` rendering path it uses doesn't execute embedded SVG scripts before relying on that)
- [x] Add `validateImageFile(file)` guard in `handleOverlayFile` (`BatchWorkspace.tsx:170`) before data-url conversion; reject invalid files without creating a node
- [x] Update `.ai/` doc for the overlay-import accept set (see Documentation)
- [x] Write/extend tests (see Tests section)

### Tests

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/lib/image-helpers.test.ts` | Existing suite (vitest; covers accept jpeg/png/webp/gif, reject unsupported, size limits) — add cases: accepts `image/svg+xml` and `image/jpg`; rejects `application/pdf` and unknown types (unchanged from before) |

### Verification

- [x] `pnpm --filter @maga/web test` exits 0
- [x] `pnpm --filter @maga/web exec tsc --noEmit` exits 0
- [ ] `pnpm --filter @maga/web build` exits 0 _(deferred to Phase 4 gates)_
- [ ] Manual: "Add Image Overlay" dialog shows JPG/JPEG/WebP/GIF/PNG/SVG as selectable; pick a `.jpg` → overlay node appears with the image _(deferred to Phase 4 manual)_
- [ ] Manual: confirm batch-variant "Overlays" upload (`AssetUploadZone`) still accepts the same set (no regression) _(deferred to Phase 4 manual)_

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file _(automated gates; manual + build at Phase 4)_
- [x] Code-reviewer agent has verified this phase
- [x] Any reviewer-driven changes reflected back into this plan file _(none — green, no changes requested)_
- [x] Tests written and passing
- [x] Documentation updated
- [ ] Orchestrator approved
- [x] Changes committed: `fix(overlay): accept jpg/webp/gif in image-overlay import`
- [x] Phase marked complete

---

### Phase 2 — Overlay images export sharp at large sizes

**Risk:** medium
**Mode:** afk
**Type:** frontend
**Success criteria:** QA exports a large composite containing a high-resolution image overlay; the overlay renders sharp (not fuzzy), matching the crispness of the base image. The interactive editing canvas is unaffected (it never rasterizes through `coverCropDataUrl`), and large exports still complete with reasonable file size.
**Commit message:** `fix(export): render image overlays at full resolution to remove blur`

### Root cause (confirmed)

Overlays are pre-rasterized to display-pixel slot size, then upscaled 2× by the
export post-pass:

- `coverCropDataUrl(src, slot.width, slot.height)` is called in
  `use-single-composite.ts:83` and `use-batch-render.ts:283` — the only two
  call sites in the codebase.
- `cover-crop.ts:10-29` sizes its crop canvas to exactly `slotW × slotH`
  (`:23-24`, 1× CSS px), discarding source detail.
- The post-pass (`canvas-post-pass.ts:159-160` `drawOverlayImage`, `:201-202`
  `applyImageOverlayPostPass` canvas sizing) then draws at `node.width * pr`
  with `pr = 2` (hardcoded `pixelRatio: 2`, duplicated as a bare literal 4×
  across `export-helpers.ts:46,68,72-78` — no shared constant exists).

The base image stays sharp because it goes straight through `html-to-image` at
2× and never passes through `coverCropDataUrl`. **Confirmed:** both
`coverCropDataUrl` call sites already feed `pixelRatio: 2` consumers
(`compositeFromElement` / `exportCanvasElement`) — there is no separate,
intentionally-lower-res on-screen preview being protected today; both
existing callers already suffer this same blur.

### Resolved decisions baked in

- **Fix blur only; keep the 2× export scale.** No user-facing resolution
  setting — LOCKED.
- **Direction:** thread the export `pixelRatio` into `coverCropDataUrl` so it
  crops at `slot.width * pr × slot.height * pr` (clamped to the source's native
  resolution so we never upscale beyond source). The post-pass then draws a
  same-or-higher-res bitmap → no upscaling blur.
- **Bump both existing call sites unconditionally** — `use-single-composite.ts:83`
  and `use-batch-render.ts:283` both feed pixelRatio-2 raster generation
  already; there is no separate preview-only branch to preserve (see Root
  cause). The editing canvas itself never calls `coverCropDataUrl`, so it's
  untouched regardless.

### File changes

| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/lib/cover-crop.ts` | Add optional `scale`/`pixelRatio` param (default `1`, preserves current behavior for any other caller); size crop canvas to `slotW*scale × slotH*scale`, clamped so output never exceeds source native pixels |
| modify | `apps/web/src/hooks/use-single-composite.ts` | Pass the export `pixelRatio` (2) into the `coverCropDataUrl` call at `:83` |
| modify | `apps/web/src/hooks/use-batch-render.ts` | Same scale threading at `:283`, consistent with single |
| modify | `apps/web/src/__tests__/cover-crop.test.ts` | Existing 127-line suite (output dims, cover-fit, centering, data-URL return) — add: output canvas dimensions scale with `pixelRatio`, clamped to source — see Tests |

### Steps

- [ ] Add a `scale` (export pixelRatio) parameter to `coverCropDataUrl`; default `1` preserves current behavior for any future caller
- [ ] Size the crop canvas to `slotW*scale × slotH*scale`, clamped to the source image's natural width/height (no upscaling past source)
- [ ] Pass the export `pixelRatio` (2) at both `use-single-composite.ts:83` and `use-batch-render.ts:283` — no "preview vs export" branch needed
- [ ] Confirm the post-pass coordinate contract still holds (it draws at `node.width*pr`; the crop now supplies enough pixels)
- [ ] Consider extracting the duplicated `pixelRatio: 2` literal in `export-helpers.ts` into one shared constant while touching this area (optional, DRY — not required for the fix to work)
- [ ] Update `.ai/` doc / decision for the resolution fix (see Documentation)
- [ ] Write/extend tests (see Tests section)

### Tests

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/cover-crop.test.ts` | Crop canvas dimensions equal `slot * scale`; clamps to source native size when `slot * scale` exceeds source; default (`scale` omitted) reproduces current 1× output |

### Verification

- [ ] `pnpm --filter @maga/web test` exits 0
- [ ] `pnpm --filter @maga/web exec tsc --noEmit` exits 0
- [ ] `pnpm --filter @maga/web build` exits 0
- [ ] Manual: export a large composite with a high-res overlay; overlay is sharp at 100% zoom (compare against pre-fix fuzzy export)
- [ ] Manual: the interactive editing canvas (drag/resize view) looks identical to before — it never rasterizes through `coverCropDataUrl`
- [ ] Manual: a low-res source overlay does NOT get upscaled artifacts (clamp works); large export completes without excessive memory/time

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any reviewer-driven changes reflected back into this plan file
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `fix(export): render image overlays at full resolution to remove blur`
- [ ] Phase marked complete

---

### Phase 3 — Blue selection box matches image aspect ratio when locked

**Risk:** medium
**Mode:** afk
**Type:** frontend
**Success criteria:** With "lock aspect ratio" enabled, QA enlarges an image overlay via the Size inputs AND by dragging the corner handle; in both cases the blue selection box keeps the image's intrinsic aspect ratio and the image fills it with no letterboxing. With lock OFF, free (non-proportional) resize still works.
**Commit message:** `fix(overlay): lock selection box to image aspect ratio on resize`

### Root cause (confirmed)

- The blue box is the overlay node's own `<div>` (`outline: 2px solid #2563EB`,
  `overlay-node-layer.tsx:142-144`) sized from `node.width`/`node.height`
  (`buildOverlayStyle`, `:40-41`). The inner `<img>` uses `objectFit: "contain"`
  (`:67`), so when box W:H ≠ image intrinsic ratio the image letterboxes and the
  outline stops hugging it.
- **Two resize paths, lock applied to neither today:**
  1. Panel Size inputs (`overlay-controls-panel.tsx:131-174`) wrap edits in
     `applyAspectRatioLock` (`:52-63`), which preserves the box's *current*
     ratio (confirmed: derives the missing dimension from the box's existing
     width/height) — not the image's intrinsic ratio.
  2. Corner-handle drag (`overlay-node-layer.tsx:117-122` `handleResizePointerMove`
     → `onResize(width, height)` → `text-overlay-canvas.tsx:68` →
     `BatchWorkspace` prop `onNodeResize` (wired at `:440`) →
     `handleNodeResize` `:183-190`, which writes via
     `fanOut.handleSetNodeOverride` — a per-variant override, not a direct
     node mutation) applies **no** lock at all; it only floors each dimension
     at 20px (`Math.max(20, start.width + dw)`).
- The `<img>` natural W/H is read nowhere in the codebase (no `naturalWidth`/
  `onLoad` usage anywhere under `apps/web/src` or `packages/*`). Lock state is
  `node.aspectRatioLocked` on the `OverlayNode` type
  (`packages/editor/src/types.ts:67`), default `true` via `DEFAULT_OVERLAY_NODE`
  in `packages/editor/src/defaults.ts`
  (see `.ai/decisions/aspect-ratio-locked-default.md`).

### Resolved decisions baked in

- **When locked, the box holds the IMAGE'S INTRINSIC ratio** (not the box's
  drifted current ratio) — LOCKED.
- **Both paths respect the lock** — panel inputs AND corner-drag — LOCKED.
- **Corner-drag convention:** width drives height (`height = width / intrinsicRatio`).
  Documented in code.
- Free resize preserved when `aspectRatioLocked` is false.
- **Storage: component-level ref/Map keyed by node id, NOT a new persisted
  schema field** — LOCKED. `OverlayNode` already carries `aspectRatioLocked`;
  adding a *new* persisted field (e.g. `intrinsicRatio`) would touch the
  `packages/projects` v1→v5 migration chain for no real benefit, since the
  ratio is cheap to re-derive each session from the already-rendered `<img>`.
  A node with no entry in the map yet (image not loaded) falls back to
  today's unconstrained behavior until `onLoad` fires.

### Implementation notes

- Capture intrinsic ratio on `<img onLoad>` (`naturalWidth/naturalHeight`) in
  `overlay-node-layer.tsx`, store in a `Map<nodeId, ratio>` ref (or
  equivalent) scoped to where both the panel and the drag handler can read it
  — confirm the simplest shared location given the component tree (lifting to
  `BatchWorkspace` state, or a small context/hook, whichever matches the
  existing prop-drilling pattern between `overlay-node-layer.tsx`,
  `overlay-controls-panel.tsx`, and `BatchWorkspace.tsx`).
- Centralize the constraint: when `aspectRatioLocked`, both `applyAspectRatioLock`
  (inputs) and `handleResizePointerMove`/`handleNodeResize` (drag) compute the
  dependent dimension from the intrinsic ratio. Keep functions <30 lines.
- `handleNodeResize` writes through `fanOut.handleSetNodeOverride` (per-variant
  override store, see `.ai/index.md` "Batch fan-out edits"); apply the
  intrinsic-ratio constraint to `{width, height}` *before* that call so the
  fan-out itself stays unchanged.

### File changes

| Action | File | What changes |
|---|---|---|
| modify | `apps/web/src/components/overlay-node-layer.tsx` | Capture intrinsic ratio on `<img onLoad>` into a ref/Map keyed by node id; in `handleResizePointerMove` (`:117-122`), when locked, derive `height = width / intrinsicRatio` (width-drives-height) instead of the current floor-only clamp |
| modify | `apps/web/src/components/overlay-controls-panel.tsx` | Update `applyAspectRatioLock` (`:52-63`) to constrain to the image's intrinsic ratio instead of the box's current ratio when locked |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | In `handleNodeResize` (`:183-190`), when the node is locked, apply the intrinsic-ratio constraint before calling `fanOut.handleSetNodeOverride({width, height})` |
| modify | `apps/web/src/components/__tests__/overlay-node-layer.test.tsx` | Existing RTL suite — add corner-drag lock coverage, see Tests |
| modify | `apps/web/src/__tests__/overlay-controls-panel.test.tsx` | Existing RTL suite (already imports `applyAspectRatioLock`, has an `aspectRatioLocked: true` fixture) — add intrinsic-ratio coverage, see Tests |

### Steps

- [ ] Capture image intrinsic ratio (natural W/H) on load in `overlay-node-layer.tsx`; store in a ref/Map keyed by node id (not a schema field — see Resolved decisions); safe fallback (current unconstrained behavior) for nodes without an entry yet
- [ ] Update `applyAspectRatioLock` to use intrinsic ratio (not box current ratio) when locked
- [ ] Apply the same intrinsic-ratio constraint to corner-drag: `handleResizePointerMove` and `handleNodeResize` (width-drives-height), applied before the `fanOut.handleSetNodeOverride` write
- [ ] Preserve free resize when `aspectRatioLocked` is false (no constraint)
- [ ] Add a new `.ai/decisions/` entry for the intrinsic-ratio + both-paths behavior rather than rewriting `aspect-ratio-locked-default.md` (that doc explicitly scopes itself to the *default value* only and disclaims documenting lock logic — cross-link instead of overwriting) (see Documentation)
- [ ] Write/extend tests (see Tests section)

### Tests

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/components/__tests__/overlay-node-layer.test.tsx` | Locked + corner drag → height derived from width using intrinsic ratio (not the floor-only clamp); unlocked → free W/H unchanged |
| modify | `apps/web/src/__tests__/overlay-controls-panel.test.tsx` | Locked + input width change → height = width/intrinsicRatio (not box's drifted ratio); intrinsic ratio (e.g. 2:1) preserved |

### Verification

- [ ] `pnpm --filter @maga/web test` exits 0
- [ ] `pnpm --filter @maga/web exec tsc --noEmit` exits 0
- [ ] `pnpm --filter @maga/web build` exits 0
- [ ] Manual: lock ON, change width in Size input → height auto-updates, box hugs image (no letterbox)
- [ ] Manual: lock ON, drag corner handle → box keeps image ratio, image fills box
- [ ] Manual: lock OFF → corner drag and inputs resize freely (non-proportional) as before
- [ ] Manual: a previously-distorted node, once locked + nudged, snaps back to image ratio

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any reviewer-driven changes reflected back into this plan file
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `fix(overlay): lock selection box to image aspect ratio on resize`
- [ ] Phase marked complete

---

### Phase 4 — Final Verification + KB Sync

**This phase runs after all other phases are complete.**
**Mode:** hil
**Type:** docs

**Overall success criteria:**

- All three fixes work end-to-end in the live app; all gates green; `.ai/` KB
  reflects the import accept set, the export-resolution fix, and the intrinsic
  aspect-lock behavior; no regression to existing overlays, the interactive
  editing canvas, or the batch-variant overlay upload.

**Steps:**

- [ ] Confirm every preceding phase's checkboxes are ticked in this file
- [ ] Run all gates:
  ```
  pnpm --filter @maga/web test
  pnpm --filter @maga/web exec tsc --noEmit
  pnpm --filter @maga/web build
  ```
- [ ] Manual happy path for each fix (import a JPG overlay; export a large composite and confirm sharp overlay; lock + resize keeps image ratio on inputs and drag)
- [ ] Manual regression: existing saved projects' overlays render unchanged; interactive editing canvas unchanged
- [ ] Verify `.ai/` updates from Phases 1–3 are present and consistent (see Knowledge Base Impact)

**Tests:**

No automated tests — justified because: all testable logic is covered in per-phase suites; this phase is gates + manual end-to-end + KB sync only.

**Verification:**

- [ ] Every preceding phase's Steps/Verification/Phase review checkboxes ticked
- [ ] All three gates exit 0
- [ ] `.ai/` KB synced (import accept, export resolution, aspect-lock decision)
- [ ] No CLAUDE.md invariants violated (pnpm, thin entry points, reuse, `.ai/` synced)
- [ ] Feature tested manually (golden path + edge cases per phase)
- [ ] Overall success criteria met

**Phase review:**

- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent reviewed the entire change end-to-end
- [ ] Any reviewer-driven changes reflected back into this plan file
- [ ] All phase checkboxes above are ticked

## Documentation

| Change | Documentation location |
|---|---|
| Image-overlay import accept set + validation guard | `.ai/` (overlay-import row in `index.md` / relevant architecture doc) |
| Export overlay resolution fix (crop at `slot * pixelRatio`) | `.ai/decisions/` (new) + `.ai/patterns/pixelratio-coordinate-mapping.md` (update) |
| Aspect-lock now constrains to image intrinsic ratio on both resize paths | `.ai/decisions/` (new — `aspect-ratio-locked-default.md` is scoped to the default value only; cross-link from it rather than overwrite) |

Documentation is added as a step within each relevant phase, not as a separate phase.

## Knowledge Base Impact

| `.ai/` artifact | Action | What it captures |
|---|---|---|
| `index.md` | update | Overlay-import accept set; export-resolution fix pointer |
| `decisions/export-overlay-resolution.md` | create | Why crop at `slot * pixelRatio`, clamp-to-source, keep 2× ceiling; rejected alternative (user-facing resolution setting) |
| `patterns/pixelratio-coordinate-mapping.md` | update | Note that overlay cover-crop must match export pixelRatio |
| `decisions/aspect-ratio-intrinsic-lock.md` | create | Lock now constrains to image intrinsic ratio (not box's current ratio) across both resize paths (inputs + corner-drag); width-drives-height convention; ratio stored in a ref/Map keyed by node id, not a persisted schema field (avoids touching the `packages/projects` migration chain). Cross-link from `decisions/aspect-ratio-locked-default.md`, which stays scoped to the default-value decision. |

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| Phase 1 | `validateImageFile` accepts jpeg/png/webp/gif/svg + `image/jpg`, rejects others | `apps/web/src/__tests__/lib/image-helpers.test.ts` |
| Phase 2 | `coverCropDataUrl` scales crop canvas by export pixelRatio, clamps to source | `apps/web/src/__tests__/cover-crop.test.ts` |
| Phase 3 | Aspect-lock derives dependent dimension from intrinsic ratio on inputs + drag; free when unlocked | `apps/web/src/components/__tests__/overlay-node-layer.test.tsx` (drag), `apps/web/src/__tests__/overlay-controls-panel.test.tsx` (inputs) |
| Phase 4 | — (gates + manual only; justified above) | — |

Tests are written as a step within each relevant phase, not as a separate phase.

## Human Summary

Three independent bug fixes, one commit each, plus a final verification pass.

- **What & why:** Users can't import JPG overlays, exported overlays look blurry
  at large sizes, and the blue selection box stops matching the image when aspect
  ratio is locked. Each is a distinct, self-contained fix.
- **Phase 0:** Worktree + install.
- **Phase 1 (JPG import):** Widen the "Add Image Overlay" file picker to accept
  JPEG/WebP/GIF (keeping PNG/SVG) and add a runtime validation guard for parity
  with the main uploader. Testable: a JPG imports as an overlay.
- **Phase 2 (export blur):** Overlays are currently cropped to screen-pixel size
  then upscaled 2×, which softens them. Crop them at export resolution (clamped to
  the source's real pixels) so they stay sharp; the base image stays untouched and
  the interactive editing canvas is unaffected (it never goes through this crop
  step). Testable: large export shows a crisp overlay.
- **Phase 3 (aspect lock):** When lock is on, constrain the box to the image's
  natural aspect ratio on both the Size inputs and corner-handle drag, so the blue
  box always hugs the image. Testable: locked resize keeps the image ratio with no
  letterboxing.
- **Phase 4:** Manual end-to-end, gates, and `.ai/` knowledge-base sync.
- **Key trade-off:** Export overlays are cropped at 2× (4× the bitmap area) for
  sharpness — clamped to source resolution so low-res overlays aren't upscaled and
  memory stays bounded. The 2× export ceiling itself is unchanged (no new UI).
