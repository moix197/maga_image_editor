# @maga/projects

Framework-light TypeScript package. Owns the versioned batch-compositing project model and ZIP serialization. No React, no imports from `apps/web`. Depends on `@maga/editor` for the `EditorState` template type and `jszip` for ZIP packaging.

The package also owns the IndexedDB read/write adapter and ZIP deserialize (re-import) logic; the schema defined here is the durable contract those layers read and write.

## Public API

Import only from `@maga/projects` — internal files are not part of the public surface.

| Export | Kind | Description |
|--------|------|-------------|
| `BatchProject` | type | Versioned project: background, overlays, template, variable slot, outputs |
| `ProjectAsset` | type | Binary asset ref (`id`, `filename`, `blobKey`) — bytes live out-of-band |
| `VariableSlot` | type | The variable image slot (`overlayNodeId` + cover-fit `width`/`height`) |
| `GeneratedOutput` | type | One rendered composite (`overlayAssetId`, `outputBlobKey`, `timestamp`) |
| `TextStyle` | type | Styleable subset of a `TextNode` (font, size, color, weight, style, opacity, rotation, shadow, text background); reexported so callers don't reach into `@maga/editor` |
| `NodeOverride` | type | A per-`(overlay, node)` override value: `Partial<Omit<TextNode & OverlayNode, "id">> & { hidden?: boolean }` — content/style/geometry fields flat, plus the non-Node `hidden` flag. See Schema v5 |
| `ItemNodeOverrides` | type | The unified store type (`Record<overlayId, Record<nodeId, NodeOverride>>`), value of `BatchProject.itemNodeOverrides` |
| `SchemaVersion` | type | Numeric literal type of the current schema version (`5`) |
| `SCHEMA_VERSION` | const | The current schema version literal (`5`) |
| `getNodeOverride` / `setNodeOverride` / `setNodeHidden` | fn | Unified store accessors: read an override, merge a `NodeOverride` patch (immutable nested-map write), toggle the `hidden` flag (immutable + idempotent — no-op returns the same store ref) |
| `getTextValue` / `getTextStyle` / `isNodeHidden` | fn | Thin reads over the unified store: content (`""` default), style partial (content/hidden stripped), and visibility |
| `migrateToV2` | fn | First link in the chain: upgrades a `< 2` record to v2 (empty `itemTextValues` + a transient all-locked `textLayerLocks`). Gates on the v2 literal, not `SCHEMA_VERSION` |
| `migrateToV3` | fn | Second link: adds empty `itemTextStyles` to a v2 record, stamping the literal `3`; idempotent (never resets an existing map) |
| `migrateToV4` | fn | Third link: retires the lock model — fans each locked layer's template value/style into every overlay's per-item text maps, then drops `textLayerLocks`. Idempotent |
| `migrateToV5` | fn | Fourth link: collapses the three v4 text maps (`itemTextValues`, `itemTextStyles`, `itemHiddenNodeIds`) into the unified `itemNodeOverrides` store, then drops them. No-clobber + idempotent (gates on `>= 5`) |
| `migrateProject` | fn | Single forward-migration entry point — chains v1→v2→v3→v4→v5. Idempotent on a current record. Used by both ZIP import and IDB load |
| `exportProjectZip` | fn | Builds a portable project ZIP (`Promise<Blob>`) — see below |
| `dataUrlToBlob` | fn | `data:<mime>;base64,...` → `Blob` (pure `atob` + `Uint8Array`) |
| `openDb` | fn | Opens/creates the `maga-batch` IndexedDB (`projects` + `blobs` stores) |
| `saveProject` / `loadProject` | fn | Upsert / read a `BatchProject` JSON by id (`loadProject` returns `null` on missing or `schemaVersion` mismatch) |
| `saveBlob` / `loadBlob` | fn | Store / read a raw `Blob` by uuid key |
| `deleteProject` | fn | Remove a project JSON record by id |
| `importProjectZip` | fn | ZIP `Blob` → `{ project, blobs: Map<path, Blob> }`; throws `ZipImportError` |
| `ZipImportError` | class | Typed error for missing/corrupt `project.json` or incompatible version |

## IndexedDB adapter

Single database `maga-batch` (v1), two object stores: `projects` (keyed by project `id`, holds `BatchProject` JSON with blob-key refs only) and `blobs` (keyed by uuid, holds raw `Blob`s). Keeping the project JSON blob-free leaves it small and queryable; binary is delegated to the blob store. `loadProject` discards (and `console.warn`s) any record whose `schemaVersion` is not current, returning `null`. The adapter is framework-agnostic; callers (e.g. `apps/web`'s `use-project-persistence`) own the data-URL ⇄ blob-key reconciliation and quota handling.

## ZIP import

`importProjectZip(zipBlob)` reverses `exportProjectZip`: it parses `project.json`, validates `schemaVersion <= SCHEMA_VERSION` immediately (throwing `ZipImportError("Incompatible project version")` only for a version **newer** than this build, or a corruption message on missing/invalid JSON). Any older project (v1–v4, or version-less) is **migrated forward to v5 on load** via the shared `migrateProject` chain rather than rejected (see Schema versioning). It returns the project plus a `Map` of blobs **keyed by the same ZIP-relative paths the project refs use** (`background.<ext>`, `overlays/<i>-...`, `outputs/<i>-...`) so callers can reconcile bytes to refs directly.

Nullable-field handling: `template` and `variableSlot` are optional in the JSON. Import never hard-throws on a missing field — an absent `template`/`variableSlot` is normalized to `null` (background-only drafts), while a legacy project that carries a non-null value keeps it as-is. Only `schemaVersion` mismatch and missing/corrupt JSON reject.

## ZIP export

`exportProjectZip(project, backgroundDataUrl, overlayDataUrls, outputDataUrls): Promise<Blob>` packages a project into a self-contained, human-readable ZIP:

```
project.json                    BatchProject JSON with relative-path asset refs
background.<ext>                background image (ext from its data URL MIME)
overlays/0-<filename>, 1-...    overlay images, index-prefixed for stable order
outputs/0-<filename>.<ext>, ... generated composites, aligned to overlay order
```

The in-memory `project` holds raw data URLs in `background.blobKey`, each `overlays[i].blobKey`, and each `outputs[i].outputBlobKey`. The actual bytes are passed separately via the data URL arrays (same order as `project.overlays` / `project.outputs`). During serialization those ref fields are **rewritten to the ZIP-relative paths** so `project.json` matches the ZIP layout, stays human-readable, and never embeds data URLs — keeping it clean for the future cloud mapping.

Both overlays and outputs are index-prefixed, so two overlays sharing a filename never collide. Output extensions are derived from each output data URL's own MIME (`image/png` → `.png`, `image/jpeg` → `.jpg`): outputs arrive already-encoded from the render pipeline, and this package has no DOM/canvas, so we preserve the upstream encoding rather than decoding + re-encoding. Alpha-based format selection (PNG for transparent, JPEG for opaque) belongs upstream at render time if ever needed.

Nullable-field handling: a background-only draft carries `template: null` and `variableSlot: null`. Both pass through unchanged and serialize as JSON `null` — no crash. With no outputs, no `outputs/` entries are written.

## Schema versioning

`BatchProject.schemaVersion` is the `5` literal. ZIP import and IDB restore gate on it: a record **newer** than the current version is rejected as incompatible, while an **older** record is migrated forward on load. Bump `SCHEMA_VERSION` only on a breaking change to the project JSON shape.

`template` (`EditorState | null`) and `variableSlot` (`VariableSlot | null`) are nullable: a background-only draft is a valid project with both `null`. The IDB adapter and ZIP serialize/deserialize all tolerate `null` natively.

### The unified per-item override model (current, schema v5)

As of v4 **every node is per-item** — there is no shared/locked concept. As of v5 the three former parallel text maps are **collapsed into one unified store**:

- `itemNodeOverrides: Record<overlayAssetId, Record<nodeId, NodeOverride>>` — one `NodeOverride` per `(overlay, node)`. `NodeOverride` is `Partial<Omit<TextNode & OverlayNode, "id">> & { hidden?: boolean }`: content under `content`, style/geometry fields spread flat, and visibility on the `hidden` flag. A missing entry/field falls back to the template node's own value. Empty `{}` means no overrides.

**Helpers.** Read/write the store via the exported `getNodeOverride` / `setNodeOverride` (immutable nested-map merge) / `setNodeHidden` (immutable + idempotent toggle), plus the thin reads `getTextValue` / `getTextStyle` / `isNodeHidden`. `getTextStyle` returns the override with `content` and `hidden` stripped.

**Render application.** The render loop applies content and style in a **single merged `updateTextNode` call** per text layer; a layer whose override carries `hidden: true` is rendered with `opacity: 0` instead. Both the merged patch and the visibility change are restored from the full template snapshot in an exception-safe `finally` — a partial restore would leak a per-item value into the shared template, so the entire snapshot is rewritten.

**Orphaned keys.** When a node is deleted from the template or an overlay is removed, its key in the store may go stale. Stale keys are **silently ignored** by the render loop — there is no matching live node, so no mutation happens. No cleanup runs on load or save (cheap to leak, expensive to coordinate); revisit only if ZIP size becomes a concern.

### Migration chain (v1 → v2 → v3 → v4 → v5)

`migrateProject(project)` is the single forward-migration entry point. It chains `migrateToV2`, `migrateToV3`, `migrateToV4`, then `migrateToV5`. **Each step stamps the literal version it produces** (2, 3, 4, 5), never `SCHEMA_VERSION`, so the chain steps monotonically and a current-version bump never lets an early step skip a later one's transform:

- `migrateToV2` upgrades a `< 2` record: empty `itemTextValues` plus a **transient** all-locked `textLayerLocks` derived from the template (preserving v1's shared-text behavior). Gates on the **v2 literal (`2`)**.
- `migrateToV3` adds `itemTextStyles: {}` to a v2 record, stamping the literal `3`. Idempotent — an existing map is preserved, never reset.
- `migrateToV4` **retires the lock model**: each layer whose `textLayerLocks` entry is `true` has its template content/style fanned out into every overlay's `itemTextValues` / `itemTextStyles`, then `textLayerLocks` is dropped. Non-destructive edge cases: zero overlays → locks dropped; stale lock key → skipped; an existing per-item override → preserved, never overwritten.
- `migrateToV5` **collapses the three text maps** (`itemTextValues`, `itemTextStyles`, `itemHiddenNodeIds`) into the unified `itemNodeOverrides` store, then drops them. For each overlay key: content → `NodeOverride.content`, the style partial spreads in, each hidden nodeId → `hidden: true`. **No-clobber** (an existing `itemNodeOverrides` field is never overwritten), **idempotent** (gates on `>= 5`; re-run is a no-op), stale keys skipped, zero-overlay safe.

`migrateProject` is idempotent on an already-current (v5) record: existing `itemNodeOverrides` passes through unchanged and there is no `textLayerLocks` to drop. The **same** helper runs at both ingress points — `zip-import.ts` (via `normalizeNullableFields`) and `idb-adapter.ts` (`loadProject`) — with no forked copies, so legacy v1–v4 records and current v5 ones all load identically. `exportProjectZip` always writes `schemaVersion: 5` and serializes `itemNodeOverrides`.

## Asset refs are out-of-band

The project JSON holds only `blobKey` refs, never absolute URLs or embedded bytes. This keeps the JSON small and queryable and keeps refs portable across the IndexedDB blob store and ZIP layout (relative paths). It also leaves the schema clean to map onto the future Supabase layer (`plans/stage-5-cloud-persistence.md`).

## EditorState reuse

The `template` field is `EditorState` from `@maga/editor`, reused via a type-only import. `EditorState` is owned by the shared `@maga/editor` package (not `apps/web`), so reusing it introduces no circular dependency and avoids redefining the model.

## BatchWorkspace editor surface

`TemplateEditor.tsx` was removed in the batch-editor-parity refactor. `BatchWorkspace` now embeds the real editor surface directly: `useEditorState` owns the template state, `TextOverlayCanvas` renders the live canvas, and `TextStylePanel` / `OverlayControlsPanel` handle per-node controls. Editor state is synced to `project.template` via `setEditorTemplate` in `use-batch-project`.

### Phase 3: live-canvas capture

Preview capture (both single preview and batch render) now targets the live `TextOverlayCanvas` div via `liveCanvasRef` instead of the former `HiddenCompositeCanvas` off-screen element. `HiddenCompositeCanvas` and its associated `bgDimensions` state and `canvasElRef`/`canvasCallbackRef` refs have been removed. Before capture, `useSingleComposite` calls `onDeselectForCapture` to clear the selection ring from the DOM, waits two animation frames (via `waitTwoFrames` in `apps/web/src/lib/capture-helpers.ts`) for React to flush, then restores selection in the `finally` block — matching the `/editor` `handleExport` pattern exactly.

## Dependency rationale: JSZip

`jszip` is the package's one runtime third-party dependency, used by `exportProjectZip`. Per CLAUDE.md's "build our own before installing" rule, building a ZIP encoder ourselves is impractical: it requires implementing the ZIP binary format spec (local file headers, central directory, end-of-central-directory record), DEFLATE compression (LZ77 + Huffman coding), and CRC-32 checksumming. That is squarely a "deep protocol/spec implementation" — the same category as cryptography — so a battle-tested library is the right call. `dataUrl → bytes` conversion is done in-package (`atob` + `Uint8Array`); only the ZIP container itself is delegated to JSZip.

## Architecture

Consumed via the workspace protocol (`@maga/projects: workspace:*`). The `exports` map in `package.json` restricts the public surface to `./src/index.ts`. `dataUrlToBlob` lives in `zip-export.ts` and is re-exported from `index.ts` so consumers reuse the one in-package data-URL → blob conversion rather than reinventing it.
