# Architecture

The high-level shape of the system: package boundaries, how data flows, and the
rules that keep dependencies pointing one direction. Capture the *structure and
its rationale* — not API-level detail the code already documents.

## System shape

Three packages in a pnpm workspace, each owning one responsibility.

- **`@maga/web`** (`apps/web`) — the Next.js application: routes, page components,
  React hooks, and the `lib/` service functions. All UI, browser, and external-service
  wiring lives here. It is the only package that knows about React or the DOM.
- **`@maga/editor`** (`packages/editor`) — the framework-free editor domain: node
  types, defaults, guards, and the pure state-mutation functions. No React, no DOM
  — see [[framework-free-editor-package]]. Web reaches it only through the
  `apps/web/src/hooks/use-editor-state.ts` wrapper.
- **`@maga/projects`** (`packages/projects`) — framework-free batch-project domain:
  the persisted schema v5 (overlay assets + one unified per-item `itemNodeOverrides`
  store: content/style/geometry/transform/hidden per `(overlay, node)`) and the
  ZIP/IDB serializers. No React, no DOM. See *Batch workspace* below.
- **`@maga/config`** (`packages/config`) — static build configuration shared across
  the workspace: the base `tsconfig`, the ESLint config, and the Tailwind preset.
  No runtime code.

## Dependency direction

One-way, no cycles: **`@maga/web` → `@maga/editor` → `@maga/config`**.

- `@maga/web` depends on `@maga/editor` (its domain, a runtime dependency) and on
  `@maga/config` (build config).
- `@maga/editor` depends only on `@maga/config`, and only at **build time**
  (a devDependency — tsconfig/ESLint/Tailwind); no `@maga/config` code ships in
  the editor runtime. It never depends on web.
- `@maga/config` depends on nothing in the workspace — it is the sink.

The build-time nature of editor→config doesn't change the invariant: dependencies
still flow one-way with no cycles.

This realizes the CLAUDE.md Architecture rule (dependencies flow one direction; no
circular dependencies between packages). UI and framework concerns may depend on the
domain, never the reverse.

## Data flow

### Canvas + DOM-overlay node model

The editor renders the base image to a canvas, with text and image overlays
living as **DOM elements in an overlay layer positioned over that canvas** —
not painted into it. The source of truth is the editor package's **immutable
node array** (`EditorState.nodes` in `@maga/editor`): each text/overlay/border
node is one entry, and the overlay-layer DOM is a render of that array. Web
mutates the array only through the pure transitions in
`packages/editor/src/editor-state.ts` (see
[[immutable-state-mutation-functions]]); the DOM overlay reflects the new state,
it is never the state itself.

### Export fidelity

Export runs in two stages. `html-to-image` rasterizes the editor DOM to a base
PNG at `pixelRatio: 2` (`apps/web/src/lib/export-helpers.ts`); then a native
`<canvas>` post-pass at the same 2x re-draws the image overlays to bake their
effects — opacity, corner radius, rotation, drop shadow, edge feather —
back in (`apps/web/src/lib/canvas-post-pass.ts`). The second pass exists because
`html-to-image`'s `foreignObject` rasterizer silently drops those CSS effects;
see [[canvas-post-pass-for-export-effects]]. The post-pass is non-React and reads
each overlay's state from a `data-overlay` JSON attribute on the DOM, see
[[data-overlay-dom-serialization]].

### Batch workspace

There is one editor surface: the `/batch` workspace (`apps/web/src/app/batch`).
`/editor` is a redirect into it; single-image editing is just batch with one
overlay — see [[template-workspace-unified-route]]. `WorkspaceSideNav` switches
sections via a `?section=` query param; `BatchWorkspace`
(`apps/web/src/components/batch/`) wires the project, editor-state, render, and
persistence hooks together.

The workspace is a **3-column shell**: left `WorkspaceSideNav`; center a
**persistent** `TextOverlayCanvas` with `VariantStrip` directly below it — both
stay mounted and visible across the Assets / Template sections, the canvas never
section-swaps away. The right column is a contextual `BatchRightPanel`
(`apps/web/src/components/batch/BatchRightPanel.tsx`) — a pure shell that switches
its body on `activeSection` (Assets: asset list + upload zone; Template: overlay/
template + per-variant text controls + a `LayerStackPanel` whose rows select a
node — click/keyboard → `setSelectedNodeId`, the same setter the canvas uses).
**Results is the exception:** it replaces
the center canvas with the full-width `BatchResultsGallery` and collapses the right
panel. Below the `md` breakpoint the right panel stacks under the canvas.

`OverlayPickerDialog` (`apps/web/src/components/batch/OverlayPickerDialog.tsx`,
built on `apps/web/src/components/ui/dialog.tsx` — Radix dialog) is a presentational,
controlled (`open`/`onOpenChange`) multi-select thumbnail-grid dialog over
`ProjectAsset[]`, reusing the `VariantStrip`/`AssetList` thumbnail-grid markup. It
holds only local selection state (reset on open/close) and exposes two callbacks —
`onConfirm(ids)` (Add, disabled when empty) and `onUploadNew()` (falls through to
the existing upload path) — no data fetching or node creation inside it. Not yet
wired into `BatchRightPanel`'s "Add Image Overlay" button (integration is a
follow-up phase).

The center canvas renders a **live preview** of the active variant, derived
copy-on-read from the template + that overlay's per-item overrides via
`usePreviewEditorState` (`apps/web/src/hooks/use-preview-editor-state.ts`) — the
shared template is never mutated for display; see [[live-preview-derived-state]].
Every node is per-item (the text lock model was removed in v4): text and
image-overlay edits — content, style, geometry, overlay transforms, and
visibility — fan across the selected variants via `useFanOutTextHandlers`
(`apps/web/src/hooks/use-fan-out-text-handlers.ts`, whose `handleSetNodeOverride`
is the generic patch primitive) — `VariantStrip` multi-select chooses the targets,
`reconcileVariantSelection` (`apps/web/src/lib/variant-selection.ts`) keeps that
selection coherent across active-switch and deletion. This preview/display path is
**orthogonal** to the Generate All render path below — the export loop owns output
and is unaffected.

A batch project pairs a shared **template** (one `EditorState`: background, layers,
text styles) with N **overlay assets** (each: id, original filename, blob key).
Per-item edits are stored as overrides, not per-item state — one **unified** store
`itemNodeOverrides[overlayAssetId][nodeId]` of `NodeOverride`
(`Partial<…overridable Node fields…> & { hidden? }`), covering text **and** image
overlays in a single map; content lives under `content`, style/geometry/transform
fields spread flat, visibility rides on `hidden` — see [[per-item-text-schema]].
This is the `@maga/projects` schema at `SCHEMA_VERSION = 5`.

Rendering each variant **mutates the live template (text content/style/geometry and
overlay geometry/transforms), lets the DOM repaint, captures it, then restores
everything** — never a detached clone; the shared template is never permanently
mutated, and the `finally` restore covers all overridden fields, not just content.
This is the load-bearing mechanism in
`apps/web/src/hooks/use-batch-render.ts` — see [[batch-render-text-patch]].

Reorder (asset list, layer stack) uses native HTML5 DnD with no library; layer
z-order reuses `reorderNode` from `@maga/editor` — see [[dnd-library-choice]].

Projects persist two ways from `@maga/projects`: an IndexedDB adapter (live
autosave) and a ZIP exporter/importer (portable file). Both load older records
through the single shared `migrateProject` chain
(`migrateToV5 ∘ migrateToV4 ∘ migrateToV3 ∘ migrateToV2`,
`packages/projects/src/schema.ts`), which upgrades v1→v5 and is idempotent on a v5
record; `migrateToV4` fans the retired lock model's shared values into the old
per-item text maps, then `migrateToV5` collapses those three maps
(`itemTextValues`/`itemTextStyles`/`itemHiddenNodeIds`) into the unified
`itemNodeOverrides` store. The version bump is one-way; see
[[per-item-text-schema]].

### Cartoonize (external service)

Cartoonize is a one-shot, server-mediated call. The batch workspace holds the
source image and calls the `use-cartoonize.ts` hook, which POSTs the image to the
internal `/api/cartoonize` route. The route —
not the client — holds the provider key and forwards to **DeepAI Toonify**
(`apps/web/src/lib/cartoonize-service.ts`), then returns a dataURL the hook hands
back to the page, which stores it in `resultDataUrl` React state. The server-key
boundary is the point: the provider key never reaches the client, see
[[deepai-toonify-provider]]. The result is ephemeral page state, not persisted —
see [[ephemeral-cartoonize-result-state]].

### TextNode anchoring

`TextNode` x/y coordinates are **top-left corner percentages** of the canvas (matching `OverlayNode`). The root div in `TextNodeLayer` uses `left: x%, top: y%` with no centering translate. Rotation pivots around the element's visual center via `transformOrigin: 50% 50%`. Default position for new nodes is x:25, y:25 (upper-left quadrant, clearly visible).

> Prior to this change (before the "top-left anchor" refactor), text nodes were center-anchored: `transform: translate(-50%,-50%) rotate(...)` and default x/y were 50,50. Any saved projects with old x/y values now have those values interpreted as the top-left corner.

### TextNode width field

`TextNode` (`packages/editor/src/types.ts`) has an optional `width?: number` field (added in Phase 1 of text-box-resize). When absent the node auto-sizes to content (old behavior, no migration needed). When set, the root div in `TextNodeLayer` receives an inline `width: <n>px` style.

The `textBackground` wrapper in `TextNodeLayer` was changed from an inline `<span>` to a `display:block; width:100%` span so the background fills the full box width when `width` is set, while still auto-wrapping to content when `width` is absent.

`TextNodeLayer` (`apps/web/src/components/text-node-layer.tsx`) accepts:
- `onResize?: (width: number) => void` — called during right-edge drag with the new pixel width (min-clamped to 20).
- `onContentChange?: (content: string) => void` — called when inline editing commits (Esc or blur); receives the new text content.

The right-edge drag handle (a `<span aria-label="Resize handle">`) is rendered inside the node when `isSelected` is true, mirroring the SE-handle pattern of `OverlayNodeLayer`. It uses pointer capture (`setPointerCapture`/`releasePointerCapture`). The resize must **never** trigger a move: the handle's pointer move/up call `e.stopPropagation()`, and the root `handlePointerMove` bails when `resizeStart.current` is set — both guard a position-drift bug where a captured pointermove on the handle bubbled into `onMove`. See `decisions/text-node-width-resize.md`.

**Inline double-click editing:** Double-clicking a selected, visible text node enters an uncontrolled `contentEditable` mode. React sets `el.textContent = node.content` once via `useEffect` on edit-mode entry and never touches the DOM content again while editing — this prevents cursor-reset on re-renders. On commit (Esc or blur), `el.textContent` is read back and forwarded to `onContentChange`. Drag is suppressed during editing via an early-return guard in `handlePointerDown`. Edit mode exits automatically when `isSelected` becomes `false`. The canvas is a **second write surface** for text content alongside the panel Textarea; both commit through the same fan-out path. See `decisions/text-node-width-resize.md`.

`TextOverlayCanvas` wires `onResize` → `onNodeTextResize(id, width)` (a separate prop from `onNodeResize` for overlay nodes) and `onContentChange` → `onNodeContentChange(id, content)`.

`BatchWorkspace` exposes:
- `handleNodeTextResize(id, width)` — calls `fanOut.handleSetNodeOverride(activeOverlayId, id, { width })` — width-only patch, height is auto.
- `handleNodeContentChange(id, content)` — calls `fanOut.handleSetItemTextValue(activeOverlayId, id, content)` — so inline-edit commits fan out to all selected variants, matching the panel Textarea and the resize handler (both go through the fan-out hook, not raw `itemText`).

`width` is **not** in the `TextStyle` Pick (`packages/projects/src/schema.ts`). Width changes from the panel (`TextStylePanel`) are split by `BatchRightPanel.onChange`: `width` routes via `itemText.setNodeOverride`; the remaining style keys route via `itemText.setTextStyle`. See `decisions/text-node-width-resize.md`.

### TextNode height/align fields

`TextNode` (`packages/editor/src/types.ts`) gains three optional layout fields. All are absent on legacy nodes (no schema bump); absent = pre-feature behavior. They split across the same two routing paths as `width`:

- `height?: number` — optional fixed box height. Applied to the root div in `TextNodeLayer` as `height: <n>px` with `overflow: visible` (text exceeding the box spills below — never clipped, no scrollbar). Set on canvas by the **single bottom-right corner handle** (see below) with clamp `Math.max(0, ...)` (**no min-height floor** — diverges from width's `Math.max(20, ...)`), or by a panel Height input (blank → `undefined`). **Routes as GEOMETRY** like `width`: not in the `TextStyle` Pick; `BatchRightPanel.onChange` forwards it via `itemText.setNodeOverride`. `BatchWorkspace.handleNodeTextHeightResize(id, height)` → `fanOut.handleSetNodeOverride(overlayId, id, { height })`.

  **Canvas resize handle (geometry):** `TextNodeLayer` renders one `se-resize` square at the bottom-right corner (mirrors `OverlayNodeLayer`), not separate width/height handles. A single drag computes both `dw`/`dh` and fires `onResize(width)` **and** `onHeightResize(height)` together; the two `setNodeOverride` patches merge functionally so width and height both persist. Note a horizontal-only drag still locks the current height (sets `height`), since the corner controls both axes.
- `textAlign?: "left" | "center" | "right"` — CSS `textAlign` on the root div, applied only when defined. **Routes as STYLE**: it IS in the `TextStyle` Pick and fans out via `setTextStyle` / `handleSetItemTextStyle`. Panel: 3-button Left/Center/Right toggle; clicking the active button toggles back to `undefined`.
- `verticalAlign?: "top" | "middle" | "bottom"` — the root div becomes `display: flex; flexDirection: column` with `justifyContent` mapped (`top`→`flex-start`, `middle`→`center`, `bottom`→`flex-end`) **only when `height !== undefined`**; otherwise normal block flow is preserved so auto-size nodes are unaffected. **Routes as STYLE** (in the `TextStyle` Pick). Panel: 3-button Top/Middle/Bottom toggle, disabled while `height` is `undefined`.

See `decisions/text-node-height-align.md`.

> Update via the `sync-knowledge` skill when an architectural boundary, package,
> or flow is introduced or changed.
