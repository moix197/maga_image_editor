# Plan: Canvas Viewport Zoom and Alignment Smart Guides

**Created:** 2026-07-01
**Branch:** feat/canvas-zoom-and-smart-guides
**Shape:** Sequential
**Status:** not started

## Context

The editor canvas (`apps/web/src/components/text-overlay-canvas.tsx`) renders
the base image at its natural CSS size (`maxWidth: 100%`) with no way to zoom
in/out, so large source images can't be worked on in full — users are stuck
scrolling a `overflow-auto` container. There is also no alignment help: users
eyeball centering text within the parent image or lining up overlays against
each other, with zero snap/grid/guide support anywhere in the codebase.

This plan adds two related canvas-surface features, in this order:

1. **Viewport zoom** — a CSS `transform: scale()` on a new ancestor wrapper
   around the existing canvas stage, with +/- buttons, a % readout, and
   fit-to-screen/reset controls. Ephemeral, non-persisted view state.
2. **Alignment smart guides** — a pure, framework-free snap-math module in
   `@maga/editor` that computes snap targets (image/canvas edges & centers,
   later sibling overlays, later equal-spacing) and is consumed during drag to
   snap node position + render a guide line, using the existing move/fan-out
   path unchanged.

Zoom must ship first because smart-guide snap thresholds are explicitly
**zoom-scale-aware** (a screen-pixel threshold must be converted to
canvas-space using the current scale) — Phase 2+ depends on the zoom hook
built in Phase 1.

### Resolved decisions (locked with user)

- **Zoom controls, v1 scope:** +/- buttons with a % readout, plus
  fit-to-screen and reset(100%). No keyboard shortcuts, no ctrl/cmd+wheel —
  LOCKED (keeps scope tight, no new hotkey plumbing).
- **Zoom mechanism:** CSS `transform: scale()` on a wrapper, not resizing the
  `<img>`. The wrapper must be an **ancestor of**, not the same element as,
  the div passed to `canvasCallbackRef` — that exact div is what
  `html-to-image` rasterizes for export, so a transform placed directly on it
  would export at the zoomed size — LOCKED.
- **Pan:** rely on the existing `overflow-auto` scroll container; no
  space-drag pan in v1 — LOCKED.
- **Zoom state:** ephemeral (resets on reload/project switch), clamped
  25%–400%, lives in a new `@maga/web` hook (`apps/web/src/hooks`), never in
  `@maga/editor`, never persisted to the project schema — LOCKED.
- **Guide behavior:** snap + show a guide line; the snapped position persists
  as the node's new position via the existing move/fan-out path — same as any
  normal move — LOCKED.
- **Snap math:** pure, framework-free module in `@maga/editor` (Vitest
  unit-testable), consumed by `@maga/web` during drag. Threshold is
  zoom-scale-aware — LOCKED.
- **Snap threshold default:** 8px screen-space, converted to canvas-space via
  `thresholdPx / scale` inside `resolveSnap`. Defined as a named, tunable
  constant in `@maga/web` (e.g. `SNAP_THRESHOLD_PX` near the `computeSnap`
  closure) — the pure `@maga/editor` module never hardcodes it, always takes
  `thresholdPx` as a parameter — LOCKED default, tunable.
- **Rotation:** v1 snap math always uses the upright (un-rotated) bounding box
  for edges/centers — LOCKED.
- **Fan-out:** a snap-produced position edit reuses the existing
  `handleNodeMove` → `fanOut.handleSetNodeOverride` path exactly; no new
  fan-out rule — LOCKED.
- **Guide target staging (this plan's phase order):** (A) parent/base-image
  edges + center and canvas center lines → (B) other overlays' edges/centers →
  (C) equal-spacing/distribution among 3+ elements, explicitly the largest and
  most separable/optional scope — LOCKED.

### Confirmed source locations (verified by research, not assumed)

| Artifact | Path |
|---|---|
| Canvas stage wrapper (`position:relative; display:inline-block`, holds `<img>` + node layers) | `apps/web/src/components/text-overlay-canvas.tsx:37-40` |
| Base `<img>` (`maxWidth:100%`) | `apps/web/src/components/text-overlay-canvas.tsx:42-46` |
| Node layers mapped/rendered | `apps/web/src/components/text-overlay-canvas.tsx:47-75` |
| `canvasCallbackRef` prop type / wiring | `apps/web/src/components/text-overlay-canvas.tsx:18` (type), `:38` (wired on wrapper); actual ref impl in `BatchWorkspace.tsx:201-202` (`liveCanvasRef`/`liveCanvasCallbackRef`), passed in at `BatchWorkspace.tsx:512` |
| Text node percent-based MOVE (already scale-safe via `getBoundingClientRect`) | `apps/web/src/components/text-node-layer.tsx:131-139` (math at `:135-138`) |
| Text node raw px-delta RESIZE (needs ÷ zoom scale) | `apps/web/src/components/text-node-layer.tsx:168-175` (`handleResizePointerMove`) |
| Overlay node percent-based MOVE | `apps/web/src/components/overlay-node-layer.tsx:137-143` |
| Overlay node raw px-delta RESIZE (needs ÷ zoom scale) | `apps/web/src/components/overlay-node-layer.tsx:156-167` (`handleResizePointerMove`) |
| Overlay intrinsic-ratio Map | `apps/web/src/components/overlay-node-layer.tsx:24` |
| Scroll container wrapping the canvas | `apps/web/src/components/batch/BatchWorkspace.tsx:493-496` (`<div className="relative flex-1 overflow-auto p-4">`) |
| `handleNodeMove` (all moves funnel here) | `apps/web/src/components/batch/BatchWorkspace.tsx:249-256` |
| `handleNodeResize` | `apps/web/src/components/batch/BatchWorkspace.tsx:258-271` |
| `activeOverlayId` state | `apps/web/src/components/batch/BatchWorkspace.tsx:44-46` |
| `itemNodeOverrides` (per-variant node patches) | destructured `BatchWorkspace.tsx:37`; shape `Record<overlayAssetId, Record<nodeId, NodeOverride>>` at `packages/projects/src/schema.ts:39,143` |
| Fan-out primitive reused by snap | `apps/web/src/hooks/use-fan-out-text-handlers.ts:29-36` (`handleSetNodeOverride`) |
| Export rasterization (`html-to-image`) | `apps/web/src/lib/export-helpers.ts:1` (import), `compositeFromElement` `:41-60` (`toPng` at `:49`), `exportCanvasElement` `:62-86` (`toPng` at `:71`) — both target `liveCanvasRef.current`, i.e. **exactly** the `canvasCallbackRef` div |
| `TextNode`/`OverlayNode` types (x/y percent, width/height) | `packages/editor/src/types.ts:27-38` (TextNode), `:54-61` (OverlayNode) |
| TextNode `width?`/`height?` are **optional** — "Explicit box width in px. When absent, the box auto-sizes to content" — vs. OverlayNode `width`/`height` **required** | `packages/editor/src/types.ts:36,38` (TextNode), `:54-61` (OverlayNode, no `?`) |
| Current move handlers measure only the *parent container's* `getBoundingClientRect()` for percent math — neither layer ever reads the dragged node's own rendered width/height today | `text-node-layer.tsx:131-139` (`handlePointerMove`), `overlay-node-layer.tsx:137-143` (`handlePointerMove`); the only existing self-measurement is `text-node-layer.tsx` `handleResizePointerDown` (~:157-166) falling back to `containerRef.current?.offsetWidth/offsetHeight` when `node.width`/`height` is undefined |
| `@maga/editor` pure-function conventions (`create*`/`update*`/`remove*`) | `packages/editor/src/editor-state.ts:14-59` |
| `@maga/editor` public barrel (must re-export new module here) | `packages/editor/src/index.ts` (15 lines total; single `exports: { ".": "./src/index.ts" }` in `packages/editor/package.json`) |
| `useEditorState` return shape/conventions | `apps/web/src/hooks/use-editor-state.ts:72-82` |
| `WorkspaceActionsBar` flat-props pattern | `apps/web/src/components/batch/WorkspaceActionsBar.tsx:5-24` (props interface), secondary-button-group pattern at `:81-112` |
| Existing test locations (inconsistent co-location, both patterns coexist) | `apps/web/src/__tests__/text-node-align.test.tsx`, `apps/web/src/__tests__/text-node-resize.test.tsx`, `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts`, `apps/web/src/hooks/__tests__/use-editor-state.test.ts`, `packages/editor/src/__tests__/` (exists) |
| `.ai/decisions/` naming convention (kebab-case topic) | e.g. `aspect-ratio-intrinsic-lock.md`, `canvas-post-pass-for-export-effects.md`, `dnd-library-choice.md` |
| No existing zoom/pan dependency | `apps/web/package.json` — no `react-zoom-pan-pinch`/`panzoom`/`d3-zoom`; confirms hand-rolled scale transform is the right call per CLAUDE.md "build our own before installing" |

## Risk: medium-high

Two shared, high-traffic files (`text-node-layer.tsx`, `overlay-node-layer.tsx`)
get their resize math touched, which every drag/resize interaction in the app
runs through — regressions there are highly visible. The export path
(`export-helpers.ts`) rasterizes the *exact* div the zoom transform must stay
off of, so wrapper placement has to be verified precisely, not assumed. The
guide-line overlay also renders inside that same captured div, so its
ephemeral visibility must never overlap an export call.

## Dependencies & Risks

- **INVARIANT — export non-contamination (critical).** `html-to-image`'s
  `toPng` targets `liveCanvasRef.current`, which resolves to the exact div
  carrying `canvasCallbackRef` (`text-overlay-canvas.tsx:37-40`). Two
  sub-invariants, each with a structural (not assumption-based) guarantee:
  - (a) **Zoom scale never enters export geometry.** The `transform: scale()`
    wrapper MUST be a strict **ancestor of**, never the same element as,
    the `canvasCallbackRef` div (wrapper added around `<TextOverlayCanvas>`
    in `BatchWorkspace.tsx`). Guaranteed by construction (the wrapper JSX
    literally wraps the component that owns the ref) and verified by an
    automated test (Phase 1) that asserts the ref'd element's own inline
    style never carries a `transform`, at any zoom value, while an ancestor
    does.
  - (b) **Guide-line DOM never appears in a capture.** Guide-line elements
    render inside the `canvasCallbackRef` div (required — they must share
    the node coordinate space) and are gated strictly on `activeGuides`
    being non-empty, cleared on pointer-up/drag-cancel. This is **not**
    treated as a timing assumption ("export never runs mid-drag"): Phase 2
    adds (1) an automated test asserting zero guide DOM nodes exist before a
    drag starts and after pointer-up, and non-zero only while a simulated
    drag is in-flight, and (2) a defensive guard in
    `export-helpers.ts` — before calling `toPng`, assert/strip any
    `[data-guide-line]` element from the captured subtree — so the
    non-contamination guarantee holds even if the timing assumption is
    ever violated by a future change. Guide-line elements carry a
    `data-guide-line` attribute specifically to make both the test and the
    guard concrete.
- **Single scale source of truth.** The resize-math fix (Phase 1, dividing
  `dw`/`dh` by `zoomScale`) and the snap-threshold conversion (Phase 2,
  `thresholdPx / scale`) MUST both read the same `zoom` value returned by the
  one `useCanvasZoom()` call in `BatchWorkspace.tsx` on every render — never a
  second copy of zoom state. **Failure mode if they diverge:** drag/resize
  would stay pixel-accurate while snapping triggers at the wrong on-screen
  distance (or vice versa), a subtle, hard-to-repro bug since both look
  correct in isolation at `zoom=1`. Phase 2 steps must explicitly thread the
  same `zoom` value already used for `zoomScale` into `computeSnap`, not
  re-derive or re-fetch it.
- **TextNode auto-size box measurement.** `TextNode.width`/`height` are
  optional (auto-sized to content, `types.ts:36,38`); `OverlayNode.width`/
  `height` are required. Constructing the `SnapBox` for a dragged TextNode
  therefore requires measuring its **own** live rendered box (e.g.
  `e.currentTarget.getBoundingClientRect()`, converted to canvas-space by
  dividing by the current zoom scale) — code that does not exist today
  (today's move handlers only read the *parent container's* rect for percent
  math, per the table above). OverlayNode snap boxes use `node.width`/
  `node.height` directly, no DOM read needed. The measured box is computed in
  `@maga/web` and passed **into** `resolveSnap`/`computeContainerSnapTargets`
  as plain data — the pure `@maga/editor` module (`snap-guides.ts`) must
  never call a DOM API itself.
- **Shared pixel-delta resize math.** Both `text-node-layer.tsx` and
  `overlay-node-layer.tsx` `handleResizePointerMove` use raw `clientX`/`clientY`
  deltas (`dw`/`dh`) — both need to divide by the live zoom scale. Percent-based
  MOVE math (`getBoundingClientRect`) is already scale-safe and needs no change
  — do not touch it.
- **Sibling-snap staleness (Phase 3).** "Other nodes on the canvas" must be
  read from the already-resolved, override-applied node list (what the canvas
  actually renders for the active variant), not raw base `editorState.state.nodes`,
  or guides would snap to positions that aren't actually on screen for that
  variant.
- **RESOLVED (during Phase 4 manual verification): auto-sized sibling TextNode
  box collapse.** Originally documented (Phase 3) as a non-blocking limitation
  — `siblingSnapBox` in `BatchWorkspace.tsx` had no DOM ref map to siblings'
  rendered elements, so an auto-sized TextNode sibling (no stored
  `width`/`height` — true of every default text node, per
  `packages/editor/src/defaults.ts` `DEFAULT_TEXT_NODE`) collapsed to a
  zero-size box. This turned out to be **fatal, not narrow**: Phase 4's
  `resolveEqualSpacingSnap` cross-axis-overlap check needs genuinely
  overlapping ranges, so equal-spacing detection almost never fired against
  default text nodes — confirmed via manual browser test (no purple spacing
  guide ever appeared). Fixed by adding a `nodeElementsRef` DOM ref registry
  (`registerNodeElement`, mirrors the existing `liveCanvasCallbackRef`
  pattern) in `BatchWorkspace.tsx`, threaded through `text-overlay-canvas.tsx`
  into `TextNodeLayer` only (`OverlayNode` width/height are required, never
  needs this); `siblingSnapBox` now live-measures an auto-sized TextNode
  sibling via this registry instead of falling back to zero. Regression test
  in `apps/web/src/__tests__/text-node-snap.test.tsx` proves three fully
  auto-sized siblings now correctly trigger the spacing guide. Code-reviewer
  verdict: green. Capture in `.ai/decisions/alignment-smart-guides.md` during
  Phase 5 (supersedes the original "known limitation" note).
- **Test co-location is inconsistent in this codebase** (some component tests
  in `apps/web/src/__tests__/`, some hook tests in
  `apps/web/src/hooks/__tests__/`). This plan places: pure snap-math tests in
  `packages/editor/src/__tests__/` (directory already exists), the new zoom
  hook test in `apps/web/src/hooks/__tests__/`, and drag/RTL behavior tests in
  `apps/web/src/__tests__/` — matching the majority pattern for each kind.
- **No new dependency required.** Zoom is a hand-rolled CSS transform + hook;
  snap math is a hand-rolled pure module. Consistent with CLAUDE.md "build our
  own before installing."

---

## Phases

### Phase 0: Create worktree

**This phase is always first. No exceptions.**

**Steps:**

- [ ] Confirm branch name (`feat/canvas-zoom-and-smart-guides`) and base ref
      (`main`) with the user
- [ ] Run `git worktree add ../canvas-zoom-and-smart-guides -b feat/canvas-zoom-and-smart-guides main`
- [ ] Verify worktree is active and on the correct branch (`git worktree list`)
- [ ] `pnpm install`
- [ ] `pnpm --filter @maga/web test` exits 0 on the clean branch (baseline)

---

### Phase 1: Viewport zoom (end-to-end)

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** User can zoom in/out via +/- buttons and see a live %
readout; Fit-to-screen brings a large image fully into view; Reset returns to
100%. Dragging and resizing text/overlay nodes remains pixel-accurate at any
zoom level. Export/preview output is byte-for-byte unaffected by the current
zoom level.
**Commit message:** `feat(canvas): add viewport zoom (scale transform, controls, scale-aware resize)`

**File changes:**

| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/hooks/use-canvas-zoom.ts` | Ephemeral zoom hook: `zoom` (fraction, default `1`, clamped `[0.25, 4]`), `zoomIn`/`zoomOut` (±25% steps, clamped), `resetZoom` (→`1`), `fitToViewport(containerEl, imageEl)` (computes `min(containerW/naturalW, containerH/naturalH)`, clamped to range). Returns a flat object, mirroring `use-editor-state.ts:72-82` conventions |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Call `useCanvasZoom()`; wrap `<TextOverlayCanvas>` (around `:512`) in a new `<div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>` **outside** the scroll container's captured subtree boundary — ancestor of, never equal to, the `canvasCallbackRef` div; thread `zoom` down into `TextOverlayCanvasProps` as `zoomScale`; add an `imgRef` callback (natural width/height) for `fitToViewport`; wire zoom props into `WorkspaceActionsBar` |
| modify | `apps/web/src/components/text-overlay-canvas.tsx` | Accept new `zoomScale: number` prop (default `1`); pass through to `TextNodeLayer`/`OverlayNodeLayer` as `zoomScale`; add a ref callback on the `<img>` (`:42-46`) to expose `naturalWidth`/`naturalHeight` for fit-to-viewport |
| modify | `apps/web/src/components/text-node-layer.tsx` | `handleResizePointerMove` (`:168-175`): accept `zoomScale` prop, divide `dw`/`dh` by it before computing new width/height |
| modify | `apps/web/src/components/overlay-node-layer.tsx` | `handleResizePointerMove` (`:156-167`): same fix — divide `dw`/`dh` by `zoomScale` prop |
| modify | `apps/web/src/components/batch/WorkspaceActionsBar.tsx` | Add flat props: `zoomPercent: number; onZoomIn: () => void; onZoomOut: () => void; onZoomReset: () => void; onZoomFit: () => void;` (props interface `:5-24`); render a new button group mirroring the existing secondary-group pattern (`:81-112`) with a `%` readout |
| create | `apps/web/src/__tests__/canvas-zoom-export-isolation.test.tsx` | Automated invariant test (see Dependencies & Risks "export non-contamination"): renders `BatchWorkspace`/`TextOverlayCanvas` at a non-1 zoom value and asserts the `canvasCallbackRef`-bound element's own inline style never contains a `transform`, while a strict ancestor element does |

**Steps:**

- [x] Implement `use-canvas-zoom.ts` (zoom state + `zoomIn`/`zoomOut`/`resetZoom`/`fitToViewport`, clamped 25–400%)
- [x] Add the scale-transform wrapper in `BatchWorkspace.tsx`, confirmed to sit **outside** the `canvasCallbackRef` div (verify via DOM inspection, not assumption)
- [x] Thread `zoomScale` through `TextOverlayCanvasProps` → `TextNodeLayer`/`OverlayNodeLayer`
- [x] Fix `text-node-layer.tsx:168-175` resize math to divide by `zoomScale`
- [x] Fix `overlay-node-layer.tsx:156-167` resize math to divide by `zoomScale`
- [x] Add `imgRef`/natural-size plumbing for `fitToViewport`
- [x] Add zoom controls to `WorkspaceActionsBar.tsx` (+/-, %, Fit, Reset) as flat props, no registry
- [x] Confirm percent-based MOVE math (`getBoundingClientRect`-driven, `text-node-layer.tsx:135-138` / `overlay-node-layer.tsx:137-143`) needs **no change** — verify manually at 50%, 100%, 200% zoom
- [x] Manually verify `export-helpers.ts` output (`compositeFromElement`/`exportCanvasElement`) is identical regardless of current zoom value
- [x] Add `canvas-zoom-export-isolation.test.tsx` proving the scale transform structurally cannot enter the captured div's own style, at any zoom value (automated counterpart to the manual export check above)
- [x] Update `.ai/` (deferred to Phase 5 `sync-knowledge` step — do not hand-edit)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/hooks/__tests__/use-canvas-zoom.test.ts` | `zoomIn`/`zoomOut` step + clamp at 25%/400%; `resetZoom` → 100%; `fitToViewport` math for given container/image sizes (including clamping when the fit ratio exceeds 400% or falls below 25%) |
| modify | `apps/web/src/__tests__/text-node-resize.test.tsx` | Add cases asserting resize `dw`/`dh` are divided by a non-1 `zoomScale` prop (e.g. drag delta halved at `zoomScale=2`) |
| create | `apps/web/src/__tests__/overlay-node-resize.test.tsx` | Same `zoomScale`-division coverage for `OverlayNodeLayer`'s resize handler (mirrors the text-node resize test structure; check first whether an equivalent overlay resize test already exists and extend it instead of duplicating) |
| create | `apps/web/src/__tests__/canvas-zoom-export-isolation.test.tsx` | Structural invariant: the `canvasCallbackRef` element carries no `transform` at any zoom value; a strict ancestor does |

**Verification:**

- [x] `pnpm --filter @maga/web test` exits 0 (includes `canvas-zoom-export-isolation.test.tsx`)
- [x] `pnpm --filter @maga/web exec tsc --noEmit` exits 0
- [x] Manual: zoom in/out buttons change the visible canvas size and % readout; Fit-to-screen shows a full large image; Reset returns to 100%
- [x] Manual: drag and resize a text node and an overlay node at 50%, 100%, and 200% zoom — positions/sizes land exactly where the pointer indicates
- [x] Manual: generate a preview/export while zoomed to something other than 100% — output pixel dimensions/content match an export taken at 100% zoom (spot-check corroborating the automated structural test)

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn (workflow adapted: inline code-reviewer subagent used instead of fresh-session handoff, per orchestrator's "work in main" directive)
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session (N/A — inline review adaptation)
- [x] Code-reviewer agent has verified this phase (verdict: green; nit 1 padding-aware fit applied)
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [x] Tests for this phase written and passing
- [x] Documentation updated (deferred to Phase 5 `sync-knowledge` step, per plan convention)
- [x] Orchestrator (user) has verified and approved this phase
- [x] Changes committed: `feat(canvas): add viewport zoom (scale transform, controls, scale-aware resize)`
- [x] Phase marked complete

---

### Phase 2: Smart guides vs. parent image + canvas center

**Risk:** medium
**Mode:** hil
**Type:** mixed
**Success criteria:** Dragging a text or overlay node snaps to the vertical/
horizontal center (and edges) of the parent base image and to the canvas
midlines, showing a visible colored guide line while snapped; releasing
persists the snapped position via the normal move/fan-out path.
**Commit message:** `feat(canvas): add smart guides (image + canvas center/edge snap)`

**File changes:**

| Action | File | What changes |
|---|---|---|
| create | `packages/editor/src/snap-guides.ts` | Pure module: `SnapBox { x, y, width, height }` (percent/px agnostic, upright/unrotated), `SnapReference` (line: axis + position + kind: edge/center), `computeContainerSnapTargets(containerSize)` → vertical/horizontal edge+center references for image and canvas bounds, `resolveSnap(dragBox, references, thresholdPx, scale)` → `{ x, y, guides: SnapGuide[] }`, converting `thresholdPx` to canvas-space via `thresholdPx / scale` |
| modify | `packages/editor/src/index.ts` | Re-export `snap-guides.ts` types/functions (append, per the existing barrel pattern) |
| create | `packages/editor/src/__tests__/snap-guides.test.ts` | Unit coverage for `resolveSnap`/`computeContainerSnapTargets` (see Tests below) |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add ephemeral `activeGuides` state (not persisted); add a `computeSnap(dragBox)` closure using `computeContainerSnapTargets`/`resolveSnap` against the base-image bounds + canvas bounds and the current `zoom` from `use-canvas-zoom`; pass `computeSnap`/`onGuidesChange` down into node layers |
| modify | `apps/web/src/components/text-overlay-canvas.tsx` | Accept `activeGuides` prop; render guide lines (absolutely positioned divs, one per active guide, each carrying `data-guide-line`) inside the stage wrapper (`:37-40`), only when non-empty |
| modify | `apps/web/src/components/text-node-layer.tsx` | In `handlePointerMove` (`:131-139`), after computing raw percent `x`/`y`, build the node's `SnapBox`: for TextNode, measure the node's **own** live box via `e.currentTarget.getBoundingClientRect()` (converted to canvas-space by dividing by `zoomScale`) since `node.width`/`height` may be undefined (auto-sized) — this is new measurement code, the container-rect read used for `x`/`y` is unrelated and unchanged; call the injected `computeSnap` with that box; use the returned (possibly snapped) `x`/`y` for both the live style and the final `onMove` call; report guides via `onGuidesChange`; clear guides in `handlePointerUp` (`:141-143`) |
| modify | `apps/web/src/components/overlay-node-layer.tsx` | Same wiring in `handlePointerMove` (`:137-143`) / `handlePointerUp` (`:145-147`); `SnapBox` width/height come directly from `node.width`/`node.height` (always defined) — no DOM measurement needed |
| modify | `apps/web/src/lib/export-helpers.ts` | Defensive guard in `compositeFromElement`/`exportCanvasElement` (`:41-60`, `:62-86`): before calling `toPng`, assert (dev) and strip (always) any `[data-guide-line]` element from the captured subtree — belt-and-suspenders enforcement of the guide non-contamination invariant, independent of the "export never runs mid-drag" timing assumption |

**Steps:**

- [x] Implement `snap-guides.ts` (container/image edge+center targets, scale-aware `resolveSnap`) with upright-bbox semantics only
- [x] Export from `packages/editor/src/index.ts`
- [x] Add `activeGuides` state + `computeSnap` closure in `BatchWorkspace.tsx`, sourcing base-image bounds, canvas bounds, and the **same** `zoom` value already threaded into `zoomScale` in Phase 1 (single source of truth — do not re-derive)
- [x] Thread `computeSnap`/guide-reporting callbacks into `TextNodeLayer` and `OverlayNodeLayer`; snapped `x`/`y` drive both the live drag preview and the persisted `onMove` value
- [x] Implement TextNode's own-box measurement (`getBoundingClientRect()` on the node element, divided by `zoomScale`) for `SnapBox` construction, distinct from the existing parent-container rect read used for `x`/`y` percent math; OverlayNode uses `node.width`/`height` directly
- [x] Render guide lines in `text-overlay-canvas.tsx` with `data-guide-line`, gated strictly on `activeGuides` being non-empty; clear on pointer-up/drag-cancel
- [x] Confirm no new fan-out logic: snapped moves still flow through `handleNodeMove` (`BatchWorkspace.tsx:249-256`) → `fanOut.handleSetNodeOverride` (`use-fan-out-text-handlers.ts:29-36`) unchanged
- [x] Add the defensive `[data-guide-line]` strip/assert guard to `export-helpers.ts` (structural enforcement, not a timing assumption)
- [x] Add `canvas-guide-export-isolation.test.tsx` proving zero guide DOM nodes exist outside an active drag, and the export guard strips any that did
- [x] Update `.ai/` (deferred to Phase 5 `sync-knowledge` step — do not hand-edit)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `packages/editor/src/__tests__/snap-guides.test.ts` | `resolveSnap`: image-center snap (within threshold); canvas-center snap as a **distinct** case from image-center (e.g. canvas bounds larger than image bounds, letterboxed); threshold-boundary case (position exactly at the threshold snaps, one unit past it does not); no snap outside threshold; threshold scales correctly with a non-1 `scale` argument (screen-px → canvas-space conversion); upright bbox is used regardless of any rotation field present on the input box |
| create | `apps/web/src/__tests__/text-node-snap.test.tsx` | Simulated pointer drag of a text node near the image/canvas center asserts the node lands on the snapped `x`/`y` and a guide indicator is rendered; dragging away from center produces no snap/guide; auto-sized TextNode (no stored `width`/`height`) still produces a correct `SnapBox` from its live measured DOM rect |
| create | `apps/web/src/__tests__/canvas-guide-export-isolation.test.tsx` | No `[data-guide-line]` nodes exist before a drag starts or after pointer-up; nodes appear only while a simulated drag is in-flight; `export-helpers.ts` guard strips any `[data-guide-line]` node from a subtree even when one is artificially present |

**Verification:**

- [x] `pnpm --filter @maga/web test` exits 0 (includes `canvas-guide-export-isolation.test.tsx`)
- [x] `pnpm --filter @maga/editor test` exits 0 (pre-existing unrelated `editor-state.test.ts` failure confirmed present identically on pre-Phase-2 `main`, not caused by this phase)
- [x] `pnpm --filter @maga/web exec tsc --noEmit` exits 0
- [x] Manual: dragging a text node near the parent image's vertical/horizontal center snaps and shows a line; releasing keeps the snapped position
- [x] Manual: repeat at 50% and 200% zoom — snap still triggers at a consistent on-screen distance from the guide (confirms scale-aware threshold, same `zoom` source as Phase 1's resize fix)
- [x] Manual: exporting/generating a preview mid-feature never shows a guide line baked into the output (spot-check corroborating the automated isolation test + export guard)

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn (workflow adapted: inline code-reviewer subagent used instead of fresh-session handoff, per orchestrator's "work in main" directive)
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session (N/A — inline review adaptation)
- [x] Code-reviewer agent has verified this phase (verdict: green; nits assessed — 2 no-op, 1 documented as intentional non-abstraction per CLAUDE.md)
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [x] Tests for this phase written and passing
- [x] Documentation updated (deferred to Phase 5 `sync-knowledge` step, per plan convention)
- [x] Orchestrator (user) has verified and approved this phase
- [x] Changes committed: `feat(canvas): add smart guides (image + canvas center/edge snap)`
- [x] Phase marked complete

---

### Phase 3: Smart guides vs. sibling overlays

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** Dragging one node additionally snaps to the edges/
centers of other nodes visible on the same canvas (respecting per-variant
node overrides), showing a guide line against the sibling being aligned to.
**Commit message:** `feat(canvas): extend smart guides to sibling overlay/text nodes`

**File changes:**

| Action | File | What changes |
|---|---|---|
| modify | `packages/editor/src/snap-guides.ts` | Add `computeSiblingSnapTargets(boxes: SnapBox[])` producing edge+center references per sibling box; keep pure/testable, no DOM |
| modify | `packages/editor/src/__tests__/snap-guides.test.ts` | Extend with sibling-reference cases |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Extend the `computeSnap` closure (from Phase 2) to also pass sibling node boxes — the already-resolved, override-applied node list for the active variant, excluding the node currently being dragged — into `computeSiblingSnapTargets` |
| modify | `packages/editor/src/index.ts` | Re-export `computeSiblingSnapTargets` (not originally listed here; required so `BatchWorkspace.tsx` can import it from `@maga/editor` — one-line addition matching the existing barrel pattern) |

**Steps:**

- [x] Extend `snap-guides.ts` with sibling edge/center references; extend unit tests
- [x] Wire sibling boxes into `computeSnap` in `BatchWorkspace.tsx`, sourced from the resolved per-variant node list (respecting `itemNodeOverrides`), not raw base `editorState.state.nodes`
- [x] Confirm the dragged node excludes itself from its own sibling reference set
- [x] Manual check: guide line renders correctly when aligning to a sibling that itself has a per-variant override applied
- [x] Update `.ai/` (deferred to Phase 5 `sync-knowledge` step — do not hand-edit)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `packages/editor/src/__tests__/snap-guides.test.ts` | Sibling-box edge/center snap resolution; dragged node's own box is never included as a reference |
| modify | `apps/web/src/__tests__/text-node-snap.test.tsx` | Drag-to-align-with-sibling scenario: two nodes, dragging one near the other's edge snaps and shows a guide |

**Verification:**

- [x] `pnpm --filter @maga/web test` exits 0
- [x] `pnpm --filter @maga/editor test` exits 0 (pre-existing unrelated `editor-state.test.ts` failure confirmed present identically on pre-Phase-3 `main`, not caused by this phase)
- [x] `pnpm --filter @maga/web exec tsc --noEmit` exits 0
- [x] Manual: align one overlay to another overlay's edge and center; guide line appears and position snaps
- [x] Manual: switch active variant with a per-variant override on a sibling node — snapping uses the overridden (resolved) position, not the base one

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn (workflow adapted: inline code-reviewer subagent used instead of fresh-session handoff, per orchestrator's "work in main" directive)
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session (N/A — inline review adaptation)
- [x] Code-reviewer agent has verified this phase (verdict: green; auto-sized-sibling-collapse limitation documented as accepted non-blocking gap)
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [x] Tests for this phase written and passing
- [x] Documentation updated (deferred to Phase 5 `sync-knowledge` step, per plan convention)
- [x] Orchestrator (user) has verified and approved this phase
- [x] Changes committed: `feat(canvas): extend smart guides to sibling overlay/text nodes`
- [x] Phase marked complete

---

### Phase 4: Equal-spacing / distribution guides

**Risk:** high
**Mode:** hil
**Type:** frontend
**Success criteria:** With three or more elements roughly aligned along an
axis, dragging one so the gaps become equal shows a distribution guide and
snaps to the equal-gap position.
**Commit message:** `feat(canvas): add equal-spacing distribution guides`

**File changes:**

| Action | File | What changes |
|---|---|---|
| modify | `packages/editor/src/snap-guides.ts` | Add `resolveEqualSpacingSnap(dragBox, otherBoxes, axis, thresholdPx, scale)`: given 2+ other boxes overlapping on the cross-axis, detect when moving `dragBox` along `axis` would equalize gaps between the nearest neighbors, return a snap position + a spacing guide; pure/tested |
| modify | `packages/editor/src/index.ts` | Re-export the new function/types |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Extend `computeSnap` to also try equal-spacing resolution (per axis) alongside edge/center/sibling snapping from Phases 2–3; define and document precedence when multiple snaps compete (edge/center wins over spacing) |
| modify | `apps/web/src/components/text-overlay-canvas.tsx` | Extend guide rendering to a distinct visual treatment for spacing guides (e.g. tick marks) vs. edge/center lines |
| modify (post-review fix) | `apps/web/src/components/batch/BatchWorkspace.tsx`, `apps/web/src/components/text-overlay-canvas.tsx`, `apps/web/src/components/text-node-layer.tsx` | Discovered during manual verification: default text nodes (no stored width/height) never triggered the spacing guide. Added a `nodeElementsRef`/`registerNodeElement` DOM ref registry so `siblingSnapBox` can live-measure auto-sized TextNode siblings instead of collapsing to a zero-size box — see "Dependencies & Risks" RESOLVED note |

**Steps:**

- [x] Implement `resolveEqualSpacingSnap` (single-axis, cross-axis overlap required) with unit tests covering: 2 elements → no spacing guide, 3+ evenly spaced → detected, near-miss within threshold → snaps
- [x] Export from `packages/editor/src/index.ts`
- [x] Wire into `computeSnap`; document and implement precedence (edge/center snap wins over spacing snap when both are within threshold)
- [x] Extend guide rendering in `text-overlay-canvas.tsx` for the spacing-guide visual variant
- [x] Update `.ai/` (deferred to Phase 5 `sync-knowledge` step — do not hand-edit)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `packages/editor/src/__tests__/snap-guides.test.ts` | `resolveEqualSpacingSnap`: no-guide with <3 elements, correct detection with 3+ evenly-spaced elements, near-miss snap within threshold, no false-positive when cross-axis ranges don't overlap |
| modify | `apps/web/src/__tests__/text-node-snap.test.tsx` | Three-node scenario: dragging the middle/edge node into the equal-gap position triggers the spacing guide and snap |

**Verification:**

- [x] `pnpm --filter @maga/web test` exits 0
- [x] `pnpm --filter @maga/editor test` exits 0 (pre-existing unrelated `editor-state.test.ts` failure confirmed present identically before this phase, not caused by it)
- [x] `pnpm --filter @maga/web exec tsc --noEmit` exits 0
- [x] Manual: three elements roughly in a row — dragging the third into the equal-gap position shows spacing guides and snaps
- [x] Manual: edge/center snap still takes precedence when both are simultaneously in range

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn (workflow adapted: inline code-reviewer subagent used instead of fresh-session handoff, per orchestrator's "work in main" directive)
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session (N/A — inline review adaptation)
- [x] Code-reviewer agent has verified this phase (verdict: green; core spacing formula hand-traced against 3 test cases; 3 non-blocking nits addressed with clarifying comments)
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [x] Tests for this phase written and passing
- [x] Documentation updated (deferred to Phase 5 `sync-knowledge` step, per plan convention)
- [x] Orchestrator (user) has verified and approved this phase (post-fix: sibling live-measurement bug found + fixed in `4d8c4a5`, then confirmed working in browser)
- [x] Changes committed: `feat(canvas): add equal-spacing distribution guides`
- [x] Phase marked complete

---

### Phase 4.5: Resize smart guides (sibling size-match)

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** While resizing a text or overlay node, if the new width
and/or height lands close to another node's width/height, the resize snaps to
match that dimension exactly, showing a dashed guide line — reusing the same
`SnapGuide`/`data-guide-line` rendering system as move guides (Phases 2–4).
Added after user manual testing of Phase 4 surfaced this as a wanted
extension; move-guide snapping (position) is unaffected — this is
resize-guide snapping (size) only, which currently has zero guide/snap
behavior (`handleResizePointerMove` in both node layers only divides by
`zoomScale`, per Phase 1).
**Commit message:** `feat(canvas): add resize smart guides (sibling size-match snap)`

**File changes:**

| Action | File | What changes |
|---|---|---|
| modify | `packages/editor/src/snap-guides.ts` | Add `resolveSizeMatchSnap(dragSize: {width, height}, siblingSizes: {width, height}[], thresholdPx, scale)`: for each axis (width, height) independently, find the closest sibling dimension within threshold and return a matched size + a `SnapGuide` (extend `SnapKind` again, additively, e.g. `"size"`); pure/DOM-free, no self-exclusion (caller excludes the resizing node first, same convention as `computeSiblingSnapTargets`) |
| modify | `packages/editor/src/index.ts` | Re-export `resolveSizeMatchSnap` |
| modify | `packages/editor/src/__tests__/snap-guides.test.ts` | Extend: width-only match, height-only match, both axes match independently, no match outside threshold, no siblings → no match |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add a `computeResizeSnap(dragSize, canvasSize)` closure (mirrors `computeSnap`), sourcing sibling sizes from `previewEditorState.nodes` (excluding the resizing node via `selectedNodeId`, same self-exclusion convention as Phase 3) — for TextNode siblings without stored width/height, reuse the `nodeElementsRef` live-measurement registry added in the Phase 4 sibling-fix; wire into `TextOverlayCanvas` as a new prop |
| modify | `apps/web/src/components/text-overlay-canvas.tsx` | Thread `computeResizeSnap`/resize-guide reporting into `TextNodeLayer`/`OverlayNodeLayer`; guide rendering already generic (`guideLineStyle`) — extend only for the new `"size"` kind's visual (reuse the existing dashed-line treatment, distinct color) |
| modify | `apps/web/src/components/text-node-layer.tsx` | `handleResizePointerMove`: after computing `dw`/`dh` ÷ `zoomScale`, call `computeResizeSnap` with the candidate new size; if a match is returned, use the matched size instead of the raw computed one and report the guide; clear the guide in `handleResizePointerUp` |
| modify | `apps/web/src/components/overlay-node-layer.tsx` | Same wiring in `handleResizePointerMove`/`handleResizePointerUp` |
| create | `apps/web/src/__tests__/resize-snap.test.tsx` | Simulated resize drag near a sibling's width/height snaps to match it and shows the size-match guide; resizing away from any sibling size produces no snap/guide |
| fix (post-review) | `apps/web/src/components/overlay-node-layer.tsx` | `constrainResizeToRatio` always re-derives height as `width / ratio` when the overlay's aspect ratio is locked, discarding any snapped height — so a height-axis `"size"` guide would claim a match the final rendered height doesn't actually have. Fixed by dropping the horizontal-axis `"size"` guide before reporting whenever `ratio !== undefined`. Regression test added. |

**Steps:**

- [x] Implement `resolveSizeMatchSnap` in `snap-guides.ts` (independent width/height matching, threshold+scale conversion matching `resolveSnap`/`resolveEqualSpacingSnap` conventions); extend unit tests
- [x] Export from `packages/editor/src/index.ts`
- [x] Add `computeResizeSnap` closure in `BatchWorkspace.tsx`, reusing `previewEditorState.nodes` + `nodeElementsRef` for TextNode live-measurement (no new ref infra — reuse Phase 4's fix)
- [x] Wire `computeResizeSnap` into both node layers' `handleResizePointerMove`; matched size drives both the live resize preview and the persisted `onResize`/`onHeightResize` value
- [x] Extend guide rendering for the new `"size"` kind's dashed-line visual, distinct from `"spacing"`'s color
- [x] Confirm move-guide snapping (Phases 2–4) is completely unaffected — resize and move guides are independent code paths sharing only the `SnapGuide` type and rendering function
- [x] Update `.ai/` (deferred to Phase 6 `sync-knowledge` step — do not hand-edit)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| modify | `packages/editor/src/__tests__/snap-guides.test.ts` | `resolveSizeMatchSnap`: width-only match, height-only match, independent axis matching, no match outside threshold, no siblings → no match |
| create | `apps/web/src/__tests__/resize-snap.test.tsx` | Resize-to-match-sibling-size behavior + guide rendering; no-snap-when-far case; aspect-ratio-lock takes precedence (width-match case); aspect-ratio-lock height-axis guide never lies about the final size (post-review regression test) |

**Verification:**

- [x] `pnpm --filter @maga/web test` exits 0
- [x] `pnpm --filter @maga/editor test` exits 0 (pre-existing unrelated `editor-state.test.ts` failure expected)
- [x] `pnpm --filter @maga/web exec tsc --noEmit` exits 0
- [x] Manual: resize a node until its width/height nears a sibling's — dashed guide appears, size snaps to match exactly
- [x] Manual: move-guide (position) snapping from Phases 2–4 still works unchanged after this phase

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file
- [x] Code-reviewer agent has verified this phase (verdict: yellow → fixed → green; guide-position remap and aspect-ratio-lock reconciliation both scrutinized; one real bug found — misleading height-axis guide under ratio lock — fixed with a regression test)
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [x] Tests for this phase written and passing
- [x] Documentation updated (deferred to Phase 6 `sync-knowledge` step, per plan convention)
- [x] Orchestrator (user) has verified and approved this phase
- [x] Changes committed: `feat(canvas): add resize smart guides (sibling size-match snap)`
- [x] Phase marked complete

---

### Phase 5: Final Verification

**This phase runs after all other phases are complete.**
**Mode:** hil
**Type:** mixed

**Overall success criteria:**

- User can zoom the canvas 25%–400%, fit-to-screen, and reset, without any
  loss of drag/resize precision or export fidelity.
- Dragging any node shows and snaps to appropriate guides — parent
  image/canvas center+edges, sibling nodes, and equal-spacing among 3+
  elements — with the snapped position always persisting through the normal
  move/fan-out path.
- No regression to existing move, resize, variable-slot, fan-out, or export
  behavior.

**Steps:**

- [x] Every preceding phase's Steps/Verification/Phase review checkboxes are ticked in the plan file
- [x] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review) — dispatched directly via subagent (no worktree/branch was used for this plan; all phases were committed straight to `main`, so no `/clear` + fresh-session handoff was needed)
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session — N/A, see above; orchestrator explicitly directed the subagent dispatch inline instead
- [x] Code-reviewer agent reviews the entire change end-to-end — verdict: **green**, no blocking findings (reviewed all 6 commits `6bc1850..HEAD`, confirmed `@maga/editor` DOM-free, export-safety wrapper placement, guide non-contamination, resize/move guide independence, aspect-ratio-lock fix)
- [x] Any changes made in response to the final code-reviewer review have been reflected back into this plan file — none required, no blocking findings
- [x] Run all gates:
  ```
  pnpm --filter @maga/web test        # 495/495 passed
  pnpm --filter @maga/editor test     # 1 pre-existing unrelated failure (editor-state.test.ts, untouched by this plan)
  pnpm --filter @maga/web exec tsc --noEmit   # clean
  pnpm --filter @maga/web build       # clean
  ```
- [x] No CLAUDE.md invariants violated (pnpm; thin entry points — snap math stays in `@maga/editor`, zoom state stays in a hook; reuse before reinvent; `@maga/editor` remains DOM-free; `.ai/` synced via `sync-knowledge`, not hand-edited)
- [ ] Feature tested manually end-to-end (golden path + edge cases: zoom extremes, snap near multiple competing guides, per-variant sibling overrides, 3+ element spacing) — pending orchestrator manual pass
- [x] Run `sync-knowledge` to create `.ai/decisions/viewport-zoom.md` and `.ai/decisions/alignment-smart-guides.md` and update `.ai/index.md` / `.ai/architecture.md`
- [ ] Overall success criteria met — pending manual verification above
- [ ] All phase checkboxes above are ticked — pending manual verification above

## Documentation

| Change | Documentation location |
|---|---|
| Viewport zoom (hook, scale-transform wrapper placement, scale-aware resize fix) | `.ai/decisions/viewport-zoom.md` (new), `.ai/index.md` |
| Smart guides (pure snap module, drag wiring, guide rendering, staged target types) | `.ai/decisions/alignment-smart-guides.md` (new), `.ai/index.md`, `.ai/architecture.md` (Batch workspace / canvas section) |

Documentation is added as a step within each relevant phase (deferred execution to the Phase 5 `sync-knowledge` step, per this codebase's convention of not hand-editing the index).

## Knowledge Base Impact

| `.ai/` artifact | Action | What it captures |
|---|---|---|
| `index.md` | update | New `use-canvas-zoom.ts` hook and `snap-guides.ts` module rows |
| `architecture.md` | update | Zoom-wrapper placement relative to the exported/captured canvas div; snap-guide drag wiring and staged target types |
| `decisions/viewport-zoom.md` | create | Why CSS `transform: scale()` on an ancestor wrapper (not resizing the image); why ephemeral/non-persisted state in `@maga/web`; why the resize-only (not move) pixel-delta paths needed a scale fix; export-safety constraint and its automated structural test |
| `decisions/alignment-smart-guides.md` | create | Why a pure `@maga/editor` module; scale-aware threshold design (single `zoom` source shared with resize) and its 8px default; upright-bbox-only decision for rotation; TextNode live-DOM-measurement vs. OverlayNode stored-dims for `SnapBox` construction; staged target scope (image/canvas → siblings → equal-spacing) and why equal-spacing is last/optional; reuse of the existing fan-out path with no new rules; the guide-DOM non-contamination guard in `export-helpers.ts` |

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| Phase 1 | Zoom clamp/step/fit/reset math | `apps/web/src/hooks/__tests__/use-canvas-zoom.test.ts` |
| Phase 1 | Resize `dw`/`dh` divided by `zoomScale` | `apps/web/src/__tests__/text-node-resize.test.tsx` (extended), `apps/web/src/__tests__/overlay-node-resize.test.tsx` |
| Phase 1 | Export non-contamination: scale transform structurally cannot reach the captured div | `apps/web/src/__tests__/canvas-zoom-export-isolation.test.tsx` |
| Phase 2 | Pure snap resolution vs. image-center, canvas-center (distinct case), threshold boundary, scale-aware threshold, upright bbox | `packages/editor/src/__tests__/snap-guides.test.ts` |
| Phase 2 | Drag-to-snap behavior (position + guide rendering), auto-sized TextNode live-measured SnapBox | `apps/web/src/__tests__/text-node-snap.test.tsx` |
| Phase 2 | Guide DOM non-contamination (absent outside drag) + export guard strips stray guide nodes | `apps/web/src/__tests__/canvas-guide-export-isolation.test.tsx` |
| Phase 3 | Sibling edge/center snap references, self-exclusion | `packages/editor/src/__tests__/snap-guides.test.ts` (extended) |
| Phase 3 | Drag-to-align-with-sibling behavior | `apps/web/src/__tests__/text-node-snap.test.tsx` (extended) |
| Phase 4 | Equal-spacing detection (2 vs 3+, near-miss, cross-axis overlap requirement) | `packages/editor/src/__tests__/snap-guides.test.ts` (extended) |
| Phase 4 | Three-node distribution drag behavior + precedence over edge/center | `apps/web/src/__tests__/text-node-snap.test.tsx` (extended) |
| Phase 5 | — (gates + manual only) | — |

## Human Summary

- **What & why:** Large images can't be seen/worked on in full today, and
  aligning text/overlays is pure eyeballing. This plan adds a zoomable
  viewport and snap-to-align guide lines.
- **Phase 0:** Worktree + branch setup.
- **Phase 1 (zoom):** A CSS-scale transform on a wrapper *outside* the exact
  div the exporter captures, plus +/-, %, fit, and reset controls in an
  ephemeral hook. The only functional risk is the two resize handlers
  (text/overlay nodes) needing their raw pixel-delta math divided by the zoom
  scale — moves already work correctly because they're percent-based.
- **Phase 2 (guides, image + canvas):** A pure, Vitest-tested snap module in
  `@maga/editor` computes edge/center targets against the parent image and
  canvas; wired into the existing drag handlers so a snap both moves the node
  and shows a line, then persists exactly like a normal move. Guide lines are
  proven (by an automated test, not just convention) to never exist outside
  an active drag, and `export-helpers.ts` gets a defensive strip as a second
  line of defense against ever baking a guide into an export.
- **Phase 3 (guides, siblings):** Same module extended to snap against other
  nodes' edges/centers, using the resolved per-variant positions.
- **Phase 4 (equal spacing):** The largest, explicitly optional/separable
  scope — detects and snaps to equal gaps among 3+ elements.
- **Phase 5:** Full gate run, manual end-to-end pass, `.ai/` sync.
- **Key trade-off:** Snap math lives entirely in `@maga/editor` (DOM-free,
  unit-testable) while all DOM/drag wiring and guide rendering stays in
  `@maga/web` — keeping the CLAUDE.md package-boundary rule intact even though
  it means threading a few new props (`zoomScale`, `computeSnap`,
  `activeGuides`) through two already-busy layer components.
