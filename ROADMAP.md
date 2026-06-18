# Roadmap — MAGA Image Editor

Cartoonize a photo into a "Disney love-story" style, then annotate it with rich
text/overlay tools and download the result. Next.js + shadcn on Vercel.

## Guiding principle: local-first, infrastructure last

Build a fully working app **locally with zero external services**, deploy it to
Vercel the simplest possible way, and only add accounts/services once the core
works. Anything that requires setup you'd have to maintain (databases, auth,
mailers) is deferred to the latest stages. State lives in the browser
(`localStorage`) until cloud persistence is actually introduced.

**Setup cost per stage is called out explicitly.** Early stages need none (or, at
most, a single free API key). Cloud + auth come last.

## Current status & next milestone _(updated 2026-06-18)_

**Built so far:** Stage 0 (workspace, `packages/config`, Next.js app, theme toggle), Stage 1 P1–P2 (image upload/display/download + compare layout), Stage 2 P1 (`packages/editor` + one draggable text node + PNG export).

**▶ Next milestone — "main functionality working locally." Do this before anything else:**

1. **Finish Stage 2 (P2–P6)** — multiple text nodes, edit/select/delete, full properties (font, size, color, opacity, shadow, text background), image overlays, faithful PNG export.
2. **Stage 3 (Cartoonizer)** — upload → cartoonize → result in the editor.

The milestone is reached when this loop works end-to-end **and is verified locally**: send image → cartoonize → add/edit texts → manage all properties → export. Everything stays local (Stage 3 needs only one free API key).

**Deferred until the milestone is verified — no work, no setup, no Supabase connection before then:**

- **Stage 4 (Preferences)** — theme only; language/i18n dropped (English-only).
- **Stage 5 (Cloud / Supabase)** — first remote stage; no auth, cloud-native. Not started until explicitly chosen.

PRDs for Stages 3/4/5 already exist in `plans/`. A PRD file does nothing on its own — it only acts when run with `execute-prd`.

## Decisions (locked)

- **Stack:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. Package manager: **pnpm**.
- **Hosting:** Vercel. Auto-deploy on push to `main`. Daily work on `dev`; ship via PR `dev → main` (Vercel preview deploys on PRs). The only early "infrastructure" = a GitHub repo + Vercel link.
- **Local state first:** editor state lives in the browser through the milestone. The originally-planned Stage 1 P3 `localStorage` project store was never built; rather than build it just to throw it away, **Stage 5 goes cloud-native straight to Supabase** (no local-store-to-cloud swap).
- **Cartoonizer:** committed to **DeepAI Toonify** (genuinely free API key, no card, single `api-key` header, server-side only). No spike. The `ICartoonizer` interface keeps it swappable later.
- **Cloud + auth (deferred):** Supabase free tier for persistence (**Stage 5, no auth — scoped by an anonymous local id**), then Supabase Auth in Stage 6 (built-in email magic links — no separate mailer). Introduced only after the milestone is verified.

## Architecture (modular by packages, grown as needed)

pnpm workspace. Packages are added when their concern actually appears — no
speculative scaffolding.

- `apps/web` — Next.js app (thin routes/pages; UI + route handlers only).
- `packages/config` — shared tsconfig/eslint/tailwind preset. *(Stage 0)*
- `packages/editor` — canvas/overlay engine: text nodes, borders, overlays, transforms, export. Framework-light, callback-driven. *(Stage 2)*
- `packages/cartoonizer` — `ICartoonizer` interface + provider adapters. *(Stage 3)*
- `packages/db` — Supabase client, schema, queries. *(Stage 5, cloud-native — no local store to replace)*

Boundaries: dependencies flow one way; no package reaches into another's internals.

---

## Stages

Each stage becomes its own PRD via the `write-prd` skill, then executed with
`execute-prd`. **Setup** marks what external setup a stage requires.

### Stage 0 — Foundation & simplest Vercel deploy   ·   *Setup: GitHub repo + Vercel link*
Empty-but-deployed app proving the push-to-main → live loop. No DB, no auth, no keys.
pnpm workspace + `apps/web` (App Router, TS, Tailwind, shadcn, next-themes dark/light) + `packages/config`. Branch model `dev`/`main`. Vercel project, preview deploys on PRs. (Dedicated CI deferred to Stage 8 — Vercel's own build is the gate for now.)
**Exit:** placeholder page live on Vercel from `main`; a PR from `dev` gets a preview URL.

### Stage 1 — Image workspace   ·   *Setup: none*
Upload an image, see it in a side-by-side compare layout (source vs result slot), manage a local project (create/name, persisted in `localStorage`), download the current image. Result slot also accepts a manually uploaded image so compare is real before cartoonize exists.
**Exit:** upload → see → download, with a named project that survives reload.

### Stage 2 — Text & overlay editor   ·   *Setup: none*   ·   **◀ MILESTONE (P1 done; P2–P6 next)**
The core editing engine (`packages/editor`). Multiple text nodes with full styling (font family/style/weight, size, color, opacity, shadow, text background + blur), drag-position, rotation, z-order, select/delete; borders & image overlays with position/scale/opacity/z-order; **export the composed image** to download. P1 (one draggable text node + PNG export) is built; P2–P6 are the next work. _Note: editor-state persistence (the deferred Stage 1 P3 local store) is out of scope — state is in-memory until Stage 5._
**Exit:** stack multiple text + overlays on an image, export a faithful PNG.

### Stage 3 — Cartoonizer (free API)   ·   *Setup: one free API key (DeepAI)*   ·   **◀ MILESTONE**
`packages/cartoonizer` with `ICartoonizer` + the **DeepAI Toonify** adapter (committed; no spike). Called only from a server route handler (key server-side). Wire it so the result fills the compare view's result slot. App still works without the key (cartoonize disabled, everything else functional). PRD: `plans/stage-3-cartoonizer.md`.
**Exit:** upload a photo, get a cartoonized result in the compare view.

### Stage 4 — Preferences (local, theme only)   ·   *Setup: none*   ·   _deferred until milestone verified_
Light/dark/system theme via a settings UI (extends next-themes from Stage 0). **Language/i18n dropped — English-only.** PRD: `plans/stage-4-preferences.md`.
**Exit:** theme preference persists across reloads.

### Stage 5 — Cloud persistence (Supabase)   ·   *Setup: Supabase project*   ·   _deferred until milestone verified_
Introduce `packages/db`; persist projects/images/editor-state to Supabase (Postgres + Storage) **cloud-native** (no local store to swap). **No auth** — rows scoped by an anonymous local id, RLS-ready and tightened to real users in Stage 6; writes go through server route handlers (service-role key, server-only). First remote stage. PRD: `plans/stage-5-cloud-persistence.md`.
**Exit:** projects + images persist in the cloud and reload across devices.

### Stage 6 — Auth (Supabase)   ·   *Setup: Supabase Auth (built-in email)*
Supabase Auth (magic link via built-in email — no separate mailer; add OAuth later). Tie existing data to real users via RLS; protected app area; sign-in/out.
**Exit:** users sign in; each sees only their own projects.

### Stage 7 — Projects dashboard & lifecycle   ·   *Setup: none (uses Stage 5/6)*
List/grid of projects with status (ongoing/done), thumbnails, resume/duplicate/delete, mark-done, filter/sort.
**Exit:** full project lifecycle from a dashboard.

### Stage 8 — Hardening, CI & polish   ·   *Setup: none*
Add GitHub Actions CI (lint/typecheck/build gate on PRs), quota/rate-limit UX for the cartoonize API, error boundaries, loading skeletons, accessibility pass (`web-design-guidelines`), responsive QA, docs.
**Exit:** stable, accessible, documented v1.

---

## How we'll work each stage

1. `write-prd` to produce the stage PRD.
2. `execute-prd` to implement on `dev`.
3. PR `dev → main`; preview deploy review; merge → production deploy.

## Open items to resolve in-stage

- Stage 2: canvas library choice (konva/fabric vs DOM + html-to-image) — pick by reuse + export fidelity. (P1 used DOM + html-to-image; confirm it holds for P2–P6.)
- Stage 3: DeepAI Toonify quality on real photos — validate the Disney love-story result during execution; the `ICartoonizer` interface keeps a swap cheap if it disappoints.
- Stage 5: anon-local-id scoping is organizational, not a real security boundary (no auth) — hardened to `auth.uid()` in Stage 6.
