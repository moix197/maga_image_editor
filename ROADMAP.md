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

## Decisions (locked)

- **Stack:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. Package manager: **pnpm**.
- **Hosting:** Vercel. Auto-deploy on push to `main`. Daily work on `dev`; ship via PR `dev → main` (Vercel preview deploys on PRs). The only early "infrastructure" = a GitHub repo + Vercel link.
- **Local state first:** projects/images/editor-state persist in `localStorage` until Stage 5 swaps in Supabase.
- **Cartoonizer:** pluggable provider behind an interface. Primary = a **free** hosted image API (≤20/day fits free tiers — e.g. Google Gemini image edit / Cloudflare Workers AI). Needs only a single API key, no service to maintain. Local self-hosted model is the fallback only if no free API qualifies.
- **Cloud + auth (deferred):** Supabase free tier for persistence, then Supabase Auth (its built-in email handles magic links — no separate mailer). Introduced only after the local app is solid.

## Architecture (modular by packages, grown as needed)

pnpm workspace. Packages are added when their concern actually appears — no
speculative scaffolding.

- `apps/web` — Next.js app (thin routes/pages; UI + route handlers only).
- `packages/config` — shared tsconfig/eslint/tailwind preset. *(Stage 0)*
- `packages/editor` — canvas/overlay engine: text nodes, borders, overlays, transforms, export. Framework-light, callback-driven. *(Stage 2)*
- `packages/cartoonizer` — `ICartoonizer` interface + provider adapters. *(Stage 3)*
- `packages/db` — Supabase client, schema, queries. *(Stage 5, replaces the local store)*

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

### Stage 2 — Text & overlay editor   ·   *Setup: none*
The core editing engine (`packages/editor`). Multiple text nodes with full styling (font family/style/weight, size, color, opacity, shadow, text background + blur), drag-position, rotation, z-order, select/delete; borders & image overlays with position/scale/opacity/z-order; **export the composed image** to download. Editor state persists in the local project.
**Exit:** stack multiple text + overlays on an image, reload to restore, export a faithful PNG.

### Stage 3 — Cartoonizer (free API)   ·   *Setup: one free API key*
`packages/cartoonizer` with `ICartoonizer` + a free-API adapter. **Spike first** to confirm a free API does the Disney love-story style within free-tier limits (≤20/day); local self-host is the fallback. Wire it so the result fills the compare view's result slot. App still works without the key (cartoonize disabled, everything else functional).
**Exit:** upload a photo, get a cartoonized result in the compare view.

### Stage 4 — Preferences: theme + language (local)   ·   *Setup: none*
Light/dark theme (next-themes, partly from Stage 0) + language switch (i18n), persisted in `localStorage`. Settings UI.
**Exit:** theme + language persist across reloads.

### Stage 5 — Cloud persistence (Supabase)   ·   *Setup: Supabase project*
Introduce `packages/db`; move projects/images/editor-state/preferences from `localStorage` to Supabase (Postgres + Storage) behind the same store interface. Migration of local data optional. RLS-ready schema (even before auth, scoped by a local/anon id, tightened in Stage 6).
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

- Stage 2: canvas library choice (konva/fabric vs DOM + html-to-image) — pick by reuse + export fidelity.
- Stage 3: which free API clears the quality + free-tier bar (spike decides; local fallback ready).
- Stage 5: keep a store interface so the `localStorage` → Supabase swap is a drop-in.
