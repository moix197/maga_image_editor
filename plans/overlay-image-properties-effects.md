# Plan: Overlay Image Properties & Effects

**Created:** 2026-06-19
**Status:** complete (2026-06-19)
**Branch:** stage-3-cartoonizer (implemented directly in the main checkout — no worktree, no separate branch)

## Context

Overlay IMAGE nodes currently lack a properties panel and have no visual effects support. Text nodes are first-class editable nodes with a full panel (position, size, rotation, style). This plan brings image overlays to parity: a properties panel with numeric position/size controls, aspect-ratio lock, opacity, corner radius, rotation, drop shadow, and edge feather. Every effect shown on screen must bake correctly into the exported PNG.

Export strategy: use `html-to-image` for the base composite (existing path), then add a native 2D-canvas post-pass that re-draws each image overlay with feather (alpha-gradient mask), drop shadow (`ctx.shadow*`), opacity, corner radius, and rotation. Zero new dependencies.

## Risk: high

Drop shadow and edge feather require a native-canvas post-pass with precise pixelRatio-aware coordinate mapping (% → px), rotation-origin centering, and zIndex-ordered compositing. Misalignment between the on-screen CSS representation and the canvas post-pass is the primary failure mode.

## Dependencies & Risks

| Risk | Mitigation |
|---|---|
| pixelRatio alignment: base PNG is 2× logical size; post-pass must match | Pass `pixelRatio` constant through post-pass; compute all coordinates at `value * pixelRatio` |
| % → px coordinate mapping: x,y stored as %; post-pass needs container dimensions | Capture container `offsetWidth` / `offsetHeight` before calling `htmlToImage`; pass through to post-pass |
| Rotation origin: CSS rotates around element center; canvas must do the same | Translate to center, rotate, translate back in canvas draw sequence |
| Render order: layering must match on-screen zIndex order | Sort image overlay nodes by ascending `zIndex` before iterating in post-pass |
| Base layer coordination: image overlays rendered twice (base PNG + post-pass) | Suppress or make transparent the base-layer image overlay rendering for nodes that use post-pass effects; OR composite with correct opacity math |
| `filter: drop-shadow()` silently fails in foreignObject / html-to-image | Post-pass handles shadow; do NOT rely on CSS filter for export fidelity |
| `mask-image` silently fails in foreignObject / html-to-image | Post-pass handles feather; CSS mask-image is on-screen only |
| Feather visual consistency: CSS mask vs canvas alpha-gradient may differ slightly | Implement both using the same inset-gradient formula; document any known delta |

---

## Phases

### Phase 1: Image Properties Panel — Position, Size, Aspect-Ratio Lock

**Risk:** low
**Mode:** afk
**Type:** mixed (typescript + frontend)
**Success criteria:** Select an image overlay → panel appears with X/Y and W/H numeric inputs plus an aspect-ratio lock toggle. Typing a number in W (with lock ON) proportionally updates H. Dragging/resizing still works as before. Export PNG is unaffected (no new visual effects introduced).
**Commit message:** `feat: image overlay properties panel — position, size, aspect-ratio lock`

> **UI instruction:** Before building any UI in this phase, invoke the `ui-ux-pro-max --stack nextjs` skill to align component style with the design system. Reuse existing shadcn primitives: Slider, Input, Select, Label, Button. Follow the `text-style-panel.tsx` FieldRow pattern rather than inventing new control components.

**File changes:**

| Action | File | What changes |
|---|---|---|
| Edit | `packages/editor/src/types.ts` | Add `aspectRatioLocked?: boolean` to `OverlayNode` |
| Edit | `packages/editor/src/defaults.ts` | Add `aspectRatioLocked: true` to `DEFAULT_OVERLAY_NODE` |
| Edit | `packages/editor/src/index.ts` | Ensure `aspectRatioLocked` is exported via the public API surface |
| Edit | `apps/web/src/components/overlay-controls-panel.tsx` | Extend panel to show for image overlays: X/Y number inputs (stored as %, displayed as %), W/H number inputs with aspect-ratio lock toggle; wire all to `updateOverlayNode`; mirror `text-style-panel.tsx` layout (`<aside class="w-64 rounded-lg border border-border bg-card p-4 shadow-sm">`, FieldRow groups) |
| Edit | `apps/web/src/app/editor/page.tsx` | Confirm panel is mounted for selected image overlay nodes (should already be conditional; adjust guard if needed; keep entry point thin) |

**Steps:**
- [x] Invoke `ui-ux-pro-max --stack nextjs` skill before building UI
- [x] Read `packages/editor/src/types.ts` — add `aspectRatioLocked?: boolean` to `OverlayNode`; keep change minimal
- [x] Read `packages/editor/src/defaults.ts` — add `aspectRatioLocked: true` to `DEFAULT_OVERLAY_NODE`
- [x] Read `packages/editor/src/index.ts` — verify `OverlayNode` type and `DEFAULT_OVERLAY_NODE` are exported; add to exports if not present (already exported; field rides the type)
- [x] Read `apps/web/src/components/overlay-controls-panel.tsx` and `apps/web/src/components/text-style-panel.tsx` to understand the existing pattern before writing any new code
- [x] Extend `overlay-controls-panel.tsx`: add a FieldRow section for "Position" (X %, Y %) and a FieldRow section for "Size" (W px, H px, lock toggle); use shadcn `<Input>` and `<Label>`; add a `<input type="checkbox">` for the lock toggle; implement aspect-ratio preservation logic inside the component (extract to a named helper `applyAspectRatioLock(patch, currentNode)` — keep under 30 lines)
- [x] Confirm `apps/web/src/app/editor/page.tsx` mounts the panel for image overlays without adding business logic to the page component
- [x] Run `pnpm --filter @maga/editor build` to confirm TypeScript compiles clean (no `build` script in package; used `typecheck` = tsc --noEmit, clean)
- [ ] Run `pnpm --filter web dev` and manually exercise: select image overlay → panel visible → edit X/Y → node moves → edit W with lock ON → H updates proportionally → drag/resize still works (deferred to Phase 4 hil)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| Create | `packages/editor/src/__tests__/overlay-node.test.ts` | `createOverlayNode` defaults `aspectRatioLocked: true`; `updateOverlayNode` persists `aspectRatioLocked: false` patch |
| Create | `apps/web/src/__tests__/overlay-controls-panel.test.tsx` | Renders X/Y/W/H inputs for an image overlay node; lock toggle changes `aspectRatioLocked`; changing W with lock ON fires `onChange` with proportionally adjusted H |

**Verification:**
- [x] Automated tests pass: `pnpm --filter @maga/editor test` (29) and `pnpm --filter web test` (90)
- [ ] Select image overlay in editor → panel appears with X, Y, W, H fields and lock toggle (Phase 4 hil)
- [ ] Type value in X → node moves horizontally on screen (Phase 4 hil)
- [ ] Type value in W with lock ON → H updates to maintain natural ratio (Phase 4 hil)
- [ ] Type value in W with lock OFF → H unchanged (Phase 4 hil)
- [ ] Drag/resize overlay still works as before (Phase 4 hil)
- [ ] Export PNG → open PNG → image is positioned correctly (no regression) (Phase 4 hil)

**Phase review:**
- [x] All Steps and Verification checkboxes above ticked (automated; manual browser checks deferred to Phase 4 hil)
- [x] Code-reviewer agent has verified this phase (verdict: green, commit 7e6c14d)
- [x] Any changes made in response to code-reviewer suggestions reflected back into plan (none required — no blocking findings)
- [x] Tests written and passing (29 editor + 90 web, incl. 5 new)
- [x] Documentation updated (README updates batched into Phase 3 commit `6e256dd`)
- [x] Orchestrator has verified and approved this phase

---

### Phase 2: Opacity, Corner Radius, Rotation, Drop Shadow — Canvas Post-Pass Foundation

**Risk:** high
**Mode:** afk
**Type:** mixed (typescript + backend/export + frontend)
**Success criteria:** Set rotation 45°, corner radius 20px, opacity 0.7, drop shadow 5/5/10 on image overlay → all visible on screen → export PNG → PNG shows all four effects baked correctly by post-pass.
**Commit message:** `feat: image overlay opacity/radius/rotation/shadow with canvas post-pass`

> **UI instruction:** Before building any UI in this phase, invoke the `ui-ux-pro-max --stack nextjs` skill. Reuse existing shadcn primitives: Slider, Input, Select, Label, Button. Follow the `text-style-panel.tsx` FieldRow pattern rather than inventing new control components.

> **Export-fidelity note:** `transform: rotate()`, `border-radius`, and `filter: drop-shadow()` all silently fail or produce incorrect output in `html-to-image` foreignObject rendering. The native-canvas post-pass is the only reliable export path for ALL of these effects. On-screen CSS applies them for live preview only.

**Export post-pass risks (see Dependencies & Risks above for full list):**
1. **pixelRatio alignment** — base PNG canvas is `containerW * 2` × `containerH * 2`. All post-pass coordinates must be multiplied by `pixelRatio` (2).
2. **% → px mapping** — `node.x` and `node.y` are percentages. Compute: `xPx = (node.x / 100) * containerW * pixelRatio`; same for y. Width and height are stored as logical px; multiply by `pixelRatio`.
3. **Rotation origin** — translate to node center, rotate, translate back: `ctx.translate(cx, cy); ctx.rotate(rad); ctx.translate(-cx, -cy)`.
4. **Render order** — process overlay nodes sorted by ascending `zIndex`.
5. **Base layer coordination** — image overlays rendered in the base `html-to-image` PNG must not double-composite. Strategy: render post-pass nodes with a `data-post-pass="true"` attribute and set their CSS `opacity: 0` during the `htmlToImage` call only, then restore. This hides them from the base PNG without removing them from DOM layout.

**File changes:**

| Action | File | What changes |
|---|---|---|
| Edit | `packages/editor/src/types.ts` | Add `rotation?: number` (degrees, default 0), `cornerRadius?: number` (px, default 0), and `dropShadow?: { x: number; y: number; blur: number; color: string; opacity: number }` to `OverlayNode` |
| Edit | `packages/editor/src/defaults.ts` | Add `rotation: 0`, `cornerRadius: 0` to `DEFAULT_OVERLAY_NODE`; no default `dropShadow` (undefined = no shadow) |
| Edit | `packages/editor/src/index.ts` | Confirm new fields and `DropShadow` sub-type are covered by exported types |
| Edit | `apps/web/src/components/overlay-node-layer.tsx` | Apply on-screen CSS for live preview: `transform: rotate(${rotation}deg)`, `borderRadius: ${cornerRadius}px`, `overflow: hidden`, `opacity`, and `filter: drop-shadow(...)` when `dropShadow` is defined; mark element with `data-post-pass="true"` attribute for export suppression |
| Edit | `apps/web/src/components/overlay-controls-panel.tsx` | Add "Rotation" FieldRow (number input + shadcn `<Slider>` 0–360), "Corner Radius" FieldRow (shadcn `<Slider>` 0–200px), confirm "Opacity" FieldRow present; add "Drop Shadow" FieldRow section: enable/disable toggle, X/Y number inputs, blur number input, color picker (`<input type="color">`), opacity slider |
| Create | `apps/web/src/lib/canvas-post-pass.ts` | New module: `applyImageOverlayPostPass(baseDataUrl, overlayNodes, containerW, containerH, pixelRatio): Promise<string>`. One public export. Internal named helpers: `toCanvasPx`, `buildRotationTransform`, `drawOverlayImage`, `applyFeatherMask` (stub), `buildEdgeGradients` (stub). Returns final data URL. |
| Edit | `apps/web/src/lib/export-helpers.ts` | Temporarily set `opacity: 0` on elements with `data-post-pass="true"` before `htmlToImage.toPng(el, { pixelRatio: 2 })` call, restore after; then call `applyImageOverlayPostPass(baseDataUrl, imageOverlayNodes, el.offsetWidth, el.offsetHeight, 2)`; return post-pass result data URL |

**Steps:**
- [x] Invoke `ui-ux-pro-max --stack nextjs` skill before building UI
- [x] Read `packages/editor/src/types.ts` — add `rotation?: number`, `cornerRadius?: number`, `dropShadow?` fields to `OverlayNode` (+ `DropShadow` interface)
- [x] Read `packages/editor/src/defaults.ts` — add `rotation: 0`, `cornerRadius: 0`; no default for `dropShadow`
- [x] Create `apps/web/src/lib/canvas-post-pass.ts` with named helpers `toCanvasPx`, `buildRotationTransform`, `drawOverlayImage` (opacity+cornerRadius+rotation+dropShadow), `applyFeatherMask`/`buildEdgeGradients` (Phase-3 stubs), and public `applyImageOverlayPostPass`. Shadow is cast off the rounded silhouette OUTSIDE the clip so corner radius never truncates the shadow.
- [x] Read `apps/web/src/lib/export-helpers.ts` — integrate post-pass: suppress `data-post-pass` nodes (opacity:0) before `htmlToImage`, restore in `finally`, call `applyImageOverlayPostPass`, return result; `data-overlay` JSON parse guarded with try/catch
- [x] Read `apps/web/src/components/overlay-node-layer.tsx` — add `data-post-pass="true"` + `data-overlay`; on-screen CSS for rotation, cornerRadius, opacity, drop-shadow (preview only)
- [x] Extend `overlay-controls-panel.tsx`: Rotation, Corner Radius FieldRows; Opacity row; Drop Shadow section; shadcn Slider/Input/Label/Button; `text-style-panel.tsx` FieldRow pattern
- [x] Run compile gate (`typecheck` — no `build` script in editor pkg) and `pnpm --filter web test` — clean
- [ ] Run `pnpm --filter web dev`; manually verify all four effects on screen (deferred to Phase 4 hil)
- [ ] Export PNG → confirm opacity, corner radius, rotation, and drop shadow baked in PNG (deferred to Phase 4 hil)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| Edit | `packages/editor/src/__tests__/overlay-node.test.ts` | `createOverlayNode` defaults `rotation: 0`, `cornerRadius: 0`; `updateOverlayNode` persists arbitrary rotation, cornerRadius, and dropShadow patches |
| Edit | `apps/web/src/__tests__/overlay-controls-panel.test.tsx` | Rotation slider, Corner Radius slider, and Drop Shadow inputs fire correct `onChange` patches; Drop Shadow toggle enables/disables the section |
| Create | `apps/web/src/__tests__/canvas-post-pass.test.ts` | `toCanvasPx` returns correct px values at pixelRatio 1 and 2 (unit-testable, pure geometry); `applyImageOverlayPostPass` with a mock canvas returns a string data URL; shadow ctx properties set correctly for a node with `dropShadow` defined; `drawOverlayImage` visual output requires manual check |

**Verification:**
- [x] Automated tests pass: `pnpm --filter @maga/editor test` (31) and `pnpm --filter web test` (103, incl. combined corner-radius+shadow case)
- [ ] Set rotation to 45 → image visibly rotated on screen (Phase 4 hil)
- [ ] Set corner radius to 30 → image corners rounded on screen (Phase 4 hil)
- [ ] Set opacity to 0.5 → image semi-transparent on screen (Phase 4 hil)
- [ ] Enable drop shadow X=5, Y=5, blur=10 → shadow visible on screen around image overlay (Phase 4 hil)
- [ ] Export PNG → rotation is present and correctly baked in PNG (Phase 4 hil)
- [ ] Export PNG → corner radius is present and correctly baked in PNG (Phase 4 hil)
- [ ] Export PNG → opacity is correct in PNG (Phase 4 hil)
- [ ] Export PNG → drop shadow is present and aligned in PNG (Phase 4 hil)
- [ ] Image overlay with no `dropShadow` field exports correctly (no shadow, no regression) (Phase 4 hil)
- [ ] Multiple image overlays with different effects export in correct zIndex order (Phase 4 hil)
- [ ] Text nodes and border overlays unaffected (regression check) (Phase 4 hil)

**Phase review:**
- [x] All Steps and Verification checkboxes above ticked (automated; manual browser/export checks deferred to Phase 4 hil)
- [x] Code-reviewer agent has verified this phase (verdict: yellow → fixed; blocking shadow-clip bug + JSON-parse guard resolved in commit 22dd96b)
- [x] Any changes made in response to code-reviewer suggestions reflected back into plan (shadow cast off rounded silhouette outside clip; guarded data-overlay parse; combined-case test added)
- [x] Tests written and passing (editor 31 + web 103)
- [x] Documentation updated (README updates batched into Phase 3 commit `6e256dd`)
- [x] Orchestrator has verified and approved this phase

---

### Phase 3: Edge Feather — Alpha-Gradient in Post-Pass

**Risk:** high
**Mode:** afk
**Type:** mixed (typescript + export + frontend)
**Success criteria:** Set feather radius 30px on an image overlay → all four edges fade/soften on screen → export PNG → open PNG → edges are softened and visually consistent with the on-screen preview.
**Commit message:** `feat: image overlay edge feather with alpha-gradient export bake`

> **UI instruction:** Before building any UI in this phase, invoke the `ui-ux-pro-max --stack nextjs` skill. Reuse existing shadcn primitives: Slider, Input, Select, Label, Button. Follow the `text-style-panel.tsx` FieldRow pattern rather than inventing new control components.

> **Consistency note:** On-screen CSS `mask-image` and the canvas alpha-gradient must use the same inset-gradient formula so the preview closely matches the export. Document any known visual delta in `packages/editor/README.md`.

**File changes:**

| Action | File | What changes |
|---|---|---|
| Edit | `packages/editor/src/types.ts` | Add `featherRadius?: number` (px, 0 = no feather) to `OverlayNode` |
| Edit | `packages/editor/src/defaults.ts` | No default `featherRadius` (undefined = 0 / disabled) |
| Edit | `packages/editor/src/index.ts` | Confirm `featherRadius` is covered by exported types |
| Edit | `apps/web/src/components/overlay-node-layer.tsx` | Apply CSS `mask-image: linear-gradient(...)` inset fade on all four edges when `featherRadius > 0`; use `-webkit-mask-image` for cross-browser; extract mask CSS string to a helper `buildFeatherMaskCss(radius, width, height): string` in `apps/web/src/lib/css-helpers.ts` (create file if it doesn't exist; check first) |
| Edit | `apps/web/src/lib/canvas-post-pass.ts` | Implement `applyFeatherMask(ctx, node, pr)` stub created in Phase 2: draw the image to an offscreen canvas, create four `CanvasGradient` objects (one per edge, inset by `featherRadius * pixelRatio`), composite them using `destination-in` to produce the alpha-gradient mask, then draw the result onto the main canvas; implement `buildEdgeGradients(ctx, w, h, featherPx)` helper |
| Edit | `apps/web/src/components/overlay-controls-panel.tsx` | Add "Edge Feather" FieldRow: single slider (0–100px), label shows current value in px |

**Steps:**
- [x] Invoke `ui-ux-pro-max --stack nextjs` skill before building UI
- [x] Read `packages/editor/src/types.ts` — add `featherRadius?: number`
- [x] Check whether `apps/web/src/lib/css-helpers.ts` exists; if not, create it with `buildFeatherMaskCss(radius, width, height): string` (created; also houses deduped `withAlpha`)
- [x] Read `apps/web/src/components/overlay-node-layer.tsx` — apply feather mask CSS using `buildFeatherMaskCss`; `-webkit-mask-image` also set
- [x] Read `apps/web/src/lib/canvas-post-pass.ts` — implement `applyFeatherMask` (offscreen canvas, ≤30 lines) and `buildEdgeGradients` (four inset edge gradients, `destination-in`, clamped to half smaller dim)
- [x] Extend `overlay-controls-panel.tsx` with Edge Feather slider (shadcn Slider 0–100px); FieldRow pattern
- [x] Run compile gate (`typecheck`) and tests — clean
- [ ] Manually compare on-screen feather vs exported PNG feather at radius 20 and 50 (deferred to Phase 4 hil)
- [ ] Export PNG → confirm edge feather is baked correctly in PNG (deferred to Phase 4 hil)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| Edit | `apps/web/src/__tests__/canvas-post-pass.test.ts` | `applyFeatherMask` is called when `featherRadius > 0`; not called when `featherRadius` is 0 or undefined |
| Create | `apps/web/src/__tests__/css-helpers.test.ts` | `buildFeatherMaskCss(20, 200, 100)` returns a string containing expected gradient stops; returns empty string for radius 0 |
| Edit | `apps/web/src/__tests__/overlay-controls-panel.test.tsx` | Edge Feather slider fires `onChange` with correct `featherRadius` patch |
| Edit | `packages/editor/src/__tests__/overlay-node.test.ts` | `updateOverlayNode` persists `featherRadius` patch |

**Verification:**
- [x] Automated tests pass: `pnpm --filter web test` (109) and `pnpm --filter @maga/editor test` (32); offscreen feather compositing verified with distinct ctx mocks (commit 74ab69b)
- [ ] Set feather radius 30 → all four edges of the image soften on screen (Phase 4 hil)
- [ ] Export PNG → edges are softened and correctly baked in PNG (Phase 4 hil)
- [ ] On-screen preview and exported PNG are visually consistent (minor tolerance acceptable; known delta documented in packages/editor/README.md) (Phase 4 hil)
- [ ] Feather radius 0 / disabled → no mask applied; image renders with sharp edges on screen and in export (Phase 4 hil)
- [ ] Drop shadow from Phase 2 still works correctly when feather is also enabled (Phase 4 hil)
- [ ] Text nodes and border overlays unaffected (regression check) (Phase 4 hil)

**Phase review:**
- [x] All Steps and Verification checkboxes above ticked (automated; manual browser/export checks deferred to Phase 4 hil)
- [x] Code-reviewer agent has verified this phase (verdict: green; optional test-hardening nit applied in 74ab69b)
- [x] Any changes made in response to code-reviewer suggestions reflected back into plan (distinct offscreen ctx mock added to verify compositing)
- [x] Tests written and passing (web 109 + editor 32)
- [x] Documentation updated (packages/editor/README.md: OverlayNode API, effect fields, feather delta, exports)
- [x] Orchestrator has verified and approved this phase

---

### Phase 4 (Final): Final Verification

**Risk:** medium
**Mode:** hil
**Type:** mixed

**Overall success criteria:** All four effect categories (position/size, rotation/corner-radius/opacity, drop shadow, edge feather) work correctly on screen and bake into the exported PNG. No regressions on text nodes, border overlays, drag/resize, z-order, or delete.

**Steps:**
- [x] Open editor in browser with `pnpm --filter web dev`
- [x] Add an image overlay; confirm default panel state: lock ON, rotation 0, cornerRadius 0, no shadow, no feather
- [x] Set precise X=10%, Y=10%, W=300px, H= (auto from lock) → confirm on screen
- [x] Toggle aspect-ratio lock OFF; set H to arbitrary value → confirm H independent of W
- [x] Set rotation 30 → confirm on screen; set corner radius 40 → confirm on screen
- [x] Set opacity 0.7 → confirm on screen
- [x] Enable drop shadow: X=8, Y=8, blur=12, color=#333333, opacity=0.8 → confirm on screen
- [x] Set feather radius 25 → confirm edge fade on screen
- [x] Export PNG → verify in image viewer: all five effects present (position, rotation+radius, opacity, shadow, feather)
- [x] Add a second image overlay with different settings; export → both overlays correctly rendered in zIndex order
- [x] Select a text node → text panel appears (not image panel); set rotation on text → unaffected by this feature
- [x] Select a border overlay → border panel appears; border unaffected by this feature
- [x] Drag and resize an image overlay → dragging/resizing still works (fixed during verification — see Post-verification fixes below)
- [x] Reorder, delete image overlay → z-order and delete still work
- [x] Run full test suite (`pnpm --filter web test` + `pnpm --filter @maga/editor test`)
- [x] All tests pass (web 118, editor 32)
- [x] Export with an image overlay whose src is broken → export completes without throwing; overlay skipped (per-overlay try/catch added in post-pass)
- [x] Set feather radius larger than half the overlay's smaller dimension → no crash; feather clamps (`Math.min(featherPx, w/2, h/2)`)
- [x] Rotation + feather: feather mask rotates with the overlay (feather applied inside the rotation transform)
- [x] Aspect-lock starting from a non-natural ratio → lock preserves current ratio, not natural image ratio
- [x] Very small overlay with large shadow blur → no crash; shadow renders
- [x] Two overlays with different zIndex values → post-pass draws them in ascending zIndex order
- [x] Overlay src origin: overlays in this app are always same-origin `data:` URLs (`fileToDataUrl`); `crossOrigin` is set only for http(s) srcs, and each `drawImage` is wrapped in try/catch that skips a failing overlay

**Verification:**
- [x] Automated tests pass (web 118 + editor 32; typecheck clean)
- [x] All manual checks above completed (user-verified golden path + key edge cases)
- [x] Export PNG fidelity confirmed for each effect type (position, rotation+radius, opacity, shadow, feather)
- [x] No regressions on text nodes, border overlays, or existing drag/resize/delete behavior

**Post-verification fixes** (issues found during this hil pass and resolved):
- `034f9d8` — image overlays were dropped from the exported PNG: forcing `crossOrigin="anonymous"` on the same-origin `data:` overlay src tainted the canvas so `toDataURL` threw and aborted the whole overlay loop. Fix: set `crossOrigin` only for http(s) srcs; isolate each overlay draw in try/catch.
- `34fc00d` — resize handle was unclickable: Phase-2 `overflow:hidden` on the outer overlay div clipped the handle at `-6,-6`. Fix: moved corner-radius/overflow/feather onto the `<img>`; outer div keeps rotation + drop-shadow + the handle.
- `c5e8a11` — feather export ≠ on-screen: the bottom/right canvas edge gradients were reversed (transparent at the inset line, opaque at the border), so `destination-in` erased the image interior. Fix: orient all four edges transparent-at-border → opaque-inward; added a gradient-orientation test.
- `234af5e` — main image shrank and overlay jumped while dragging: selecting a node injected a `w-64` properties panel into the canvas flex row, narrowing the `flex-1` canvas and resizing the base image. Fix: reserve a constant-width side-panel slot (placeholder when nothing selected) so the canvas never reflows on selection.

**Phase review:**
- [x] All Steps and Verification checkboxes above ticked
- [x] Code-reviewer agent has verified the implementation phases (1: green, 2: yellow→fixed, 3: green)
- [x] Any changes made in response to code-reviewer suggestions reflected back into plan
- [x] Tests written and passing (web 118, editor 32; typecheck clean)
- [x] Documentation updated (`packages/editor/README.md`: OverlayNode API, effect fields, feather delta, exports)
- [x] Orchestrator has verified and approved this phase

---

## Documentation

| Change | Documentation location |
|---|---|
| `OverlayNode` type extended with `aspectRatioLocked`, `rotation`, `cornerRadius`, `dropShadow`, `featherRadius` | `packages/editor/README.md` — update OverlayNode API section |
| `applyImageOverlayPostPass` export post-pass function | `apps/web/src/lib/README.md` (create if absent) — describe export pipeline and post-pass responsibilities |
| Known visual delta between CSS feather (mask-image) and canvas feather (alpha-gradient) | `packages/editor/README.md` — note in feather section |
| New public exports added to `packages/editor/src/index.ts` | `packages/editor/README.md` — update exports list |

---

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| 1 | `createOverlayNode` defaults `aspectRatioLocked: true`; `updateOverlayNode` persists `aspectRatioLocked` patch | `packages/editor/src/__tests__/overlay-node.test.ts` |
| 1 | Panel renders X/Y/W/H inputs; lock toggle fires onChange with proportional H | `apps/web/src/__tests__/overlay-controls-panel.test.tsx` |
| 2 | `createOverlayNode` defaults `rotation: 0`, `cornerRadius: 0`; `updateOverlayNode` persists rotation, cornerRadius, dropShadow patches | `packages/editor/src/__tests__/overlay-node.test.ts` |
| 2 | Rotation slider, Corner Radius slider, Drop Shadow toggle and inputs fire correct onChange patches | `apps/web/src/__tests__/overlay-controls-panel.test.tsx` |
| 2 | `toCanvasPx` correct at pixelRatio 1 and 2 (unit-testable); shadow ctx props set correctly; `applyImageOverlayPostPass` returns data URL | `apps/web/src/__tests__/canvas-post-pass.test.ts` |
| 3 | `applyFeatherMask` called when `featherRadius > 0`, skipped when 0/undefined | `apps/web/src/__tests__/canvas-post-pass.test.ts` |
| 3 | `buildFeatherMaskCss` returns correct gradient stops; empty string for radius 0 | `apps/web/src/__tests__/css-helpers.test.ts` |
| 3 | Edge Feather slider fires correct onChange patch | `apps/web/src/__tests__/overlay-controls-panel.test.tsx` |
| 3 | `updateOverlayNode` persists `featherRadius` patch | `packages/editor/src/__tests__/overlay-node.test.ts` |

---

## Human Summary

This plan brings image overlay nodes in the MAGA image editor up to parity with text nodes. After implementation, selecting an image overlay opens a properties panel where you can set precise numeric X/Y position, W/H dimensions with an aspect-ratio lock, opacity, rotation, corner radius, drop shadow, and edge feather. Every effect shows on screen in real time and bakes correctly into the exported PNG.

The tricky part is export fidelity: `transform: rotate()`, `border-radius`, `filter: drop-shadow()`, and `mask-image` all fail silently or produce incorrect output inside `html-to-image`'s foreignObject pipeline. To fix this, Phase 2 introduces a native-canvas post-pass that runs after the base PNG is captured. It owns ALL image-overlay baking from that point forward: opacity, corner radius, rotation, and drop shadow are all rendered by the post-pass, not by the HTML/CSS layer. On-screen CSS still applies these effects for live preview, but the post-pass is the sole export path. Phase 3 then adds edge feather (alpha-gradient mask) on top of the already-established post-pass infrastructure. The post-pass must account for a 2x pixel ratio, convert percentage-based positions to canvas pixels, and rotate around each element's center — these are the highest-risk items in the plan and are covered by unit tests for the coordinate-mapping helpers.

This project is not a git repo; there is no worktree setup step. The plan runs as three implementation phases (position/size, all-effects post-pass, feather) followed by a final human-in-the-loop verification pass. Zero new dependencies are added. Existing text nodes, border overlays, drag/resize, z-order, and delete behavior are explicitly protected from regression throughout.
