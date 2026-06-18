# Plan: Stage 3 — Cartoonizer

**Created:** 2026-06-18
**Branch:** `stage-3-cartoonizer`
**Status:** not started

## Context

Stage 2 delivered a full DOM-layer editing engine (`packages/editor`) with text nodes, overlays, borders, drag, z-order, and PNG export. Stage 3 adds a one-click "Cartoonize" feature powered by the **DeepAI Toonify** API. The user uploads a photo on the existing `/editor` page, clicks "Cartoonize", and the API result appears in the right panel of the existing `CompareLayout`. The result can then be downloaded using the already-wired `downloadDataUrl` helper. No new page or routing is introduced — Stage 3 is a pure feature addition to the existing editor shell.

### Provider decision

**Chosen provider: DeepAI Toonify** (`POST https://api.deepai.org/api/toonify`).

| | DeepAI Toonify | Alternative (local model / other SaaS) |
|--|--|--|
| Setup complexity | Single API key, one multipart POST | Local: GPU runtime + model weights; Other SaaS: OAuth or credit card |
| Free tier | Yes — one API key, no credit card | Varies |
| Bundle impact | None — server-side only | Local: large WASM/model bundle |
| CLAUDE.md dep rule | Native `fetch` only — zero new packages | Would require SDK or heavy client lib |
| Cartoon style fit | "Disney love-story" preset | Not guaranteed |

Verdict: **DeepAI Toonify** wins on simplicity, zero client-side bundle impact, and CLAUDE.md dep-minimization. The API key is server-only (`DEEPAI_API_KEY` in `.env.local`, no `NEXT_PUBLIC_` prefix). No SDK — native `fetch` only.

**User-overridable:** if you want a different provider before execution begins, update this section and Phase 1's service functions accordingly.

### API key handling

`DEEPAI_API_KEY` lives in `.env.local` only. It is never exposed to the client. The app is **local-first**: when the key is absent, the Cartoonize button is visually disabled with a tooltip hint and the app remains fully functional for all other features. No crash. The `GET /api/cartoonize` route returns `{ enabled: boolean }` which the client reads on mount.

### Input strategy

The editor holds `sourceDataUrl` (a base64 data URL). The API route accepts a `POST` with JSON body `{ imageDataUrl: string }`, decodes the base64 on the server, converts it to a `Buffer`, and POSTs to DeepAI as a multipart file upload. This avoids exposing the API key to the client and keeps the DeepAI call entirely server-side.

### Persistence

**Persistence of the cartoonized result across reload is OUT OF SCOPE.** The `resultDataUrl` lives in the existing editor page's React state. Reloading the page clears it. This is a known limitation and is explicitly called out in the documentation.

**User-overridable:** if you want persistence before execution begins, wire `resultDataUrl` into Stage 1's project store interface before running Phase 1.

## Risk: medium

DeepAI free-tier rate limits are the main external risk. DeepAI returns a temporary CDN `output_url` — the server fetches it immediately and converts it to a base64 data URL before responding to the client; the CDN URL is discarded and never reaches the browser. The cartoonized result is ephemeral because it lives in React state only — reloading the page clears it. The plan mitigates this by treating the result as ephemeral (in-memory only) and by calling this out in documentation.

## Dependencies & Risks

- **Stage 2 must be complete** — `apps/web/src/app/editor/page.tsx`, `CompareLayout`, `image-display.tsx`, `downloadDataUrl` from `image-helpers.ts`, and `exportCanvasElement` from `export-helpers.ts` must all exist.
- **DeepAI free-tier rate limits** — the free tier allows a limited number of API calls per month. Heavy usage will hit limits. Document this; advise users to check their DeepAI dashboard.
- **Temporary `output_url`** — DeepAI returns a CDN URL that the server fetches immediately and converts to a base64 data URL. The CDN URL is discarded server-side and never sent to the client. The result is ephemeral because it lives in React state — reloading clears it. Persistence is out of scope. Warn the user in the UI with an inline note and in documentation.
- **No `NEXT_PUBLIC_` prefix** — the API key must never appear in client-side code or environment variables. The `GET /api/cartoonize` enabled-check is the only client-facing signal.
- **`.env.local` in `.gitignore`** — verify before Phase 1 ships. If already present, document that. If not, add it.
- **Native `fetch` only** — no `node-fetch`, no `form-data` package, no Axios. Use `FormData` (available in Node 18+ / Next.js runtime) and native `fetch`.
- **No circular deps** — `apps/web/src/lib/cartoonize-service.ts` must not import from `packages/editor`. It is a standalone service layer in `apps/web`.
- **Next.js API route runtime** — the route uses the Node.js runtime (default). `FormData` and `fetch` are available in Node 18+. No `runtime = 'edge'` declaration.
- **User-overridable assumptions:**
  - DeepAI endpoint URL: `https://api.deepai.org/api/toonify` — change in `cartoonize-service.ts` if you want a different model.
  - Enabled-check strategy: `GET /api/cartoonize` returning `{ enabled: boolean }` — change in `route.ts` if you prefer a different approach.
  - Error display: toast or inline error message — change in `use-cartoonize.ts` if you prefer a different UX pattern.

---

## Phases

---

### Phase 0: Create worktree

> Confirm with user before running these commands.

**Steps:**
- [ ] Verify you are on `dev` branch: `git checkout dev && git pull origin dev`
- [ ] Create worktree: `git worktree add ../maga_image_editor_stage3 -b stage-3-cartoonizer`
- [ ] `cd ../maga_image_editor_stage3`
- [ ] Install deps: `pnpm install`
- [ ] Confirm app starts: `pnpm --filter @maga/web dev`

---

### Phase 1: Cartoonize service + API route

**Risk:** medium
**Mode:** afk
**Type:** typescript + backend
**Success criteria:** `curl -X POST http://localhost:3000/api/cartoonize -H "Content-Type: application/json" -d '{"imageDataUrl":"data:image/jpeg;base64,..."}' ` returns `{ outputUrl: "data:image/...;base64,..." }` (a base64 data URL, not a CDN URL) when `DEEPAI_API_KEY` is set, OR returns `{ disabled: true, error: "Cartoonize is disabled: DEEPAI_API_KEY is not set" }` with HTTP 503 when key is absent. POST with a non-`data:image/` prefix returns 400. POST with a payload exceeding the size limit returns 413. DeepAI HTTP 429 produces a 502 response with `{ error: "DeepAI rate limit exceeded. Try again later." }`; HTTP 402/403 produces `{ error: "DeepAI quota exceeded. Check your dashboard." }`. `GET /api/cartoonize` returns `{ enabled: true }` or `{ enabled: false }` depending on key presence. Unit tests for all service functions pass with mocked `fetch`. Route handler disabled-case test passes.

**Commit message:** `feat(cartoonizer): cartoonize-service + API route with enabled-check`

**Execution note:** No UI in this phase — skip `ui-ux-pro-max` skill. Pure TypeScript service and Next.js route handler only.

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/lib/cartoonize-service.ts` | Five focused functions: `isCartoonizeEnabled(): boolean` checks `process.env.DEEPAI_API_KEY`; `dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string }` decodes base64 data URL to Buffer; `cartoonizeBuffer(buffer: Buffer, mimeType: string): Promise<string>` POSTs to DeepAI as multipart, returns the raw `output_url` CDN string; throws with "DeepAI rate limit exceeded. Try again later." on HTTP 429, "DeepAI quota exceeded. Check your dashboard." on HTTP 402/403, generic error on other non-ok; `fetchOutputAsDataUrl(outputUrl: string): Promise<string>` server-fetches the CDN URL and converts to a base64 data URL; `cartoonizeDataUrl(dataUrl: string): Promise<string>` calls `downscaleIfNeeded(dataUrl)` (imported from `apps/web/src/lib/image-helpers.ts`), then `dataUrlToBuffer`, then `cartoonizeBuffer`, then `fetchOutputAsDataUrl` — returns a base64 data URL to the caller. Each function ≤30 lines. No React, no imports from `packages/editor`. |
| create | `apps/web/src/app/api/cartoonize/route.ts` | Thin route handler. `GET`: returns `{ enabled: isCartoonizeEnabled() }`. `POST`: reads JSON body `{ imageDataUrl }`; validates presence (400 if missing); validates `data:image/` mime prefix (400 if invalid); checks payload size against limit of 10 MB base64 string length (413 if exceeded); returns 503 `{ disabled: true, error: "..." }` if `!isCartoonizeEnabled()`; calls `cartoonizeDataUrl`, returns `{ outputUrl }` (a base64 data URL) on success or `{ error }` with 502 on DeepAI failure. ≤45 lines total; all logic delegated to service. |
| create | `.env.example` | Entry: `DEEPAI_API_KEY=` with comment explaining where to get the key and that this file is safe to commit |
| edit | `.gitignore` | Add `.env.local` if not already present; verify and document |
| create | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` | Unit tests for all five service functions with mocked `fetch` and `process.env`; covers 429/402 error messages, `downscaleIfNeeded` call, `fetchOutputAsDataUrl` data URL output |
| create | `apps/web/src/__tests__/api/cartoonize.test.ts` | Unit tests for route handler: GET enabled/disabled; POST 400 missing field; POST 400 non-image mime; POST 413 oversized payload; POST 503 key absent |

**Steps:**
- [ ] Check whether `.env.local` is already in `.gitignore` at repo root: `grep -n ".env.local" .gitignore` — if missing, add it
- [ ] Create `.env.example` at repo root with `DEEPAI_API_KEY=` entry and comment: `# Get your free key at https://deepai.org — never commit .env.local`
- [ ] Create `apps/web/src/lib/cartoonize-service.ts`:
  - `isCartoonizeEnabled(): boolean` — `return !!process.env.DEEPAI_API_KEY`; one line body
  - `dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string }` — split on `,`, extract mimeType from header, decode base64 to `Buffer.from(base64, 'base64')`; ≤15 lines
  - `cartoonizeBuffer(buffer: Buffer, mimeType: string): Promise<string>` — build `FormData`, append `Buffer` as a `Blob` with correct mimeType under field name `'image'`; `fetch('https://api.deepai.org/api/toonify', { method: 'POST', headers: { 'api-key': process.env.DEEPAI_API_KEY! }, body: formData })`; parse JSON; check `response.status === 429` → throw `"DeepAI rate limit exceeded. Try again later."`; check `response.status === 402 || 403` → throw `"DeepAI quota exceeded. Check your dashboard."`; throw generic on other non-ok; return `data.output_url` on success; throw if `output_url` missing; ≤30 lines
  - `fetchOutputAsDataUrl(outputUrl: string): Promise<string>` — `fetch(outputUrl)`, read as `arrayBuffer`, convert to base64 via `Buffer.from(arrayBuffer).toString('base64')`, prepend `data:<contentType>;base64,`; ≤20 lines
  - `cartoonizeDataUrl(dataUrl: string): Promise<string>` — calls `downscaleIfNeeded(dataUrl)` (import from `./image-helpers`), then `dataUrlToBuffer`, then `cartoonizeBuffer`, then `fetchOutputAsDataUrl`; returns the base64 data URL; ≤15 lines
- [ ] Create `apps/web/src/app/api/cartoonize/route.ts`:
  - `export async function GET()` — returns `NextResponse.json({ enabled: isCartoonizeEnabled() })`
  - `export async function POST(request: Request)` — reads `request.json()`, validates `imageDataUrl` present (400), validates it starts with `data:image/` (400 `{ error: "Invalid image format" }`), checks `imageDataUrl.length > 10 * 1024 * 1024 * 1.37` (≈10 MB decoded → ~13.7 MB base64, use a 14_000_000 char limit) → 413 `{ error: "Image too large" }`; guards on `!isCartoonizeEnabled()` → 503; calls `cartoonizeDataUrl`, returns `{ outputUrl }` (a base64 data URL) or `{ error }` on catch → 502
  - Import only from `cartoonize-service` and `next/server`; ≤45 lines total
- [ ] Write `apps/web/src/__tests__/lib/cartoonize-service.test.ts`:
  - Mock `fetch` globally; mock `process.env.DEEPAI_API_KEY`
  - `isCartoonizeEnabled` returns false when key absent, true when present
  - `dataUrlToBuffer` correctly decodes a small known base64 string, returns correct mimeType
  - `cartoonizeBuffer` calls fetch with correct URL, method, and `api-key` header; returns `output_url` from mocked response
  - `cartoonizeBuffer` throws with "rate limit exceeded" message when DeepAI returns HTTP 429
  - `cartoonizeBuffer` throws with "quota exceeded" message when DeepAI returns HTTP 402
  - `cartoonizeBuffer` throws when response is non-ok (generic case, e.g. 500)
  - `cartoonizeBuffer` throws when `output_url` is missing from response
  - `fetchOutputAsDataUrl` fetches a CDN URL, reads response as ArrayBuffer, and returns a `data:image/...;base64,...` string
  - `cartoonizeDataUrl` calls `downscaleIfNeeded` before `dataUrlToBuffer`
  - `cartoonizeDataUrl` end-to-end with mocked fetch returns a base64 data URL (not a CDN URL)
- [ ] Write `apps/web/src/__tests__/api/cartoonize.test.ts`:
  - `GET` returns `{ enabled: false }` when `DEEPAI_API_KEY` not set
  - `GET` returns `{ enabled: true }` when `DEEPAI_API_KEY` is set
  - `POST` without `imageDataUrl` returns 400
  - `POST` with `imageDataUrl` that does not start with `data:image/` returns 400 `{ error: "Invalid image format" }`
  - `POST` with `imageDataUrl` exceeding the character limit returns 413 `{ error: "Image too large" }`
  - `POST` without key returns 503 `{ disabled: true }`
- [ ] Run `pnpm --filter @maga/web test` — all pass
- [ ] Run `pnpm typecheck` from root — exits 0

**Tests:**
| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` | `isCartoonizeEnabled` key presence/absence; `dataUrlToBuffer` base64 decode and mimeType extraction; `cartoonizeBuffer` fetch call shape, `api-key` header, `output_url` extraction, HTTP 429 → "rate limit" error, HTTP 402 → "quota exceeded" error, error on generic non-ok, error on missing `output_url`; `fetchOutputAsDataUrl` fetches CDN URL and returns base64 data URL; `cartoonizeDataUrl` calls `downscaleIfNeeded` first, end-to-end returns data URL |
| create | `apps/web/src/__tests__/api/cartoonize.test.ts` | GET returns `{ enabled }` correctly; POST 400 on missing body field; POST 400 on non-`data:image/` mime prefix; POST 413 on oversized payload; POST 503 `{ disabled: true }` when key absent |

**Verification:**
- [ ] `pnpm --filter @maga/web test` exits 0
- [ ] `pnpm typecheck` from root exits 0
- [ ] `.env.local` is in `.gitignore` (verify with `git check-ignore -v .env.local`)
- [ ] `.env.example` exists at repo root with `DEEPAI_API_KEY=` entry
- [ ] `cartoonize-service.ts` has no React imports, no imports from `packages/editor`
- [ ] `route.ts` is ≤45 lines; imports only from `cartoonize-service` and `next/server`
- [ ] Each service function is ≤30 lines
- [ ] `cartoonize-service.ts` has five functions; each ≤30 lines; `fetchOutputAsDataUrl` returns a `data:image/...;base64,...` string
- [ ] `cartoonizeDataUrl` calls `downscaleIfNeeded` (verify import from `image-helpers.ts`)
- [ ] Manual smoke (with key set): `curl -X GET http://localhost:3000/api/cartoonize` returns `{"enabled":true}`
- [ ] Manual smoke (key absent): `curl -X POST http://localhost:3000/api/cartoonize -H "Content-Type: application/json" -d '{"imageDataUrl":"data:image/jpeg;base64,/9j/..."}' ` returns 503 `{ "disabled": true, "error": "..." }`
- [ ] Manual smoke (mime validation): POST with `{ "imageDataUrl": "data:text/plain;base64,..." }` returns 400 `{ "error": "Invalid image format" }`
- [ ] Manual smoke (size validation): POST with a >14 MB base64 string returns 413 `{ "error": "Image too large" }`

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
  ```
  Code review — Stage 3 Cartoonizer, Phase 1 (service + API route). Branch: stage-3-cartoonizer. Files to review: apps/web/src/lib/cartoonize-service.ts, apps/web/src/app/api/cartoonize/route.ts, apps/web/src/__tests__/lib/cartoonize-service.test.ts, apps/web/src/__tests__/api/cartoonize.test.ts, .env.example, .gitignore. Check: (1) DEEPAI_API_KEY is never referenced in any file under apps/web/src/app/ except the route handler (server-only); (2) no NEXT_PUBLIC_ prefix anywhere near the key; (3) cartoonize-service.ts has five functions each ≤30 lines, no React imports, no imports from packages/editor; (4) cartoonizeDataUrl calls downscaleIfNeeded (from image-helpers.ts) before dataUrlToBuffer — reuse before reinvent; (5) cartoonizeBuffer returns the raw DeepAI output_url; fetchOutputAsDataUrl server-fetches that URL and returns a base64 data URL; the CDN URL never reaches the client; (6) cartoonizeBuffer throws "DeepAI rate limit exceeded. Try again later." on HTTP 429 and "DeepAI quota exceeded. Check your dashboard." on HTTP 402/403; (7) route.ts ≤45 lines, thin — all logic delegated to service; (8) POST route validates data:image/ mime prefix (400 "Invalid image format") and payload size limit (413 "Image too large") before calling service; (9) FormData + native fetch used (no node-fetch, no form-data package, no Axios); (10) GET route returns { enabled: boolean }; POST route returns 503 { disabled: true } when key absent, 400 when imageDataUrl missing or invalid mime, 413 on oversized payload, 502 on DeepAI error; (11) .env.local in .gitignore; (12) .env.example committed with DEEPAI_API_KEY= entry; (13) unit tests mock fetch and process.env correctly; tests cover 429, 402, mime validation, size validation, fetchOutputAsDataUrl data URL output, downscaleIfNeeded call; (14) pnpm --filter @maga/web test exits 0; (15) pnpm typecheck exits 0; (16) CLAUDE.md invariants: pnpm, thin entry points, small focused functions ≤30 lines, native fetch only, no new packages introduced.
  ```
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing (see Tests subsection above) — or no-tests justification accepted
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(cartoonizer): cartoonize-service + API route with enabled-check`
- [ ] Phase marked complete

---

### Phase 2: Cartoonize button + wired UI

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** User uploads a photo in the existing editor, clicks "Cartoonize", sees a loading spinner on the button while the request is in flight, and the cartoonized result appears in the right panel of the existing `CompareLayout` (via `resultDataUrl` state in `editor/page.tsx`). Without `DEEPAI_API_KEY` set: button is visually disabled on mount with a tooltip "Add DEEPAI_API_KEY to .env.local to enable". An inline ephemeral-URL warning is shown below the result panel. Existing download functionality (via `downloadDataUrl` from `image-helpers.ts`) works on the result. No crash in either case. Tests pass.

**Commit message:** `feat(cartoonizer): cartoonize button, hook, and wired editor UI`

**Execution note:** Use the `ui-ux-pro-max --stack nextjs` skill for all UI additions in this phase (button, loading state, disabled tooltip, ephemeral-URL warning).

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/src/hooks/use-cartoonize.ts` | Client hook. State: `loading: boolean`, `error: string \| null`, `enabled: boolean`. On mount: `GET /api/cartoonize` → sets `enabled`. `cartoonize(dataUrl: string): Promise<string \| null>` — sets `loading: true`, POSTs to `/api/cartoonize`, returns `outputUrl` on success or sets `error` and returns `null` on failure; always sets `loading: false`. ≤50 lines. No business logic — pure fetch orchestration. |
| edit | `apps/web/src/app/editor/page.tsx` | Add "Cartoonize" button to toolbar: disabled + tooltip when `!enabled`; spinner when `loading`; on click calls `cartoonize(sourceDataUrl)` → on non-null result sets `resultDataUrl`. Add ephemeral-URL warning below result panel when `resultDataUrl` is set (inline note: "This result is temporary — download it before closing or reloading."). Page stays thin: all cartoonize logic via `useCartoonize` hook. |
| create | `apps/web/src/__tests__/hooks/use-cartoonize.test.ts` | Unit tests for hook: `enabled` starts false, set to true after GET returns `{ enabled: true }`; `cartoonize` sets loading during fetch, clears on resolve; returns `outputUrl` on success; sets `error` on failure; returns null on 503 disabled response. |
| create | `apps/web/src/__tests__/hooks/use-cartoonize-disabled.test.ts` | Unit test: when GET returns `{ enabled: false }`, `enabled` is false after mount; `cartoonize` call is not expected (button disabled — test the hook state, not the button). |

**Steps:**
- [ ] Create `apps/web/src/hooks/use-cartoonize.ts` (use `ui-ux-pro-max --stack nextjs` for error/loading state patterns):
  - `useState` for `loading`, `error`, `enabled`
  - `useEffect` on mount: `fetch('/api/cartoonize').then(r => r.json()).then(d => setEnabled(d.enabled)).catch(() => setEnabled(false))`
  - `cartoonize(dataUrl: string): Promise<string | null>`:
    - Set `loading: true`, `error: null`
    - `fetch('/api/cartoonize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageDataUrl: dataUrl }) })`
    - Parse JSON; if `data.disabled` → set `error: "Cartoonize is disabled. Add DEEPAI_API_KEY to .env.local."` → return null
    - If `data.error` → set `error: data.error` → return null
    - Return `data.outputUrl`
    - Always `finally { setLoading(false) }`
  - Return `{ loading, error, enabled, cartoonize }`
  - Note: `data.outputUrl` will be a base64 data URL (not a CDN URL); the hook is agnostic to this — it just returns the string
  - ≤50 lines total
- [ ] Update `apps/web/src/app/editor/page.tsx` (use `ui-ux-pro-max --stack nextjs`):
  - Import and call `useCartoonize()`
  - Add "Cartoonize" button to the editor toolbar section, adjacent to existing toolbar buttons
  - Button disabled when `!enabled || loading || !sourceDataUrl`
  - When `!enabled`: wrap button in a `<span title="Add DEEPAI_API_KEY to .env.local to enable">` (or use shadcn Tooltip if already in project) — do not introduce Tooltip if it would require a new package; prefer `title` attribute
  - When `loading`: button label becomes a spinner (reuse existing loading pattern in the project; if none, render `"Cartoonizing..."` text with `disabled` — no new spinner library)
  - On click: `const url = await cartoonize(sourceDataUrl); if (url) setResultDataUrl(url)`
  - After `CompareLayout` or result panel: when `resultDataUrl` is set, render an inline `<p>` warning: `"This result is temporary — download it before closing or reloading the page."`
  - Page component stays ≤100 lines; all hook calls at top; no inline business logic
- [ ] Write `apps/web/src/__tests__/hooks/use-cartoonize.test.ts`:
  - Mock `fetch` globally with `vi.fn()`
  - On mount GET mock returns `{ enabled: true }` → `enabled` is true
  - Calling `cartoonize` with a data URL: fetch called with correct URL/method/body; `loading` is true during fetch; resolves to `outputUrl` (mock returns a `data:image/png;base64,...` string, not a CDN URL)
  - Calling `cartoonize` when fetch fails: `error` is set, returns null, `loading` false
  - Calling `cartoonize` when response has `{ disabled: true }`: `error` is set, returns null
- [ ] Write `apps/web/src/__tests__/hooks/use-cartoonize-disabled.test.ts`:
  - On mount GET mock returns `{ enabled: false }` → `enabled` is false after effect
- [ ] Run `pnpm --filter @maga/web test` — all pass
- [ ] Run `pnpm typecheck` from root — exits 0
- [ ] Update `apps/web/README.md` — document "Cartoonize" feature, disabled state, ephemeral-URL warning

**Tests:**
| Action | File | What it covers |
|---|---|---|
| create | `apps/web/src/__tests__/hooks/use-cartoonize.test.ts` | `enabled` set from GET response; `cartoonize` fetch call shape; `loading` true during request, false after; returns `outputUrl` on success; sets `error` on network failure; sets `error` on `{ disabled: true }` response; returns null on error |
| create | `apps/web/src/__tests__/hooks/use-cartoonize-disabled.test.ts` | `enabled` is false when GET returns `{ enabled: false }` |

**Verification:**
- [ ] `pnpm --filter @maga/web test` exits 0
- [ ] `pnpm typecheck` from root exits 0
- [ ] With key absent: open `/editor`, upload image — "Cartoonize" button is visually disabled; hovering shows tooltip "Add DEEPAI_API_KEY to .env.local to enable"
- [ ] With key absent: no crash, all other editor features work normally
- [ ] With key set: upload image → click "Cartoonize" → button shows "Cartoonizing..." (disabled during request) → result appears in right panel of `CompareLayout`
- [ ] With key set: ephemeral-URL warning appears below result panel
- [ ] With key set: existing "Download" action on result works (downloads the cartoonized image)
- [ ] With key set: error case — kill network mid-request (or set wrong key) → error message displayed; button re-enabled; no crash
- [ ] `sourceDataUrl` is null → Cartoonize button is disabled (no source image to cartoonize)

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
  ```
  Code review — Stage 3 Cartoonizer, Phase 2 (button + wired UI). Branch: stage-3-cartoonizer. Files to review: apps/web/src/hooks/use-cartoonize.ts, apps/web/src/app/editor/page.tsx (changes only), apps/web/src/__tests__/hooks/use-cartoonize.test.ts, apps/web/src/__tests__/hooks/use-cartoonize-disabled.test.ts, apps/web/README.md. Check: (1) use-cartoonize.ts is ≤50 lines, pure fetch orchestration — no business logic, no direct DeepAI calls, no API key references; (2) page.tsx stays thin (≤100 lines), all cartoonize logic via useCartoonize, no inline business logic; (3) button disabled when !enabled || loading || !sourceDataUrl; (4) disabled tooltip uses title attribute or existing Tooltip component — no new packages; (5) loading state uses existing pattern — no new spinner library; (6) resultDataUrl set only on non-null return from cartoonize(); (7) resultDataUrl will be a base64 data URL — confirm no CDN URL ever stored in state; (8) ephemeral warning rendered when resultDataUrl is set — wording is about in-memory state clearing on reload, not URL expiry; (9) downloadDataUrl from image-helpers.ts reused for download — not reimplemented; (10) hook tests mock fetch globally, cover enabled/disabled/loading/error/success paths; mock success response uses data:image/png;base64,... not an https:// URL; (11) pnpm --filter @maga/web test exits 0; (12) pnpm typecheck exits 0; (13) CLAUDE.md invariants: pnpm, thin entry points, small focused functions, reuse before reinvent (downloadDataUrl, existing button/toolbar patterns), no new packages.
  ```
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing (see Tests subsection above) — or no-tests justification accepted
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(cartoonizer): cartoonize button, hook, and wired editor UI`
- [ ] Phase marked complete

---

### Phase 3: Final Verification

**Mode:** hil

**Overall success criteria:** A local user with no auth or backend can: (1) open `/editor` with `DEEPAI_API_KEY` absent — all existing editor features (upload, text nodes, export, download) work normally; the Cartoonize button is visibly disabled with a tooltip; no crash; (2) set `DEEPAI_API_KEY` in `.env.local` and restart the dev server — Cartoonize button becomes enabled; (3) upload a photo, click "Cartoonize", see the spinner, see the result in the right panel of `CompareLayout`, read the ephemeral-URL warning, and download the result; (4) lose the result on reload (expected, documented); (5) all unit tests pass; (6) no CLAUDE.md invariants are violated; (7) `.env.local` is not tracked by git; (8) `.env.example` is committed with the key placeholder.

**Steps:**
- [ ] Every preceding phase's Steps / Verification / Phase review checkboxes are ticked
- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review):
  ```
  End-to-end review of stage-3-cartoonizer (Stage 3 — Cartoonizer). Scope: all new and modified files on this branch. Check: (1) DEEPAI_API_KEY never appears in any client-side file or NEXT_PUBLIC_ env var — server-only throughout; (2) DeepAI is called only from cartoonize-service.ts and only invoked by the API route — never from the client; (3) cartoonize-service.ts — five functions, each ≤30 lines, no React, no packages/editor imports; (4) cartoonizeDataUrl calls downscaleIfNeeded (from image-helpers.ts) before dataUrlToBuffer — reuse before reinvent; (5) fetchOutputAsDataUrl server-fetches the DeepAI output_url CDN link and returns a base64 data URL — the CDN URL is never returned to or stored by the client; (6) cartoonizeBuffer throws "DeepAI rate limit exceeded. Try again later." on HTTP 429 and "DeepAI quota exceeded. Check your dashboard." on HTTP 402/403; (7) route.ts — ≤45 lines, thin, all logic delegated to service; (8) POST route validates data:image/ mime prefix (400) and payload size limit (413) before calling service; (9) use-cartoonize.ts — ≤50 lines, no business logic, no direct DeepAI calls; (10) page.tsx — stays thin (≤100 lines), all logic in hooks; (11) native fetch only — no node-fetch, form-data, Axios, or other HTTP packages introduced; (12) FormData + Blob used for multipart POST to DeepAI in cartoonize-service.ts; (13) .env.local in .gitignore; .env.example committed; (14) GET /api/cartoonize returns { enabled: boolean }; (15) POST /api/cartoonize returns 503 { disabled: true } when key absent, 400 on missing body or invalid mime, 413 on oversized payload, 502 on DeepAI error with human-readable message; (16) button disabled when !enabled || loading || !sourceDataUrl; (17) resultDataUrl is always a base64 data URL — never a CDN URL; (18) ephemeral warning shown when resultDataUrl is set — wording is about in-memory state clearing on reload; (19) downloadDataUrl from image-helpers.ts reused — not reimplemented; (20) pnpm --filter @maga/web test exits 0; (21) pnpm typecheck exits 0; (22) no dead code, no commented-out blocks; (23) CLAUDE.md invariants: pnpm, thin entry points, small focused functions (≤30 lines), reuse before reinvent, no speculative abstractions, separation of concerns, minimize deps (zero new packages), build own before installing.
  ```
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt
- [ ] Code-reviewer agent reviews the entire change end-to-end
- [ ] Any changes made in response to the final code-reviewer review have been reflected back into this plan file
- [ ] `pnpm --filter @maga/web test` exits 0
- [ ] `pnpm typecheck` from root exits 0
- [ ] No CLAUDE.md invariants violated
- [ ] Security checklist (manual):
  - [ ] `DEEPAI_API_KEY` does not appear in browser DevTools → Network tab or Sources tab
  - [ ] `DEEPAI_API_KEY` does not appear in any file under `apps/web/src/` except `cartoonize-service.ts` (server-only)
  - [ ] `DEEPAI_API_KEY` does not appear in `.env.example` (placeholder only — no real value)
  - [ ] `git status` confirms `.env.local` is untracked (not committed)
  - [ ] POST `/api/cartoonize` with a non-`data:image/` payload returns 400 (mime validation active)
  - [ ] POST `/api/cartoonize` with a >14 MB base64 string returns 413 (size validation active)
  - [ ] DeepAI `output_url` is never visible in browser Network tab — the CDN URL is fetched server-side and only a base64 data URL is returned to the client
  - [ ] With an invalid/expired API key: error message references rate limit or quota (not a raw HTTP error code)
- [ ] Disabled-state golden path (key absent):
  - [ ] Start app without `.env.local` → `/editor` loads without crash
  - [ ] Upload an image → all other toolbar actions work normally (Add Text, Export, Download)
  - [ ] "Cartoonize" button is visibly disabled (greyed out)
  - [ ] Hover over button → tooltip "Add DEEPAI_API_KEY to .env.local to enable" is visible
  - [ ] Click disabled button → nothing happens (no error, no request)
- [ ] Enabled-state golden path (key set):
  - [ ] Add `DEEPAI_API_KEY=<real key>` to `.env.local`; restart dev server
  - [ ] `/editor` loads; upload a photo
  - [ ] Click "Cartoonize" → button shows "Cartoonizing..." and is disabled during request
  - [ ] Request completes → cartoonized result appears in right panel of `CompareLayout`
  - [ ] Ephemeral-URL warning is visible below the result panel
  - [ ] Click download action on result → browser downloads the cartoonized image
  - [ ] Reload page → result is gone (right panel blank) — this is expected and documented
- [ ] Error-state path:
  - [ ] Set a wrong/invalid API key → click "Cartoonize" → error message appears; button re-enabled; no crash
  - [ ] Remove `sourceDataUrl` (no image uploaded) → "Cartoonize" button is disabled
- [ ] Overall success criteria met
- [ ] All phase checkboxes in this document are ticked

---

## Documentation

| Change | Documentation location |
|---|---|
| `DEEPAI_API_KEY` setup instructions, `.env.local` pattern | `apps/web/README.md` — "Environment Variables" section |
| Cartoonize feature overview, disabled state, ephemeral-URL warning | `apps/web/README.md` — "Features" section |
| `cartoonize-service.ts` public functions and their contracts; server-side fetch of DeepAI output URL and base64 data URL normalization | `apps/web/README.md` — "Lib" section |
| `useCartoonize` hook API (returns, states, usage) | `apps/web/README.md` — "Hooks" section |
| Out-of-scope: persistence across reload | `apps/web/README.md` — "Known Limitations" section |
| DeepAI free-tier rate limit warning | `apps/web/README.md` — "Known Limitations" section |
| `.env.example` key placeholder | `.env.example` at repo root — committed |

---

## Tests

| Phase | Logic under test | Test file |
|---|---|---|
| 1 | `isCartoonizeEnabled` returns false when key absent, true when present | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | `dataUrlToBuffer` decodes base64, extracts mimeType correctly | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | `cartoonizeBuffer` calls DeepAI with correct URL, method, api-key header | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | `cartoonizeBuffer` returns raw CDN `output_url` string from mocked DeepAI response | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | `cartoonizeBuffer` throws "rate limit exceeded" on HTTP 429 | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | `cartoonizeBuffer` throws "quota exceeded" on HTTP 402 | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | `cartoonizeBuffer` throws on generic non-ok HTTP response from DeepAI | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | `cartoonizeBuffer` throws when `output_url` missing from DeepAI response | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | `fetchOutputAsDataUrl` fetches CDN URL and returns `data:image/...;base64,...` string | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | `cartoonizeDataUrl` calls `downscaleIfNeeded` before `dataUrlToBuffer` | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | `cartoonizeDataUrl` end-to-end returns a base64 data URL (not a CDN URL) | `apps/web/src/__tests__/lib/cartoonize-service.test.ts` |
| 1 | Route GET returns `{ enabled: false }` when key absent | `apps/web/src/__tests__/api/cartoonize.test.ts` |
| 1 | Route GET returns `{ enabled: true }` when key present | `apps/web/src/__tests__/api/cartoonize.test.ts` |
| 1 | Route POST returns 400 when `imageDataUrl` missing | `apps/web/src/__tests__/api/cartoonize.test.ts` |
| 1 | Route POST returns 400 when `imageDataUrl` has non-`data:image/` mime prefix | `apps/web/src/__tests__/api/cartoonize.test.ts` |
| 1 | Route POST returns 413 when `imageDataUrl` exceeds character size limit | `apps/web/src/__tests__/api/cartoonize.test.ts` |
| 1 | Route POST returns 503 `{ disabled: true }` when key absent | `apps/web/src/__tests__/api/cartoonize.test.ts` |
| 2 | `useCartoonize` — `enabled` set from GET response on mount | `apps/web/src/__tests__/hooks/use-cartoonize.test.ts` |
| 2 | `useCartoonize` — `cartoonize()` fetch called with correct URL, method, body | `apps/web/src/__tests__/hooks/use-cartoonize.test.ts` |
| 2 | `useCartoonize` — `loading` true during request, false after resolve | `apps/web/src/__tests__/hooks/use-cartoonize.test.ts` |
| 2 | `useCartoonize` — returns `outputUrl` on success | `apps/web/src/__tests__/hooks/use-cartoonize.test.ts` |
| 2 | `useCartoonize` — sets `error` and returns null on network failure | `apps/web/src/__tests__/hooks/use-cartoonize.test.ts` |
| 2 | `useCartoonize` — sets `error` and returns null on `{ disabled: true }` response | `apps/web/src/__tests__/hooks/use-cartoonize.test.ts` |
| 2 | `useCartoonize` — `enabled` is false when GET returns `{ enabled: false }` | `apps/web/src/__tests__/hooks/use-cartoonize-disabled.test.ts` |

---

## Human Summary

Stage 3 adds a one-click "Cartoonize" feature to the MAGA Image Editor using the **DeepAI Toonify** API. It is built as two clean vertical slices on top of the existing editor shell — no new pages, no new routing, no new packages.

**Phase 1** builds the server-side foundation: `cartoonize-service.ts` contains five focused functions (enabled check, base64 decode, multipart DeepAI POST, server-side CDN fetch with base64 normalization, and a composer). The composer calls `downscaleIfNeeded` (from the existing `image-helpers.ts`) before sending to DeepAI, then server-fetches the temporary CDN `output_url` and converts it to a base64 data URL before returning — the CDN URL is never sent to the client. The Next.js API route at `/api/cartoonize` is a thin handler — it validates input (presence, mime prefix `data:image/`, payload size), guards on the missing-key case, and delegates all logic to the service. The GET handler returns `{ enabled: boolean }` so the client can check availability without exposing the key. All DeepAI communication is strictly server-side.

**Phase 2** wires the feature to the UI: `useCartoonize` is a small client hook that manages `loading`, `error`, and `enabled` state, with no business logic of its own. In `editor/page.tsx`, a "Cartoonize" button calls the hook and sets `resultDataUrl` on success — which is already wired to the right panel of the existing `CompareLayout`. No new layout, no new components beyond the hook; existing `downloadDataUrl` handles the download.

**Key architectural decisions:**
- `DEEPAI_API_KEY` is server-only throughout — never referenced in client code, never prefixed with `NEXT_PUBLIC_`.
- The app is **local-first and gracefully degraded**: without the key the button is disabled and the rest of the editor is fully functional.
- Zero new packages: native `fetch` + `FormData` + `Blob` handle the multipart upload in the Node.js runtime. No `node-fetch`, no `form-data`, no Axios.
- **Persistence is out of scope**: the cartoonized result lives in React state only. An inline warning tells the user to download before reloading. This is explicitly documented and a known limitation. The server fetches the DeepAI CDN URL immediately and discards it; the client receives a base64 data URL which is ephemeral because React state clears on reload — not because of URL expiry.
