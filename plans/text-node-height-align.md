# Plan: TextNode Height + Horizontal/Vertical Align

**Created:** 2026-06-26
**Branch:** feat/text-node-height-align
**Shape:** Sequential  
**Status:** ✅ Complete — all phases shipped on `main`, user-verified, pushed to `origin/main`.

> Execution note: ran in a single session on `main` (no separate worktree), with
> per-phase implementation + `code-reviewer` subagents. The "worktree setup"
> (Phase 0) and per-phase "context-reset handoff to a fresh session" checkboxes
> describe an alternate workflow that was not used, so they remain unticked by
> design — they are not outstanding work. Canvas resize was later consolidated to
> a single bottom-right corner handle (`e5935ec`, `925981c`).

## Risk: medium

## Dependencies & Risks

- Phase 3 depends on Phase 1 completing the flex-root change — implement in order.
- Flex column on the root div must not break `contentEditable` inline-edit or
  `textBackground` block-span rendering. Verified by existing tests staying green
  and an explicit manual step in Phase 3.
- Height cleared to blank in panel must produce `undefined`, not `0` or `NaN`.
  Guarded by an explicit test case in Phase 1.
- Bottom-handle drag that would produce a negative height is clamped to 0 by
  `Math.max(0, ...)` (no min-height floor — intentional divergence from width's
  20px). Test must assert 0 is the minimum value passed to `onHeightResize`.
- `NodeOverride` will accept `height` automatically once `TextNode.height` is
  added in Phase 1 (it is `Partial<Omit<TextNode & OverlayNode, "id">>`).

---

## Context

Three vertical slices add layout capabilities to `TextNode`:

1. **Height** — fixed box height via bottom-edge drag handle + panel input
2. **Horizontal align** — `textAlign` CSS routed through `TextStyle`
3. **Vertical align** — flex-column justify applied to fixed-height box

Mirrors the just-landed `width` resize + inline-edit work on branch
`feat/text-box-resize-inline-edit`. All resolved decisions from that feature
(routing split, no schema version bump, `stopPropagation` guard pattern) apply
here.

### Confirmed source locations (verified, not assumed)

| Artifact | Path |
|---|---|
| `TextNode` type | `packages/editor/src/types.ts` |
| `TextStyle` Pick | `packages/projects/src/schema.ts` |
| `NodeOverride` type | `packages/projects/src/schema.ts` |
| Canvas layer | `apps/web/src/components/text-node-layer.tsx` |
| Right panel | `apps/web/src/components/text-style-panel.tsx` |
| Overlay reference | `apps/web/src/components/overlay-node-layer.tsx` |
| Hook | `apps/web/src/hooks/use-item-text.ts` |
| Fan-out handlers | `apps/web/src/hooks/use-fan-out-text-handlers.ts` |
| Workspace | `apps/web/src/components/batch/BatchWorkspace.tsx` |
| Right panel (batch) | `apps/web/src/components/batch/BatchRightPanel.tsx` |
| Tests | `apps/web/src/__tests__/` |

---

## Dependency note

Phase 3 (vertical align) depends on Phase 1 (height) because `verticalAlign`
is only meaningful when `height` is set and the root div is already a flex
column. Implement in order: Phase 1 → Phase 2 → Phase 3 → Phase 4.

---

## Phase 0 — Worktree Setup

**Risk:** low  
**Mode:** hil  
**Type:** config  
**Success criteria:** Isolated worktree on `feat/text-node-height-align` is active and all existing tests pass green.  
**Commit message:** *(no commit — setup only)*

**Steps:**

- [ ] Confirm branch name and base ref with the user
- [ ] `git worktree add ../maga-text-height-align -b feat/text-node-height-align`
- [ ] `cd ../maga-text-height-align && pnpm install`
- [ ] `pnpm --filter web test` exits 0 on the clean branch

**Tests:**

No automated tests — justified because: pure worktree scaffolding with no behavior change.

**Verification:**

- [ ] `git worktree list` shows the new worktree on correct branch
- [ ] `pnpm --filter web test` exits 0

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked
- [x] Orchestrator approved

---

## Phase 1 — Height: schema → handle → panel → fan-out (end-to-end)

**Risk:** medium  
**Mode:** afk  
**Type:** mixed  
**Success criteria:** QA can drag the bottom edge of a text node to set a fixed height, type a value in the Height panel field, see the box expand/contract, and confirm the height persists across variant switches. Text that exceeds the fixed height spills visibly below (overflow visible, no clip).  
**Commit message:** `feat(text-node): add height field with bottom-edge drag handle and panel input`

### Resolved decisions baked in

- `height?: number` — optional, `undefined` = no fixed height (current
  behavior preserved exactly).
- **Overflow: visible.** Height is a min-box for vertical-align positioning.
  Root div gets `height: <n>px` and default `overflow: visible`. Text spills
  below; no clipping, no scrollbar.
- **No min-height clamp.** `Math.max(0, ...)` is the only guard — allows zero
  and below-zero drag (gracefully renders 0-height box). This intentionally
  diverges from the width handle's `Math.max(20, ...)` clamp; the divergence
  is intentional because zero-width text is invisible but zero-height does not
  hide overflowed text.
- **No schema version bump.** `height?: number` is optional; absent = legacy
  behavior. `NodeOverride` already accepts it via
  `Partial<Omit<TextNode & OverlayNode, "id">>`.
- **Routes as GEOMETRY** (not `TextStyle`). Same split as `width`:
  `BatchRightPanel.onChange` sends `height` via `itemText.setNodeOverride`;
  `TextStyle` Pick is NOT extended.

### File changes

| Action | File | What changes |
|---|---|---|
| modify | `packages/editor/src/types.ts` | Add `height?: number` to `TextNode` |
| modify | `apps/web/src/components/text-node-layer.tsx` | Apply `height` to root div style; add bottom-edge drag handle; `handleHeightResizePointerDown/Move/Up` with `e.stopPropagation()` + early-bail guard in root `handlePointerMove`; add `onHeightResize?: (height: number) => void` prop (mirrors existing `onResize?: (width: number) => void`) |
| modify | `apps/web/src/components/text-style-panel.tsx` | Add Height number input below Width input (same pattern: blank → `undefined`, not 0 or NaN) |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add `handleNodeTextHeightResize(id, height)` → `fanOut.handleSetNodeOverride(overlayId, id, { height })`; wire to canvas layer |
| modify | `apps/web/src/__tests__/text-node-resize.test.tsx` | Extend with height handle suite (see Tests section) |

### Handle pattern (mirror width exactly)

```tsx
// bottom-edge drag handle
<span
  aria-label="Resize height handle"
  style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 8, cursor: "s-resize" }}
  onPointerDown={handleHeightResizePointerDown}
/>
```

`handleHeightResizePointerDown` → `e.stopPropagation()`, capture pointer,
record `startY` + `startHeight`.  
`handleHeightResizePointerMove` → `e.stopPropagation()`, compute
`newHeight = Math.max(0, startHeight + (e.clientY - startY))`, call
`onHeightResize?.(newHeight)`.  
`handleHeightResizePointerUp` → `e.stopPropagation()`, release capture.  
Root `handlePointerMove` → bail when `heightResizeStart.current` is set
(mirrors `resizeStart.current` guard for width).

### Steps

- [x] Add `height?: number` to `TextNode` in `packages/editor/src/types.ts`
- [x] Apply `height` to root div inline style in `text-node-layer.tsx`
- [x] Add bottom-edge drag handle with `handleHeightResizePointerDown/Move/Up`; call `e.stopPropagation()` on all three; add early-bail `if (heightResizeStart.current) return` in root `handlePointerMove`
- [x] Add `onHeightResize?: (height: number) => void` prop; compute `Math.max(0, startHeight + (e.clientY - startY))` (no 20px floor)
- [x] Add Height number input to `text-style-panel.tsx` (blank input → `undefined`, not 0 or NaN; same pattern as Width)
- [x] Add `handleNodeTextHeightResize` in `BatchWorkspace.tsx` → `fanOut.handleSetNodeOverride(overlayId, id, { height })`; wire prop to canvas layer
- [x] Confirm `height` is NOT added to `TextStyle` Pick in `packages/projects/src/schema.ts`
- [x] Write/extend tests (see Tests section below)

### Tests

**File:** `apps/web/src/__tests__/text-node-resize.test.tsx` (extend existing)

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/text-node-resize.test.tsx` | Height handle suite (see cases below) |

New describe block: `"TextNodeLayer height resize handle"`

- Handle renders when `isSelected=true`, hidden when `isSelected=false`
- `node.height` applied as inline style on root div
- `onHeightResize` called with correct computed height on pointer drag
- Drag that produces negative intermediate value is clamped to 0 (`Math.max(0,...)`) — `onHeightResize` receives 0, not a negative number
- `onMove` NOT called during height resize drag
- `onHeightResize` NOT called when `buttons=0`
- Clearing the Height panel input (blank) calls handler with `undefined`, not `0` or `NaN`

### Verification

- [x] `pnpm --filter web test` exits 0
- [x] `pnpm --filter web exec tsc --noEmit` exits 0
- [x] `pnpm --filter web build` exits 0
- [x] Manual: drag bottom edge of a text node; Height field in panel reflects value; text exceeding height spills below (not clipped); height persists when switching variants
- [x] Manual: confirm `height` is absent from `TextStyle` Pick (no style-routing regression)

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted in fenced code block
- [ ] Orchestrator cleared context and pasted handoff into fresh session
- [x] Code-reviewer agent verified this phase
- [x] Tests written and passing
- [x] Documentation updated
- [x] Orchestrator approved
- [x] Committed: `feat(text-node): add height field with bottom-edge drag handle and panel input`
- [x] Phase marked complete

---

## Phase 2 — Horizontal align: schema → CSS → panel → fan-out (end-to-end)

**Risk:** low  
**Mode:** afk  
**Type:** mixed  
**Success criteria:** QA can click Left/Center/Right buttons in the right panel and see the text within the node realign immediately. Persists per-variant and survives reload.  
**Commit message:** `feat(text-node): add textAlign field with 3-button panel toggle`

### Resolved decisions baked in

- `textAlign?: "left" | "center" | "right"` on `TextNode`.
- `undefined` = no explicit `textAlign` (browser default: left) — existing
  nodes render identically.
- **Routes as STYLE** (not geometry). `textAlign` IS added to the `TextStyle`
  Pick in `packages/projects/src/schema.ts`. `BatchRightPanel.onChange` sends
  it via `itemText.setTextStyle`.
- Applied as CSS `textAlign` on the root div. No wrapper changes needed.

### File changes

| Action | File | What changes |
|---|---|---|
| modify | `packages/editor/src/types.ts` | Add `textAlign?: "left" \| "center" \| "right"` to `TextNode` |
| modify | `packages/projects/src/schema.ts` | Add `"textAlign"` to the `TextStyle` Pick |
| modify | `apps/web/src/components/text-node-layer.tsx` | Apply `textAlign: node.textAlign` in root div style |
| modify | `apps/web/src/components/text-style-panel.tsx` | Add 3-button toggle (Left/Center/Right) — `undefined` renders no active button; clicking active button sets `undefined` (toggle-off) |
| create | `apps/web/src/__tests__/text-node-align.test.tsx` | New file: horizontal align suite |

### Panel UI pattern

```tsx
// 3-button toggle — mirrors fontWeight bold/normal pattern already in panel
<div className="flex gap-1">
  {(["left", "center", "right"] as const).map((align) => (
    <Button
      key={align}
      variant={node.textAlign === align ? "default" : "outline"}
      size="icon"
      onClick={() => onChange({ textAlign: align === node.textAlign ? undefined : align })}
      aria-label={`Align ${align}`}
    >
      <AlignLeftIcon /> {/* swap per value */}
    </Button>
  ))}
</div>
```

Toggle-off (clicking active button) resets to `undefined`.

### Steps

- [x] Add `textAlign?: "left" | "center" | "right"` to `TextNode` in `packages/editor/src/types.ts`
- [x] Add `"textAlign"` to `TextStyle` Pick in `packages/projects/src/schema.ts`
- [x] Apply `textAlign: node.textAlign` to root div style in `text-node-layer.tsx`
- [x] Add 3-button toggle to `text-style-panel.tsx`; toggle-off sets `undefined`; routes via `setTextStyle` (not `setNodeOverride`)
- [x] Write tests (see Tests section below)

### Tests

| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/text-node-align.test.tsx` | `textAlign` applied to root div; all three values; `undefined` produces no style |
| modify | `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` | `{ textAlign: "center" }` fans to all selected variants via `handleSetItemTextStyle` |

### Verification

- [x] `pnpm --filter web test` exits 0
- [x] `pnpm --filter web exec tsc --noEmit` exits 0
- [x] `pnpm --filter web build` exits 0
- [x] Manual: toggle each alignment; text shifts left/center/right inside node; persists across variants; toggling active button resets to default (left)
- [x] Manual: confirm `textAlign` IS in `TextStyle` Pick and routes via `setTextStyle` (not `setNodeOverride`)

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted in fenced code block
- [ ] Orchestrator cleared context and pasted handoff into fresh session
- [x] Code-reviewer agent verified this phase
- [x] Tests written and passing
- [x] Documentation updated
- [x] Orchestrator approved
- [x] Committed: `feat(text-node): add textAlign field with 3-button panel toggle`
- [x] Phase marked complete

---

## Phase 3 — Vertical align: schema → flex layout → panel → fan-out (end-to-end)

**Risk:** medium  
**Mode:** afk  
**Type:** mixed  
**Success criteria:** QA sets a fixed height on a text node, then clicks Top/Middle/Bottom in the panel; the text block repositions within the fixed-height box. Without an explicit height, buttons are disabled and have no visible effect. `textBackground` highlight still wraps each line correctly. Inline double-click edit still works inside the flex column.  
**Commit message:** `feat(text-node): add verticalAlign field with flex-column layout when height is set`

**Depends on Phase 1** — root div must accept a fixed `height` for vertical
alignment to have meaning. Flex layout is only activated when `height` is set.

### Resolved decisions baked in

- `verticalAlign?: "top" | "middle" | "bottom"` on `TextNode`.
- `undefined` = no explicit alignment — preserves current behavior exactly.
- **Routes as STYLE.** `verticalAlign` added to `TextStyle` Pick.
- Implementation: root div becomes `display: flex; flex-direction: column`
  when `height` is set. `justifyContent` maps: `top` → `flex-start`,
  `middle` → `center`, `bottom` → `flex-end`, `undefined` → `flex-start`
  (same visual as current).
- **`textBackground` and `contentEditable` must still render correctly inside
  flex column.** The inner `<span>` (textBackground wrapper) is already
  `display: block; width: 100%`, which is a valid flex child. `contentEditable`
  is on the same span — flex has no effect on `contentEditable` itself.
- Flex is **only applied when `height` is set.** Without a fixed height, the
  root div remains in normal block flow (no flex) so wrapping / auto-size
  behavior is unchanged.

### File changes

| Action | File | What changes |
|---|---|---|
| modify | `packages/editor/src/types.ts` | Add `verticalAlign?: "top" \| "middle" \| "bottom"` to `TextNode` |
| modify | `packages/projects/src/schema.ts` | Add `"verticalAlign"` to the `TextStyle` Pick |
| modify | `apps/web/src/components/text-node-layer.tsx` | Root div style: when `node.height` is set, add `display: "flex", flexDirection: "column", justifyContent: JUSTIFY_MAP[node.verticalAlign ?? "top"]`; otherwise no flex properties — keeps normal block flow for auto-size nodes |
| modify | `apps/web/src/components/text-style-panel.tsx` | Add 3-button toggle (Top/Middle/Bottom) below Height input — disabled / grayed when `node.height` is `undefined` |
| modify | `apps/web/src/__tests__/text-node-align.test.tsx` | Extend with vertical align suite |

### justifyContent map

```ts
const JUSTIFY_MAP: Record<"top" | "middle" | "bottom", string> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};
```

### Flex activation guard

```tsx
const flexStyles: React.CSSProperties = node.height !== undefined
  ? {
      display: "flex",
      flexDirection: "column",
      justifyContent: JUSTIFY_MAP[node.verticalAlign ?? "top"],
    }
  : {};

// merged into root div style:
style={{ ...existingStyles, ...flexStyles }}
```

### Steps

- [x] Add `verticalAlign?: "top" | "middle" | "bottom"` to `TextNode` in `packages/editor/src/types.ts`
- [x] Add `"verticalAlign"` to `TextStyle` Pick in `packages/projects/src/schema.ts`
- [x] Add `JUSTIFY_MAP` constant and conditional `flexStyles` object in `text-node-layer.tsx`; merge into root div style only when `node.height !== undefined`
- [x] Add disabled Top/Middle/Bottom toggle to `text-style-panel.tsx`; disabled when `node.height` is `undefined`; routes via `setTextStyle`
- [x] Write/extend tests (see Tests section below)

### Tests

| Action | File | What it covers |
|---|---|---|
| modify | `apps/web/src/__tests__/text-node-align.test.tsx` | Vertical align suite (see cases below) |
| modify | `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` | `{ verticalAlign: "middle" }` fans to all selected variants via `handleSetItemTextStyle` |

Vertical align test cases:

- `justifyContent: "flex-start"` when `verticalAlign="top"` and height set
- `justifyContent: "center"` when `verticalAlign="middle"` and height set
- `justifyContent: "flex-end"` when `verticalAlign="bottom"` and height set
- No flex styles on root div when `node.height` is `undefined` (even if `verticalAlign` is set)
- `textBackground` span renders with `display: block; width: 100%` as valid flex child — no regression

### Verification

- [x] `pnpm --filter web test` exits 0 (including `text-node-inline-edit.test.tsx` — must stay green with no changes)
- [x] `pnpm --filter web exec tsc --noEmit` exits 0
- [x] `pnpm --filter web build` exits 0
- [x] Manual: set height on a node; toggle Top/Middle/Bottom; content moves within box; `textBackground` highlight wraps each line correctly inside flex column
- [x] Manual: with no height set, buttons show as disabled; clicking them has no visible effect
- [x] Manual: inline edit still functions inside flex column (double-click enters edit, Esc/blur commits)
- [x] Manual: confirm flex is absent on root div when `node.height` is `undefined` (inspect element)

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted in fenced code block
- [ ] Orchestrator cleared context and pasted handoff into fresh session
- [x] Code-reviewer agent verified this phase
- [x] Tests written and passing (including `text-node-inline-edit.test.tsx` still green)
- [x] Documentation updated
- [x] Orchestrator approved
- [x] Committed: `feat(text-node): add verticalAlign field with flex-column layout when height is set`
- [x] Phase marked complete

---

## Phase 4 — Final Verification + KB Sync

**Risk:** low  
**Mode:** hil  
**Type:** docs

**Overall success criteria:** All three capabilities work end-to-end in the live app; all gates green; `.ai/` KB reflects the new fields and routing decisions; no visual regression on existing nodes.

### Steps

- [x] Run all three gates:
  ```
  pnpm --filter web test
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web build
  ```
- [x] Manual regression: open a saved project with existing text nodes (no `height`/`textAlign`/`verticalAlign`); confirm they render identically to pre-feature
- [x] Manual happy path for each slice (see phase acid tests above)
- [x] Update `.ai/architecture.md` — add `TextNode height/align fields` section:
  - `height?: number`: optional fixed height; overflow visible; no min clamp.
  - `textAlign?: "left"|"center"|"right"`: routed via `TextStyle` Pick.
  - `verticalAlign?: "top"|"middle"|"bottom"`: routed via `TextStyle` Pick; flex layout only when `height` is set.
- [x] Create `.ai/decisions/text-node-height-align.md` capturing:
  - Overflow-visible decision and rationale.
  - No min-height clamp (divergence from width's 20px floor — intentional).
  - `textAlign`/`verticalAlign` in `TextStyle` Pick (unlike `width`/`height`).
  - Flex-conditional-on-height guard and why (prevent breaking auto-size nodes).
  - Phase ordering dependency (Phase 3 depends on Phase 1 flex root).
- [x] Final commit: `feat: text node height + horizontal/vertical align` (landed as per-phase commits `74ba12e`, `97845e5`, `f52a206` + canvas-handle fixes `e5935ec`, `925981c`)

**Tests:**

No automated tests — justified because: all logic covered in per-phase test suites; this phase is gates + manual end-to-end + KB sync only.

### Verification

- [x] Every preceding phase's Steps/Verification/Phase review checkboxes are ticked in this file
- [x] All three gates exit 0
- [x] `.ai/architecture.md` updated
- [x] `.ai/decisions/text-node-height-align.md` created
- [x] No visual regressions on existing nodes (manual)
- [x] No CLAUDE.md invariants violated (pnpm, thin entry points, `.ai/` KB synced)

**Phase review:**

- [x] Code-reviewer agent reviewed entire change end-to-end (per-phase `code-reviewer` passes, all green)
- [x] All phase checkboxes above ticked
- [x] Overall success criteria met

---

## Documentation table

| Doc | Phase updated |
|---|---|
| `packages/editor/src/types.ts` | 1, 2, 3 |
| `packages/projects/src/schema.ts` | 2, 3 |
| `.ai/architecture.md` | 4 |
| `.ai/decisions/text-node-height-align.md` | 4 (new) |

---

## Tests mapping table

| Test file | Phases covered |
|---|---|
| `apps/web/src/__tests__/text-node-resize.test.tsx` | 1 (extended) |
| `apps/web/src/__tests__/text-node-align.test.tsx` | 2, 3 (new file) |
| `apps/web/src/__tests__/use-fan-out-text-handlers.test.ts` | 2, 3 (extended) |
| `apps/web/src/__tests__/text-node-inline-edit.test.tsx` | 3 (must stay green — no changes) |

---

## Knowledge base impact table

| KB file | Change |
|---|---|
| `.ai/architecture.md` | Add `height`, `textAlign`, `verticalAlign` to TextNode section |
| `.ai/decisions/text-node-height-align.md` | New — captures all decisions above |

---

## Human summary

Four phases. One commit each.

- **Phase 0:** Worktree + install.
- **Phase 1:** `height` field end-to-end — type → root div → bottom handle → panel input → fan-out. Overflow visible, no min clamp (intentional divergence from width).
- **Phase 2:** `textAlign` end-to-end — type → `TextStyle` Pick → CSS → 3-button panel toggle → fan-out. Low risk, pure style.
- **Phase 3:** `verticalAlign` end-to-end — type → `TextStyle` Pick → flex-column root (only when height set) → 3-button panel toggle → fan-out. Depends on Phase 1.
- **Phase 4:** hil. Gates, manual regression, KB sync.
