# Native HTML5 drag-and-drop, no DnD library

**Decision:** Reorder (the asset list and the canvas layer stack) uses the native
HTML5 DnD API (`draggable` + `onDragStart`/`onDragOver`/`onDrop`) directly. No DnD
library was added — `package.json` has no `dnd-kit`, `react-dnd`,
`react-beautiful-dnd`, or `sortablejs`.

**Why:** CLAUDE.md says build our own before installing. List/stack reorder is a
coarse interaction — move one row to a new index — which native HTML5 DnD covers
without a dependency. The actual reorder logic is reused, not reinvented:
`reorderNode` from `@maga/editor` drives layer z-order, and `reorderOverlays`
(`apps/web/src/hooks/use-batch-project.ts`) reorders the asset list.

**Rejected:** Pulling in a DnD library (`dnd-kit` etc.) for what is a single-axis,
coarse reorder — added surface to audit and maintain for no behavior we need.

**Constraints it creates:** Native HTML5 DnD has a **known keyboard-accessibility
gap** (no keyboard reorder, weak touch support). Acceptable for now; if a future
need (touch, a11y) makes native genuinely impractical, that is the trigger to
revisit a library — re-evaluate, don't reach for one by default.
