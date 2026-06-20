# @maga/web

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPAI_API_KEY` | Optional | Enables the Cartoonize feature. Get a free key at https://deepai.org. Set in `.env.local` — never commit that file. See `.env.example` for the placeholder. |

Without `DEEPAI_API_KEY` the Cartoonize button is disabled and all other editor features remain fully functional.

## Routes

- `/editor` — redirects to `/batch` (permanent redirect via `next/navigation` `redirect()`).
- `/batch` — unified batch workspace (`src/app/batch/page.tsx`). Houses all compositing work in a single shell with a side-nav and consolidated actions bar.

### Workspace sections (`?section=`)

The batch workspace uses a URL search param to track the active section. Links are shareable.

| `?section=` | Content |
|-------------|---------|
| `assets` (default) | Upload background / overlay images; import ZIP |
| `template` | Canvas editor — add text, border, image overlay nodes |
| `text` | Text layer property panel for the selected text node |
| `results` | Preview card + generated output gallery |

### Side-nav (`WorkspaceSideNav`)

Rendered by `src/app/batch/layout.tsx`. Vertical on `md+`, horizontal tab strip on mobile. Navigation-only — no business logic.

### Actions bar (`WorkspaceActionsBar`)

Rendered at the top of `BatchWorkspace`. Six global actions in two semantic groups:
- **Primary**: Generate Preview, Generate All, Cancel
- **Secondary**: Import ZIP, Export ZIP, Clear Project

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

### Batch compositing (`/batch`)

Produce many composites from one template in the browser — no backend. Upload a single **background** plus **N overlay images**, position a **variable image slot** on the template, then **Generate all** to render one cover-fit composite per overlay. Results appear in a gallery; download them individually or **export a portable ZIP**.

- **Variable slot.** One overlay node on the template is the slot whose `src` is swapped per overlay image at render time. Each overlay is center-cropped (cover-fit) into the slot's exact dimensions before compositing.
- **Persistence.** The in-progress project auto-saves (debounced) to IndexedDB (`maga-batch` DB) and restores on reload. A previously exported ZIP can be re-imported to resume work.

#### Portable ZIP layout

A self-contained export with relative-path asset refs (no absolute URLs):

```
project.json          # versioned BatchProject (schemaVersion: 1), refs as relative paths
background.<ext>      # extension derived from the background's MIME type
overlays/             # one entry per overlay, index-prefixed: overlays/<i>-<filename>
outputs/              # one composite per generated output: outputs/<i>-<stem>.<ext>
```

The project model (`BatchProject`, `ProjectAsset`, `VariableSlot`, `GeneratedOutput`), the IndexedDB adapter, and the ZIP export/import logic all live in the `@maga/projects` package — see [`packages/projects/README.md`](../../packages/projects/README.md) for the API.

#### Key client helpers

- `coverCropDataUrl(src, slotW, slotH)` (`src/lib/cover-crop.ts`) — center-crops a source image to exactly `slotW × slotH` using cover-fit math, returning a fitted data URL so the composite post-pass blits it 1:1 without distortion.
- **Sequential batch render** (`src/hooks/use-batch-render.ts`) — renders overlays one at a time off the live DOM canvas, reports progress, and is cancellable mid-run.
- **`reorderOverlays(newOrder)`** (`src/hooks/use-batch-project.ts`) — replaces the `overlays` array wholesale with `newOrder` (`ProjectAsset[]`). The caller is responsible for constructing the reordered array (e.g. after a drag-and-drop). Generate All iterates `overlays` in index order, so output order mirrors the overlay order set here.

## Components

### `VariantStrip` (`src/components/batch/VariantStrip.tsx`)

Pure presentational thumbnail strip for switching the active overlay item in the batch workspace.

```tsx
<VariantStrip
  overlays={overlays}          // ProjectAsset[] — items to render as thumbnails
  activeId={activeOverlayId}   // string | null — currently previewed item
  onSelect={(id) => setActiveId(id)}
/>
```

- Renders `null` when `overlays` is empty (safe to always mount).
- `role="listbox"` container; each thumbnail is a `button[role="option"]` with `aria-selected`.
- Clicking a thumbnail fires `onSelect(id)`. The parent controls `activeId`; there is no internal state.
- `activeId` governs **only the live-editable canvas overlay preview** (which item is shown in the canvas panel). It does not affect Generate All — that renders every item regardless of which is active.

### `BulkTextPanel` (`src/components/batch/BulkTextPanel.tsx`)

All-items × text-layers stacked editor rendered in the **Text** workspace section. One card per overlay, one input row per text layer — so N overlays × M text layers = N×M inputs.

```tsx
<BulkTextPanel
  overlays={overlays}                 // ProjectAsset[]
  textNodes={textNodes}               // TextNode[] from the active template
  itemTextValues={itemTextValues}     // Record<overlayAssetId, Record<textNodeId, string>>
  textLayerLocks={textLayerLocks}     // Record<textNodeId, boolean>
  setItemTextValue={setItemTextValue} // (overlayAssetId, textNodeId, value) => void
  setTextLayerLock={setTextLayerLock} // (textNodeId, locked) => void
/>
```

- **Locked layer** (`textLayerLocks[nodeId] === true`): input is disabled and shows the shared template `content`. The same value is used for every item when generating.
- **Unlocked layer** (default): input is enabled and shows the per-item override (empty string when not yet set; template `content` shown as placeholder).
- Lock toggle button fires `setTextLayerLock(nodeId, !locked)`. Per-layer — toggling a layer locks/unlocks it across all overlay cards simultaneously.
- Presentational only — no hooks, no business logic. All state lives in `useBatchProject`.

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

### `useItemText(args)` (`src/hooks/use-item-text.ts`)

Thin accessor over the `useBatchProject` text-mutation API. Useful when a single-item context (e.g. a canvas overlay row) needs to read/write text values without knowing the full map shape.

```ts
const { getTextValue, setTextValue, isLocked, toggleLock } = useItemText({
  itemTextValues,   // Record<overlayAssetId, Record<textNodeId, string>>
  textLayerLocks,   // Record<textNodeId, boolean>
  setItemTextValue, // (overlayAssetId, textNodeId, value) => void
  setTextLayerLock, // (textNodeId, locked) => void
});

getTextValue(overlayAssetId, textNodeId): string
// Per-item override for the given overlay + text node; "" when not yet set.

setTextValue(overlayAssetId, textNodeId, value): void
// Direct alias to the setItemTextValue callback.

isLocked(textNodeId): boolean
// Lock state for a text layer; defaults to false (per-item) when not yet set.

toggleLock(textNodeId): void
// Flips the lock state for a text layer.
```

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
- **DnD reorder is pointer-only.** The items list (`AssetList`) and layer stack (`LayerStackPanel`) use native HTML5 drag-and-drop, which has no keyboard path. Users who rely on keyboard navigation cannot reorder items. A planned follow-up will add move-up / move-down buttons that call the existing `onReorder` / `onReorderNode` callbacks, providing a fully keyboard-accessible reorder path.

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
