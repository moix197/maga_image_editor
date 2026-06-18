# Plan: Stage 1 — Image Workspace

**Created:** 2026-06-17
**Branch:** `feature/stage-1-workspace`
**Status:** not started

## Context

Stage 0 delivered `apps/web` (Next.js App Router + TS + Tailwind + shadcn + next-themes) and `packages/config`, deployed to Vercel. Stage 1 builds the core image-editing workspace entirely client-side — no backend, no auth, no API keys. Users can upload images, view a side-by-side compare layout, persist named projects in localStorage, and download results. All logic lives in `apps/web/lib/`; page components stay thin.

## Risk: medium

## Dependencies & Risks

- **No new npm packages for drag-and-drop** — native HTML drag events only (per CLAUDE.md build-our-own rule).
- **`next/image` does not handle data URLs** — use plain `<img>` tags for displaying uploaded images.
- **Large images (>20 MB)** — rejected at validation; images >2048px downscaled via canvas for display perf.
- **localStorage quotas** — base64 images are large; warn users if quota exceeded (graceful catch).
- **Stage 5 swappability** — `project-store.ts` must expose a stable interface so localStorage can be replaced with Supabase without touching callers.
- **Vitest not yet configured** — Phase 1 adds the test harness as part of its steps.

---

## Phases

### Phase 0: Create worktree

> Confirm with user before running these commands.

**Steps:**
- [ ] Verify you are on `dev` branch: `git checkout dev && git pull origin dev`
- [ ] Create worktree: `git worktree add ../maga_image_editor_stage1 -b feature/stage-1-workspace`
- [ ] `cd ../maga_image_editor_stage1`
- [ ] Install deps: `pnpm install`
- [ ] Confirm app starts: `pnpm --filter @maga/web dev`

---

### Phase 1: Upload, display, download

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** User opens `/editor`, picks or drags an image file, sees it rendered on the page, clicks Download and receives the file. Unsupported types and files >20 MB show a clear error message. Tests pass.

**Commit message:** `feat(web): image upload, display, and download with validation`

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| create | `apps/web/lib/image-helpers.ts` | `validateImageFile`, `fileToDataUrl`, `downscaleIfNeeded`, `downloadDataUrl` |
| create | `apps/web/components/image-uploader.tsx` | Drag-and-drop + file picker; emits validated file via callback; shows error state |
| create | `apps/web/components/image-display.tsx` | `<img>` wrapper with optional download button |
| create | `apps/web/app/editor/page.tsx` | Thin page — wires `ImageUploader` + `ImageDisplay` via `useState`; imports from `lib/` |
| create | `apps/web/vitest.config.ts` | Vitest config for `apps/web` (jsdom environment) |
| create | `apps/web/vitest.setup.ts` | Global test setup (e.g., `@testing-library/jest-dom` matchers) |
| create | `apps/web/__tests__/lib/image-helpers.test.ts` | Unit tests for all four helpers |
| create | `apps/web/components/__tests__/image-uploader.test.tsx` | Component tests for uploader (drag, pick, error states) |
| edit | `apps/web/package.json` | Add `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom` as devDependencies; add `"test"` and `"test:coverage"` scripts |
| edit | `apps/web/README.md` | Document editor route, image-helpers API, and how to run tests |

**Steps:**
- [ ] Add vitest and testing-library devDeps to `apps/web/package.json`:
  ```
  pnpm --filter @maga/web add -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
  ```
- [ ] Create `apps/web/vitest.config.ts` (jsdom environment, path aliases matching tsconfig)
- [ ] Create `apps/web/vitest.setup.ts` (import `@testing-library/jest-dom`)
- [ ] Implement `apps/web/lib/image-helpers.ts` with all four functions (each ≤30 lines):
  - `validateImageFile(file: File): { valid: boolean; error?: string }` — allow jpeg/png/webp/gif, reject >20 MB
  - `fileToDataUrl(file: File): Promise<string>` — FileReader wrapper
  - `downscaleIfNeeded(dataUrl: string, maxDimension?: number): Promise<string>` — canvas downscale, default max 2048px
  - `downloadDataUrl(dataUrl: string, filename: string): void` — anchor trigger
- [ ] Create `apps/web/components/image-uploader.tsx`:
  - Accepts `onFile: (file: File) => void` and `onError: (msg: string) => void` callbacks (no business logic inside)
  - Native drag events (`onDragOver`, `onDrop`); hidden `<input type="file" accept="image/*">`
  - Shows drag-over highlight via Tailwind class toggling
  - Calls `validateImageFile` internally before emitting `onFile`
- [ ] Create `apps/web/components/image-display.tsx`:
  - Accepts `src: string | null`, `alt: string`, `onDownload?: () => void`
  - Renders `<img>` (not `next/image`) for data URLs; shows placeholder when `src` is null
  - Download button rendered only when `onDownload` is provided
- [ ] Create `apps/web/app/editor/page.tsx` (thin — ≤40 lines):
  - `useState` for `sourceDataUrl: string | null` and `error: string | null`
  - On file from uploader: `fileToDataUrl` → `downscaleIfNeeded` → set state
  - Pass `downloadDataUrl` result as `onDownload` to `ImageDisplay`
- [ ] Add `"test": "vitest run"` and `"test:coverage": "vitest run --coverage"` scripts to `apps/web/package.json`
- [ ] Write tests (see Tests section)
- [ ] Run `pnpm --filter @maga/web test` — all pass
- [ ] Update `apps/web/README.md` (see Documentation section)

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| create | `apps/web/__tests__/lib/image-helpers.test.ts` | `validateImageFile` (valid types, bad type, oversized); `fileToDataUrl` (resolves string); `downscaleIfNeeded` (no-op when small, downscales when large); `downloadDataUrl` (anchor created + click called) |
| create | `apps/web/components/__tests__/image-uploader.test.tsx` | Renders drop zone; calls `onFile` on valid drop; calls `onError` on invalid type; calls `onError` on oversized file; file input triggers `onFile` |

**Verification:**
- [ ] `/editor` loads without errors
- [ ] Drag a JPEG onto the drop zone — image appears on page
- [ ] Use file picker to select a PNG — image appears
- [ ] Try dropping a `.txt` file — error message shown, no image
- [ ] Try a file >20 MB — error message shown
- [ ] Click Download — browser saves the image with a sensible filename
- [ ] `pnpm --filter @maga/web test` exits 0

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted in a fenced code block:
  ```
  Review Phase 1 of feature/stage-1-workspace. Scope: apps/web/lib/image-helpers.ts, apps/web/components/image-uploader.tsx, apps/web/components/image-display.tsx, apps/web/app/editor/page.tsx, and their test files. Check: thin entry point, no business logic in page.tsx, each helper ≤30 lines, no external drop-zone library, validateImageFile rejects non-image MIME types and files >20 MB, downscaleIfNeeded uses canvas, downloadDataUrl uses anchor click, all tests pass.
  ```
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(web): image upload, display, and download with validation`
- [ ] Phase marked complete

---

### Phase 2: Side-by-side compare layout + result slot

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** User sees two equal panels at `/editor` — source image on the left, result slot on the right. Each panel has its own upload zone and download button (only shown when the panel has an image). Result slot shows a "No result yet" placeholder until an image is uploaded. Layout stacks on mobile. Tests pass.

**Commit message:** `feat(web): side-by-side compare layout with independent source and result slots`

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| create | `apps/web/components/compare-layout.tsx` | Two-column responsive layout; accepts `left` and `right` render slots as ReactNode |
| create | `apps/web/components/image-panel.tsx` | Single panel: `ImageUploader` + `ImageDisplay` + panel label + conditional download button; accepts callbacks |
| edit | `apps/web/app/editor/page.tsx` | Replace single-slot state with `sourceDataUrl` + `resultDataUrl`; render `CompareLayout` with two `ImagePanel` instances |
| create | `apps/web/components/__tests__/compare-layout.test.tsx` | Layout renders two children; stacks on mobile (class check) |
| create | `apps/web/components/__tests__/image-panel.test.tsx` | Renders uploader + placeholder when no image; shows image + download button when image present |
| edit | `apps/web/README.md` | Document compare layout and result slot behaviour |

**Steps:**
- [ ] Create `apps/web/components/compare-layout.tsx`:
  - Two-column grid via Tailwind (`grid grid-cols-1 md:grid-cols-2 gap-4`)
  - Accepts `left: React.ReactNode` and `right: React.ReactNode`
  - No logic — pure layout shell
- [ ] Create `apps/web/components/image-panel.tsx`:
  - Accepts `label: string`, `dataUrl: string | null`, `onFile: (f: File) => void`, `onError: (msg: string) => void`, `onDownload?: () => void`
  - Renders `ImageUploader` when no image OR as an overlay; renders `ImageDisplay` when image present
  - Download button visible only when `dataUrl` is set and `onDownload` is provided
  - Shows "No result yet" placeholder text when `dataUrl` is null and `label` indicates result slot (prop: `emptyLabel?: string`)
- [ ] Update `apps/web/app/editor/page.tsx`:
  - Add `resultDataUrl` state alongside `sourceDataUrl`
  - Render `<CompareLayout left={<ImagePanel ...source />} right={<ImagePanel ...result />} />`
  - Page stays ≤60 lines
- [ ] Write tests (see Tests section)
- [ ] Run `pnpm --filter @maga/web test` — all pass
- [ ] Update `apps/web/README.md`

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| create | `apps/web/components/__tests__/compare-layout.test.tsx` | Renders left and right children; applies responsive grid classes |
| create | `apps/web/components/__tests__/image-panel.test.tsx` | Shows placeholder when `dataUrl` is null; shows `<img>` when `dataUrl` set; download button absent without `onDownload`; download button present with `onDownload`; `onFile` called on valid upload |

**Verification:**
- [ ] `/editor` shows two equal panels on desktop
- [ ] On mobile viewport (≤768px) panels stack vertically
- [ ] Source panel: upload an image — it appears in left panel; download button appears
- [ ] Result panel: shows "No result yet" initially; upload a second image — appears in right panel with download button
- [ ] Each download button downloads only its panel's image
- [ ] `pnpm --filter @maga/web test` exits 0

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted in a fenced code block:
  ```
  Review Phase 2 of feature/stage-1-workspace. Scope: apps/web/components/compare-layout.tsx, apps/web/components/image-panel.tsx, updated apps/web/app/editor/page.tsx, and their test files. Check: CompareLayout is a pure layout shell with no logic, ImagePanel accepts only callbacks (no business logic, no redirects), page.tsx stays thin (≤60 lines), responsive stacking via Tailwind, download button conditional on dataUrl + onDownload prop, all tests pass.
  ```
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(web): side-by-side compare layout with independent source and result slots`
- [ ] Phase marked complete

---

### Phase 3: Local project store — create, name, persist, list, switch

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** User can name the current workspace a "project", reload the page and see images and name restored, create a second project, and switch between them — each with independent images. Active project persists across reloads. Tests pass.

**Commit message:** `feat(web): localStorage project store with create, name, persist, list, and switch`

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| create | `apps/web/lib/project-store.ts` | Full CRUD + image store with stable public interface (see Architecture Guidance) |
| create | `apps/web/lib/types.ts` | Shared `Project`, `ProjectId`, `ProjectImages` types |
| create | `apps/web/components/project-header.tsx` | Inline-editable project name, "New project" button, project switcher (dropdown or list) |
| edit | `apps/web/app/editor/page.tsx` | Wire project store: load active project on mount, auto-save images on change, pass project CRUD callbacks to `ProjectHeader` |
| create | `apps/web/__tests__/lib/project-store.test.ts` | Unit tests for all CRUD and image functions against mock localStorage |
| create | `apps/web/components/__tests__/project-header.test.tsx` | Renders project name; inline edit updates name; "New project" creates one; switcher lists projects |
| edit | `apps/web/README.md` | Document project-store API, localStorage keys, and Stage 5 swap seam |

**Steps:**
- [ ] Create `apps/web/lib/types.ts` with `ProjectId`, `Project`, `ProjectImages` types
- [ ] Implement `apps/web/lib/project-store.ts`:
  - localStorage key for project list: `mage:projects` (JSON array of `Project` objects without images)
  - localStorage key for images: `mage:project:<id>:images` (per-project, keeps list lookup fast)
  - localStorage key for active project: `mage:activeProjectId`
  - Export all seven functions from Architecture Guidance (each ≤30 lines)
  - Wrap localStorage writes in try/catch; log warning on quota error
  - No business logic — pure read/write; no side effects beyond localStorage
- [ ] Create `apps/web/components/project-header.tsx`:
  - Accepts `project: Project`, `projects: Project[]`, `onRename: (name: string) => void`, `onCreate: () => void`, `onSwitch: (id: ProjectId) => void`
  - Inline name editing: click name → `<input>` appears; blur or Enter saves via `onRename`
  - "New project" button calls `onCreate`
  - Project switcher: shadcn `<DropdownMenu>` listing all projects; selecting calls `onSwitch`
  - No business logic; no direct localStorage calls
- [ ] Update `apps/web/app/editor/page.tsx`:
  - On mount: read `mage:activeProjectId`; if present load project + images via store; else create default project "Untitled project"
  - On `sourceDataUrl` or `resultDataUrl` change: `setProjectImages(activeId, { sourceImage, resultImage })`
  - `onRename` → `updateProject` + re-read project
  - `onCreate` → `createProject("Untitled project")` → set as active
  - `onSwitch` → write `mage:activeProjectId` → load new project's images
  - Page stays thin: all store calls in a `useProjectStore` custom hook in `apps/web/hooks/use-project-store.ts`
- [ ] Create `apps/web/hooks/use-project-store.ts`: encapsulates all project store interaction; returns `{ project, projects, sourceDataUrl, resultDataUrl, setSourceDataUrl, setResultDataUrl, renameProject, createProject, switchProject }`
- [ ] Write tests (see Tests section)
- [ ] Run `pnpm --filter @maga/web test` — all pass
- [ ] Update `apps/web/README.md`

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| create | `apps/web/__tests__/lib/project-store.test.ts` | `createProject` persists to localStorage; `getProject` returns null for missing id; `listProjects` returns all; `updateProject` patches name and updatedAt; `deleteProject` removes from list; `getProjectImages` returns nulls when unset; `setProjectImages` persists and retrieves; quota error caught gracefully |
| create | `apps/web/components/__tests__/project-header.test.tsx` | Displays current project name; click name → input appears; blur saves via `onRename`; "New project" calls `onCreate`; dropdown lists all projects; selecting calls `onSwitch` |

**Verification:**
- [ ] `/editor` loads with a default project name visible
- [ ] Upload a source image — it auto-saves; reload page — image and name restored
- [ ] Click project name → type a new name → blur → name updates in header
- [ ] Click "New project" → blank workspace with new default name; original project still in dropdown
- [ ] Switch back to original project → original images reload
- [ ] Create 3+ projects and confirm list shows all in dropdown
- [ ] Trigger a localStorage quota error (mock in tests); app shows warning, does not crash
- [ ] `pnpm --filter @maga/web test` exits 0

**Phase review:**
- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted in a fenced code block:
  ```
  Review Phase 3 of feature/stage-1-workspace. Scope: apps/web/lib/types.ts, apps/web/lib/project-store.ts, apps/web/hooks/use-project-store.ts, apps/web/components/project-header.tsx, updated apps/web/app/editor/page.tsx, and their test files. Check: project-store.ts is pure read/write with no business logic; stable public interface matches the seven-function spec; images stored under separate per-project keys; active project key is mage:activeProjectId; ProjectHeader accepts only callbacks; useProjectStore hook encapsulates all store interaction keeping page.tsx thin; localStorage quota errors caught; all tests pass.
  ```
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(web): localStorage project store with create, name, persist, list, and switch`
- [ ] Phase marked complete

---

### Phase 4: Final Verification

**Mode:** hil
**Overall success criteria:** A local user with no auth or backend can: (1) upload an image via drag-and-drop or file picker, (2) view it in a side-by-side compare layout, (3) upload a second image into the result slot, (4) download either image, (5) name a project, reload the page and see it restored, (6) create and switch between multiple projects — all entirely client-side with zero external setup. All tests pass. No CLAUDE.md invariants violated.

**Steps:**
- [ ] Every preceding phase's Steps / Verification / Phase review checkboxes are ticked
- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review):
  ```
  End-to-end review of feature/stage-1-workspace (Stage 1 — Image Workspace). Scope: all new and modified files under apps/web/ on this branch. Check: (1) entry points thin — page.tsx ≤60 lines, no business logic; (2) lib/image-helpers.ts functions each ≤30 lines with single responsibility; (3) lib/project-store.ts pure read/write, stable interface, no business logic; (4) hooks/use-project-store.ts encapsulates store interaction; (5) no external drop-zone library added; (6) next/image not used for data URLs; (7) localStorage quota errors caught gracefully; (8) CompareLayout pure shell; (9) ImagePanel and ProjectHeader accept callbacks only; (10) pnpm --filter @maga/web test exits 0; (11) no dead code, no commented-out blocks; (12) CLAUDE.md invariants: pnpm, thin entry points, small focused functions, reuse before reinvent, no speculative abstractions, separation of concerns.
  ```
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt
- [ ] Code-reviewer agent reviews the entire change end-to-end
- [ ] Any changes made in response to the final code-reviewer review have been reflected back into this plan file
- [ ] All tests pass: `pnpm --filter @maga/web test`
- [ ] No CLAUDE.md invariants violated
- [ ] Feature tested manually — golden path:
  - [ ] Drag JPEG onto source slot → appears
  - [ ] Upload PNG to result slot → side-by-side compare visible
  - [ ] Download source → correct file saved
  - [ ] Download result → correct file saved
  - [ ] Rename project → reloads with new name
  - [ ] Create second project, upload different image, switch back to first → first images restored
- [ ] Edge cases tested manually:
  - [ ] Drop `.txt` file → clear error, no crash
  - [ ] Drop file >20 MB → clear error, no crash
  - [ ] Upload image >2048px → displayed downscaled, downloaded at original dimensions
  - [ ] Open two browser tabs on `/editor` with same project → no crash
- [ ] Overall success criteria met
- [ ] All phase checkboxes above are ticked

---

## Documentation

| Change | Documentation location |
|--------|------------------------|
| Editor route, image-helpers API, test command | `apps/web/README.md` — "Editor" section |
| Compare layout component props | `apps/web/README.md` — "Components" section |
| Project store public interface, localStorage keys, Stage 5 swap seam | `apps/web/README.md` — "Project Store" section |
| `useProjectStore` hook API | `apps/web/README.md` — "Hooks" section |

---

## Tests

| Phase | Logic under test | Test file |
|-------|-----------------|-----------|
| 1 | `validateImageFile` — MIME types, size limit | `apps/web/__tests__/lib/image-helpers.test.ts` |
| 1 | `fileToDataUrl` — resolves data URL | `apps/web/__tests__/lib/image-helpers.test.ts` |
| 1 | `downscaleIfNeeded` — no-op for small images; canvas downscale for large | `apps/web/__tests__/lib/image-helpers.test.ts` |
| 1 | `downloadDataUrl` — anchor element created and clicked | `apps/web/__tests__/lib/image-helpers.test.ts` |
| 1 | `ImageUploader` — drag, pick, error states | `apps/web/components/__tests__/image-uploader.test.tsx` |
| 2 | `CompareLayout` — renders children, responsive grid classes | `apps/web/components/__tests__/compare-layout.test.tsx` |
| 2 | `ImagePanel` — placeholder, image display, conditional download button, onFile callback | `apps/web/components/__tests__/image-panel.test.tsx` |
| 3 | `project-store` — full CRUD, image get/set, quota error handling | `apps/web/__tests__/lib/project-store.test.ts` |
| 3 | `ProjectHeader` — name display, inline edit, new project, switcher | `apps/web/components/__tests__/project-header.test.tsx` |

---

## Human Summary

Stage 1 adds the core image workspace to MAGA Image Editor in three vertical slices — each leaving the user with new, immediately usable functionality:

**Phase 1** wires up image upload (drag-and-drop + file picker using native HTML events, no library), validates type and size, downscales large images for display, and enables download. The test harness (Vitest + Testing Library) is set up here.

**Phase 2** introduces the signature side-by-side compare layout: source image on the left, result slot on the right. Both slots are independent — each can receive an upload and be downloaded separately. The layout stacks responsively on mobile.

**Phase 3** adds persistence: a `project-store.ts` module wraps localStorage with a deliberately stable API (seven named functions) designed so Stage 5 can swap the backing store to Supabase without touching any caller. Users can name projects, reload and restore their work, and manage multiple projects via a header dropdown.

All business logic lives in `apps/web/lib/` and `apps/web/hooks/`; page components and UI components stay thin and callback-based. No new runtime dependencies are introduced.
