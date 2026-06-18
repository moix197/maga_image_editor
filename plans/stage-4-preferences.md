# Plan: Stage 4 — Preferences

**Created:** 2026-06-18
**Branch:** `stage-4-preferences`
**Status:** not started

## Context

Stage 3 delivered the cartoonizer effect pipeline. Stage 4 is intentionally minimal: it introduces a Preferences surface in the app header, consolidating theme control under a dedicated entry point. The user-visible delta is upgrading the existing binary light/dark toggle to a three-option selector (Light, Dark, System) accessible from a popover. This is the only preference in scope.

### Language / i18n

Out of scope per explicit user decision. The original roadmap titled this stage "Preferences: theme + language" but the language/i18n half is deferred indefinitely. English-only throughout. No i18n libraries, no locale dictionaries, no language-switch UI will be planned or implemented in this stage.

### UI surface decision

A Preferences popover in the app header (shadcn `Popover` triggered by a `Settings2` gear icon button) was chosen over a `/settings` route for two reasons: (1) a dedicated route adds navigation, a new page, and a URL slot for a single preference — disproportionate overhead; (2) the tool is a single-page editor — there is no navigation model that a settings route would fit into naturally. A popover is self-contained, dismissable with Escape, and adds no routing complexity. It is the standard pattern for lightweight preference panels in single-page tools.

### Theme control upgrade

The current `ThemeToggle` is a binary button that cycles between `"light"` and `"dark"` via `resolvedTheme`. The `ThemeProvider` in `apps/web/src/app/layout.tsx` already sets `defaultTheme="system"` and `enableSystem` — next-themes supports System tracking out of the box — but the System option is never surfaced in the UI. The Preferences popover replaces the binary toggle with a three-option radio group (Light / Dark / System), exposing the capability that next-themes already provides. No new dependency is needed: shadcn `RadioGroup` (already available) supplies the selector UI; `useTheme` supplies `setTheme`.

### User-overridable

The gear icon (`Settings2` from lucide-react) can be swapped for any other lucide icon before execution if a different visual treatment is preferred. The popover width and positioning (align, side) can be adjusted in the component props.

## Risk: low

## Dependencies & Risks

- **No new external dependencies** — shadcn Popover and RadioGroup are already available; lucide-react is already installed; next-themes is already the theme provider. Nothing new is installed.
- **Theme persistence** is handled entirely by next-themes writing to `localStorage` under its own key (`theme`). This is independent of the Stage 1 P3 localStorage project store (`mage:project:*` keys) — no dependency there, no conflict.
- **ThemeToggle removal** — the existing `apps/web/src/components/theme-toggle.tsx` becomes unused once the header replaces it with `PreferencesPopover`. It must be deleted (not left as dead code) if no other reference exists. Grep for all usages before deleting.
- **shadcn RadioGroup** — confirm it is already initialized in the project (`apps/web/src/components/ui/radio-group.tsx`). If not, run `pnpm dlx shadcn@latest add radio-group` before implementation.
- **shadcn Popover** — confirm it is already initialized (`apps/web/src/components/ui/popover.tsx`). If not, run `pnpm dlx shadcn@latest add popover` before implementation.

---

## Phases

### Phase 0: Create worktree

> Confirm with user before running these commands.

**Steps:**
- [ ] Verify you are on `dev` branch: `git checkout dev && git pull origin dev`
- [ ] Create worktree: `git worktree add ../maga_image_editor_stage4 -b stage-4-preferences`
- [ ] `cd ../maga_image_editor_stage4`
- [ ] Install deps: `pnpm install`
- [ ] Confirm app starts: `pnpm --filter @maga/web dev`

---

### Phase 1: Preferences popover with theme selector

**Risk:** low
**Mode:** hil
**Type:** frontend
**Success criteria:** User can open the Preferences popover from the header gear icon and select Light, Dark, or System; the chosen theme applies immediately; selection persists across hard page reload; the old binary ThemeToggle button is no longer present in the header.
**Commit message:** `feat(web): add preferences popover with light/dark/system theme selector`
**Execution note:** UI phase — use `ui-ux-pro-max --stack nextjs` for design and implementation.

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/components/preferences-popover.tsx` | New `PreferencesPopover` client component: shadcn `Popover` with a `Settings2` icon `Button` trigger; popover content contains a shadcn `RadioGroup` with three items — Light, Dark, System; reads current theme via `useTheme`; calls `setTheme(value)` on selection change |
| delete | `apps/web/src/components/theme-toggle.tsx` | Remove if no references remain outside the header (see Steps — grep first). If a reference exists outside the header, retain and note why in the plan. |
| modify | `apps/web/src/app/[header file]` | Locate via grep for `ThemeToggle` usage; replace import + JSX with `PreferencesPopover`. |

**Steps:**
- [ ] Grep for `ThemeToggle` usage across the repo to find exactly which file(s) render it in the header
- [ ] Confirm shadcn `Popover` is initialized (`apps/web/src/components/ui/popover.tsx` exists); if not, add it: `pnpm dlx shadcn@latest add popover`
- [ ] Confirm shadcn `RadioGroup` is initialized (`apps/web/src/components/ui/radio-group.tsx` exists); if not, add it: `pnpm dlx shadcn@latest add radio-group`
- [ ] Create `apps/web/src/components/preferences-popover.tsx` (use `ui-ux-pro-max --stack nextjs`):
  - `"use client"` directive
  - Import `Popover`, `PopoverTrigger`, `PopoverContent` from shadcn
  - Import `RadioGroup`, `RadioGroupItem` from shadcn
  - Import `Settings2` from `lucide-react`
  - Import `useTheme` from `next-themes`
  - Trigger: a shadcn `Button` variant `ghost` with `Settings2` icon and `aria-label="Preferences"`
  - Content: a labeled `RadioGroup` with three `RadioGroupItem` values: `"light"`, `"dark"`, `"system"`, each with a visible label (Light, Dark, System)
  - `mounted` guard: render `null` (or a skeleton placeholder matching the button dimensions) until after hydration — prevents SSR/hydration mismatch where server renders with no theme class and client patches it. Pattern: `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])` — do not return `null` from the full component, only suppress the `RadioGroup` content (keep the trigger button rendered so layout does not shift)
  - `value={theme ?? 'system'}` and `onValueChange={setTheme}` wired to `useTheme` (`theme` is `undefined` on the server; the fallback avoids an uncontrolled-to-controlled React warning)
  - Component ≤50 lines (mounted guard adds ~5 lines); no business logic
- [ ] In the file(s) found via grep: remove the `ThemeToggle` import and JSX; add `PreferencesPopover` import and render it in the same slot
- [ ] Grep again for any remaining `ThemeToggle` references across the repo
- [ ] Delete `apps/web/src/components/theme-toggle.tsx` if all references are gone
- [ ] Verify popover opens, all three options apply their respective theme immediately, and the selection persists across hard reload
- [ ] Update `apps/web/README.md` (or root `README.md` if no app-level one) to note the preferences popover and the three-option theme selector

**Tests:**
No automated tests — justified because: all logic is delegated to next-themes (`setTheme`); the component is a thin UI shell with no extractable business logic; the `mounted` guard is a one-line `useEffect` with no branching. Manual verification via Verification checklist covers all observable behavior.

**Verification:**
- [ ] `pnpm build` (in `apps/web`) completes without errors
- [ ] Preferences popover opens from header gear icon
- [ ] Light option: applies light theme immediately
- [ ] Dark option: applies dark theme immediately
- [ ] System option: follows OS preference
- [ ] Selection persists across hard reload (next-themes localStorage)
- [ ] Old binary ThemeToggle icon no longer appears in header
- [ ] No hydration mismatch: hard reload with DevTools → no React hydration warnings; theme class on `<html>` matches the stored preference immediately (next-themes handles this; verify the mounted guard does not cause a visible layout shift or flash of wrong theme)
- [ ] Keyboard accessible: popover opens/closes with Enter/Escape; RadioGroup navigable with arrow keys
- [ ] No TypeScript errors (`pnpm tsc --noEmit` from root)

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted in fenced block
- [ ] Orchestrator cleared context and pasted handoff prompt
- [ ] Code-reviewer agent verified this phase
- [ ] Reviewer-driven changes reflected back into plan
- [ ] Tests for this phase written and passing — or no-tests justification accepted (see Tests above)
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `feat(web): add preferences popover with light/dark/system theme selector`
- [ ] Phase marked complete

```
Phase 1 review — stage-4-preferences (Preferences popover with light/dark/system theme selector).

Scope: apps/web/src/components/preferences-popover.tsx (new); apps/web/src/components/theme-toggle.tsx (deleted or retained with reason); the header file that previously rendered ThemeToggle (import + JSX replaced with PreferencesPopover).

Check:
(1) preferences-popover.tsx is a client component ("use client") and ≤50 lines with no business logic.
(2) A mounted guard (useState + useEffect) is present; it suppresses only the RadioGroup content (not the trigger button) until after hydration — no layout shift, no flash of wrong theme.
(3) useTheme is the only theme API used — no direct localStorage reads/writes; no custom persistence.
(4) RadioGroup value is `theme ?? 'system'` — never undefined — and onValueChange is setTheme.
(5) RadioGroup has three options with values exactly "light", "dark", "system" matching next-themes setTheme expectations.
(6) Popover trigger button has aria-label="Preferences" (or equivalent accessible label).
(7) RadioGroup is keyboard-navigable (arrow keys move selection; the shadcn RadioGroup provides this by default — verify nothing overrides it).
(8) theme-toggle.tsx is deleted if it has no remaining references; if retained, a clear reason is in the plan.
(9) The header file's change is minimal — only the import and JSX for ThemeToggle replaced; no other surrounding code modified.
(10) pnpm build (apps/web) exits 0.
(11) pnpm tsc --noEmit from root exits 0.
(12) No dead code, no commented-out blocks.
(13) CLAUDE.md invariants: pnpm used (not npm/yarn); thin entry points; small focused functions; no new external dependencies introduced; minimal change — only what was needed.
```

---

### Phase 2: Final Verification

**Mode:** hil

**Overall success criteria:**
- User can open the Preferences popover from the app header
- All three theme options (Light, Dark, System) work and persist across reload
- Old binary ThemeToggle is gone from the header
- No regressions to existing editor functionality
- Build and type-check pass

**Steps:**
- [ ] Every preceding phase's Steps/Verification/Phase review checkboxes ticked
- [ ] Reviewer handoff prompt emitted in fenced block (end-to-end scope)
- [ ] Orchestrator cleared context and pasted handoff prompt
- [ ] Code-reviewer agent reviews entire change end-to-end
- [ ] Reviewer-driven changes reflected back
- [ ] All tests pass (`pnpm test` from root, or equivalent)
- [ ] No CLAUDE.md invariants violated
- [ ] Feature tested manually: open popover, switch all three themes, reload page
- [ ] Overall success criteria met
- [ ] All phase checkboxes above ticked

```
End-to-end review — stage-4-preferences (Stage 4 — Preferences).

Scope: all new and modified files on this branch vs dev.

Check:
(1) preferences-popover.tsx is the only new component; it is a client component, ≤50 lines, no business logic, no direct localStorage access.
(2) A mounted guard (useState + useEffect) is present; suppresses only the RadioGroup content (not the trigger button) until after hydration — verify no layout shift and no flash of wrong theme on hard reload.
(3) RadioGroup value is `theme ?? 'system'` — never undefined — so React never warns about uncontrolled-to-controlled transition.
(4) RadioGroup values are exactly "light", "dark", "system" — matching what next-themes setTheme accepts.
(5) useTheme is the sole theme API; next-themes handles persistence automatically.
(6) Theme persistence is independent of the project store (mage:project:* localStorage keys) — no interaction between them.
(7) ThemeToggle component is fully removed (file deleted, all import sites cleaned up) — no dead code remains.
(8) The header file change is surgical: only the ThemeToggle import + JSX replaced with PreferencesPopover; no surrounding lines altered.
(9) No new external dependencies added to any package.json.
(10) shadcn Popover and RadioGroup used (already part of the project's component set) — no new shadcn components added if they were already present.
(11) pnpm build (apps/web) exits 0.
(12) pnpm tsc --noEmit from root exits 0.
(13) pnpm test from root exits 0 (or equivalent; no regressions to existing test suites).
(14) Accessibility: popover trigger has an accessible label; RadioGroup is keyboard-navigable.
(15) CLAUDE.md invariants: pnpm throughout; thin entry point (header file stays thin); small focused function (preferences-popover.tsx ≤50 lines); reuse before reinvent (shadcn components reused); no speculative abstractions; minimal change; no new deps.
```

---

## Documentation

| Change | Documentation location |
|---|---|
| PreferencesPopover replaces ThemeToggle in header; exposes Light/Dark/System options | `apps/web/README.md` (or root `README.md` if no app-level one) — update "theme" section |

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| Phase 1 | No automated tests — pure UI shell delegating to next-themes; no extractable business logic | N/A |

## Human Summary

Plain-language: Stage 4 is intentionally minimal. The only change is replacing the existing binary (light/dark) ThemeToggle button in the app header with a "Preferences" popover (gear icon). Inside the popover sits a three-option theme selector: Light, Dark, System. This is a net UX improvement — the System option was previously inaccessible from the UI even though next-themes supported it. Theme persistence already works via next-themes/localStorage — nothing new needed there. The stage is thin by design: i18n was cut, and theme is the only remaining preference. It stands alone because it delivers a complete, testable user-facing change (new entry point, new UI, observable behavior) even if it is small. Future preferences (e.g., export defaults, canvas snap settings) can be added to the popover in later stages without structural changes.
