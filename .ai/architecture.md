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

### Cartoonize (external service)

Cartoonize is a one-shot, server-mediated call. `apps/web/src/app/editor/page.tsx`
holds the source image; its `handleCartoonize` calls the `use-cartoonize.ts`
hook, which POSTs the image to the internal `/api/cartoonize` route. The route —
not the client — holds the provider key and forwards to **DeepAI Toonify**
(`apps/web/src/lib/cartoonize-service.ts`), then returns a dataURL the hook hands
back to the page, which stores it in `resultDataUrl` React state. The server-key
boundary is the point: the provider key never reaches the client, see
[[deepai-toonify-provider]]. The result is ephemeral page state, not persisted —
see [[ephemeral-cartoonize-result-state]].

> Update via the `sync-knowledge` skill when an architectural boundary, package,
> or flow is introduced or changed.
