# @maga/web

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPAI_API_KEY` | Optional | Enables the Cartoonize feature. Get a free key at https://deepai.org. Set in `.env.local` — never commit that file. See `.env.example` for the placeholder. |

Without `DEEPAI_API_KEY` the Cartoonize button is disabled and all other editor features remain fully functional.

## Routes

- `/editor` — main image editor page (`src/app/editor/page.tsx`). Upload an image via drag-and-drop or file picker; add text/overlays; cartoonize; download the result.

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

## Features

### Cartoonize

Click **Cartoonize** in the toolbar to send the source image to the DeepAI Toonify API and display the result in the right panel.

- **Requires** `DEEPAI_API_KEY` in `.env.local`. Without it the button is visibly disabled with a tooltip: "Add DEEPAI_API_KEY to .env.local to enable".
- The result is **ephemeral** — it lives in React state only. Reloading the page clears it. An inline warning is shown below the result panel as a reminder to download before reloading.
- The server fetches DeepAI's temporary CDN URL immediately and converts it to a base64 data URL before returning to the client; the CDN URL is never stored or sent to the browser.
- Input images are downscaled client-side (≤ 2048 px) before upload to stay within the API's payload limit.

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

### `useCartoonize()`

Manages the Cartoonize feature state. Returns:

- `enabled: boolean` — true when `DEEPAI_API_KEY` is set (checked on mount via `GET /api/cartoonize`)
- `loading: boolean` — true while a cartoonize request is in flight
- `error: string | null` — last error message, or null
- `cartoonize(dataUrl: string): Promise<string | null>` — downscales the image client-side, POSTs to `/api/cartoonize`, returns the base64 output data URL on success or null on failure (sets `error`)

### `useEditorState(initial?)`

Wraps `@maga/editor` state mutations. Returns:
- `state: EditorState` — current editor state
- `addTextNode(partial?)` — creates and appends a new TextNode with defaults
- `updateTextNode(id, patch)` — immutably patches a TextNode
- `removeNode(id)` — removes any node by id
- `reorderNode(id, direction)` — swaps zIndex with adjacent node ('up'|'down')

## Lib

### `cartoonize-service` (`src/lib/cartoonize-service.ts`)

Five focused server-only functions (no React, no `packages/editor` imports):

```ts
isCartoonizeEnabled(): boolean
// Returns true when process.env.DEEPAI_API_KEY is set.

dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string }
// Decodes a base64 data URL to a Buffer and extracts the MIME type.

cartoonizeBuffer(buffer: Buffer, mimeType: string): Promise<string>
// POSTs image bytes to DeepAI Toonify as multipart/form-data.
// Returns the raw CDN output_url. Throws on HTTP 429 ("rate limit"), 402/403 ("quota exceeded"), or other errors.

fetchOutputAsDataUrl(outputUrl: string): Promise<string>
// Server-fetches the DeepAI CDN URL and returns a base64 data URL (data:image/...;base64,...).
// The CDN URL is never sent to the client.

cartoonizeDataUrl(dataUrl: string): Promise<string>
// Composer: dataUrlToBuffer → cartoonizeBuffer → fetchOutputAsDataUrl. Returns a base64 data URL.
```

### `exportCanvasElement(el, filename)`

Awaits `document.fonts.ready`, calls `html-to-image.toPng` at 2× pixel ratio, downloads the result as a PNG.

## Known Limitations

- **Cartoonize result is not persisted.** It lives in React state only — reloading the page clears it. Download the result before reloading.
- **DeepAI free-tier rate limits.** The free tier has a limited number of API calls per month. Heavy usage will hit limits; check your DeepAI dashboard at https://deepai.org.

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

## Multi-Node Workflow

- Multiple text nodes can be added; each is independent and draggable.
- Click a node to select it — a blue outline appears around the selected node.
- Click a blank area of the canvas to deselect the current node.
- Use **Move Up** / **Move Down** buttons in the style panel to adjust z-order (layer stack).
- Use the **Rotation** slider (−180° to 180°) to rotate the selected node clockwise or counter-clockwise.
- Use the **Delete** button to remove the selected node from the canvas.
- Z-order is reflected in both the canvas rendering and the exported PNG.

## Overlay Controls

Two types of overlay nodes can be added on top of the source image.

### Image Overlay

Click **Add Image Overlay** in the toolbar to open a file picker (PNG or SVG). The chosen image is converted to a data URL and placed at 10%,10% with 150×100 px default dimensions. It can be:

- **Dragged** by pointer anywhere on the canvas (position stored as % of canvas size)
- **Resized** via the blue handle in the bottom-right corner
- **Selected** to open the `OverlayControlsPanel` in the side panel

### Border Overlay

Click **Add Border** to place a CSS-border rectangle (defaults: 5%,5%, 90×90 px, 4 px solid white). Controls available in the side panel:

| Control | Effect |
|---------|--------|
| Opacity | Slider 0–100% |
| Border Color | Native color picker |
| Border Width | Slider 1–40 px |
| Border Style | Select: solid / dashed / dotted / double |
| Border Radius | Slider 0–200 px |

Both overlay types share **Move Up / Move Down** (z-order) and **Delete** buttons in the side panel. Selecting an overlay shows the `OverlayControlsPanel`; selecting a text node shows the `TextStylePanel`; clicking the canvas background deselects all.
