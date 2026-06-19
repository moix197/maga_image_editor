# @maga/projects

Framework-light TypeScript package. Owns the versioned batch-compositing project model and ZIP serialization. No React, no imports from `apps/web`. Depends on `@maga/editor` for the `EditorState` template type and `jszip` for ZIP packaging.

Future phases add the IndexedDB read/write adapter and ZIP deserialize (re-import) logic to this package; the schema defined here is the durable contract those layers read and write.

## Public API

Import only from `@maga/projects` — internal files are not part of the public surface.

| Export | Kind | Description |
|--------|------|-------------|
| `BatchProject` | type | Versioned project: background, overlays, template, variable slot, outputs |
| `ProjectAsset` | type | Binary asset ref (`id`, `filename`, `blobKey`) — bytes live out-of-band |
| `VariableSlot` | type | The variable image slot (`overlayNodeId` + cover-fit `width`/`height`) |
| `GeneratedOutput` | type | One rendered composite (`overlayAssetId`, `outputBlobKey`, `timestamp`) |
| `SchemaVersion` | type | Numeric literal type of the current schema version (`1`) |
| `SCHEMA_VERSION` | const | The current schema version literal (`1`) |
| `exportProjectZip` | fn | Builds a portable project ZIP (`Promise<Blob>`) — see below |

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

## Schema versioning

`BatchProject.schemaVersion` is the `1` literal. It is the single discriminant that ZIP import and IDB restore gate on: a project whose `schemaVersion` is not `1` is rejected as incompatible. Bump `SCHEMA_VERSION` only on a breaking change to the project JSON shape.

## Asset refs are out-of-band

The project JSON holds only `blobKey` refs, never absolute URLs or embedded bytes. This keeps the JSON small and queryable and keeps refs portable across the IndexedDB blob store and ZIP layout (relative paths). It also leaves the schema clean to map onto the future Supabase layer (`plans/stage-5-cloud-persistence.md`).

## EditorState reuse

The `template` field is `EditorState` from `@maga/editor`, reused via a type-only import. `EditorState` is owned by the shared `@maga/editor` package (not `apps/web`), so reusing it introduces no circular dependency and avoids redefining the model.

## Dependency rationale: JSZip

`jszip` is the package's one runtime third-party dependency, used by `exportProjectZip`. Per CLAUDE.md's "build our own before installing" rule, building a ZIP encoder ourselves is impractical: it requires implementing the ZIP binary format spec (local file headers, central directory, end-of-central-directory record), DEFLATE compression (LZ77 + Huffman coding), and CRC-32 checksumming. That is squarely a "deep protocol/spec implementation" — the same category as cryptography — so a battle-tested library is the right call. `dataUrl → bytes` conversion is done in-package (`atob` + `Uint8Array`); only the ZIP container itself is delegated to JSZip.

## Architecture

Consumed via the workspace protocol (`@maga/projects: workspace:*`). The `exports` map in `package.json` restricts the public surface to `./src/index.ts`. The `dataUrlToBlob` helper in `zip-export.ts` is exported only for unit testing and is intentionally not re-exported from `index.ts`.
