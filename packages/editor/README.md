# @maga/editor

Framework-light TypeScript package. Owns the editor state model and pure mutation functions. No React, no side effects, no imports from `apps/web`.

## Public API

Import only from `@maga/editor` — internal files are not part of the public surface.

| Export | Kind | Description |
|--------|------|-------------|
| `NodeId` | type | Branded string for node identifiers |
| `TextNode` | type | Text overlay node (position, size, color, opacity, rotation, zIndex) |
| `OverlayNode` | type | Image overlay node (src, position, dimensions, opacity, zIndex) |
| `EditorNode` | type | Union of TextNode and OverlayNode |
| `EditorState` | type | `{ nodes: EditorNode[] }` |
| `DEFAULT_TEXT_NODE` | const | Default values for new text nodes |
| `DEFAULT_OVERLAY_NODE` | const | Default values for new overlay nodes |
| `createEditorState` | fn | Returns a fresh empty `EditorState` |
| `createTextNode` | fn | Merges partial with defaults, assigns unique NodeId |
| `updateTextNode` | fn | Returns new state with patch applied (immutable) |
| `removeNode` | fn | Returns new state with node removed |
| `reorderNode` | fn | Returns new state with zIndex swapped with adjacent node |

## Architecture

Pure functions only. No side effects. No runtime dependencies. Consumed by `apps/web` via workspace protocol (`@maga/editor: workspace:*`). The `exports` map in `package.json` restricts the public surface to `./src/index.ts`.
