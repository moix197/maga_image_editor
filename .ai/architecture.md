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

- `@maga/web` depends on `@maga/editor` (its domain) and `@maga/config` (build config).
- `@maga/editor` depends only on `@maga/config` (build config); it never depends on web.
- `@maga/config` depends on nothing in the workspace — it is the sink.

This realizes the CLAUDE.md Architecture rule (dependencies flow one direction; no
circular dependencies between packages). UI and framework concerns may depend on the
domain, never the reverse.

## Data flow

_Empty. Sketch the main flows (request → service → store, etc.) once they exist._

> Update via the `sync-knowledge` skill when an architectural boundary, package,
> or flow is introduced or changed.
