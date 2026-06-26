# Plan: Text Box Resize and Inline Edit
**Created:** 2026-06-26
**Branch:** feat/text-box-resize-inline-edit
**Status:** not started

## Context

Text nodes (`TextNode`) currently have no explicit width — they auto-size to fit content. This plan adds:

1. **Width-resizable box** — a right-edge drag handle on the canvas + a Width field in the right panel. Height stays auto (grows to fit wrapped text). When a `textBackground` is set, the background fills the full box width (not per-line).
2. **Double-click inline editing** — clicking twice enters an uncontrolled `contentEditable` mode; Esc or click-away commits. Single click still selects/moves.

This mirrors how `OverlayNode` resize already works. All writes flow through the existing fan-out path (`fanOut.handleSetNodeOverride`).

## Risk: Medium

Core hot paths (`text-node-layer.tsx`, `BatchWorkspace.tsx`) are touched. The main unknown is the `TextStyle` Pick whitelist in `packages/projects/src/schema.ts` — if `width` is not in that Pick, the panel width input must route through `setNodeOverride` directly rather than `setTextStyle`. This is called out explicitly in Phase 1.

## Dependencies & Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | `TextStyle` Pick in `schema.ts` excludes `width` → panel `onChange` silently drops it | Phase 1 Step 3 is an explicit whitelist check before writing any panel code |
| 2 | `contentEditable` + React controlled value causes cursor-reset on every keystroke | Locked decision: uncontrolled pattern — set initial text once on edit-mode enter, read back on commit |
| 3 | Drag handle pointer events bubble to move handler → both fire | `e.stopPropagation()` in resize `pointerDown`; same pattern as `overlay-node-layer.tsx` |
| 4 | `transform: translate(-50%,-50%)` on text nodes means `width` on the root div shifts visual center | Apply `width` to the root div only; centering still works because `left/top` stay at `x%/y%` and `translate(-50%,-50%)` centers on that origin |
| 5 | Export path (`html-to-image` canvas post-pass) may not respect `width` on text divs | Phase 3 verification includes an export smoke test |
| 6 | `isEditing` + pointer-capture interaction during live drag | Suppress drag entirely when `isEditing` via early-return in `handlePointerDown` |

---

### Phase 0: Create worktree
**Risk:** None
**Mode:** afk
**Type:** tooling
**Success criteria:** Developer has an isolated worktree at a known path and is on the correct branch.
**Commit message:** *(no commit — setup only)*

**Steps:**
- [ ] From the repo root, run: `git worktree add ../maga_image_editor_text-resize feat/text-box-resize-inline-edit`
- [ ] Confirm the new worktree exists: `git worktree list`
- [ ] All subsequent work happens in `../maga_image_editor_text-resize`

**Verification:**
- [ ] `git worktree list` shows the new worktree on branch `feat/text-box-resize-inline-edit`
- [ ] `git status` inside the worktree is clean

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [x] Code-reviewer agent has verified this phase
- [x] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [x] Tests for this phase written and passing — *No automated tests — justified because: pure worktree setup, no code changes.*
- [x] Documentation updated
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: *(no commit)*
- [ ] Phase marked complete

---

### Phase 1: Width-resizable text box, end-to-end
**Risk:** Medium — touches types, canvas layer, panel; includes the TextStyle whitelist unknown
**Mode:** afk
**Type:** frontend
**Success criteria:** User can drag the right-edge handle on a text node to resize its width; the text wraps inside the box; the background (when set) fills the full box width; a Width input in the right panel also sets the width; typing a value or dragging correctly fans out to all variants.
**Commit message:** `feat(text-node): add width-resize drag handle and panel width control`

**File changes:**
| Action | File | What changes |
|---|---|---|
| Edit | `packages/editor/src/types.ts` | Add `width?: number` field to `TextNode` interface (after `zIndex`, before `fontSize`) |
| Edit | `apps/web/src/components/text-node-layer.tsx` | (1) Add `onResize?: (width: number) => void` prop; (2) when `node.width` is set, apply it to root div style; (3) move `textBackground` from inline `<span>` to a `display:block; width:100%` wrapper so bg fills full box; (4) add right-edge drag handle JSX + 3 pointer handlers (down/move/up) mirroring `overlay-node-layer.tsx` SE handle but width-only |
| Edit | `apps/web/src/components/text-overlay-canvas.tsx` | Wire `onResize` on `TextNodeLayer`: `onResize={(width) => onNodeResize(node.id, width, 0)}` — passes `0` for height (BatchWorkspace ignores it in the width-only path added below) |
| Edit | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add `handleNodeTextResize(id, width)` that calls `fanOut.handleSetNodeOverride(activeOverlayId ?? "", id, { width })` — width-only patch, does not touch height |
| Edit | `apps/web/src/components/text-overlay-canvas.tsx` | Update `onNodeResize` callback type / routing to call `handleNodeTextResize` for text nodes and existing `handleNodeResize` for overlay nodes (discriminate via `isTextNode`) |
| Edit | `apps/web/src/components/text-style-panel.tsx` | Add "Width" `FieldRow` after Font Size; `<input type="number" value={node.width ?? ""} placeholder="Auto" min={20} onChange={(e) => onChange({ width: e.target.value === "" ? undefined : Math.max(20, Number(e.target.value)) })} />` |
| Edit | `apps/web/src/components/batch/BatchRightPanel.tsx` | **After verifying whitelist (Step 3 below):** ensure the `onChange` prop passed to `TextStylePanel` routes `width` correctly — either via `setTextStyle` (if whitelist expanded) or a separate `setNodeOverride` call |

**Steps:**
- [x] **Step 1 — Add `width?: number` to `TextNode`.**
  Open `packages/editor/src/types.ts`. After the `zIndex: number` line (currently line ~36), add `width?: number;`. No other changes to this file.
  **Design invariant:** `width` is optional — omitting it means auto-size. Old projects with no `width` field render identically to before (the fallback is implicit from the absence of the inline style). No migration needed.

- [x] **Step 2 — Update `text-node-layer.tsx` root style.**
  Open `apps/web/src/components/text-node-layer.tsx`. In the root style object (lines ~84-107), add conditional width:
  ```ts
  ...(node.width !== undefined && { width: `${node.width}px` }),
  ```
  Keep `whiteSpace: "pre-wrap"` so text wraps within the set width.

- [x] **Step 3 — Fix `textBackground` to fill full box width (not per-line).**
  In `text-node-layer.tsx`, the current render wraps content in `<span style={buildBackgroundSpanStyle(bg)}>`. Replace with a `<div>` (or `<span style={{ display: "block", width: "100%" }}>`) so that when `node.width` is set, the background fills the entire box. When no width is set, `width: 100%` still wraps to content width via the parent's auto-size behavior — verify this renders correctly.

- [x] **Step 4 — Add resize pointer handlers to `text-node-layer.tsx`.**
  - **Before implementing, read `overlay-node-layer.tsx` in full** — the SE-handle pointer capture pattern must be mirrored exactly. Do not invent a new pattern.
  Add three handler refs (mirroring `overlay-node-layer.tsx` lines ~110-127):
  ```ts
  const resizeStart = useRef<{ clientX: number; width: number } | null>(null);

  function handleResizePointerDown(e: React.PointerEvent) {
    e.stopPropagation(); // prevent move handler from firing
    resizeStart.current = { clientX: e.clientX, width: node.width ?? containerRef.current?.offsetWidth ?? 100 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleResizePointerMove(e: React.PointerEvent) {
    if (!resizeStart.current) return;
    const dw = e.clientX - resizeStart.current.clientX;
    const newWidth = Math.max(20, resizeStart.current.width + dw);
    onResize?.(newWidth);
  }

  function handleResizePointerUp(e: React.PointerEvent) {
    resizeStart.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }
  ```
  Note: `containerRef` — add `const containerRef = useRef<HTMLDivElement>(null)` and attach to the root div.

- [x] **Step 5 — Add right-edge drag handle JSX to `text-node-layer.tsx`.**
  Inside the root div, after the content span, render the handle when `isSelected`:
  ```tsx
  {isSelected && (
    <span
      style={{
        position: "absolute",
        right: -6,
        top: "50%",
        transform: "translateY(-50%)",
        width: 12,
        height: 12,
        background: "#3b82f6",
        borderRadius: 2,
        cursor: "ew-resize",
        zIndex: 10,
      }}
      onPointerDown={handleResizePointerDown}
      onPointerMove={handleResizePointerMove}
      onPointerUp={handleResizePointerUp}
    />
  )}
  ```

- [x] **Step 6 — Whitelist check (CRITICAL — do this before touching the panel).**
  Open `packages/projects/src/schema.ts`. Inspect the `TextStyle` Pick (lines ~4-13). Current pick keys: `fontSize`, `color`, `opacity`, `fontFamily`, `fontWeight`, `fontStyle`, `rotation`, `shadow`, `textBackground`. `width` is NOT in this list. Therefore `itemText.setTextStyle(...)` will silently drop a `width` patch. **Resolution:** In `BatchRightPanel.tsx`, the `onChange` callback for `TextStylePanel` must split the patch — send `width` (if present) via `itemText.setNodeOverride(activeOverlay.id, selectedNodeId!, { width })` and the remaining style keys via `itemText.setTextStyle(...)`. **DO NOT add `width` to the `TextStyle` Pick — `TextStyle` is intentionally style-only. This decision is permanent.**

- [x] **Step 7 — Add Width FieldRow to `text-style-panel.tsx`.**
  After the Font Size row (lines ~103-112), add:
  ```tsx
  <FieldRow label="Width">
    <input
      type="number"
      value={node.width ?? ""}
      placeholder="Auto"
      min={20}
      onChange={(e) =>
        onChange({
          width: e.target.value === "" ? undefined : Math.max(20, Number(e.target.value)),
        })
      }
    />
  </FieldRow>
  ```
  `onChange` here accepts `Partial<TextNode>` — confirm the prop type already uses `Partial<TextNode>` (it does: `onChange: (patch: Partial<TextNode>) => void`).

- [x] **Step 8 — Update `BatchRightPanel.tsx` onChange callback.**
  Locate the `TextStylePanel` render (lines ~157-166). Split the patch per Step 6:
  ```ts
  onChange={(patch) => {
    const { width, ...stylePatch } = patch;
    if (Object.keys(stylePatch).length > 0) {
      activeOverlay
        ? itemText.setTextStyle(activeOverlay.id, selectedNodeId!, stylePatch as Partial<TextStyle>)
        : editorState.updateTextNode(selectedNodeId!, stylePatch);
    }
    if (width !== undefined) {
      activeOverlay
        ? itemText.setNodeOverride(activeOverlay.id, selectedNodeId!, { width })
        : editorState.updateTextNode(selectedNodeId!, { width });
    }
  }}
  ```

- [x] **Step 9 — Wire `onResize` in `text-overlay-canvas.tsx`.**
  Add `handleNodeTextResize` to `BatchWorkspace.tsx` (width-only `setNodeOverride` patch). Update `text-overlay-canvas.tsx` so `TextNodeLayer` receives `onResize={(width) => onNodeResize(node.id, width, 0)}`. In the canvas `onNodeResize` callback, route to `handleNodeTextResize` for text nodes: discriminate with `isTextNode(node)`.

- [x] **Step 10 — Add `handleNodeTextResize` to `BatchWorkspace.tsx`.**
  After `handleNodeResize` (lines ~174-190), add:
  ```ts
  const handleNodeTextResize = useCallback((id: string, width: number | undefined) => {
    if (width === undefined) {
      // Clear-override path: remove the width override entirely
      fanOut.handleSetNodeOverride(activeOverlayId ?? "", id, { width: undefined });
      return;
    }
    fanOut.handleSetNodeOverride(activeOverlayId ?? "", id, { width });
  }, [fanOut, activeOverlayId]);
  ```
  Pass it down to `TextOverlayCanvas` via props (add `onNodeTextResize` or reuse `onNodeResize` with text/overlay discrimination in the canvas — prefer reuse with discrimination to keep the interface minimal).
  **Logic lives in `use-item-text.ts` (via `fanOut.handleSetNodeOverride`). `BatchWorkspace` stays thin — no business logic here.**
  **Fan-out note:** `handleSetNodeOverride` already fans out to selected variants only when per-variant selection is active. Width resize during active per-variant selection correctly updates only the selected variants — no additional logic needed.

- [x] **Step 11 — TypeScript check.** Run `pnpm --filter web exec tsc --noEmit`. Fix all type errors before proceeding.

- [x] **Step 12 — Update `.ai/` docs.**
  - Update `architecture.md`: add row for `TextNode.width` (optional number, absent = auto-size); document `onResize?: (width: number | undefined) => void` prop on `TextNodeLayer`; document `textBackground` full-box behavior change.
  - Create `decisions/text-node-width-resize.md`: record the `TextStyle` whitelist resolution rationale (width excluded from Pick → routes via `setNodeOverride`), the width-only (not height) decision, the min-width clamp of 20px, and the no-schema-version-bump rationale.
  - **This file (`decisions/text-node-width-resize.md`) must NOT exist yet — it is created during implementation here, not during planning.**

**Tests:**
| Action | File | What it covers |
|---|---|---|
| Create | `apps/web/src/__tests__/text-node-resize.test.tsx` | TextNodeLayer renders resize handle when `isSelected`; handle is absent when not selected; `onResize` called with clamped width on pointer drag simulation |
| Edit | `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` | Add case: width patch `{ width: 120 }` fan-outs to all variants via `setNodeOverride` |
| Edit | `apps/web/src/__tests__/item-overlay-panel.test.tsx` | Add case: Width field renders in TextStylePanel; onChange with `width` routes to `setNodeOverride` not `setTextStyle` |

**Verification:**
- [x] Automated tests pass: `pnpm --filter web test`
- [x] `pnpm --filter web exec tsc --noEmit` — zero errors
- [ ] Drag right-edge handle on a text node → width updates live, text wraps, handle stays at right edge
- [ ] Type a value in Width panel field → box resizes on blur/Enter
- [ ] Clear Width field (empty) → box returns to auto-size (`width: undefined` clears the override, no stretched box)
- [ ] Text with `textBackground` and a set width → background fills the full box width, not just per-line
- [ ] Text node with `textBackground` and NO explicit width → background still wraps to content width (no stretched empty box; auto-size fallback intact)
- [ ] Per-variant fan-out: resizing on variant A does not affect variant B (unless fan-out mode is "all")
- [ ] Width resize during active per-variant selection → fans out to selected variants only via `handleSetNodeOverride` (not all variants)
- [ ] Export regression covered in Phase 3 Step 8 — mark as deferred here.
- [ ] `pnpm --filter web build` — no new lint errors

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(text-node): add width-resize drag handle and panel width control`
- [ ] Phase marked complete

---

### Phase 2: Inline double-click editing, end-to-end
**Risk:** Medium — `contentEditable` uncontrolled pattern; pointer suppression must be airtight
**Mode:** afk
**Type:** frontend
**Success criteria:** User can double-click a text node on the canvas to edit it inline; the caret appears, text is editable; pressing Esc or clicking outside commits the change; the panel Textarea and variant state reflect the updated content. Single-click still selects/moves normally.
**Commit message:** `feat(text-node): add double-click inline editing on canvas`

**File changes:**
| Action | File | What changes |
|---|---|---|
| Edit | `apps/web/src/components/text-node-layer.tsx` | Add `isEditing` local state; `onDoubleClick` handler; suppress move drag when editing; cursor/userSelect switch; render `contentEditable` div uncontrolled on edit mode; blur/Esc commit via `onContentChange` |
| Edit | `apps/web/src/components/text-node-layer.tsx` | Add `onContentChange?: (content: string) => void` prop |
| Edit | `apps/web/src/components/text-overlay-canvas.tsx` | Wire `onContentChange` on `TextNodeLayer` → calls `onNodeContentChange(node.id, content)` |
| Edit | `apps/web/src/components/text-overlay-canvas.tsx` | Add `onNodeContentChange: (id: string, content: string) => void` to `TextOverlayCanvasProps` |
| Edit | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add `handleNodeContentChange(id, content)` → `itemText.setTextValue(activeOverlayId ?? "", id, content)` |
| Edit | `apps/web/src/components/batch/BatchWorkspace.tsx` | Pass `onNodeContentChange={handleNodeContentChange}` to `TextOverlayCanvas` |

**Steps:**
- [ ] **Step 1 — Add `onContentChange` prop to `TextNodeLayerProps`.**
  In `apps/web/src/components/text-node-layer.tsx`, add `onContentChange?: (content: string) => void` to the props interface.

- [ ] **Step 2 — Add `isEditing` local state.**
  ```ts
  const [isEditing, setIsEditing] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);
  ```

- [ ] **Step 3 — Suppress move drag when editing.**
  In `handlePointerDown` (currently at lines ~52-72), add an early return at the top:
  ```ts
  if (isEditing) return;
  ```
  This prevents the move handler from capturing the pointer while the user is typing.

- [ ] **Step 4 — Switch cursor and userSelect while editing.**
  In the root style object (lines ~84-107), make `cursor` and `userSelect` conditional:
  ```ts
  cursor: isEditing ? "text" : "move",
  userSelect: isEditing ? "text" : "none",
  ```

- [ ] **Step 5 — Add `onDoubleClick` handler.**
  On the root div, add `onDoubleClick={handleDoubleClick}`:
  ```ts
  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    // Guard: do not enter edit mode if the node is not visible or not selected
    if (!isSelected) return;
    if (node.opacity === 0 || node.visible === false) return;
    setIsEditing(true);
  }
  ```

- [ ] **Step 6 — Focus the `contentEditable` element when edit mode activates.**
  Use a `useEffect` that watches `isEditing`:
  ```ts
  useEffect(() => {
    if (isEditing && editableRef.current) {
      const el = editableRef.current;
      el.focus();
      // Place caret at end
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);
  ```

- [ ] **Step 7 — Render the content as `contentEditable` when editing.**
  Replace the current content span render with a conditional:
  ```tsx
  {isEditing ? (
    <div
      ref={editableRef}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleEditCommit}
      onKeyDown={handleEditKeyDown}
      style={{ outline: "none", minWidth: 20, whiteSpace: "pre-wrap" }}
      // Uncontrolled: set initial text via useEffect, do NOT bind to React value
    />
  ) : (
    // existing content span / textBackground wrapper
  )}
  ```
  In the `useEffect` from Step 6, also set the initial text:
  ```ts
  el.textContent = node.content;
  ```
  This is the only place `node.content` is written to the DOM during edit mode — no React re-renders change it while typing.

- [ ] **Step 8 — Add `handleEditCommit` (blur handler).**
  ```ts
  function handleEditCommit() {
    if (!editableRef.current) return;
    const newContent = editableRef.current.textContent ?? "";
    setIsEditing(false);
    onContentChange?.(newContent);
  }
  ```

- [ ] **Step 9 — Add `handleEditKeyDown` (Esc commits; Enter allows newlines via default).**
  ```ts
  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleEditCommit();
    }
    // Enter: allow default (newline in contentEditable)
    // Do NOT call e.stopPropagation() here — canvas-level shortcuts should still fire if needed
  }
  ```
  **Note — Esc without change:** `handleEditCommit` fires regardless of whether the content changed. This is intentional and idempotent — calling `onContentChange` with the same string as before is a no-op at the store level.

- [ ] **Step 10 — Wire `onContentChange` in `text-overlay-canvas.tsx`.**
  Add `onNodeContentChange: (id: string, content: string) => void` to `TextOverlayCanvasProps`. Pass `onContentChange={(content) => onNodeContentChange(node.id, content)}` to each `TextNodeLayer`.

- [ ] **Step 11 — Add `handleNodeContentChange` to `BatchWorkspace.tsx`.**
  ```ts
  const handleNodeContentChange = useCallback((id: string, content: string) => {
    fanOut.handleSetItemTextValue(activeOverlayId ?? "", id, content);
  }, [fanOut, activeOverlayId]);
  ```
  Pass `onNodeContentChange={handleNodeContentChange}` to `TextOverlayCanvas`. **Routes through `fanOut.handleSetItemTextValue` (matching `handleNodeTextResize` which uses `fanOut.handleSetNodeOverride`) so inline-edit commits fan out to all selected variants — not just the active overlay. This corrects an internal inconsistency with the success criterion: the panel Textarea and resize handler already fan out, but the original plan used raw `itemText.setTextValue` which only writes the active overlay.**

- [ ] **Step 12 — Exit edit mode on node deselection.**
  In `text-node-layer.tsx`, add a `useEffect` that calls `handleEditCommit()` when `isSelected` changes from `true` to `false` while editing:
  ```ts
  useEffect(() => {
    if (!isSelected && isEditing) {
      handleEditCommit();
    }
  }, [isSelected]); // eslint-disable-line react-hooks/exhaustive-deps
  ```

- [ ] **Step 13 — TypeScript check.** Run `pnpm --filter web exec tsc --noEmit`. Fix all type errors.

- [ ] **Step 14 — Update `.ai/` docs.**
  - Update `architecture.md`: add `onContentChange?: (content: string) => void` prop on `TextNodeLayer`; document uncontrolled `contentEditable` pattern; note canvas as second write surface for text content alongside panel Textarea.
  - Append to `decisions/text-node-width-resize.md`: record the inline-edit decision (uncontrolled pattern to prevent cursor-reset) and the commit-on-empty behavior (node survives, empty string is valid content).
  - **`decisions/text-node-width-resize.md` must already exist from Phase 1 Step 12 — append to it, do not re-create.**

**Tests:**
| Action | File | What it covers |
|---|---|---|
| Create | `apps/web/src/__tests__/text-node-inline-edit.test.tsx` | Double-click enters edit mode; single-click does not; Esc commits and exits; blur commits; `onContentChange` called with correct text; drag is suppressed while `isEditing` |
| Edit | `apps/web/src/__tests__/text-node-inline-edit.test.tsx` | Empty-content commit: node survives (`onContentChange` called with `""`, node not removed) |
| Edit | `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` | Add case: `setTextValue` call routes content patch `{ content }` to correct overlay and node |

**Verification:**
- [ ] Automated tests pass: `pnpm --filter web test`
- [ ] `pnpm --filter web exec tsc --noEmit` — zero errors
- [ ] Double-click a text node → caret appears inside the box, cursor is "text"
- [ ] Type new text → content updates in real time within the box (no cursor jump)
- [ ] Press Esc → edit mode exits, panel Textarea reflects new content
- [ ] Click outside the text node → edit mode exits, content saved
- [ ] Single-click a text node → selects/moves normally (no edit mode)
- [ ] Move/drag is fully suppressed during edit (pointer-down on text area does not drag node)
- [ ] Double-click on text node does NOT trigger move/drag — confirm `onMove` is NOT called on double-click while editing
- [ ] Empty content on commit (backspace all text, then Esc or blur) → `onContentChange` is called with `""`, node is NOT removed; it stays in the canvas
- [ ] Multi-line paste: pasting a multi-line string collapses `<div>` tags into newlines via `textContent` — this is acceptable behavior; confirm pasted text appears with line breaks, no crash
- [ ] Clicking another node while editing: blur fires → commit on current node, then click selects the new node — verify this sequence without unexpected state
- [ ] Double-click on a hidden node (`opacity === 0` or `visible === false`) → does NOT enter edit mode (early-return guard in `handleDoubleClick`)
- [ ] Per-variant fan-out: inline edit on variant A fans out correctly; other variants unaffected when fan-out mode is per-item
- [ ] Panel Textarea and inline canvas stay in sync after commit
- [ ] `pnpm --filter web build` — no new lint errors

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(text-node): add double-click inline editing on canvas`
- [ ] Phase marked complete

---

### Phase 3: Final Verification
**Risk:** Low
**Mode:** hil
**Type:** qa
**Success criteria:** Both features work together end-to-end with no regressions; all automated checks green; KB synced.
**Commit message:** `chore(text-node): sync .ai/ KB for resize and inline-edit features`

**Steps:**
- [ ] **Step 1 — Full test suite green.**
  Run `pnpm --filter web test` — all 28+ test files pass including the new ones from Phases 1 and 2.

- [ ] **Step 2 — TypeScript clean.**
  Run `pnpm --filter web exec tsc --noEmit` — zero errors.

- [ ] **Step 3 — Production build green.**
  Run `pnpm --filter web build` — no lint errors, no new warnings.

- [ ] **Step 4 — Manual end-to-end: resize.**
  Open the batch workspace with at least 2 variants. Select a text node. Drag the right-edge handle → width updates live, text wraps, handle stays right-aligned. Enter a value in the Width panel field → same result. Clear the Width field → auto-size restores.

- [ ] **Step 5 — Manual end-to-end: textBackground fills box.**
  Enable `textBackground` on a text node. Set an explicit width. Confirm the background spans the full box width (not per-line hugging).

- [ ] **Step 6 — Manual end-to-end: inline edit.**
  Double-click a text node → caret visible. Type → text updates. Press Esc → committed, panel Textarea matches. Repeat with click-outside commit. Confirm single-click still moves.

- [ ] **Step 7 — Manual end-to-end: fan-out.**
  In per-item fan-out mode: resize text node on variant A → only variant A updates. Switch to all-variants fan-out mode → all variants update. Same for inline edit content.

- [ ] **Step 8 — Export smoke test.**
  Export a card with a width-resized text node (with and without textBackground) via the normal export path. Open the exported image and confirm text is wrapped at the correct width and background fills the box.

- [ ] **Step 9 — No old-project regression.**
  Load a project saved before this change (no `width` on TextNode). Confirm text nodes render identically to before (auto-size, no handle unless selected, no editing issues).

- [ ] **Step 10 — Sync knowledge base.**
  Run `/sync-knowledge` to update `.ai/` KB. Confirm the three artifacts in the KB Impact table below are written/updated.

- [ ] **Step 11 — Commit KB changes.**
  Commit any `.ai/` changes with: `chore(text-node): sync .ai/ KB for resize and inline-edit features`

**Tests:**
*No new tests in this phase — all tests were written in Phases 1 and 2.*

**Verification:**
- [ ] `pnpm --filter web test` — all tests pass
- [ ] `pnpm --filter web exec tsc --noEmit` — zero errors
- [ ] `pnpm --filter web build` — green
- [ ] All manual steps above completed and signed off

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `chore(text-node): sync .ai/ KB for resize and inline-edit features`
- [ ] Phase marked complete

---

## Documentation

Each phase includes a documentation step. The specific artifacts:

| Phase | What to document | Where |
|---|---|---|
| 1 | `TextNode.width` optional field; `onResize?: (width: number \| undefined) => void` prop on `TextNodeLayer`; `textBackground` full-box behavior; `TextStyle` whitelist workaround routing; min-width clamp of 20px; no schema version bump rationale | **Update** `.ai/architecture.md`: add row for `TextNode.width`; **Create** `decisions/text-node-width-resize.md` with whitelist resolution rationale (must NOT exist before Phase 1 Step 12 runs) |
| 2 | `onContentChange?: (content: string) => void` prop on `TextNodeLayer`; uncontrolled `contentEditable` pattern and why; inline edit as second write surface alongside panel Textarea; commit-on-empty behavior (node survives) | **Update** `.ai/architecture.md`; **Append** to `decisions/text-node-width-resize.md` |
| 3 | Final KB sync via `/sync-knowledge`; index row update | **Update** `.ai/index.md` |

## Knowledge Base Impact

| `.ai/` artifact | Action | What it captures |
|---|---|---|
| `index.md` | Update | New row: text-node resize (width-only, drag handle + panel field) and inline edit (double-click contentEditable) capabilities |
| `architecture.md` (or nearest equivalent) | Update | `TextNodeLayer` now has `onResize?: (width: number) => void` and `onContentChange?: (content: string) => void` props; the canvas is now a second write surface for text content alongside the panel Textarea; `TextStyle` Pick does not include `width` — width routes via `setNodeOverride` |
| `decisions/text-node-width-resize.md` | Create | Why width-only (not width+height — height auto-grows); why `contentEditable` is uncontrolled (prevent cursor-reset on every keystroke); `TextStyle` whitelist resolution (width excluded from Pick → routes via `setNodeOverride`); min-width clamp of 20px from `overlay-node-layer.tsx` pattern; no schema version bump (`width?: number` is optional — absent means auto-size, old projects load unchanged) |

## Tests

| File | Phase | What it covers |
|---|---|---|
| `apps/web/src/__tests__/text-node-resize.test.tsx` | 1 | Resize handle renders when selected; absent when not; `onResize` fires with clamped width |
| `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` (edit) | 1 | Width patch `{ width: 120 }` fans out via `setNodeOverride` to all variants |
| `apps/web/src/__tests__/item-overlay-panel.test.tsx` (edit) | 1 | Width field renders in TextStylePanel; onChange with `width` routes to `setNodeOverride` not `setTextStyle` |
| `apps/web/src/__tests__/text-node-inline-edit.test.tsx` | 2 | Double-click enters edit; single-click does not; Esc commits; blur commits; `onContentChange` called with correct text; drag suppressed while editing |
| `apps/web/src/__tests__/text-node-inline-edit.test.tsx` (edit) | 2 | Empty-content commit: node survives (`onContentChange` called with `""`, node not removed) |
| `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` (edit) | 2 | `setTextValue` routes `{ content }` patch to correct overlay and node |

## Human Summary

This plan adds two features to text nodes that mirror existing overlay-node behavior:

**Phase 1 (Width resize):** Adds an optional `width?: number` field to `TextNode`. A right-edge drag handle on the canvas and a Width input in the right panel both set it. Height stays auto-growing. The `textBackground` is changed from a per-line `<span>` to a block-level element so it fills the full box. The key implementation detail is that `width` is NOT in the `TextStyle` Pick in `schema.ts` — the panel `onChange` callback must split the patch and route `width` via `setNodeOverride` directly.

**Phase 2 (Inline edit):** Double-clicking a text node enters an uncontrolled `contentEditable` mode — React sets the initial text once, the user types freely, and `textContent` is read back on Esc or blur. Drag is suppressed during editing via an early-return guard. Commits flow through the existing `itemText.setTextValue` path, keeping the entry point thin.

**No schema version bump** — `width` is optional and old projects load unchanged. Both features fan out to variants via the existing `handleSetNodeOverride` path.
