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
| Batch live preview | `apps/web/src/hooks/use-preview-editor-state.ts` (`usePreviewEditorState`) | Derived copy-on-read EditorState for the active variant; memoized; never mutates the template. [[live-preview-derived-state]] |
| Batch text fan-out edits | `apps/web/src/hooks/use-fan-out-text-handlers.ts` (`useFanOutTextHandlers`) · `apps/web/src/lib/variant-selection.ts` (`reconcileVariantSelection`) | Every text value/style/visibility edit fans across `selectedVariantIds` (multi-select in `VariantStrip`); selection resets on active-switch, prunes on delete. [[per-item-text-schema]] |
| Per-variant text-layer hiding | `apps/web/src/hooks/use-item-text.ts` (`isNodeHidden`/`setNodeHidden`) | `hidden` flag on a node's `NodeOverride` (unified store); trash hides for selected variants, eye restores. Preview filters node out; render sets `opacity:0`. [[per-item-text-schema]] |
| Property panels | `apps/web/src/components/{text-style-panel,overlay-controls-panel}.tsx` | [[field-row-property-panel-layout]] |
| Export / compositing | `apps/web/src/lib/{export-helpers,canvas-post-pass}.ts` | [[canvas-post-pass-for-export-effects]] · [[data-overlay-dom-serialization]] · [[pixelratio-coordinate-mapping]] · [[per-item-trycatch-fallback]] |
| External services (cartoonize) | `apps/web/src/app/api/cartoonize/route.ts` · `apps/web/src/lib/cartoonize-service.ts` · `apps/web/src/hooks/use-cartoonize.ts` | [[deepai-toonify-provider]] · [[ephemeral-cartoonize-result-state]] · [[lib-service-function-convention]] |

> Update via the `sync-knowledge` skill — don't hand-edit drift in. See
> `architecture.md` for the package map and dependency direction.
