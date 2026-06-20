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
| `@maga/config` | Static build config: base tsconfig, ESLint config, Tailwind preset | `packages/config` | |

## Cross-cutting

| Concern | Where it's handled | Notes |
| ------- | ------------------ | ----- |
| Property panels | `apps/web/src/components/{text-style-panel,overlay-controls-panel}.tsx` | [[field-row-property-panel-layout]] |
| Export / compositing | `apps/web/src/lib/{export-helpers,canvas-post-pass}.ts` | [[canvas-post-pass-for-export-effects]] · [[data-overlay-dom-serialization]] · [[pixelratio-coordinate-mapping]] · [[per-item-trycatch-fallback]] |
| External services (cartoonize) | `apps/web/src/app/api/cartoonize/route.ts` · `apps/web/src/lib/cartoonize-service.ts` · `apps/web/src/hooks/use-cartoonize.ts` | [[deepai-toonify-provider]] · [[ephemeral-cartoonize-result-state]] · [[lib-service-function-convention]] |

> Update via the `sync-knowledge` skill — don't hand-edit drift in. See
> `architecture.md` for the package map and dependency direction.
