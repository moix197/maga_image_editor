# @maga/web

## Routes

- `/editor` — main image editor page (`src/app/editor/page.tsx`). Upload an image via drag-and-drop or file picker; download the result.

## image-helpers API (`src/lib/image-helpers.ts`)

```ts
validateImageFile(file: File): { valid: boolean; error?: string }
// Checks type (JPEG/PNG/WebP/GIF) and size (≤ 20 MB).

fileToDataUrl(file: File): Promise<string>
// Reads a File into a base64 data URL via FileReader.

downscaleIfNeeded(dataUrl: string, maxDimension?: number): Promise<string>
// Returns original if within maxDimension (default 2048); otherwise draws to canvas and returns scaled data URL.

downloadDataUrl(dataUrl: string, filename: string): void
// Triggers a browser download of the given data URL.
```

## Components

### `CompareLayout` (`src/components/compare-layout.tsx`)

Pure layout shell — no hooks, no events, no `"use client"`.

```tsx
<CompareLayout left={<LeftPanel />} right={<RightPanel />} />
```

Renders a two-column responsive grid (`grid-cols-1 md:grid-cols-2`). Each child is wrapped in a plain `<div>`.

### `ImagePanel` (`src/components/image-panel.tsx`)

`"use client"` wrapper that composes `ImageUploader` and `ImageDisplay` into a labeled card.

```tsx
<ImagePanel
  label="Source"
  dataUrl={dataUrl}           // string | null
  onFile={handleFile}         // (file: File) => void
  onError={handleError}       // (msg: string) => void
  onDownload={handleDownload} // optional — passed through to ImageDisplay
  emptyLabel="No image yet"   // optional caption shown above the uploader
/>
```

- `dataUrl` is `null`: renders `ImageUploader`; shows `emptyLabel` caption if provided.
- `dataUrl` is set: renders `ImageDisplay`; `onDownload` forwarded only when provided.
- No business logic — pure prop forwarding.

## Tests

```bash
pnpm test              # run all tests once
pnpm test:coverage     # run with v8 coverage report
```

Tests live in `src/__tests__/` and `src/components/__tests__/`. Uses Vitest + jsdom + Testing Library.

## Hooks

### `useEditorState(initial?)`

Wraps `@maga/editor` state mutations. Returns:
- `state: EditorState` — current editor state
- `addTextNode(partial?)` — creates and appends a new TextNode with defaults
- `updateTextNode(id, patch)` — immutably patches a TextNode
- `removeNode(id)` — removes any node by id
- `reorderNode(id, direction)` — swaps zIndex with adjacent node ('up'|'down')

## Lib

### `exportCanvasElement(el, filename)`

Awaits `document.fonts.ready`, calls `html-to-image.toPng` at 2× pixel ratio, downloads the result as a PNG.

## Editor Controls

- **Add Text** — appends a draggable "Hello" text node at 50%,50% of the canvas
- **Export** — downloads the canvas (image + all text nodes) as a PNG via html-to-image
- Drag any text node by pointer to reposition it

## Text Styling Controls

When a text node is selected on the canvas, a `TextStylePanel` appears in a side panel (`src/components/text-style-panel.tsx`).

### Controls and CSS Mappings

| Control | CSS Property | Notes |
|---------|-------------|-------|
| Font Family | `font-family` | Dropdown: Inter, Roboto, Playfair Display, Oswald, Merriweather, Dancing Script |
| Font Weight | `font-weight` | normal / bold |
| Font Style | `font-style` | normal / italic |
| Font Size | `font-size` | Number input, 8–200px |
| Color | `color` | Native color picker |
| Opacity | `opacity` | Slider 0–1 (step 0.01) |
| Shadow | `text-shadow` | Toggle + color picker + blur slider (0–40px); offsetX/offsetY fixed at 2px |

All changes apply immediately to the canvas and are included in the exported PNG.

### Text Background Controls

When a text node is selected, a "Text Background" section appears at the bottom of the `TextStylePanel`.

| Control | Effect | Notes |
|---------|--------|-------|
| Enable background | Toggles background on/off | Off → `textBackground: null`; On → defaults (black, 50% opacity, 0 blur, 8/4px padding) |
| Color | Background fill color | Native color picker |
| Opacity | Background opacity | Slider 0–1 (step 0.01) |
| Blur | `backdrop-filter: blur()` on the text node | Slider 0–20px; 0 = no blur (sharp edge) |
| Padding X | Horizontal padding inside the background span | Number input 0–40px |
| Padding Y | Vertical padding inside the background span | Number input 0–40px |

Disabling the background sets `textBackground: null` on the node, removing all background and blur.
