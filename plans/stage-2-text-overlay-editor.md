# Plan: Stage 2 — Text & Overlay Editor

**Created:** 2026-06-17
**Branch:** `stage-2-text-overlay-editor`
**Status:** not started

## Context

Stage 1 delivered image upload, side-by-side compare layout, and a localStorage project store with a stable, swappable interface. Stage 2 introduces the core editing engine: `packages/editor` — a framework-light, callback-driven canvas/overlay package. On top of any source image the user can stack multiple text nodes with full styling, add image overlays and borders, manipulate z-order and transforms, and export the composed result as a downloadable PNG. Editor state (text nodes, overlays, z-order) persists through Stage 1's project store interface, not around it.

### Canvas approach decision

**Chosen approach: DOM layers + `html-to-image` for export.**

Two options were evaluated:

| | Option A: Canvas library (react-konva / fabric.js) | Option B: DOM layers + html-to-image |
|--|--|--|
| Export fidelity | Very high — canvas is the export | Good — CSSOM rendering; minor font/blur edge cases exist |
| Drag/rotate ergonomics | Library-managed | CSS transforms — well-understood, native pointer events |
| Bundle size | react-konva ~90 KB gz; fabric.js ~230 KB gz | html-to-image ~30 KB gz |
| CLAUDE.md build-our-own rule | Adds a large abstraction we can't own | One small export utility; all else is our code |
| Speculative abstraction risk | Canvas API is wide; we use ~10% of it | DOM layers are standard browser primitives |
| Text background / blur | Requires manual canvas drawing | `backdrop-filter: blur()` + CSS — trivial |

Verdict: **Option B (DOM layers + html-to-image)** wins on bundle size, CLAUDE.md dep-minimization, and the fact that CSS transforms cover all required drag/rotate ergonomics cleanly. `html-to-image` is a narrow, focused utility (~30 KB gz) whose sole job is the one thing we cannot build ourselves without reimplementing a browser layout engine. It is justified under the CLAUDE.md "clearly impractical to build ourselves" carve-out. Export fidelity is adequate for PNG compositing at this scale; if fidelity gaps appear they can be fixed at the CSS layer without touching the architecture.

**User-overridable:** if you prefer Option A (konva/fabric) before execution begins, update this context section and Phase 1's file table and steps accordingly.

### Stage 1 project store interface

Stage 1 defines the store in `apps/web/lib/project-store.ts` with a `Project` type and per-project image keys. Stage 2 extends the `Project` type with an `editorState` field (JSON-serializable) and adds `getEditorState` / `setEditorState` helpers on the same store interface. `apps/web` orchestrates; `packages/editor` knows nothing about storage.

## Risk: medium

DOM-to-image export fidelity is the only genuine unknown — custom fonts and `backdrop-filter` on some browsers may not capture perfectly. The Final Verification phase includes a dedicated export fidelity checklist.

## Dependencies & Risks

- **Stage 1 must be complete** — `apps/web/lib/project-store.ts`, `lib/types.ts`, `hooks/use-project-store.ts`, and the editor route must exist.
- **`html-to-image` external dependency** — justified above; must be installed in `apps/web` (the consumer), not in `packages/editor` (the engine). The engine is framework-light and has no knowledge of the export mechanism; the `apps/web` layer calls `html-to-image` directly.
- **Custom font loading race** — fonts must be loaded before export. Phase 1 adds a `document.fonts.ready` wait step before calling `html-to-image`.
- **`backdrop-filter` browser support** — covered by all modern evergreen browsers; documented caveat for Firefox if a user has `layout.css.backdrop-filter.enabled` disabled in about:config (extremely rare).
- **`packages/editor` public API** — `index.ts` is the only export surface; internal files are not importable by consumers. Enforce with a deliberate exports map in `package.json`.
- **No circular dependencies** — `packages/editor` must not import from `apps/web`. Data flows: `apps/web` → `packages/editor` (via props/callbacks) only.
- **Vitest already configured** in `apps/web` (from Stage 1 Phase 1). `packages/editor` needs its own `vitest.config.ts`.
- **`ui-ux-pro-max` skill** — all phases that touch UI in `apps/web` must invoke the skill with `--stack nextjs`. Steps call this out explicitly.
- **User-overridable assumptions:**
  - Font families available: Google Fonts (loaded via `next/font` or CSS `@import`). Change the font list in `packages/editor/src/constants.ts` before executing Phase 2 if you want a different default set.
  - Export scale factor: 2× (device pixel ratio) — change in `apps/web/lib/export-helpers.ts`.
  - Default text node size: 24px. Change in `packages/editor/src/defaults.ts`.

---

## Phases

---

### Phase 0: Create worktree

> Confirm with user before running these commands.

**Steps:**
- [ ] Verify you are on `dev` branch: `git checkout dev && git pull origin dev`
- [ ] Create worktree: `git worktree add ../maga_image_editor_stage2 -b stage-2-text-overlay-editor`
- [ ] `cd ../maga_image_editor_stage2`
- [ ] Install deps: `pnpm install`
- [ ] Confirm app starts: `pnpm --filter @maga/web dev`

---

### Phase 1: `packages/editor` scaffold + one text node + drag + export

**Risk:** medium
**Mode:** afk
**Type:** typescript + frontend
**Success criteria:** User opens `/editor`, uploads an image, clicks "Add Text", sees a draggable text node ("Hello") on the image, can drag it, clicks "Export" and receives a PNG that faithfully shows the image with the text at its dragged position. `packages/editor` is installed as a workspace dependency and its `index.ts` is the only public surface. `packages/editor` Vitest suite passes. `apps/web` Vitest suite passes.

**Commit message:** `feat(editor): scaffold packages/editor — one draggable text node with PNG export`

**Execution note:** Use the `ui-ux-pro-max` skill (`--stack nextjs`) for all UI components in `apps/web` in this phase (`TextOverlayCanvas`, editor toolbar, export button).

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| create | `packages/editor/package.json` | Name `@maga/editor`, `version: "0.0.1"`, `private: true`; exports map with `"."` → `./src/index.ts`; devDep: vitest, typescript; no runtime deps (framework-light) |
| create | `packages/editor/tsconfig.json` | Extends `@maga/config/tsconfig.base.json`; includes `src/**/*` |
| create | `packages/editor/vitest.config.ts` | Vitest config (jsdom environment, path aliases) |
| create | `packages/editor/src/index.ts` | Public API: re-exports `TextNode`, `OverlayNode`, `EditorState`, `createTextNode`, `updateTextNode`, `removeNode`, `reorderNode`, `createEditorState` |
| create | `packages/editor/src/types.ts` | `TextNode`, `OverlayNode`, `NodeId`, `EditorState` types; `ZOrderedNode` union |
| create | `packages/editor/src/defaults.ts` | `DEFAULT_TEXT_NODE`: position `{x:50,y:50}`, size `24`, color `#ffffff`, opacity `1`, rotation `0`; exported constants |
| create | `packages/editor/src/editor-state.ts` | `createEditorState()`, `createTextNode(partial)`, `updateTextNode(state, id, patch)`, `removeNode(state, id)`, `reorderNode(state, id, direction)` — pure functions, no side effects, each ≤30 lines |
| create | `packages/editor/__tests__/editor-state.test.ts` | Unit tests for all five pure functions |
| create | `packages/editor/README.md` | Package overview, public API table, usage example, architectural note (framework-light, no business logic) |
| edit | `packages/editor/package.json` | (same as create above — single entry) |
| edit | `apps/web/package.json` | Add `"@maga/editor": "workspace:*"` to dependencies |
| create | `apps/web/lib/export-helpers.ts` | `exportCanvasElement(el: HTMLElement, filename: string): Promise<void>` — calls `html-to-image`, waits `document.fonts.ready`, triggers download |
| create | `apps/web/components/text-overlay-canvas.tsx` | Client component: renders `<div>` container with image as background; renders `TextNodeLayer` children; accepts `state: EditorState`, `onNodeMove: (id, x, y) => void`, `canvasRef: React.RefObject<HTMLDivElement>` |
| create | `apps/web/components/text-node-layer.tsx` | Client component: single text node rendered as absolutely-positioned `<div>`; pointer-event drag via `onPointerDown/Move/Up`; accepts `node: TextNode`, `onMove: (x, y) => void`, `onSelect: () => void`; no business logic |
| create | `apps/web/hooks/use-editor-state.ts` | `useEditorState(initial?: EditorState)` — wraps all `@maga/editor` state mutations; returns `{ state, addTextNode, updateTextNode, removeNode, reorderNode }` |
| edit | `apps/web/hooks/use-project-store.ts` | Add `editorState` field to project data; expose `saveEditorState` + `loadEditorState` that call new `getEditorState` / `setEditorState` on the project store |
| edit | `apps/web/lib/project-store.ts` | Add `getEditorState(id)` / `setEditorState(id, state)` using key `mage:project:<id>:editorState`; wrap in try/catch for quota |
| edit | `apps/web/lib/types.ts` | Add `EditorState` import re-export from `@maga/editor`; document that `Project` now has optional `editorState` |
| edit | `apps/web/app/editor/page.tsx` | Add "Add Text" button → `addTextNode()`; render `TextOverlayCanvas` over source image; "Export" button → `exportCanvasElement`; wire `useEditorState` + `useProjectStore` |
| create | `apps/web/__tests__/lib/export-helpers.test.ts` | Unit test: `exportCanvasElement` calls `html-to-image` and triggers anchor download (mock html-to-image) |
| edit | `apps/web/README.md` | Document new editor toolbar controls, export flow, `useEditorState` hook API |
| edit | `packages/editor/README.md` | (same as create above) |

**Steps:**
> **Scope note:** Persistence (project-store wiring / reload-restore) is OUT OF SCOPE for this run — Stage 1 Phase 3 (localStorage project store) is `hil` and was skipped, so `apps/web/lib/project-store.ts`, `hooks/use-project-store.ts`, and `lib/types.ts` do not exist. Editor state is in-memory via `useEditorState` only. Persistence steps below are marked `[-]` (deferred until Stage 1 Phase 3 lands). All app files live under `apps/web/src/`.

- [x] Create `packages/editor/` directory structure: `src/`, `__tests__/`
- [x] Create `packages/editor/package.json` with exports map `"." : "./src/index.ts"` and `@maga/config` workspace devDep
- [x] Create `packages/editor/tsconfig.json` extending `@maga/config/tsconfig.base.json`
- [x] Create `packages/editor/vitest.config.ts` (jsdom, resolve aliases)
- [x] Add `"test": "vitest run"` script to `packages/editor/package.json`
- [x] Implement `packages/editor/src/types.ts`:
  - `NodeId`: branded string type
  - `TextNode`: `{ id: NodeId; content: string; x: number; y: number; rotation: number; zIndex: number; fontSize: number; color: string; opacity: number; }`
  - `OverlayNode`: `{ id: NodeId; src: string; x: number; y: number; width: number; height: number; opacity: number; zIndex: number; }`
  - `EditorState`: `{ nodes: (TextNode | OverlayNode)[]; }`
- [x] Implement `packages/editor/src/defaults.ts` with `DEFAULT_TEXT_NODE` and `DEFAULT_OVERLAY_NODE` constant objects
- [x] Implement `packages/editor/src/editor-state.ts` with five pure functions (each ≤30 lines):
  - `createEditorState(): EditorState` — returns `{ nodes: [] }`
  - `createTextNode(partial: Partial<TextNode>): TextNode` — merges with `DEFAULT_TEXT_NODE`, assigns random `NodeId`
  - `updateTextNode(state: EditorState, id: NodeId, patch: Partial<TextNode>): EditorState` — returns new state
  - `removeNode(state: EditorState, id: NodeId): EditorState` — filters out node
  - `reorderNode(state: EditorState, id: NodeId, direction: 'up' | 'down'): EditorState` — swaps zIndex with adjacent node
- [x] Create `packages/editor/src/index.ts` re-exporting the public surface only
- [x] Write `packages/editor/__tests__/editor-state.test.ts` (see Tests section) _(10/10 pass)_
- [x] Run `pnpm --filter @maga/editor test` — all pass
- [x] Install `html-to-image` in `apps/web`: `pnpm --filter @maga/web add html-to-image`
- [x] Create `apps/web/lib/export-helpers.ts`: — _at `apps/web/src/lib/export-helpers.ts`_
  - `exportCanvasElement(el: HTMLElement, filename: string): Promise<void>` — awaits `document.fonts.ready`, calls `htmlToImage.toPng(el, { pixelRatio: 2 })`, triggers download via anchor
  - ≤30 lines; no business logic
- [x] Create `apps/web/hooks/use-editor-state.ts` wrapping `@maga/editor` mutations; each returned function ≤15 lines; no side effects beyond state update — _at `apps/web/src/hooks/`_
- [-] Update `apps/web/lib/project-store.ts` with `getEditorState` / `setEditorState` — _DEFERRED: depends on skipped Stage 1 Phase 3_
- [-] Update `apps/web/hooks/use-project-store.ts` to load/save editor state on project switch and on `editorState` change — _DEFERRED: depends on skipped Stage 1 Phase 3_
- [x] Create `apps/web/components/text-node-layer.tsx` (use `ui-ux-pro-max --stack nextjs`): — _at `apps/web/src/components/`; drag uses grab-offset + live rect (review nits 1&2 fixed)_
  - Absolutely positioned `<div>` over the canvas container
  - Drag via pointer events: `onPointerDown` captures pointer, `onPointerMove` calls `onMove(x,y)`, `onPointerUp` releases
  - CSS `transform: rotate(${node.rotation}deg)`
  - No business logic; no direct state mutations
- [x] Create `apps/web/components/text-overlay-canvas.tsx` (use `ui-ux-pro-max --stack nextjs`): — _at `apps/web/src/components/`_
  - `position: relative` container; `<img>` fills it (not `next/image`)
  - Maps `state.nodes` (filtered to `TextNode`) → `<TextNodeLayer>` instances
  - Exposes `canvasRef` for export _(via RefCallback)_
- [x] Update `apps/web/app/editor/page.tsx` (use `ui-ux-pro-max --stack nextjs`): — _at `apps/web/src/app/editor/page.tsx`_
  - Add "Add Text" button wired to `addTextNode()`
  - Render `<TextOverlayCanvas>` over source image panel
  - Add "Export" button calling `exportCanvasElement(canvasRef.current, 'export.png')`
  - Page stays ≤80 lines total; all state logic in hooks
- [x] Write `apps/web/__tests__/lib/export-helpers.test.ts`
- [x] Run `pnpm --filter @maga/web test` — all pass _(26/26)_
- [x] Run `pnpm typecheck` from root — exits 0
- [x] Update `apps/web/README.md` and `packages/editor/README.md`

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| create | `packages/editor/__tests__/editor-state.test.ts` | `createEditorState` returns empty nodes; `createTextNode` merges defaults; `updateTextNode` returns new state with patch applied, original unchanged; `removeNode` removes correct node, leaves others; `reorderNode` swaps zIndex values correctly |
| create | `apps/web/__tests__/lib/export-helpers.test.ts` | `exportCanvasElement` awaits fonts, calls `htmlToImage.toPng`, creates anchor with blob URL, clicks it (all via mocks) |

**Verification:**
- [x] `pnpm --filter @maga/editor test` exits 0 _(10/10)_
- [x] `pnpm --filter @maga/web test` exits 0 _(26/26)_
- [~] `/editor` loads; upload an image; "Add Text" button appears — _build-verified; live browser smoke = orchestrator pause point_
- [~] Click "Add Text" → a "Hello" text node appears visually on the image — _orchestrator smoke test_
- [~] Drag the text node to a new position — it moves — _orchestrator smoke test_
- [~] Click "Export" → browser downloads a PNG; open it — image and text both present at correct position — _export wiring unit-tested (mocked); live PNG = orchestrator smoke test_
- [-] Reload page → text node position is restored from project store — _DEFERRED: persistence depends on skipped Stage 1 Phase 3_
- [x] `pnpm typecheck` exits 0
- [x] `packages/editor` internal files are not directly importable from `apps/web` (only `@maga/editor` public exports work) _(exports map restricts to "."; apps/web imports only from `@maga/editor`)_

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file (persistence steps `[-]` deferred; live-browser checks deferred to orchestrator smoke test)
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn — _N/A: subagent dispatch flow_
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session — _N/A: subagent dispatch flow_
- [x] Code-reviewer agent has verified this phase — _verdict: green_
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file — _drag grab-offset + live-rect nits fixed & amended; dead `isTextNode`/imports removed_
- [x] Tests for this phase written and passing (see Tests subsection above) — _editor 10/10, web 26/26_
- [x] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase — _PENDING: pause point smoke test_
- [x] Changes committed: `feat(editor): scaffold packages/editor — one draggable text node with PNG export`
- [x] Phase marked complete _(code-complete; awaiting orchestrator smoke-test sign-off)_

---

### Phase 2: Full text styling

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** User can select a text node and adjust: font family (dropdown of ≥5 families), font weight/style (bold, italic, normal), font size (number input), text color (color picker), opacity (slider 0–1), and shadow (toggle + color + blur). All changes render immediately on the canvas. Updated styling is included in the exported PNG. Tests pass.

**Commit message:** `feat(editor): full text styling — font, size, color, opacity, shadow`

**Execution note:** Use `ui-ux-pro-max --stack nextjs` for all new UI components in this phase.

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| edit | `packages/editor/src/types.ts` | Extend `TextNode` with `fontFamily: string`, `fontWeight: string`, `fontStyle: string`, `shadow: TextShadow \| null`; add `TextShadow` type `{ color: string; blur: number; offsetX: number; offsetY: number; }` |
| edit | `packages/editor/src/defaults.ts` | Add defaults for new `TextNode` fields: `fontFamily: 'Inter'`, `fontWeight: 'normal'`, `fontStyle: 'normal'`, `shadow: null` |
| create | `packages/editor/src/constants.ts` | `FONT_FAMILIES`: string[] of 6 families (Inter, Roboto, Playfair Display, Oswald, Merriweather, Dancing Script); exported constant |
| edit | `packages/editor/src/index.ts` | Re-export `TextShadow`, `FONT_FAMILIES` |
| create | `apps/web/components/text-style-panel.tsx` | Side-panel / popover accepting `node: TextNode`, `onChange: (patch: Partial<TextNode>) => void`; renders all style controls; no business logic; use `ui-ux-pro-max --stack nextjs` |
| edit | `apps/web/components/text-node-layer.tsx` | Apply `fontFamily`, `fontWeight`, `fontStyle`, `shadow` as inline CSS; `textShadow` from `node.shadow` fields |
| edit | `apps/web/app/editor/page.tsx` | Track `selectedNodeId: NodeId \| null`; render `<TextStylePanel>` when a text node is selected; wire `onChange` to `updateTextNode` |
| create | `apps/web/components/__tests__/text-style-panel.test.tsx` | Font family select triggers onChange; size input triggers onChange; color input triggers onChange; opacity slider triggers onChange; shadow toggle triggers onChange |
| edit | `apps/web/README.md` | Document text styling controls and which CSS properties they map to |

**Steps:**
> **Path note:** App files live under `apps/web/src/` (not `apps/web/`). New shadcn primitives (`input`, `label`, `select`, `slider`) added as lightweight stubs under `apps/web/src/components/ui/` — no Radix deps in project. Fonts loaded via `next/font/google` in `layout.tsx` (all 6 families) + `FONT_FAMILY_VAR` map in `text-node-layer.tsx`.
- [x] Extend `packages/editor/src/types.ts` with `fontFamily`, `fontWeight`, `fontStyle`, `shadow: TextShadow | null`
- [x] Add `TextShadow` type to `packages/editor/src/types.ts`
- [x] Update `packages/editor/src/defaults.ts` with new field defaults
- [x] Create `packages/editor/src/constants.ts` with `FONT_FAMILIES` array; load fonts via `next/font` or Google Fonts CSS import in `apps/web` _(all 6 loaded via next/font/google as CSS vars — review fix)_
- [x] Update `packages/editor/src/index.ts` to export new types and constants
- [x] Update `packages/editor/__tests__/editor-state.test.ts` — verify `createTextNode` sets new defaults correctly
- [x] Update `apps/web/src/components/text-node-layer.tsx` to apply new style fields as inline CSS (`fontFamily`, `fontWeight`, `fontStyle`, `textShadow`)
- [x] Create `apps/web/src/components/text-style-panel.tsx` (use `ui-ux-pro-max --stack nextjs`):
  - Font family: shadcn `<Select>` populated from `FONT_FAMILIES`
  - Font weight: shadcn `<Select>` with normal/bold
  - Font style: shadcn `<Select>` with normal/italic
  - Size: shadcn `<Input type="number">` min=8 max=200
  - Color: `<input type="color">`
  - Opacity: shadcn `<Slider>` 0–1 step=0.01
  - Shadow: toggle + color picker + blur slider
  - Each control calls `onChange({ fieldName: value })` — no mutations inside
- [x] Wire selection into `apps/web/src/app/editor/page.tsx`:
  - `selectedNodeId` state
  - `TextNodeLayer` receives `onSelect: () => setSelectedNodeId(node.id)`
  - Selected node gets a visible selection ring (CSS outline) — _excluded from export via deselect-before-capture in `handleExport` (review fix)_
  - `TextStylePanel` renders in a side panel when `selectedNodeId !== null`
- [x] Write `apps/web/src/components/__tests__/text-style-panel.test.tsx`
- [x] Run `pnpm --filter @maga/editor test` — all pass _(11/11)_
- [x] Run `pnpm --filter @maga/web test` — all pass _(38/38)_
- [x] Update `apps/web/README.md`

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| edit | `packages/editor/__tests__/editor-state.test.ts` | `createTextNode` includes fontFamily, fontWeight, fontStyle, shadow defaults |
| create | `apps/web/components/__tests__/text-style-panel.test.tsx` | Changing font family fires `onChange({ fontFamily })`; changing size fires `onChange({ fontSize })`; changing color fires `onChange({ color })`; changing opacity fires `onChange({ opacity })`; toggling shadow fires `onChange({ shadow: {...} })` |

**Verification:**
- [~] Add a text node; click it to select (selection ring appears) — _orchestrator smoke test_
- [~] Change font family — text on canvas updates immediately — _orchestrator smoke test_
- [~] Toggle bold — text renders bold — _orchestrator smoke test_
- [~] Toggle italic — text renders italic — _orchestrator smoke test_
- [~] Change size — text resizes — _orchestrator smoke test_
- [~] Change color — text color updates — _orchestrator smoke test_
- [~] Drag opacity to 0.5 — text is semi-transparent on canvas — _orchestrator smoke test_
- [~] Enable shadow, set blur 4 — shadow visible on canvas — _orchestrator smoke test_
- [~] Export — PNG reflects all styling including shadow and opacity — _orchestrator smoke test (export wiring + font/outline fixes verified by review + unit tests)_
- [x] `pnpm --filter @maga/web test` exits 0 _(38/38)_
- [x] `pnpm --filter @maga/editor test` exits 0 _(11/11)_

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file (live-browser checks deferred to orchestrator smoke test)
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn — _N/A: subagent dispatch flow_
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session — _N/A: subagent dispatch flow_
- [x] Code-reviewer agent has verified this phase — _verdict: red → fixed → re-review green_
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file — _3 blocking fixes (static react-dom import, all 6 fonts loaded, selection ring excluded from export) committed in `0d1fe20` and reflected in steps above_
- [x] Tests for this phase written and passing (see Tests subsection above) — _editor 11/11, web 38/38_
- [x] Documentation updated (see Documentation section)
- [x] Orchestrator (user) has verified and approved this phase — _approved 2026-06-18_
- [x] Changes committed: `feat(editor): full text styling — font, size, color, opacity, shadow` _(impl `145ee2ff`; review fixes `0d1fe20`)_
- [x] Phase marked complete _(code-complete; awaiting orchestrator smoke-test sign-off)_

---

### Phase 3: Text background + blur ("fuzzy" backdrop)

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** User can enable a background behind selected text node, choose its color and opacity, and enable a "fuzzy" blur effect (`backdrop-filter: blur()`). Background and blur are visible on the canvas in real time and are captured in the exported PNG. Tests pass.

**Commit message:** `feat(editor): text background with optional blur backdrop`

**Execution note:** Use `ui-ux-pro-max --stack nextjs` for UI additions in this phase.

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| edit | `packages/editor/src/types.ts` | Add `textBackground: TextBackground \| null` to `TextNode`; add `TextBackground` type `{ color: string; opacity: number; blur: number; paddingX: number; paddingY: number; }` |
| edit | `packages/editor/src/defaults.ts` | Add `textBackground: null` to `DEFAULT_TEXT_NODE` |
| edit | `packages/editor/src/index.ts` | Re-export `TextBackground` |
| edit | `apps/web/components/text-node-layer.tsx` | When `node.textBackground` is set: wrap text in inner `<span>` with `background-color`, `opacity`, `padding`; outer `<div>` gets `backdrop-filter: blur(${blur}px)` |
| edit | `apps/web/components/text-style-panel.tsx` | Add "Text Background" section: enable toggle, color picker, opacity slider, blur slider, padding sliders |
| create | `apps/web/components/__tests__/text-node-layer.test.tsx` | Renders without background when null; renders background span with correct styles when set; applies backdrop-filter when blur > 0 |
| edit | `apps/web/README.md` | Document text background controls |

**Steps:**
- [x] Add `TextBackground` type and `textBackground` field to `packages/editor/src/types.ts`
- [x] Update `packages/editor/src/defaults.ts` with `textBackground: null`
- [x] Update `packages/editor/src/index.ts` to export `TextBackground`
- [x] Update `packages/editor/__tests__/editor-state.test.ts` — verify `createTextNode` includes `textBackground: null`
- [x] Update `apps/web/src/components/text-node-layer.tsx`:
  - When `textBackground` is non-null: render text in a `<span>` with `backgroundColor` (color + opacity encoded as rgba — fill fades, text stays opaque; review fix `0ff82f8`), `padding: ${paddingY}px ${paddingX}px`
  - Outer `<div>` gets `backdropFilter: blur(${textBackground.blur}px)` (0 means no blur)
  - Keep component ≤50 lines; extracted `buildBackgroundSpanStyle(node)` + `hexToRgba` helpers
- [x] Add "Text Background" section to `apps/web/src/components/text-style-panel.tsx` (use `ui-ux-pro-max --stack nextjs`):
  - Toggle to enable/disable (`onChange({ textBackground: null })` when disabled; defaults on enable)
  - Color picker, opacity slider, blur slider (0–20px), padding X/Y inputs
- [x] Create `apps/web/src/components/__tests__/text-node-layer.test.tsx`
- [x] Run `pnpm --filter @maga/editor test` — all pass _(12/12)_
- [x] Run `pnpm --filter @maga/web test` — all pass _(42/42)_
- [x] Update `apps/web/README.md`

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| edit | `packages/editor/__tests__/editor-state.test.ts` | `createTextNode` includes `textBackground: null` by default |
| create | `apps/web/components/__tests__/text-node-layer.test.tsx` | No background element when `textBackground` is null; background span present with correct inline styles when `textBackground` set; `backdropFilter` applied on outer div when `blur > 0` |

**Verification:**
- [~] Select a text node; "Text Background" section is visible in the style panel — _orchestrator smoke test_
- [~] Enable background → colored box appears behind text on canvas — _orchestrator smoke test_
- [~] Change background color → updates in real time — _orchestrator smoke test_
- [~] Adjust opacity → background fades — _orchestrator smoke test (fill-only fade via rgba — review fix)_
- [~] Enable blur (set >0) → background edge is blurred ("fuzzy" effect) visible on canvas — _orchestrator smoke test_
- [~] Export → PNG shows background + blur correctly — _orchestrator smoke test_
- [~] Disable background → background disappears, text remains — _orchestrator smoke test_
- [x] `pnpm --filter @maga/web test` exits 0 _(42/42)_

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file (live-browser checks deferred to orchestrator smoke test)
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn — _N/A: subagent dispatch flow_
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session — _N/A: subagent dispatch flow_
- [x] Code-reviewer agent has verified this phase — _verdict: green; opacity-on-text nit fixed_
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file — _bg opacity now fill-only (rgba), `0ff82f8`; reflected in steps above_
- [x] Tests for this phase written and passing (see Tests subsection above) — _editor 12/12, web 42/42_
- [x] Documentation updated (see Documentation section)
- [x] Orchestrator (user) has verified and approved this phase — _standing approval to run to plan end; manual smoke deferred to Phase 6 Final Verification_
- [x] Changes committed: `feat(editor): text background with optional blur backdrop` _(impl `941d1499`; opacity fix `0ff82f8`)_
- [x] Phase marked complete _(code-complete; awaiting orchestrator smoke-test sign-off)_

---

### Phase 4: Multiple text nodes + select/delete + z-order + rotation

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** User can add multiple text nodes (≥3 simultaneously), select each independently, delete selected node with a "Delete" button, reorder layers with "Move Up" / "Move Down" controls, and rotate a selected node with a rotation slider. Each node maintains independent styling. Z-order is reflected correctly in the visual stack and in the exported PNG. Tests pass.

**Commit message:** `feat(editor): multiple text nodes with select, delete, z-order, and rotation`

**Execution note:** Use `ui-ux-pro-max --stack nextjs` for UI additions in this phase.

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| edit | `packages/editor/src/types.ts` | Confirm `rotation: number` already on `TextNode` (added in Phase 1); add JSDoc |
| edit | `packages/editor/src/editor-state.ts` | `reorderNode` already exists (Phase 1); add `deleteNode` alias export if not already named `removeNode` in public surface — verify consistency |
| edit | `packages/editor/src/index.ts` | Confirm all mutations exported; no new exports needed |
| edit | `apps/web/components/text-style-panel.tsx` | Add rotation slider (−180 to 180 degrees); add "Delete" button calling `onDelete`; add "Move Up" / "Move Down" buttons calling `onReorder` |
| edit | `apps/web/components/text-overlay-canvas.tsx` | Render all `TextNode` instances in `state.nodes` sorted by `zIndex`; pass `isSelected` prop to `TextNodeLayer` |
| edit | `apps/web/components/text-node-layer.tsx` | Apply `transform: rotate(${node.rotation}deg)`; show selection ring (CSS outline) when `isSelected`; make entire node click-selectable |
| edit | `apps/web/app/editor/page.tsx` | Wire `onDelete` → `removeNode`; wire `onReorder` → `reorderNode`; ensure "Add Text" always appends to top of z-stack |
| edit | `apps/web/components/__tests__/text-node-layer.test.tsx` | Add: renders rotation transform; shows selection ring when isSelected; hides ring when not |
| edit | `packages/editor/__tests__/editor-state.test.ts` | Add: `removeNode` removes correct node when multiple exist; `reorderNode` up/down with multiple nodes; creating 3 nodes assigns distinct zIndex values |
| edit | `apps/web/README.md` | Document multi-node workflow, z-order controls, rotation |

**Steps:**
- [x] Verify `rotation` is already on `TextNode` (from Phase 1 defaults) and add JSDoc comment _(reconciled: already present)_
- [x] Update `packages/editor/__tests__/editor-state.test.ts` with multi-node tests
- [x] Run `pnpm --filter @maga/editor test` — all pass _(14/14)_
- [x] Update `apps/web/src/components/text-node-layer.tsx`:
  - Add `isSelected: boolean` prop _(reconciled: added Phase 2)_
  - Apply `outline: 2px solid #3b82f6` when `isSelected` _(reconciled; excluded from export via deselect-before-capture)_
  - Apply `transform: rotate(${node.rotation}deg)` via inline style _(reconciled)_
  - `e.stopPropagation()` on pointerdown so node-click selects without bubbling to canvas-deselect
- [x] Update `apps/web/src/components/text-overlay-canvas.tsx`:
  - Sort nodes by `zIndex` ascending before rendering
  - Pass `isSelected={node.id === selectedNodeId}` to each `TextNodeLayer`
- [x] Add to `apps/web/src/components/text-style-panel.tsx` (use `ui-ux-pro-max --stack nextjs`):
  - Rotation: shadcn `<Slider>` from −180 to 180, step 1; calls `onChange({ rotation: value })`
  - "Delete" button: calls `onDelete()` prop
  - "Move Up" / "Move Down" buttons: calls `onReorder('up')` / `onReorder('down')` props
- [x] Update `apps/web/src/app/editor/page.tsx`:
  - `addTextNode` assigns new node's `zIndex` as `max(existing)+1` so new nodes land on top even after a delete _(review fix `49e5c4f` — was `nodes.length`, which collided after delete+add)_
  - Wire `onDelete` and `onReorder` props to panel
  - Clicking anywhere on canvas (not on a node) deselects: `setSelectedNodeId(null)`
- [x] Update `apps/web/src/components/__tests__/text-node-layer.test.tsx` with new cases
- [x] Run `pnpm --filter @maga/web test` — all pass _(46/46)_
- [x] Update `apps/web/README.md`

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| edit | `packages/editor/__tests__/editor-state.test.ts` | 3 nodes created → distinct zIndex values; `removeNode` on middle node leaves other two; `reorderNode('up')` swaps zIndex with the next node; `reorderNode('down')` swaps with previous; `reorderNode('up')` on top node is a no-op |
| edit | `apps/web/components/__tests__/text-node-layer.test.tsx` | `isSelected=true` → outline style applied; `isSelected=false` → no outline; `rotation=45` → transform includes rotate(45deg) |

**Verification:**
- [~] Add 3 text nodes; each has distinct content; all visible on canvas — _orchestrator smoke test_
- [~] Click node 1 → selection ring appears on node 1; clicking node 2 moves ring to node 2 — _orchestrator smoke test_
- [~] Click "Delete" with node 2 selected → node 2 removed; nodes 1 and 3 remain — _orchestrator smoke test_
- [~] Select node 3; click "Move Down" → it drops below node 1 in z-order (visual stacking changes) — _orchestrator smoke test_
- [~] Rotate slider to 45° → text rotates visually on canvas — _orchestrator smoke test_
- [~] Export → PNG shows correct z-order stacking and rotation — _orchestrator smoke test_
- [~] Click blank canvas area → selection deselected (ring gone, style panel closes) — _orchestrator smoke test_
- [-] Reload → all nodes restored with their individual styling, z-order, and rotation — _DEFERRED: persistence depends on skipped Stage 1 Phase 3_
- [x] `pnpm --filter @maga/web test` exits 0 _(46/46)_
- [x] `pnpm --filter @maga/editor test` exits 0 _(14/14)_

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked in the plan file (live-browser checks deferred to orchestrator smoke test)
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn — _N/A: subagent dispatch flow_
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session — _N/A: subagent dispatch flow_
- [x] Code-reviewer agent has verified this phase — _verdict: yellow; zIndex-collision bug fixed → green_
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file — _zIndex now max+1 (`49e5c4f`) with add-after-delete regression test; reflected in steps above_
- [x] Tests for this phase written and passing (see Tests subsection above) — _editor 14/14, web 46/46_
- [x] Documentation updated (see Documentation section)
- [x] Orchestrator (user) has verified and approved this phase — _standing approval to run to plan end; manual smoke deferred to Phase 6 Final Verification_
- [x] Changes committed: `feat(editor): multiple text nodes with select, delete, z-order, and rotation` _(impl `575134d`; zIndex fix `49e5c4f`)_
- [x] Phase marked complete _(code-complete; awaiting Phase 6 smoke-test sign-off)_

---

### Phase 5: Borders & image overlays with position/scale/opacity/z-order/delete

**Risk:** medium
**Mode:** afk
**Type:** frontend
**Success criteria:** User can add a border overlay (solid or decorative frame rendered as a `<div>` with CSS border) and upload image overlays (PNG/SVG stickers). Each overlay can be dragged, scaled via a resize handle, have its opacity adjusted, be reordered in z-order, and deleted. Overlays coexist with text nodes in a unified z-order list. Everything is captured in the export. Tests pass.

**Commit message:** `feat(editor): borders and image overlays with drag, scale, opacity, z-order, delete`

**Execution note:** Use `ui-ux-pro-max --stack nextjs` for UI additions in this phase.

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| edit | `packages/editor/src/types.ts` | `OverlayNode` type already drafted (Phase 1 types.ts); confirm fields: `id`, `src`, `x`, `y`, `width`, `height`, `opacity`, `zIndex`; add `overlayType: 'image' \| 'border'`; add `BorderOverlay` subtype `{ borderStyle: string; borderColor: string; borderWidth: number; borderRadius: number; }` extending `OverlayNode` |
| edit | `packages/editor/src/defaults.ts` | Add `DEFAULT_OVERLAY_NODE` and `DEFAULT_BORDER_NODE` |
| edit | `packages/editor/src/editor-state.ts` | Add `createOverlayNode(partial)`, `createBorderNode(partial)`, `updateOverlayNode(state, id, patch)` pure functions |
| edit | `packages/editor/src/index.ts` | Export new functions and `OverlayNode`, `BorderOverlay` types |
| create | `apps/web/components/overlay-node-layer.tsx` | Client component: renders image overlay as absolutely-positioned `<img>` with resize handle; or border as absolutely-positioned `<div>` with CSS border; drag via pointer events; resize handle on corner; accepts `node: OverlayNode`, `onMove`, `onResize`, `onSelect`; no business logic |
| edit | `apps/web/components/text-overlay-canvas.tsx` | Render both `TextNode` and `OverlayNode` entries sorted by `zIndex`; render `OverlayNodeLayer` for overlays |
| create | `apps/web/components/overlay-controls-panel.tsx` | Side panel for selected overlay: opacity slider, z-order up/down, delete; for border overlays also: color, width, style, radius controls; accepts `node: OverlayNode`, `onChange`, `onDelete`, `onReorder`; use `ui-ux-pro-max --stack nextjs` |
| edit | `apps/web/hooks/use-editor-state.ts` | Add `addOverlayNode`, `addBorderNode`, `updateOverlayNode` wrappers |
| edit | `apps/web/app/editor/page.tsx` | Add "Add Border" button; add "Add Image Overlay" button (opens file picker for PNG/SVG); wire `OverlayControlsPanel` for selected overlay node; unified selection model (text and overlay nodes share `selectedNodeId`) |
| create | `packages/editor/__tests__/overlay-state.test.ts` | Unit tests for `createOverlayNode`, `createBorderNode`, `updateOverlayNode`, `removeNode` for overlays |
| create | `apps/web/components/__tests__/overlay-node-layer.test.tsx` | Renders image with correct src and dimensions; renders border div with correct border styles; drag emits onMove; resize handle drag emits onResize |
| edit | `apps/web/README.md` | Document overlay and border controls |

**Steps:**
- [ ] Extend `packages/editor/src/types.ts` with `overlayType`, `BorderOverlay` subtype
- [ ] Update `packages/editor/src/defaults.ts` with `DEFAULT_OVERLAY_NODE` and `DEFAULT_BORDER_NODE`
- [ ] Implement `createOverlayNode`, `createBorderNode`, `updateOverlayNode` in `packages/editor/src/editor-state.ts` (each ≤30 lines)
- [ ] Update `packages/editor/src/index.ts` exports
- [ ] Write `packages/editor/__tests__/overlay-state.test.ts`
- [ ] Run `pnpm --filter @maga/editor test` — all pass
- [ ] Create `apps/web/components/overlay-node-layer.tsx` (use `ui-ux-pro-max --stack nextjs`):
  - Image overlays: `<img src={node.src}>` absolutely positioned; corner resize handle (`<div>` in bottom-right corner); `onPointerDown` on handle → `onResize(width, height)` as pointer moves
  - Border overlays: `<div>` with `border: ${borderWidth}px ${borderStyle} ${borderColor}`; `borderRadius`; absolutely positioned at `x,y`, `width × height`
  - Drag via pointer capture on main element (same pattern as `text-node-layer.tsx`)
  - Keep ≤60 lines; extract `buildOverlayStyle(node)` helper if needed
- [ ] Update `apps/web/components/text-overlay-canvas.tsx` to render `OverlayNodeLayer` for overlay nodes, interleaved with `TextNodeLayer` by `zIndex`
- [ ] Create `apps/web/components/overlay-controls-panel.tsx` (use `ui-ux-pro-max --stack nextjs`)
- [ ] Update `apps/web/hooks/use-editor-state.ts` with overlay mutation wrappers
- [ ] Update `apps/web/app/editor/page.tsx`:
  - "Add Border" → `addBorderNode()` with default full-canvas border
  - "Add Image Overlay" → file input (PNG/SVG only); on file: `fileToDataUrl` → `addOverlayNode({ src: dataUrl })`
  - Selected node check: if `selectedNode.overlayType` exists → render `OverlayControlsPanel`; else render `TextStylePanel`
- [ ] Write `apps/web/components/__tests__/overlay-node-layer.test.tsx`
- [ ] Run `pnpm --filter @maga/web test` — all pass
- [ ] Update `apps/web/README.md`

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| create | `packages/editor/__tests__/overlay-state.test.ts` | `createOverlayNode` sets `overlayType: 'image'` and default dims; `createBorderNode` sets `overlayType: 'border'` with border defaults; `updateOverlayNode` patches fields; `removeNode` removes overlay from mixed node list |
| create | `apps/web/components/__tests__/overlay-node-layer.test.tsx` | Image overlay renders `<img>` with correct src; border overlay renders `<div>` with correct border styles; pointer drag on main element fires `onMove`; pointer drag on resize handle fires `onResize` |

**Verification:**
- [ ] Click "Add Border" → border frame appears around image on canvas
- [ ] Select border → `OverlayControlsPanel` shows; adjust border color and width → updates in real time
- [ ] Adjust opacity of border → border fades
- [ ] Click "Add Image Overlay" → pick a PNG sticker → sticker appears on canvas
- [ ] Drag sticker to new position → it moves
- [ ] Drag resize handle → sticker scales
- [ ] "Move Up" / "Move Down" on sticker → z-order changes relative to text nodes
- [ ] "Delete" selected overlay → it is removed; other nodes unaffected
- [ ] Export → PNG captures border, sticker, and text nodes all in correct z-order
- [ ] Reload → all overlays and borders restored from project store
- [ ] `pnpm --filter @maga/editor test` exits 0
- [ ] `pnpm --filter @maga/web test` exits 0

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file (mark implementation-done _before_ handing off to reviewer — reviewer should see an up-to-date plan)
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn — see `write-prd` SKILL.md "Reviewer Handoff Prompt" section
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file (steps, file table, success criteria, tests table, or assumptions updated as needed — do this in the same turn as the code change, not deferred)
- [ ] Tests for this phase written and passing (see Tests subsection above) — or no-tests justification accepted
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(editor): borders and image overlays with drag, scale, opacity, z-order, delete`
- [ ] Phase marked complete

---

### Phase 6: Final Verification

**Mode:** hil

**Overall success criteria:** A local user with no auth or backend can: (1) upload a source image, (2) add multiple text nodes with full styling (font, size, color, opacity, shadow, text background + blur), drag them, rotate them, reorder them in z-order, and delete them, (3) add a border overlay and image overlays with position, scale, opacity, z-order, and delete, (4) export the composed image as a PNG that faithfully matches the on-screen composition, (5) reload the page and see all nodes, overlays, and styling restored via the project store, (6) switch projects and restore each project's independent editor state. All tests pass. No CLAUDE.md invariants are violated.

**Steps:**
- [ ] Every preceding phase's Steps / Verification / Phase review checkboxes are ticked
- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review):
  ```
  End-to-end review of stage-2-text-overlay-editor (Stage 2 — Text & Overlay Editor). Scope: all new and modified files under packages/editor/ and apps/web/ on this branch. Check: (1) packages/editor has a deliberate exports map — only index.ts is public; (2) all editor-state functions are pure (no side effects, no imports from apps/web); (3) apps/web components accept callbacks only, no business logic; (4) thin entry points — page.tsx ≤80 lines, no business logic; (5) use-editor-state.ts encapsulates all state mutations; (6) export-helpers.ts calls html-to-image and triggers download, ≤30 lines; (7) no circular deps (packages/editor must not import from apps/web); (8) html-to-image installed in apps/web not packages/editor; (9) text-node-layer.tsx and overlay-node-layer.tsx use pointer events for drag/resize, no external DnD library; (10) backdrop-filter used for text background blur; (11) all nodes sorted by zIndex before rendering; (12) pnpm --filter @maga/editor test exits 0; (13) pnpm --filter @maga/web test exits 0; (14) pnpm typecheck exits 0; (15) no dead code, no commented-out blocks; (16) CLAUDE.md invariants: pnpm, thin entry points, small focused functions (≤30 lines), reuse before reinvent, no speculative abstractions, separation of concerns, minimize deps, build own before installing.
  ```
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt
- [ ] Code-reviewer agent reviews the entire change end-to-end
- [ ] Any changes made in response to the final code-reviewer review have been reflected back into this plan file
- [ ] `pnpm --filter @maga/editor test` exits 0
- [ ] `pnpm --filter @maga/web test` exits 0
- [ ] `pnpm typecheck` from root exits 0
- [ ] No CLAUDE.md invariants violated
- [ ] Export fidelity checklist (manual):
  - [ ] Text nodes: content, font family, font weight/style, size, color render correctly in exported PNG
  - [ ] Opacity applied correctly in export (semi-transparent text visible)
  - [ ] Shadow renders in export
  - [ ] Text background + blur renders in export (verify `backdrop-filter` is captured by `html-to-image`)
  - [ ] Rotation correct in export
  - [ ] Image overlay src and opacity correct in export
  - [ ] Border overlay color, width, radius correct in export
  - [ ] Z-order correct in export (higher-zIndex nodes appear on top)
- [ ] Golden path tested manually:
  - [ ] Upload image → add 3 text nodes with different fonts, sizes, colors
  - [ ] Drag all 3 to different positions; rotate two of them
  - [ ] Add a text background + blur to one node
  - [ ] Add a border overlay and an image overlay sticker
  - [ ] Reorder layers so overlay is between two text nodes
  - [ ] Export → open PNG → composition matches screen
  - [ ] Reload → entire state restored
  - [ ] Switch to a new project → blank canvas; switch back → full state restored
- [ ] Edge cases tested manually:
  - [ ] Delete all nodes → canvas shows only source image; export produces clean image
  - [ ] Add node with 0 opacity → invisible on canvas and in export
  - [ ] Very long text content → text overflows gracefully without breaking layout
  - [ ] Rotation −180° and +180° → node rotates fully without snapping or glitching
  - [ ] No source image uploaded → "Add Text" and overlay buttons are disabled or produce a graceful warning
- [ ] Overall success criteria met
- [ ] All phase checkboxes in this document are ticked

---

## Documentation

| Change | Documentation location |
|--------|------------------------|
| `packages/editor` public API, types, usage example | `packages/editor/README.md` — created in Phase 1, updated each phase |
| `useEditorState` hook API | `apps/web/README.md` — "Hooks" section |
| `exportCanvasElement` function | `apps/web/README.md` — "Lib" section |
| Text styling controls (font, size, color, opacity, shadow) | `apps/web/README.md` — "Editor Controls" section |
| Text background + blur usage | `apps/web/README.md` — "Editor Controls" section |
| Multi-node workflow (select, delete, z-order, rotation) | `apps/web/README.md` — "Editor Controls" section |
| Overlay and border controls | `apps/web/README.md` — "Editor Controls" section |
| Editor state persistence via project store | `apps/web/README.md` — "Project Store" section |
| Canvas approach decision (DOM layers + html-to-image) | `packages/editor/README.md` — "Architecture" section |

---

## Tests

| Phase | Logic under test | Test file |
|-------|-----------------|-----------|
| 1 | `createEditorState` returns empty nodes array | `packages/editor/__tests__/editor-state.test.ts` |
| 1 | `createTextNode` merges with defaults and assigns unique NodeId | `packages/editor/__tests__/editor-state.test.ts` |
| 1 | `updateTextNode` returns new state immutably; original unchanged | `packages/editor/__tests__/editor-state.test.ts` |
| 1 | `removeNode` removes correct node; leaves others intact | `packages/editor/__tests__/editor-state.test.ts` |
| 1 | `reorderNode` swaps zIndex values correctly | `packages/editor/__tests__/editor-state.test.ts` |
| 1 | `exportCanvasElement` awaits fonts, calls html-to-image, triggers download | `apps/web/__tests__/lib/export-helpers.test.ts` |
| 2 | `createTextNode` includes fontFamily, fontWeight, fontStyle, shadow defaults | `packages/editor/__tests__/editor-state.test.ts` |
| 2 | `TextStylePanel` — all style controls fire `onChange` with correct patch | `apps/web/components/__tests__/text-style-panel.test.tsx` |
| 3 | `createTextNode` includes `textBackground: null` | `packages/editor/__tests__/editor-state.test.ts` |
| 3 | `TextNodeLayer` — no background element when null; background + backdropFilter when set | `apps/web/components/__tests__/text-node-layer.test.tsx` |
| 4 | 3 nodes get distinct zIndex; `removeNode` on middle leaves others | `packages/editor/__tests__/editor-state.test.ts` |
| 4 | `reorderNode` up/down with multiple nodes; no-op at boundary | `packages/editor/__tests__/editor-state.test.ts` |
| 4 | `TextNodeLayer` selection ring and rotation transform | `apps/web/components/__tests__/text-node-layer.test.tsx` |
| 5 | `createOverlayNode` / `createBorderNode` / `updateOverlayNode` / `removeNode` for overlays | `packages/editor/__tests__/overlay-state.test.ts` |
| 5 | `OverlayNodeLayer` — image renders `<img>` with src; border renders styled `<div>`; drag fires onMove; resize fires onResize | `apps/web/components/__tests__/overlay-node-layer.test.tsx` |

---

## Human Summary

Stage 2 introduces the core editing engine of MAGA Image Editor as a clean, self-contained package (`packages/editor`) and wires it to the existing `apps/web` workspace in five vertical slices — each leaving the user with real, usable editing capability:

**Phase 1** scaffolds `packages/editor` with its deliberate public API (`index.ts` only), implements the pure state model (TextNode types, five mutation functions), and delivers the first slice end-to-end: add a text node, drag it, and export the composed PNG. The DOM-layers + `html-to-image` approach means export works immediately with no canvas setup.

**Phase 2** adds full text styling without new architecture: font family, weight, style, size, color, opacity, and shadow all flow through the same `updateTextNode` patch mechanism introduced in Phase 1. The `TextStylePanel` component is a pure UI shell that fires `onChange` callbacks.

**Phase 3** adds text backgrounds with optional blur. `backdrop-filter: blur()` handles the "fuzzy" effect entirely in CSS — no new packages, no drawing code. It slots naturally into the existing style-panel pattern.

**Phase 4** unlocks multi-node editing: add multiple text nodes, select each independently, delete, reorder in z-order, and rotate. The `reorderNode` function already exists; this phase wires it to the UI and validates the multi-node edge cases.

**Phase 5** extends the unified node model to image overlays and borders. `OverlayNode` was drafted in Phase 1's type system; this phase implements it fully. Overlays and text nodes share one z-order list and one selection model — no separate state tree.

**Key architectural decisions:**
- `packages/editor` is framework-light: pure TypeScript, no React, no imports from `apps/web`. It owns the state model and mutation logic only.
- `apps/web` owns React components, hooks, and all side effects (export, persistence). It depends on `packages/editor` via the workspace protocol.
- Editor state persists through Stage 1's existing project store interface — `getEditorState` / `setEditorState` extend the store without changing its shape for callers.
- `html-to-image` is the only new external dependency — installed in `apps/web`, not `packages/editor`. Justified as a focused export utility whose alternative (reimplementing browser layout rendering) is clearly impractical.
- All drag and resize interactions use native pointer events. No external DnD library is introduced.
