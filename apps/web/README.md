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
