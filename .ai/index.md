# Knowledge Index

The map agents read first. One row per module/package: its single responsibility,
where it lives, and links to any decision or pattern doc. Keep rows terse —
this is a lookup table, not documentation. Retire rows that no longer point
anywhere real.

## Modules

| Module / package | Responsibility (one line) | Path | Decisions / patterns |
| ---------------- | ------------------------- | ---- | -------------------- |
| `@maga/web` | Next.js app: routes, page components, hooks, and `lib/` services | `apps/web` | |
| `@maga/editor` | Framework-free editor domain: node types, defaults, guards, state mutation | `packages/editor` | [[framework-free-editor-package]] · [[immutable-state-mutation-functions]] · [[aspect-ratio-locked-default]] · [[effect-field-optional-properties]] |
| `@maga/projects` | Framework-free batch-project domain: schema v5 (unified per-item node overrides — content/style/geometry/hidden in one `itemNodeOverrides` store), v1→v5 migration chain, ZIP + IDB serializers | `packages/projects` | [[per-item-text-schema]] |
| `@maga/config` | Static build config: base tsconfig, ESLint config, Tailwind preset | `packages/config` | |

## Cross-cutting

| Concern | Where it's handled | Notes |
| ------- | ------------------ | ----- |
| Batch workspace | `apps/web/src/app/batch/` · `apps/web/src/components/batch/` · `apps/web/src/hooks/{use-batch-render,use-batch-project}.ts` | One editor surface (`/editor` redirects in). 3-column shell: side nav · persistent canvas+VariantStrip · contextual `BatchRightPanel` (Results takes over center full-width). [[template-workspace-unified-route]] · [[batch-render-text-patch]] · [[dnd-library-choice]] |
| Batch live preview | `apps/web/src/hooks/use-preview-editor-state.ts` (`usePreviewEditorState`) | Derived copy-on-read EditorState for the active variant — applies the unified per-variant override (text content/style/geometry **and** image-overlay geometry/transform) to every node; memoized; never mutates the template. [[live-preview-derived-state]] |
| Batch fan-out edits | `apps/web/src/hooks/use-fan-out-text-handlers.ts` (`useFanOutTextHandlers`) · `apps/web/src/lib/variant-selection.ts` (`reconcileVariantSelection`) | Every per-node edit — text value/style/geometry **and** image-overlay geometry/style/transform (`handleSetNodeOverride`) plus visibility — fans across `selectedVariantIds` (multi-select in `VariantStrip`); selection resets on active-switch, prunes on delete. [[per-item-text-schema]] |
| Per-variant node hiding (text + image overlay) | `apps/web/src/hooks/use-item-text.ts` (`isNodeHidden`/`setNodeHidden`) · `ItemTextPanel` / `ItemOverlayPanel` eye-toggle lists in `BatchRightPanel.tsx` | `hidden` flag on a node's `NodeOverride` (unified store); trash/Delete hides for selected variants, the per-variant eye-toggle list restores. Preview filters node out; render sets `opacity:0`. [[per-item-text-schema]] |
| Layer stack panel | `apps/web/src/components/batch/LayerStackPanel.tsx` (in `BatchRightPanel` Template section) | Lists nodes (zIndex desc). Two affordances per row: native HTML5 drag → `reorderNode`; click/Enter/Space → `setSelectedNodeId` — a second selection surface alongside the canvas (same setter, drives the property panels). [[dnd-library-choice]] |
| Text-node resize + inline edit | `apps/web/src/components/text-node-layer.tsx` · `text-overlay-canvas.tsx` · `batch/BatchWorkspace.tsx` | Width resize (right-edge handle + panel Width; auto-grow unless `height` set) + height resize (bottom-edge handle + panel Height, overflow visible, no min clamp) route as geometry; `textAlign`/`verticalAlign` (panel toggles, flex-column only when height set) route as style. Double-click inline edit (uncontrolled `contentEditable`, commit on Esc/blur). Top-left anchored (rotation pivots on center). Resize handles `stopPropagation` so they never trigger the move handler. [[text-node-width-resize]] · [[text-node-height-align]] |
| Property panels | `apps/web/src/components/{text-style-panel,overlay-controls-panel}.tsx` | Both route `onChange` per-variant when an overlay context exists (`BatchRightPanel`): `TextStylePanel`→`setTextStyle`, `OverlayControlsPanel`→`setNodeOverride` fan-out; border overlays + template-only mode still mutate the template. Each panel reads an **effective node** = `{...templateNode, ...activeVariantOverride}` (hidden stripped) so it displays the active variant's merged values, not the raw template. [[field-row-property-panel-layout]] · [[per-item-text-schema]] |
| Export / compositing | `apps/web/src/lib/{export-helpers,canvas-post-pass,cover-crop}.ts` | [[canvas-post-pass-for-export-effects]] · [[data-overlay-dom-serialization]] · [[pixelratio-coordinate-mapping]] · [[per-item-trycatch-fallback]] · [[export-overlay-resolution]] |
| Image-overlay import accept set | `apps/web/src/lib/image-helpers.ts` (`validateImageFile`/`ALLOWED_TYPES`) · `BatchRightPanel.tsx` (`accept` on the overlay file input) · `BatchWorkspace.tsx` (`handleOverlayFile` validates before creating a node) | Accepts JPEG/PNG/WebP/GIF/SVG; `image/jpg` (non-standard JPG MIME some OSes emit) is treated as a `image/jpeg` alias. Same `ALLOWED_TYPES` also gates the unmounted `image-uploader.tsx`. |
| External services (cartoonize) | `apps/web/src/app/api/cartoonize/route.ts` · `apps/web/src/lib/cartoonize-service.ts` · `apps/web/src/hooks/use-cartoonize.ts` | [[deepai-toonify-provider]] · [[ephemeral-cartoonize-result-state]] · [[lib-service-function-convention]] |

> Update via the `sync-knowledge` skill — don't hand-edit drift in. See
> `architecture.md` for the package map and dependency direction.
