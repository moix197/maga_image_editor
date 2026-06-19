# @maga/projects

Framework-light TypeScript package. Owns the versioned batch-compositing project model. No React, no side effects, no imports from `apps/web`. Depends on `@maga/editor` for the `EditorState` template type.

Future phases add the IndexedDB read/write adapter and ZIP serialize/deserialize logic to this package; the schema defined here is the durable contract those layers read and write.

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

## Schema versioning

`BatchProject.schemaVersion` is the `1` literal. It is the single discriminant that ZIP import and IDB restore gate on: a project whose `schemaVersion` is not `1` is rejected as incompatible. Bump `SCHEMA_VERSION` only on a breaking change to the project JSON shape.

## Asset refs are out-of-band

The project JSON holds only `blobKey` refs, never absolute URLs or embedded bytes. This keeps the JSON small and queryable and keeps refs portable across the IndexedDB blob store and ZIP layout (relative paths). It also leaves the schema clean to map onto the future Supabase layer (`plans/stage-5-cloud-persistence.md`).

## EditorState reuse

The `template` field is `EditorState` from `@maga/editor`, reused via a type-only import. `EditorState` is owned by the shared `@maga/editor` package (not `apps/web`), so reusing it introduces no circular dependency and avoids redefining the model.

## Architecture

Types only at this phase. No runtime dependencies. Consumed via the workspace protocol (`@maga/projects: workspace:*`). The `exports` map in `package.json` restricts the public surface to `./src/index.ts`.
