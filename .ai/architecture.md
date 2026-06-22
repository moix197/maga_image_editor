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
  the persisted schema (overlay assets, per-item text, layer locks) and the
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
stay mounted and visible across the Assets / Template / Text sections, the canvas
never section-swaps away. The right column is a contextual `BatchRightPanel`
(`apps/web/src/components/batch/BatchRightPanel.tsx`) — a pure shell that switches
its body on `activeSection` (Assets: asset list + upload zone; Template: overlay/
template controls; Text: BulkTextPanel). **Results is the exception:** it replaces
the center canvas with the full-width `BatchResultsGallery` and collapses the right
panel. Below the `md` breakpoint the right panel stacks under the canvas.

The center canvas renders a **live preview** of the active variant, derived
copy-on-read from the template + that overlay's per-item overrides via
`usePreviewEditorState` (`apps/web/src/hooks/use-preview-editor-state.ts`) — the
shared template is never mutated for display; see [[live-preview-derived-state]].
Text edits route by lock state through `makeTextEditHandlers`
(`apps/web/src/components/batch/make-text-edit-handlers.ts`): an unlocked layer's
edit writes a per-item override (only the active variant changes), a locked layer's
edit writes the shared template (all variants change); see
[[text-edit-lock-routing]]. This preview/display path is **orthogonal** to the
Generate All render path below — the export loop owns output and is unaffected.

A batch project pairs a shared **template** (one `EditorState`: background, layers,
text styles) with N **overlay assets** (each: id, original filename, blob key).
Per-item text is stored as overrides, not per-item state — two parallel maps keyed
`[overlayAssetId][textNodeId]`: `itemTextValues` (content string) and
`itemTextStyles` (`Partial<TextStyle>`), with `textLayerLocks` deciding shared vs.
per-item for both — see [[per-item-text-schema]]. This is the `@maga/projects`
schema at `SCHEMA_VERSION = 3`.

Rendering each variant **mutates the live template (content + style), lets the DOM
repaint, captures it, then restores both** — never a detached clone; the shared
template is never permanently mutated, and the `finally` restore covers style
fields, not just content. This is the load-bearing mechanism in
`apps/web/src/hooks/use-batch-render.ts` — see [[batch-render-text-patch]].

Reorder (asset list, layer stack) uses native HTML5 DnD with no library; layer
z-order reuses `reorderNode` from `@maga/editor` — see [[dnd-library-choice]].

Projects persist two ways from `@maga/projects`: an IndexedDB adapter (live
autosave) and a ZIP exporter/importer (portable file). Both load older records
through the single shared `migrateProject` chain (`migrateToV3 ∘ migrateToV2`,
`packages/projects/src/schema.ts`), which upgrades v1→v2→v3 and is idempotent on a
v3 record; the version bump is one-way.

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

> Update via the `sync-knowledge` skill when an architectural boundary, package,
> or flow is introduced or changed.
