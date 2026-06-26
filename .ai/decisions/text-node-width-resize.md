# Decision: TextNode width resize (Phase 1)

**Date:** 2026-06-26
**Branch:** feat/text-box-resize-inline-edit

## What was decided

`TextNode` gains an optional `width?: number` field. A right-edge drag handle on the canvas and a Width input in the right panel both set it. Height stays auto-growing (no explicit height field).

## Rationale

### Width-only (not width+height)

Height is intentionally excluded. Text nodes auto-grow vertically to fit wrapped content — forcing an explicit height would clip text or leave visual gaps. Only width needs to be set by the user; height follows naturally from the font size, line count, and width.

### min-width clamp of 20px

Mirrors the 20px clamp used by `OverlayNodeLayer`'s SE-resize handle (`Math.max(20, ...)`). Prevents the box from collapsing to zero and becoming unselectable.

### TextStyle Pick whitelist — width excluded permanently

`TextStyle` in `packages/projects/src/schema.ts` is a `Pick<TextNode, …>` of the _styleable_ fields only (font, color, opacity, shadow, textBackground). `width` is a **layout** field, not a style field, and must not be added to the Pick.

Consequence: `itemText.setTextStyle(...)` would silently drop a `{ width }` patch. Resolution: `BatchRightPanel.onChange` splits the patch — `width` is forwarded via `itemText.setNodeOverride(overlayId, nodeId, { width })` directly; the remaining style keys go through `setTextStyle`. This split is permanent and intentional.

### No schema version bump

`width?: number` is optional. Old projects with no `width` field on a `TextNode` load identically — the absent field means auto-size, which was the previous behavior. No migration step is needed; the existing `NodeOverride` type already supports `width` (it is `Partial<Omit<TextNode & OverlayNode, "id">> & { hidden?: boolean }`, and `TextNode.width` now exists there).

### textBackground full-box fill

The `textBackground` wrapper was changed from `<span style={buildBackgroundSpanStyle(bg)}>` (inline, per-line hugging) to `<span style={{ display: "block", width: "100%", … }}>` (block, fills the full box). When no `width` is set, `width: 100%` on the block span still collapses to content width because the parent div also auto-sizes — no stretched empty box.

### Fan-out routing

Width resize during active per-variant selection fans out to all selected variants via `fanOut.handleSetNodeOverride` — the same path used by moves and overlay resizes. No additional logic was needed; `handleSetNodeOverride` already handles fan-out targeting.

---

# Decision: TextNode inline double-click editing (Phase 2)

**Date:** 2026-06-26
**Branch:** feat/text-box-resize-inline-edit

## What was decided

Double-clicking a text node on the canvas enters an uncontrolled `contentEditable` edit mode. Pressing Esc or clicking outside (blur) commits the change via the existing `itemText.setTextValue` path. Single-click still selects/moves normally.

## Rationale

### Uncontrolled contentEditable — no React value binding

If `contentEditable` were bound to a React state value (`value={node.content}` equivalent), React would re-render the element on every keystroke, resetting the caret to position 0. The uncontrolled pattern avoids this: `el.textContent = node.content` is set once via `useEffect` on edit-mode enter, and `el.textContent` is read back on commit. React never touches the DOM content while editing is active.

### Commit-on-empty behavior

When the user backspaces all text and commits (Esc or blur), `onContentChange` is called with `""`. The node is NOT removed — empty string is valid content. Removing nodes is an explicit delete action, not a side effect of emptying text. This keeps the behavior predictable and reversible.

### Suppress drag while editing

`handlePointerDown` returns early (`if (isEditing) return`) to prevent the move handler from competing with text selection and pointer capture during editing. This mirrors the plan's locked decision for risk mitigation item 6.

### Exit on deselection

A `useEffect` on `isSelected` calls `handleEditCommit()` whenever `isSelected` transitions from `true` to `false` while `isEditing` is `true`. This covers the case where the user clicks another node — the previous node's edit is committed before the new node is selected.

### Commit path: itemText.setTextValue

Content commits route through `BatchWorkspace.handleNodeContentChange` → `itemText.setTextValue(activeOverlayId, id, content)` → `setNodeOverride(overlayId, nodeId, { content })`. This is the same write path as the panel Textarea, ensuring canvas and panel stay in sync. `BatchWorkspace` stays thin — no business logic, just a thin bridge to `use-item-text.ts`.
