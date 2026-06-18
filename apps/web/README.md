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

## Tests

```bash
pnpm test              # run all tests once
pnpm test:coverage     # run with v8 coverage report
```

Tests live in `src/__tests__/` and `src/components/__tests__/`. Uses Vitest + jsdom + Testing Library.
