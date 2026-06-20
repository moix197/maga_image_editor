# lib service-function convention

External integrations and side-effecting helpers live as **plain async (or pure)
service functions** under `apps/web/src/lib/` — not as React hooks, not baked
into components. A hook (e.g. `use-cartoonize.ts`) or a component is only a thin
caller; the actual work is an exported function in `lib/`.

**The convention:** put the integration logic (HTTP calls, image transforms,
export rendering) in a `lib/<name>.ts` module that exports named functions
taking and returning plain values. No React imports in these modules — they stay
callable from a route, a hook, a test, or another service.

Sites (≥2 real uses):

- `apps/web/src/lib/cartoonize-service.ts` — `cartoonizeDataUrl` and friends call
  the DeepAI Toonify HTTP endpoint; consumed by the `/api/cartoonize` route, not
  by a component. See [[deepai-toonify-provider]].
- `apps/web/src/lib/image-helpers.ts` — `validateImageFile`, `fileToDataUrl`,
  `downscaleIfNeeded`: file/image transforms with no React.
- `apps/web/src/lib/export-helpers.ts` — `exportCanvasElement` and the export
  render path; orchestrates `html-to-image` + the canvas post-pass as plain
  functions.

**Why it's a pattern:** the same shape already recurs across these `lib/`
modules — framework-free functions that hooks/routes call. New external
integrations belong here, behind a service function, rather than embedded in a
hook or component.
