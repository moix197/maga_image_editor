# Editor state transitions are pure mutation functions

**Decision:** All editor state transitions live as pure functions in
`packages/editor/src/editor-state.ts` — node factories (`createTextNode`,
`createOverlayNode`, …) and state transforms (`updateOverlayNode`, `removeNode`,
`reorderNode`, …) that take state and return a new `EditorState`, never mutating
their inputs. The React hook `apps/web/src/hooks/use-editor-state.ts` only wraps
them: it owns the single `useState` and threads each transform through
`setState`, adding no mutation logic of its own.

**Why:** Pure transitions keep the domain framework-free (see
[[framework-free-editor-package]]) and trivially testable — a plain Vitest unit
test calls the function and asserts on the returned state, no render harness.
Concentrating every mutation in one module means there is exactly one place to
find or add node operations, instead of logic smeared across hooks and
components.

**Rejected:** Mutating state inside the React hook, or modelling transitions as
a `useReducer` in web. Either ties the domain to React's lifecycle, forces a
render harness to test pure transitions, and blocks non-React reuse.

**Constraints it creates:** Mutation functions must stay pure — return new
state, never mutate inputs. New node operations belong in
`packages/editor/src/editor-state.ts`, not in the hook; the hook may only wrap
them (plus thin glue like z-index assignment).
