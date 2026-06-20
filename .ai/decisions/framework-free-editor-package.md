# `@maga/editor` is framework-free

**Decision:** The `@maga/editor` package is pure TypeScript — no React, no DOM, no
browser APIs. It holds the editor domain: node types, defaults, guards, and the
state-mutation functions. React only enters at the web boundary, where
`apps/web/src/hooks/use-editor-state.ts` wraps the package for components.

**Why:** Keeping the domain framework-free makes the state model reusable
(server, tests, future non-React surfaces) and trivially testable with plain
Vitest unit tests — no render harness. The single React boundary (`use-editor-state.ts`)
means there is exactly one place where framework concerns and domain logic meet,
instead of mutation logic smeared across hooks and components.

**Rejected:** Colocating node/state mutation logic inside React hooks (e.g. a
`useReducer` in web). That ties the domain to React's lifecycle, forces a render
harness to test pure transitions, and blocks any non-React reuse.

**Constraints it creates:** No React (or other framework/DOM) import may enter
`packages/editor`. Web must consume the package through the
`use-editor-state.ts` wrapper — new node operations belong in
`packages/editor/src/editor-state.ts`, not in the hook.
