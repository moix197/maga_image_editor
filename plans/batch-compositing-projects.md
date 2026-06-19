# Plan: Batch Image-Compositing Projects

**Created:** 2026-06-19
**Branch:** feat/batch-compositing-projects
**Status:** not started

## Context

The image editor currently supports single-image compositing (background + overlays exported one at a time). Users need a batch workflow: supply one background, N overlay images, define a template with a single "variable image slot," and generate one composited output per overlay image — all in the browser, with no backend, no cost. Projects persist in IndexedDB and are portable via a downloadable ZIP that can be re-imported to resume work.

## Risk: medium

Core compositing logic already exists and is battle-tested. Risk is concentrated in: IndexedDB blob storage across browsers, cover-fit math plugging into the existing post-pass, and ZIP portability (round-trip fidelity). No backend changes required.

## Dependencies & Risks

- `applyImageOverlayPostPass` and `exportCanvasElement` must remain stable — batch rendering loops over them; any breaking change to their signatures cascades.
- IndexedDB quota varies by browser/OS — large batches of high-res images could exceed quota; plan must downscale inputs via existing `downscaleIfNeeded(2048)` before storing.
- JSZip is a new external dependency. Justified: implementing a ZIP encoder from scratch is impractical (binary format, compression algorithm, CRC checksumming) — this is the same category as cryptography per CLAUDE.md's "build our own before installing" rule. Use `pnpm add jszip` and `pnpm add -D @types/jszip`.
- The existing two-pass pipeline (`html-to-image` → canvas post-pass) is DOM-dependent; batch rendering must drive it sequentially (one composite at a time) to avoid concurrent DOM mutations.
- `plans/stage-5-cloud-persistence.md` describes a future Supabase layer — the project JSON schema defined here must stay clean enough to map to it later (keep refs as relative paths / blob keys, not absolute URLs).
- No circular dependencies: `packages/projects` must not import from `apps/web`; data flows one way.

## Phases

### Phase 0: Create worktree

**This phase is always first. No exceptions.** Always confirm worktree creation with the user before running.

**Steps:**

- [ ] Confirm branch name (`feat/batch-compositing-projects`) and base ref with the user
- [ ] Run `git worktree add ../<branch-folder> -b feat/batch-compositing-projects <base-ref>`
- [ ] Verify worktree is active and on the correct branch (`git worktree list`)

---

### Phase 1: `packages/projects` scaffold + schema

**Risk:** low
**Mode:** afk
**Type:** typescript
**Success criteria:** `pnpm test` passes in `packages/projects`; `BatchProject` type compiles with `schemaVersion: 1` literal and required fields; no circular deps (no import from `apps/web`).
**Commit message:** `feat: packages/projects scaffold with versioned BatchProject schema`

**Package decision — `packages/projects`:**
Create a new package `packages/projects` that owns: the versioned project JSON schema (types), IndexedDB read/write adapter, and ZIP serialize/deserialize logic. Batch-render orchestration and all UI stay in `apps/web`. This satisfies CLAUDE.md modular-by-packages: the project model is a discrete responsibility, reusable by any future surface (CLI export tool, cloud sync in Stage 5), and it has no dependency on `apps/web` internals.

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `packages/projects/package.json` | New package manifest |
| create | `packages/projects/tsconfig.json` | TypeScript config extending `packages/config` |
| create | `packages/projects/src/schema.ts` | Versioned `BatchProject` type (`schemaVersion: 1`), `ProjectAsset` (id, filename, blobKey), `VariableSlot` (overlayNodeId + cover-fit params), `GeneratedOutput` (overlayAssetId, outputBlobKey, timestamp) |
| create | `packages/projects/src/index.ts` | Public API re-export |

**Steps:**

- [x] Create `packages/projects` with `package.json`, `tsconfig.json`, `src/schema.ts`, `src/index.ts`; add to pnpm workspace
- [x] Define `BatchProject` schema v1 in `schema.ts` with `schemaVersion: 1` literal type; include `id`, `name`, `createdAt`, `updatedAt`, `background: ProjectAsset`, `overlays: ProjectAsset[]`, `template: EditorState`, `variableSlotId: string`, `outputs: GeneratedOutput[]`
- [x] Write `packages/projects` schema unit tests
- [x] Update `packages/projects/README.md`

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `packages/projects/__tests__/schema.test.ts` | Type-level and runtime validation that a `BatchProject` object satisfies the schema shape; `schemaVersion` equals `1`; `outputs` defaults to `[]` |

**Verification:**

- [x] Automated tests pass: `pnpm test` in `packages/projects`
- [x] No TypeScript errors (`pnpm tsc --noEmit` in `packages/projects`)
- [x] No imports from `apps/web` in `packages/projects`

**Phase review:**

- [x] All Steps and Verification checkboxes above ticked
- [x] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [x] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [x] Code-reviewer agent has verified this phase
- [x] Any changes from reviewer reflected back into this plan file
- [x] Tests written and passing
- [x] Documentation updated
- [x] Orchestrator has verified and approved this phase
- [x] Changes committed: `feat: packages/projects scaffold with versioned BatchProject schema`
- [x] Phase marked complete

---

### Phase 2: `/batch` route + asset upload UI (background + overlay images listed in-memory)

**Risk:** low
**Mode:** hil
**Type:** frontend
**Success criteria:** User opens `/batch` route, uploads a background image and multiple overlay images via drag-drop or file picker, and sees both listed by filename with thumbnail previews. No compositing yet — project exists in React state only (in-memory).
**Commit message:** `feat: batch project scaffold with asset upload UI`

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/app/batch/page.tsx` | Thin Server Component; renders `<BatchWorkspace />` |
| create | `apps/web/src/app/batch/layout.tsx` | Layout with page title metadata |
| create | `apps/web/src/components/batch/BatchWorkspace.tsx` | Client Component; holds in-memory project state via `useBatchProject` hook; renders upload zones + asset list |
| create | `apps/web/src/components/batch/AssetUploadZone.tsx` | Generic drag-drop + file-input zone (accepts callbacks only — no business logic); reuses shadcn/ui card + label |
| create | `apps/web/src/components/batch/AssetList.tsx` | Renders thumbnail grid for uploaded assets |
| create | `apps/web/src/hooks/use-batch-project.ts` | React hook; manages `BatchProject` in `useState`; exposes `setBackground`, `addOverlays`, derived list accessors; reads blobs via `fileToDataUrl` from existing `image-helpers.ts` |
| modify | `apps/web/src/app/page.tsx` | Add nav link to `/batch` |

**Steps:**

- [x] Create `/batch` route: thin `page.tsx` + `layout.tsx` with metadata
- [x] Build `AssetUploadZone` (generic, callback-only) accepting `onFiles: (files: File[]) => void`, `accept`, `multiple` props; use shadcn/ui `Card` for drop-target styling
- [x] Build `useBatchProject` hook: convert uploaded `File` objects to data URLs via existing `fileToDataUrl`; store as `ProjectAsset` with a uuid key; hold full `BatchProject` in `useState`
- [x] Build `AssetList` to render background thumbnail + overlay thumbnails grid
- [x] Build `BatchWorkspace` composing the above; wire background zone (single) and overlays zone (multiple)
- [x] Add nav link on home page

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/use-batch-project.test.ts` | `setBackground` sets background asset; `addOverlays` appends to overlay list; duplicate file names allowed (different ids) |

**Verification:**

- [x] Automated tests pass: `pnpm test` in `apps/web`
- [ ] Navigate to `/batch`, drag-drop a background image → thumbnail appears labeled "Background" _(deferred → final manual pass)_
- [ ] Upload 3 overlay images → 3 thumbnails appear in overlay list _(deferred → final manual pass)_
- [x] No console errors; no TypeScript errors (`pnpm tsc --noEmit` in `apps/web`) — tsc clean; console pending manual pass

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked _(browser-manual verification deferred to final pass)_
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn _(n/a — subagent-driven execute-prd flow)_
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session _(n/a)_
- [x] Code-reviewer agent has verified this phase
- [x] Any changes from reviewer reflected back into this plan file
- [x] Tests written and passing
- [ ] Documentation updated _(batched to final docs pass)_
- [ ] Orchestrator has verified and approved this phase _(pending final manual pass)_
- [x] Changes committed: `feat: batch project scaffold with asset upload UI`
- [ ] Phase marked complete _(pending final manual pass)_

---

### Phase 3: Template editor + single composite rendered end-to-end

**Risk:** medium
**Mode:** hil
**Type:** frontend
**Success criteria:** User positions the variable image slot on the background (using the existing overlay placement UI), clicks "Generate preview," and sees one real composited image rendered in-app — the first overlay image cover-fit into the slot, baked via the existing `applyImageOverlayPostPass` pipeline.
**Commit message:** `feat: template editor with single composite generation`

**Cover-fit math:**
Center-crop to fill slot: compute `scale = max(slotW / imgW, slotH / imgH)`, then `drawX = (slotW - imgW * scale) / 2`, `drawY = (slotH - imgH * scale) / 2`. This runs inside a new `coverCropDataUrl(src, slotW, slotH): Promise<string>` helper in `apps/web/src/lib/cover-crop.ts`. The helper produces a pre-cropped data URL that is then assigned as the variable `OverlayNode`'s `src` before the post-pass reads it. This plugs into the existing pipeline without modifying `applyImageOverlayPostPass`.

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/lib/cover-crop.ts` | `coverCropDataUrl(src, slotW, slotH)` — draws image onto offscreen canvas with center-crop scale, returns data URL |
| create | `apps/web/src/components/batch/TemplateEditor.tsx` | Client Component; renders the background with an `OverlayNode` layer for the variable slot; wraps existing overlay placement controls; marks which node is the variable slot |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Add `setTemplate(editorState, variableSlotId)` — stores template in project state |
| create | `apps/web/src/hooks/use-single-composite.ts` | Hook: given project + one overlay asset, runs cover-crop → swaps variable slot src → calls `exportCanvasElement` → returns output data URL; holds `isRendering` / `error` state |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add phase-based UI: after assets uploaded, show TemplateEditor; after template saved, show "Generate preview" button wired to `use-single-composite` + result preview |

**Steps:**

- [x] Implement `coverCropDataUrl` in `apps/web/src/lib/cover-crop.ts` using offscreen `<canvas>`; keep under 30 lines; export as named function
- [x] Build `TemplateEditor`: render background image as base; layer existing `OverlayNodeLayer` component (reuse from current editor) to place the variable slot; expose `onSave(editorState, variableSlotId)` callback; "variable slot" is visually distinguished (dashed border, label)
- [x] Wire `setTemplate` into `useBatchProject`
- [x] Build `use-single-composite`: (1) `coverCropDataUrl(overlay.src, slot.width, slot.height)` → croppedSrc, (2) clone template EditorState, swap variable node src to croppedSrc, (3) call existing `exportCanvasElement` from `apps/web/src/lib/export-helpers.ts`, (4) return result data URL
- [x] Add "Generate preview" button in `BatchWorkspace`; show first overlay composite result in a preview card
- [x] Write unit test for `coverCropDataUrl`; write unit test for the slot-swap logic in `use-single-composite` (mock `exportCanvasElement`)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/cover-crop.test.ts` | `coverCropDataUrl`: output canvas dimensions equal requested slot dimensions; image fills slot (no transparent bars) — tested by sampling corner pixels from a solid-color source |
| create | `apps/web/src/__tests__/use-single-composite.test.ts` | Variable slot src is replaced with croppedSrc before `exportCanvasElement` is called; `isRendering` transitions false→true→false; error state set on rejection |

**Verification:**

- [x] Automated tests pass: `pnpm test` in `apps/web`
- [ ] Upload background + 3 overlays; define slot by placing an overlay node on the template; click "Generate preview" → composite appears (first overlay image fills the slot, cropped to cover) _(deferred → final manual pass)_
- [ ] Slot covers (no letterbox) with center crop on a non-square overlay image _(deferred → final manual pass)_
- [x] No TypeScript errors (tsc clean: @maga/web + @maga/projects)

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked _(browser-manual verification deferred to final pass)_
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn _(n/a — subagent-driven flow)_
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt _(n/a)_
- [x] Code-reviewer agent verified
- [x] Reviewer changes reflected back _(red fixed: schema.test.ts + JSDoc; removed stray duplicate test)_
- [x] Tests written and passing
- [ ] Documentation updated _(batched to final docs pass)_
- [ ] Orchestrator approved _(pending final manual pass)_
- [x] Changes committed: `feat: template editor with single composite generation`
- [ ] Phase marked complete _(pending final manual pass)_

> **Phase 4 carry-over (from review):** the hidden composite canvas is hardcoded 800×600 while the slot's width/height are px from the editor canvas (possibly a different size) → preview slot size can drift from placement. Phase 4 batch render must capture at the true template dimensions.

---

### Phase 4: Batch render — N outputs into a results gallery

**Risk:** medium
**Mode:** afk
**Type:** mixed
**Success criteria:** User clicks "Generate all," and the app renders one composited image per overlay image sequentially, displaying each result in a gallery as it completes, with a progress indicator (e.g., "3 / 7"). Batch is cancellable mid-run.
**Commit message:** `feat: batch render with results gallery and progress`

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/hooks/use-batch-render.ts` | Hook: iterates overlay assets, calls `coverCropDataUrl` + `exportCanvasElement` per item sequentially (not concurrent — DOM dependency), appends each result to `outputs` array in state, tracks `progress: { current, total }`, supports `cancel()` via AbortController-style ref flag |
| create | `apps/web/src/components/batch/BatchResultsGallery.tsx` | Renders output grid; each card shows output image, source overlay filename, download button (reuses `downloadDataUrl` from `image-helpers.ts`); shows progress bar during render |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add "Generate all" + "Cancel" buttons; render `BatchResultsGallery` below template editor |
| modify | `apps/web/src/hooks/use-batch-project.ts` | Add `addOutput(output: GeneratedOutput)` to accumulate results; `clearOutputs()` for re-run |

**Steps:**

- [ ] Build `use-batch-render`: sequential loop over `project.overlays`; per iteration: await `coverCropDataUrl`, clone EditorState swapping slot src, await `exportCanvasElement`, call `addOutput`; update `progress`; check cancel flag between iterations
- [ ] Build `BatchResultsGallery`: grid of output cards with image preview, filename label, and per-item download via `downloadDataUrl`; progress bar via shadcn/ui `Progress` component; renders in-progress (partial results) as they arrive
- [ ] Add "Generate all" + "Cancel" controls in `BatchWorkspace`; disable "Generate all" while running
- [ ] Write unit tests for `use-batch-render` loop logic (mock compositing helpers)
- [ ] Handle zero overlays: if `project.overlays` is empty, show an inline warning "No overlay images uploaded" and disable "Generate all" button; do not enter the render loop
- [ ] Handle UI freeze: each iteration yields to the event loop via `await new Promise(r => setTimeout(r, 0))` between renders to keep the progress bar responsive
- [ ] Large batches (20+ overlays): output data URLs are held in React state in memory. Add a comment in `use-batch-render.ts` noting that if memory becomes a constraint, outputs should be written to IDB immediately per-item and references stored instead of data URLs; this is a known trade-off deferred to a future phase.

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/use-batch-render.test.ts` | N overlays → N outputs appended in order; `progress.current` increments each step; cancel flag stops loop after current item; no concurrent calls to `exportCanvasElement` (called serially) |
| create | `apps/web/src/__tests__/use-batch-render.test.ts` | zero overlays → no outputs appended, no call to `exportCanvasElement`; event-loop yield called once per iteration |

**Verification:**

- [ ] Automated tests pass: `pnpm test` in `apps/web`
- [ ] Upload background + 5 overlays; click "Generate all" → progress shows "1 / 5" … "5 / 5"; gallery populates as renders complete
- [ ] Cancel mid-run → loop stops; partial results remain in gallery
- [ ] Each gallery card "Download" saves the correct composited image
- [ ] No TypeScript errors
- [ ] Upload 0 overlays → "Generate all" is disabled and warning is shown (not a silent no-op)

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted
- [ ] Orchestrator cleared context
- [ ] Code-reviewer verified
- [ ] Reviewer changes reflected back
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `feat: batch render with results gallery and progress`
- [ ] Phase marked complete

---

### Phase 5: Portable project ZIP — export all outputs + project state

**Risk:** low
**Mode:** afk
**Type:** typescript
**Success criteria:** User clicks "Export ZIP," and the browser downloads a ZIP file containing: `project.json` (versioned project state with asset refs), `background.<ext>`, all overlay images (`overlays/`), and all generated outputs (`outputs/`). The ZIP is self-contained and human-readable.
**Commit message:** `feat: portable project ZIP export`

**ZIP justification (per CLAUDE.md "build our own before installing"):**
Building a ZIP encoder from scratch requires implementing the ZIP binary format spec (local file headers, central directory, end-of-central-directory record), DEFLATE compression (LZ77 + Huffman coding), and CRC-32 checksumming. This is squarely in the "deep protocol/spec implementation" category — impractical to build ourselves. JSZip (already added in Phase 1) is the right call.

**ZIP layout:**
```
project.json          ← BatchProject JSON (asset refs as relative paths matching ZIP layout)
background.<ext>      ← background image
overlays/
  0-<filename>        ← overlay images, index-prefixed for stable ordering
  1-<filename>
  ...
outputs/
  0-<overlay-filename>.<ext>   ← generated composites, aligned to overlay order
  1-<overlay-filename>.<ext>
  ...
```

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `packages/projects/src/zip-export.ts` | `exportProjectZip(project: BatchProject, backgroundDataUrl: string, overlayDataUrls: string[], outputDataUrls: string[]): Promise<Blob>` — builds ZIP via JSZip; serializes `project.json` with relative path refs; returns Blob |
| modify | `packages/projects/src/index.ts` | Export `exportProjectZip` |
| create | `apps/web/src/hooks/use-zip-export.ts` | Hook: gathers data URLs from project state, calls `exportProjectZip`, triggers download via a temporary `<a>` element; holds `isExporting` state |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Add "Export ZIP" button in results section; wired to `use-zip-export`; disabled until at least one output exists |

**Steps:**

- [ ] Install `jszip` and `@types/jszip` in `packages/projects` via `pnpm add jszip` / `pnpm add -D @types/jszip`
- [ ] Implement `exportProjectZip` in `packages/projects/src/zip-export.ts`: create `JSZip`, add `project.json` (stringify with relative path refs), add background file (data URL → blob via `dataUrlToBlob` helper), add overlay files under `overlays/`, add output files under `outputs/`, return `zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })`
- [ ] Add `dataUrlToBlob` private helper in the same file (converts `data:<mime>;base64,<data>` to `Blob`) — no external dependency, straightforward atob + Uint8Array
- [ ] Build `use-zip-export` hook in `apps/web`; download via `URL.createObjectURL` + click + `URL.revokeObjectURL`
- [ ] Wire "Export ZIP" button into `BatchWorkspace`
- [ ] Write unit tests for `exportProjectZip`
- [ ] Handle duplicate output filenames: if two overlays share the same filename, prefix with index (`0-filename.png`, `1-filename.png`) — the ZIP layout already index-prefixes overlays, apply the same pattern to outputs explicitly
- [ ] Output format: use PNG for transparent outputs, JPEG (quality 0.92) for opaque outputs — detect by checking whether the overlay's source image has an alpha channel; document this decision in a comment in `zip-export.ts`

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `packages/projects/__tests__/zip-export.test.ts` | ZIP blob is non-empty; `project.json` entry exists and parses to valid `BatchProject`; `schemaVersion` is `1`; overlay count in ZIP equals input overlay count; output count equals input output count |
| create | `packages/projects/__tests__/data-url-to-blob.test.ts` | `dataUrlToBlob` round-trips a known PNG data URL to correct MIME type and byte length |

**Verification:**

- [ ] Automated tests pass: `pnpm test` in `packages/projects`
- [ ] Generate a batch with 3 overlays → click "Export ZIP" → ZIP downloads
- [ ] Unzip manually: `project.json` is valid JSON with `schemaVersion: 1`; background file present; 3 overlay files under `overlays/`; 3 output files under `outputs/`
- [ ] No TypeScript errors
- [ ] Two overlays with identical filenames → ZIP contains two distinct output files without collision

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted
- [ ] Orchestrator cleared context
- [ ] Code-reviewer verified
- [ ] Reviewer changes reflected back
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `feat: portable project ZIP export`
- [ ] Phase marked complete

---

### Phase 6: IndexedDB autosave/restore + ZIP re-import

**Risk:** medium
**Mode:** hil
**Type:** mixed
**Success criteria:** (a) On page reload, the in-progress batch project is automatically restored from IndexedDB — assets, template, and outputs all present. (b) User can upload a previously exported ZIP and have the project fully restored, ready to re-run or extend.
**Commit message:** `feat: IndexedDB autosave and ZIP re-import for project resume`

**IndexedDB design:**
Single database `maga-batch`, version 1. Two object stores:
- `projects` — keyed by project `id`; stores the `BatchProject` JSON (no blobs, only blob keys)
- `blobs` — keyed by blob key (uuid); stores raw `Blob` objects

This keeps project JSON small and queryable while delegating binary storage to the blob store. `downscaleIfNeeded(2048)` from existing `image-helpers.ts` is called before storing overlay/background blobs to guard against quota exhaustion.

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `packages/projects/src/idb-adapter.ts` | `openDb(): Promise<IDBDatabase>`; `saveProject(db, project)`: upserts project JSON; `loadProject(db, id)`: returns `BatchProject \| null`; `saveBlob(db, key, blob)`: stores blob; `loadBlob(db, key)`: returns `Blob \| null`; `deleteProject(db, id)` |
| create | `packages/projects/src/zip-import.ts` | `importProjectZip(zipBlob: Blob): Promise<{ project: BatchProject; blobs: Map<string, Blob> }>` — reads ZIP entries, parses `project.json`, returns structured result |
| modify | `packages/projects/src/index.ts` | Export `openDb`, `saveProject`, `loadProject`, `saveBlob`, `loadBlob`, `importProjectZip` |
| create | `apps/web/src/hooks/use-project-persistence.ts` | Hook: on mount opens IDB, loads last project if present, calls `setBatchProject`; on project state change (debounced 500 ms) saves to IDB; exposes `importZip(file: File)` which calls `importProjectZip` then hydrates project state and stores blobs |
| modify | `apps/web/src/components/batch/BatchWorkspace.tsx` | Mount `use-project-persistence`; add "Import ZIP" upload button in empty-state; show restore banner ("Project restored") on load |
| modify | `apps/web/src/components/batch/AssetUploadZone.tsx` | No change to component itself; `BatchWorkspace` adds a separate "Import ZIP" zone distinct from asset upload |

**Steps:**

- [ ] Implement `openDb` with `indexedDB.open('maga-batch', 1)` + `onupgradeneeded` creating both object stores
- [ ] Implement `saveBlob` / `loadBlob` / `saveProject` / `loadProject` / `deleteProject` in `idb-adapter.ts` — each is a small focused function under 30 lines
- [ ] Implement `importProjectZip`: open ZIP with JSZip, extract `project.json`, extract each blob file by relative path, return `{ project, blobs }` map
- [ ] Build `use-project-persistence`: on mount → `openDb` → `loadProject(db, ACTIVE_PROJECT_KEY)` → if found restore state + load blobs; subscribe to project state changes → debounced `saveProject` + `saveBlob` per new/changed blob; expose `importZip`
- [ ] Call `downscaleIfNeeded(2048)` on background and each overlay blob before `saveBlob`
- [ ] Add ZIP import button + restore banner in `BatchWorkspace`
- [ ] Write IDB adapter unit tests (use fake-indexeddb); write ZIP import unit tests
- [ ] Handle `QuotaExceededError` from IndexedDB: wrap all `saveBlob` calls in try/catch; on quota error show a toast notification "Storage quota exceeded — images will not be saved between sessions. Consider using smaller images." and continue without crashing
- [ ] Handle corrupt or wrong-version ZIP on re-import: in `importProjectZip`, validate `schemaVersion === 1` immediately after parsing `project.json`; if missing or mismatched, throw a typed error `ZipImportError` with message "Incompatible project version"; catch in `use-project-persistence` and display an inline error banner
- [ ] Handle `schemaVersion` mismatch on IDB restore: in `loadProject`, check `schemaVersion`; if not `1`, discard stored project and return `null` (log a console warning)

**Tests:**

| Action | File | What it covers |
|---|---|---|
| create | `packages/projects/__tests__/idb-adapter.test.ts` | `saveProject` + `loadProject` round-trips project JSON; `saveBlob` + `loadBlob` round-trips a Blob; `loadProject` returns `null` for unknown id; `deleteProject` removes the entry (uses `fake-indexeddb`) |
| create | `packages/projects/__tests__/zip-import.test.ts` | `importProjectZip` on a known ZIP blob returns correct `project` with `schemaVersion: 1` and `blobs` map with entries matching overlay + background filenames |
| create | `apps/web/src/__tests__/use-project-persistence.test.ts` | On mount with existing IDB project, `setBatchProject` is called with restored state; state changes trigger debounced `saveProject`; `importZip` hydrates state from ZIP |
| create | `packages/projects/__tests__/zip-import.test.ts` | corrupt JSON in project.json → throws; schemaVersion !== 1 → throws ZipImportError; missing project.json entry → throws |
| create | `packages/projects/__tests__/idb-adapter.test.ts` | loadProject with schemaVersion 2 record returns null |

**Verification:**

- [ ] Automated tests pass: `pnpm test` in `packages/projects` and `apps/web`
- [ ] Upload assets, define template, generate batch → reload page → project fully restored (assets thumbnails visible, outputs visible in gallery)
- [ ] Export ZIP → reload → import that ZIP → project restored; "Generate all" re-runs successfully
- [ ] Large images (>2048px) stored downscaled; no QuotaExceededError in browser console
- [ ] No TypeScript errors
- [ ] Import a ZIP with `schemaVersion: 2` → inline error banner shown, no crash
- [ ] Import a ZIP with malformed `project.json` → inline error banner shown, no crash

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked
- [ ] Reviewer handoff prompt emitted
- [ ] Orchestrator cleared context
- [ ] Code-reviewer verified
- [ ] Reviewer changes reflected back
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Orchestrator approved
- [ ] Changes committed: `feat: IndexedDB autosave and ZIP re-import for project resume`
- [ ] Phase marked complete

---

### Phase 7: Final Verification

**Mode:** hil

**Overall success criteria:**

- User can complete the full golden path end-to-end: upload background + overlays → define template → batch render all → export ZIP → reload → restore from IDB → re-export ZIP → import ZIP → same results
- All N overlay images produce pixel-correct cover-fit composites matching what the single-image editor would produce for the same slot configuration
- Project JSON `schemaVersion: 1` is present in all exported ZIPs
- No console errors, no TypeScript errors, no test failures
- Feature is accessible: all interactive controls are keyboard-navigable; file upload zones have correct ARIA labels; progress indicator has live-region announcement
- Mobile-responsive: upload zones and gallery grid reflow correctly at 375px viewport width
- IndexedDB restoration works across Chrome, Firefox, and Safari (where available)
- No CLAUDE.md invariants violated: no circular deps, no business logic in page components, no unused imports or dead code

**Steps:**

- [ ] Every preceding phase's Steps/Verification/Phase review checkboxes are ticked in this plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent reviews the entire change end-to-end
- [ ] Any changes from the final code-reviewer review reflected back into this plan file
- [ ] All tests pass: `pnpm test` run from repo root
- [ ] No CLAUDE.md invariants violated
- [ ] Golden path tested manually (upload → template → batch → export ZIP → reload → restore → re-run)
- [ ] Edge cases tested: 0 overlays → "Generate all" disabled + warning; 1 overlay; 20+ overlays (check memory, no UI freeze, progress bar stays responsive); cancel mid-batch → partial results retained; corrupt ZIP re-import → error banner, no crash; schemaVersion mismatch on IDB restore → silent discard + clean empty state; QuotaExceededError → toast warning, session continues; duplicate overlay filenames in ZIP → no filename collision in outputs
- [ ] Overall success criteria met
- [ ] All phase checkboxes above are ticked

---

## Documentation

| Change | Documentation location |
|---|---|
| `packages/projects` public API (schema, IDB adapter, ZIP export/import) | `packages/projects/README.md` |
| New `/batch` route and feature overview | `apps/web/README.md` (or root `README.md` if that's the convention) |
| Cover-fit math and compositing loop pattern | `apps/web/src/lib/cover-crop.ts` inline comment (non-obvious why pre-crop before post-pass) |
| JSZip dependency justification | `packages/projects/README.md` (dependency rationale section) |

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| Phase 1 | `BatchProject` schema shape and `schemaVersion` constant | `packages/projects/__tests__/schema.test.ts` |
| Phase 2 | `useBatchProject` asset management (setBackground, addOverlays) | `apps/web/src/__tests__/use-batch-project.test.ts` |
| Phase 3 | `coverCropDataUrl` output dimensions and cover fill | `apps/web/src/__tests__/cover-crop.test.ts` |
| Phase 3 | `use-single-composite` slot-swap and render lifecycle | `apps/web/src/__tests__/use-single-composite.test.ts` |
| Phase 4 | `use-batch-render` sequential loop, progress, cancel, zero overlays | `apps/web/src/__tests__/use-batch-render.test.ts` |
| Phase 5 | `exportProjectZip` ZIP structure and entry count | `packages/projects/__tests__/zip-export.test.ts` |
| Phase 5 | `dataUrlToBlob` round-trip | `packages/projects/__tests__/data-url-to-blob.test.ts` |
| Phase 6 | IDB adapter round-trips (project + blob); schemaVersion mismatch → null | `packages/projects/__tests__/idb-adapter.test.ts` |
| Phase 6 | `importProjectZip` parse and blob extraction; corrupt/mismatched schemaVersion → ZipImportError | `packages/projects/__tests__/zip-import.test.ts` |
| Phase 6 | `use-project-persistence` mount restore + debounced save + importZip | `apps/web/src/__tests__/use-project-persistence.test.ts` |

## Human Summary

**What we're building:** A pure-browser batch compositing workflow added to the existing image editor. No backend, no cost — everything runs client-side and persists locally.

**How the phases connect:**
- Phase 1 scaffolds the `packages/projects` package with the versioned `BatchProject` schema — infrastructure only, no UI.
- Phase 2 gets assets into the browser and visible in a new `/batch` page. Nothing is composited yet, but the project structure is established.
- Phase 3 connects the existing compositing pipeline to a single overlay image, proving the cover-fit math and slot-swap pattern work end-to-end before scaling up.
- Phase 4 loops Phase 3 over all overlay images with progress feedback, giving users the core batch value.
- Phase 5 packages everything into a portable ZIP — the project becomes shareable and archivable.
- Phase 6 closes the durability loop: IndexedDB keeps work alive across reloads, and ZIP re-import lets users resume on any device.
- Phase 7 is the final human-in-the-loop end-to-end verification pass.

**End result:** User uploads one background + N overlay images, positions a variable slot on the background, hits "Generate all," watches N composites appear in a gallery, downloads a ZIP of all outputs plus the project, and can reload the page or re-upload the ZIP to continue exactly where they left off.

**Key trade-offs:**
- JSZip added as an external dependency — justified because implementing DEFLATE + ZIP binary format spec ourselves is impractical (same rationale as cryptography per CLAUDE.md).
- `packages/projects` is a new package rather than lib code in `apps/web` — worth the extra setup because the project model, IDB adapter, and ZIP logic are reusable and have zero dependency on the web app internals. Stage 5 cloud sync can depend on this package directly.
- Batch render is sequential (not parallel) — required because the two-pass compositing pipeline is DOM-dependent; concurrent renders would cause race conditions.
- Images downscaled to 2048px before IDB storage — trades output fidelity slightly for quota safety; the existing `downscaleIfNeeded` helper already makes this the convention.
