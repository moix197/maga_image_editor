# @maga/editor

Framework-light TypeScript package. Owns the editor state model and pure mutation functions. No React, no side effects, no imports from `apps/web`.

## Public API

Import only from `@maga/editor` — internal files are not part of the public surface.

| Export | Kind | Description |
|--------|------|-------------|
| `NodeId` | type | Branded string for node identifiers |
| `TextNode` | type | Text overlay node (position, size, color, opacity, rotation, zIndex) |
| `OverlayNode` | type | Image overlay node (src, position, dimensions, opacity, zIndex + effects) |
| `BorderOverlay` | type | Border-overlay variant of `OverlayNode` (`overlayType: "border"`) |
| `DropShadow` | type | Image-overlay drop shadow (`{ x, y, blur, color, opacity }`) |
| `TextShadow` | type | Text-node drop shadow |
| `TextBackground` | type | Text-node background box |
| `EditorNode` | type | Union of TextNode and OverlayNode |
| `EditorState` | type | `{ nodes: EditorNode[] }` |
| `DEFAULT_TEXT_NODE` | const | Default values for new text nodes |
| `DEFAULT_OVERLAY_NODE` | const | Default values for new overlay nodes |
| `DEFAULT_BORDER_NODE` | const | Default values for new border overlays |
| `createEditorState` | fn | Returns a fresh empty `EditorState` |
| `createTextNode` | fn | Merges partial with defaults, assigns unique NodeId |
| `updateTextNode` | fn | Returns new state with patch applied (immutable) |
| `createOverlayNode` | fn | Creates an image overlay from partial + defaults |
| `createBorderNode` | fn | Creates a border overlay from partial + defaults |
| `updateOverlayNode` | fn | Returns new state with overlay patch applied (immutable) |
| `removeNode` | fn | Returns new state with node removed |
| `reorderNode` | fn | Returns new state with zIndex swapped with adjacent node |
| `isTextNode` / `isOverlayNode` / `isBorderOverlay` | fn | Node type guards |
| `FONT_FAMILIES` | const | Available text font-family list |

### OverlayNode effect fields

Image overlays carry optional effect fields beyond the base geometry. All are baked into the exported PNG by the `apps/web` canvas post-pass (CSS applies them for live preview only):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `aspectRatioLocked` | `boolean` | `true` | Editing W or H preserves the current W:H ratio |
| `rotation` | `number` | `0` | Clockwise degrees; rotates around the element center |
| `cornerRadius` | `number` | `0` | px; clipped to the rounded silhouette |
| `dropShadow` | `DropShadow` | `undefined` | Cast off the rounded silhouette outside the clip |
| `featherRadius` | `number` | `undefined` (0) | px; fades all four edges inward |

**Feather: CSS vs. canvas (known visual delta).** On screen, feather is a CSS `mask-image` of two inset `linear-gradient`s combined with `mask-composite: intersect`. On export, the canvas post-pass reproduces the same inset-gradient intent with four per-edge `CanvasGradient`s composited via `destination-in`. Both clamp the inset to half the smaller dimension. They share the same formula, so the preview closely matches the export, with two minor deltas: (1) the CSS gradient interpolates in sRGB while the canvas may interpolate slightly differently at the corners where two edge gradients overlap, so corner falloff can look marginally softer in the export; (2) `mask-composite` support varies by browser — in engines without it the preview may show only the last gradient axis, while the export always feathers all four edges.

## Architecture

Pure functions only. No side effects. No runtime dependencies. Consumed by `apps/web` via workspace protocol (`@maga/editor: workspace:*`). The `exports` map in `package.json` restricts the public surface to `./src/index.ts`.
