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
| `SchemaVersion` | type | Numeric literal type of the current schema version (`2`) |
| `SCHEMA_VERSION` | const | The current schema version literal (`2`) |
| `newTextLayerLockDefault` | const | Lock default for a text layer added in a v2 project (`false`, per-image) |
| `migratedTextLayerLockDefault` | const | Lock default applied to every layer during v1→v2 migration (`true`, shared) |
| `migratedTextLayerLocks` | fn | Builds the all-locked `textLayerLocks` map from a template (v1→v2 default) |
| `migrateToV2` | fn | Upgrades a record missing the v2 fields: empty `itemTextValues` + all-locked `textLayerLocks` |
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

`importProjectZip(zipBlob)` reverses `exportProjectZip`: it parses `project.json`, validates `schemaVersion <= SCHEMA_VERSION` immediately (throwing `ZipImportError("Incompatible project version")` only for a version **newer** than this build, or a corruption message on missing/invalid JSON). A v1 (or version-less) project is **migrated to v2 on load** rather than rejected (see Schema versioning). It returns the project plus a `Map` of blobs **keyed by the same ZIP-relative paths the project refs use** (`background.<ext>`, `overlays/<i>-...`, `outputs/<i>-...`) so callers can reconcile bytes to refs directly.

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

`BatchProject.schemaVersion` is the `2` literal. ZIP import and IDB restore gate on it: a record **newer** than the current version is rejected as incompatible, while an **older** record is migrated forward on load. Bump `SCHEMA_VERSION` only on a breaking change to the project JSON shape.

`template` (`EditorState | null`) and `variableSlot` (`VariableSlot | null`) are nullable: a background-only draft is a valid project with both `null`. The IDB adapter and ZIP serialize/deserialize all tolerate `null` natively.

### Schema v2: per-item text + layer locks

v2 adds two fields to `BatchProject`:

- `itemTextValues: Record<string, Record<string, string>>` — per-item text overrides keyed `overlayAssetId → textNodeId → value`. A missing entry falls back to the template's own text value. Empty `{}` means no overrides.
- `textLayerLocks: Record<string, boolean>` — per-layer lock state keyed `textNodeId → locked`. `true` = the layer shares the template value across all items; `false` = per-item value from `itemTextValues`.

**Dual defaults (intentionally opposite):**

- A text layer **added in a v2 project** defaults to `locked = false` (`newTextLayerLockDefault`) — per-image divergence is the new norm.
- A text layer **migrated from v1** defaults to `locked = true` (`migratedTextLayerLockDefault`) — v1 had no per-item text, so locking all existing layers preserves the prior shared-text behavior.

### Migration path (v1 → v2)

`migrateToV2(project)` upgrades any record with `schemaVersion < 2` (or a missing version): it sets `itemTextValues: {}` and an all-locked `textLayerLocks` derived from the template (`migratedTextLayerLocks`). A record already at v2 passes through unchanged. The **same** helper runs in both `zip-import.ts` (`normalizeNullableFields`) and `idb-adapter.ts` (`loadProject`), so legacy ZIPs and legacy IDB records load identically — without error, all layers locked, no overrides. `exportProjectZip` always writes `schemaVersion: 2` plus both new fields.

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
