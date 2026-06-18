# Plan: Stage 5 — Cloud Persistence (Supabase)

**Created:** 2026-06-18
**Branch:** `stage-5-cloud-persistence`
**Status:** not started

## Context

Stages 1–4 delivered a fully local editor: upload image, apply text and overlay nodes, cartoonize (Stage 3), and export as PNG. Editor state lives entirely in memory (`useEditorState`) — there is no project concept and nothing survives a page reload.

Stage 5 introduces the **project** data model and persists it straight to Supabase cloud storage. There is intentionally no local project store and no interim localStorage layer; the deferred Stage 1 P3 local store was explicitly skipped, and Stage 5 bypasses it entirely in favour of direct cloud persistence.

### What a "project" is

A project is a named, time-stamped record owned by one user that bundles:
- **sourceImage** — the original uploaded image, stored as an object in Supabase Storage
- **resultImage** — the cartoonized result (Stage 3 output), stored in Supabase Storage
- **editorState** — a JSON snapshot of `EditorState` from `@maga/editor`: all `TextNode` and `OverlayNode` records with their content, position, rotation, zIndex, and styling

### No auth in Stage 5 — anon-id ownership model

Real authentication (`auth.uid()`) is deferred to Stage 6. Stage 5 scopes all cloud data by a **generated anonymous local id** (`anonId`): a random UUID created once client-side and stored in `localStorage`. This id is threaded through every database row and Storage object path.

**Security caveat — read before executing:**
> Without auth, RLS cannot truly enforce isolation. Any client that knows (or guesses) another client's `anonId` can read or write that client's data. The anon-id scoping is **organisational** — it namespaces rows and storage paths — not a security boundary. Stage 6 tightens RLS policies to `auth.uid()` and removes the permissive interim policies. This risk is accepted for Stage 5 and documented clearly in code and README.

### Write path: server Route Handlers only (no direct client DB writes)

Because `current_setting('app.anon_id', true)` can only be set reliably in a trusted server context (service role), and because the anon key alone cannot enforce row isolation, **all database reads and writes in Stage 5 go through Next.js Route Handlers that use the service-role client**. The browser client (`createBrowserClient`) is scaffolded in `@maga/db` for Stage 6 readiness but is **not used for any DB queries in Stage 5**. `useProjectSync` calls Route Handlers via `fetch`; Route Handlers call `@maga/db` service functions with the server client. This means:

- The service-role key never leaves the server.
- The `app.anon_id` config is set inside the Route Handler, validated server-side.
- A compromised browser client cannot bypass the Route Handler to write arbitrary rows.

**Trade-off accepted:** This adds one network hop (browser → Route Handler → Supabase) vs. direct client writes. Acceptable for this use case; the architectural path to Stage 6 (`auth.uid()` in the same Route Handler) is clean.

### Supabase client pattern (2025/2026)

Use `@supabase/supabase-js` + `@supabase/ssr`. The `auth-helpers-*` packages are deprecated. Two client factories:
- **Browser client** — `createBrowserClient(url, anonKey)` from `@supabase/ssr`, instantiated once per session. **Stage 5 usage: scaffolded only — not used for DB queries; reserved for Stage 6 auth session handling.**
- **Server client** — `createServerClient(url, serviceRoleKey, { cookies })` from `@supabase/ssr`, instantiated per Route Handler request using the service role key. Sets `app.anon_id` before delegating to `@maga/db` service functions.

Since there is no auth session, cookies carry no session token. The server client uses the service role key (not the anon key) so `set_config` has the privilege to set `app.anon_id` in a way RLS can read.

### New package: `packages/db` (`@maga/db`)

Per CLAUDE.md modular-packages principle, all Supabase client construction, generated types, schema constants, and query functions live in a new `packages/db` package. `apps/web` imports only from `@maga/db`'s public API; it never calls `@supabase/supabase-js` directly.

### User-overridable assumptions

- Supabase project region: `us-east-1` (change before Phase 1 if preferred)
- Storage bucket name: `project-images` (change in Phase 1 before creating the bucket — propagates to Phase 2 constants)
- Object key pattern: `{anonId}/{projectId}/{source|result}.{ext}` (change in Phase 2 `storage-helpers.ts`)
- `anonId` localStorage key: `maga:anonId` (change in Phase 2 `anon-id.ts`)

---

## Risk: high

**Why high:** First remote/cloud phase. Introduces external service dependency (Supabase), RLS policies that must be correct before data is writable, Storage upload/download flows, a new package (`@maga/db`), and UI wiring for save/load — all in one stage. The no-auth RLS model is a known, accepted limitation with a documented upgrade path. Network errors, CORS misconfig, and RLS policy mistakes are the most likely failure modes.

---

## Dependencies & Risks

- **Stage 2 (editor state)** must be complete. `EditorState` from `@maga/editor` is the unit of serialization.
- **Stage 3 (cartoonizer / resultImage)** should be complete or the `result_path` column will be NULL on all rows; Stage 5 handles this gracefully (nullable field).
- **Stage 1 P3 (localStorage project store) is intentionally skipped.** Stage 5 does not build or depend on it. This is a non-negotiable user decision.
- **Supabase project must be created manually (hil).** Phase 1 is `hil` for this reason.
- **Env vars must be set before any code runs.** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the browser; `SUPABASE_SERVICE_ROLE_KEY` for server-only Route Handlers. `.env.local` must be gitignored (already present in the root `.gitignore` for standard Next.js projects — verify before executing Phase 1). `.env.example` documents all three with placeholder values; `SERVICE_ROLE_KEY` comment explicitly warns: "server-only; NEVER prefix with NEXT_PUBLIC_ or reference in client code."
- **RLS is mandatory.** The Supabase anon key is `NEXT_PUBLIC_` (client-visible). Without RLS, any visitor with the anon key can read all rows. Stage 5 RLS uses `current_setting('app.anon_id', true) = owner` — set inside Route Handlers via `set_config` RPC using the service-role client. This is advisory-only (no auth); fully enforced in Stage 6 via `auth.uid()`.
- **`SERVICE_ROLE_KEY` is server-only.** It must never appear in any `NEXT_PUBLIC_` variable, never be imported by client components, and never be committed. Grep check added to Phase 4 Final Verification.
- **Storage RLS.** `storage.objects` requires an explicit policy; without one all uploads are rejected (Supabase default). Storage policies covered in Phase 1 migration — bucket upload policy scoped to `(storage.foldername(name))[1] = current_setting('app.anon_id', true)`.
- **Signed URL expiry.** `getSignedImageUrl` defaults to 3600s (1 hour). If a user leaves the editor open longer, image `<img>` tags may 403. The `loadProject` flow re-fetches signed URLs on every load; the editor does not cache URLs between sessions. Acceptable for Stage 5 — document in README.
- **Partial save failure (row created, upload fails).** If the Storage upload fails after a DB insert, the row will exist with a null `source_path`. `saveProject` in the Route Handler must delete the orphaned row on upload failure. Covered in Phase 3 steps.
- **Offline / Supabase unreachable.** All `fetch` calls from `useProjectSync` are wrapped in try/catch; errors surface as `error` state, never crash the editor. The editor remains fully usable for local editing when cloud calls fail — save/load buttons show an error state, nothing else breaks.
- **anonId missing or regenerated (orphaned projects).** If a user clears localStorage, their `anonId` is regenerated and they lose access to prior projects (rows exist under the old `owner` value). This is documented in the README as a known limitation; Stage 6 mitigates via real auth. No automated recovery path in Stage 5.
- **Duplicate project names.** Allowed — `name` has no uniqueness constraint. Projects are identified by UUID `id`, not name. No error on duplicate names; user may end up with two "Untitled" projects — both visible in the list.
- **Large image upload limits.** Supabase Storage free tier allows 50 MB per file. If source image exceeds this, the upload returns an error. `useProjectSync` surfaces this as an error state with a message ("Image too large for upload"). Documented in README.
- **CORS.** Supabase Storage allows `*` origins by default for anon key uploads; verify in Supabase dashboard if uploads fail.
- **`@supabase/ssr` cookie helpers require Next.js App Router.** Already in use — no compatibility risk.
- **No circular deps.** `packages/db` must not import from `apps/web`. `apps/web` imports from `@maga/db` only.
- **Stage 0 P3–P5 (Vercel deploy) is out of scope** for Stage 5 but note: any future Vercel deploy will need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` set in Vercel project settings.
- **Vitest environment for `packages/db`.** Query functions that call Supabase need either a real Supabase test project or a mock client. Phase 2 uses a mock Supabase client factory; Phase 3 uses a real browser session (hil smoke test) in addition to unit mocks.

---

## Phases

---

### Phase 0: Create worktree

> Confirm with user before running these commands.

**Steps:**
- [ ] Verify you are on `dev` branch: `git checkout dev && git pull origin dev`
- [ ] Create worktree: `git worktree add ../maga_image_editor_stage5 -b stage-5-cloud-persistence dev`
- [ ] Verify: `git worktree list`
- [ ] Install deps from worktree root: `pnpm install`
- [ ] Confirm app starts: `pnpm --filter @maga/web dev`

---

### Phase 1: Supabase project + schema + Storage + RLS + env wiring + `@maga/db` client scaffold

**Risk:** high
**Mode:** hil
**Type:** config + backend
**Success criteria:** Developer can run a one-off Node script (`packages/db/scripts/verify-connection.ts`) that inserts a row into the `projects` table with a synthetic `owner` (anon id), reads it back, then deletes it — all three operations succeed. The `project-images` Storage bucket exists. `.env.example` documents all required variables. `packages/db` builds (TypeScript compiles). `apps/web` still starts (`pnpm --filter @maga/web dev` exits without error after adding the workspace dep). No user-facing UI yet.

**Justification for infrastructure-first phase:** This phase is a pure infrastructure prerequisite (Supabase project creation, schema migration, RLS policy setup, env wiring). It has no user-facing surface. Justified exception per plan-sequential spec §"Allowed exceptions".

**Commit message:** `feat(db): scaffold @maga/db — Supabase client, projects schema, Storage bucket, RLS policies`

**Execution note:** Steps marked `[manual]` require the developer to act in the Supabase dashboard or CLI. Steps marked `[code]` are written by the subagent.

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| create | `packages/db/package.json` | Name `@maga/db`, `version: "0.0.1"`, `private: true`; exports map `"."` → `./src/index.ts`; deps: `@supabase/supabase-js`, `@supabase/ssr`; devDeps: `typescript`, `vitest`, `@maga/config` |
| create | `packages/db/tsconfig.json` | Extends `@maga/config/tsconfig.base.json`; includes `src/**/*`, `scripts/**/*` |
| create | `packages/db/vitest.config.ts` | Vitest config (node environment — no DOM needed for DB layer) |
| create | `packages/db/src/client.ts` | `getBrowserClient()` — wraps `createBrowserClient(url, anonKey)` from `@supabase/ssr`; Stage 5 usage: scaffolded only (not used for DB queries). `getServerClient(cookies)` — wraps `createServerClient(url, serviceRoleKey, { cookies })` using `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_`); used by Route Handlers for all DB operations. Both typed with `Database` type. ≤40 lines. Includes a `/* WARNING: getBrowserClient() is scaffolded for Stage 6 auth — do not use for DB queries in Stage 5 */` comment. |
| create | `packages/db/src/types.ts` | Hand-authored TypeScript types mirroring DB schema: `Project`, `ProjectInsert`, `ProjectUpdate`, `Database` (Supabase type shape) |
| create | `packages/db/src/index.ts` | Public API: re-exports `getBrowserClient`, `getServerClient`, `Project`, `ProjectInsert`, `ProjectUpdate` — nothing else |
| create | `packages/db/src/constants.ts` | `PROJECTS_TABLE = 'projects'`, `STORAGE_BUCKET = 'project-images'` — single source of truth |
| create | `packages/db/scripts/verify-connection.ts` | One-off script: instantiate service-role client; insert synthetic row; select it back; delete it; log "OK" or error. Run with `pnpm tsx packages/db/scripts/verify-connection.ts` |
| create | `packages/db/__tests__/client.test.ts` | Unit test: `getBrowserClient` called with correct URL + key returns a client object; `getServerClient` called with cookie store returns a client object. Mocks `@supabase/ssr` factory functions |
| create | `.env.example` | Documents `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` with placeholder values and inline comments; marks SERVICE_ROLE_KEY as server-only / never NEXT_PUBLIC_ |
| edit | `apps/web/package.json` | Add `"@maga/db": "workspace:*"` to dependencies |
| edit | `packages/db/README.md` | Package overview; public API table; env vars table; anon-id ownership model explanation; Stage 6 upgrade note (RLS tightening) |

**Steps:**
- [ ] [manual] Create Supabase project at supabase.com; note URL and anon key and service role key
- [ ] [manual] Create `.env.local` in the worktree root with the three env vars (never commit this file)
- [ ] [code] Confirm `.env.local` is listed in `.gitignore` (already present for standard Next.js repos; verify)
- [ ] [code] Create `.env.example` with placeholder values and comments
- [ ] [manual] In Supabase SQL Editor, run the following migration (or use the CLI `supabase migration new init_projects` and apply):
  ```sql
  -- Migration: 001_init_projects.sql
  create extension if not exists "pgcrypto";

  create table if not exists projects (
    id          uuid primary key default gen_random_uuid(),
    owner       text not null,
    name        text not null default 'Untitled',
    editor_state jsonb not null default '{"nodes": []}',
    source_path text,
    result_path text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );

  create index projects_owner_idx on projects (owner);
  create index projects_updated_at_idx on projects (updated_at desc);

  -- RLS (interim, Stage 5 — anon-id scoped, NOT auth-enforced)
  -- WARNING: owner is a plain text column; anyone who knows the anon id can read/write.
  -- Tightened to auth.uid() in Stage 6.
  alter table projects enable row level security;

  create policy "anon owner select" on projects
    for select using (owner = current_setting('app.anon_id', true));

  create policy "anon owner insert" on projects
    for insert with check (owner = current_setting('app.anon_id', true));

  create policy "anon owner update" on projects
    for update using (owner = current_setting('app.anon_id', true));

  create policy "anon owner delete" on projects
    for delete using (owner = current_setting('app.anon_id', true));
  ```
- [ ] [manual] Create Storage bucket `project-images` (private) via Supabase dashboard or SQL:
  ```sql
  insert into storage.buckets (id, name, public) values ('project-images', 'project-images', false);

  -- Storage RLS (interim, Stage 5)
  create policy "anon owner storage select" on storage.objects
    for select using (
      bucket_id = 'project-images'
      and (storage.foldername(name))[1] = current_setting('app.anon_id', true)
    );

  create policy "anon owner storage insert" on storage.objects
    for insert with check (
      bucket_id = 'project-images'
      and (storage.foldername(name))[1] = current_setting('app.anon_id', true)
    );

  create policy "anon owner storage delete" on storage.objects
    for delete using (
      bucket_id = 'project-images'
      and (storage.foldername(name))[1] = current_setting('app.anon_id', true)
    );
  ```
- [ ] [code] Create `packages/db/` directory structure: `src/`, `scripts/`, `__tests__/`
- [ ] [code] Create `packages/db/package.json` with exports map and deps (install with `pnpm --filter @maga/db install`)
- [ ] [code] Install Supabase deps: `pnpm --filter @maga/db add @supabase/supabase-js @supabase/ssr`
- [ ] [code] Create `packages/db/tsconfig.json` and `packages/db/vitest.config.ts`
- [ ] [code] Create `packages/db/src/constants.ts`
- [ ] [code] Create `packages/db/src/types.ts` with `Project`, `ProjectInsert`, `ProjectUpdate`, `Database` types matching the SQL schema
- [ ] [code] Create `packages/db/src/client.ts` with `getBrowserClient()` and `getServerClient(cookies)` factories
- [ ] [code] Create `packages/db/src/index.ts` exporting only the public surface
- [ ] [code] Create `packages/db/__tests__/client.test.ts` (mock `@supabase/ssr`)
- [ ] [code] Add `"test": "vitest run"` script to `packages/db/package.json`
- [ ] [code] Run `pnpm --filter @maga/db test` — all pass
- [ ] [code] Run `pnpm typecheck` — exits 0
- [ ] [code] Add `"@maga/db": "workspace:*"` to `apps/web/package.json` dependencies
- [ ] [code] Run `pnpm install` from root to link workspace
- [ ] [code] Confirm `pnpm --filter @maga/web dev` starts without error (no import errors from `@maga/db`)
- [ ] [code] Create `packages/db/scripts/verify-connection.ts` using service-role client (reads `process.env.SUPABASE_SERVICE_ROLE_KEY`)
- [ ] [manual] Run `pnpm tsx packages/db/scripts/verify-connection.ts` — output: "Connection OK: inserted, selected, deleted row {id}"
- [ ] [code] Create `packages/db/README.md`

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| create | `packages/db/__tests__/client.test.ts` | `getBrowserClient` instantiated with URL + key; `getServerClient` instantiated with cookie store; both return a Supabase client object (verified by checking `.from` method exists); `@supabase/ssr` factories are called with correct args |

**Verification:**
- [ ] `pnpm --filter @maga/db test` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm --filter @maga/web dev` starts without error
- [ ] `pnpm tsx packages/db/scripts/verify-connection.ts` prints "Connection OK"
- [ ] Supabase dashboard shows `projects` table with correct columns and RLS enabled
- [ ] Supabase dashboard shows `project-images` bucket exists
- [ ] `.env.local` is NOT staged in `git status`

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing (see Tests subsection above)
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(db): scaffold @maga/db — Supabase client, projects schema, Storage bucket, RLS policies`
- [ ] Phase marked complete

---

### Phase 2: Project store service in `@maga/db` — CRUD + anon-id + Storage upload/download

**Risk:** medium
**Mode:** afk
**Type:** backend + typescript
**Success criteria:** All `@maga/db` service functions pass their unit tests with a mock Supabase client; `pnpm --filter @maga/db test` exits 0; `pnpm typecheck` exits 0. No user-facing UI yet.

**Vertical slice justification:** Pure service layer with no user-facing surface — justified as the second part of the infrastructure prerequisite sequence. Phase 3 is the first user-observable slice; it cannot proceed without Phase 2's service API. The combined Phases 1+2 form one infrastructure block, and Phase 2 is intentionally kept thin (service functions only, no routing glue) so Phase 3 is the first commit that adds observable value.

**Commit message:** `feat(db): project service + image service — CRUD + Storage upload/download with anon-id scoping`

**Execution note:** All Supabase calls go through the server client from Phase 1 (`getServerClient`). The browser client is never passed to service functions. Each service function accepts `client: SupabaseClient` as first arg (injected from the Route Handler, not imported). The `anonId` is always the second argument so callsites are explicit. The Route Handler (Phase 3) calls `setAnonId(client, anonId)` before delegating to any service function — this sets `app.anon_id` as a Postgres session config using the service-role client so RLS policies can evaluate it. Service functions do **not** call `setAnonId` themselves — that is the Route Handler's responsibility, keeping service functions pure.

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| create | `packages/db/src/anon-id.ts` | `getOrCreateAnonId(): string` — reads `localStorage.getItem('maga:anonId')`; if absent, generates `crypto.randomUUID()`, writes to localStorage, returns it. Browser-only (guard with `typeof window !== 'undefined'`). ≤20 lines |
| create | `packages/db/src/project-service.ts` | Five pure async functions: `createProject`, `listProjects`, `getProject`, `updateProject`, `deleteProject`. Each accepts `client: SupabaseClient` as first arg (injected by the Route Handler — never imported or constructed inside this file). `anonId` is the second arg. Functions do **not** call `setAnonId` — the Route Handler calls it once before delegating. Returns typed `Project` or throws descriptive `Error` with message. Each ≤30 lines. |
| create | `packages/db/src/set-anon-id.ts` | `setAnonId(client: SupabaseClient, anonId: string): Promise<void>` — calls `client.rpc('set_config', { parameter: 'app.anon_id', value: anonId, is_local: true })`; throws if Supabase returns an error. ≤15 lines. Exported from `index.ts`. Route Handlers call this once per request before any service function. |
| create | `packages/db/src/image-service.ts` | `uploadImage(client, anonId, projectId, kind: 'source' \| 'result', blob: Blob, ext: string): Promise<string>` — uploads to `{anonId}/{projectId}/{kind}.{ext}` under `project-images` bucket; returns storage path. `getSignedImageUrl(client, path, expiresIn?: number): Promise<string>` — calls `storage.from('project-images').createSignedUrl(path, expiresIn ?? 3600)`. Each ≤30 lines |
| edit | `packages/db/src/index.ts` | Export `getOrCreateAnonId`, `setAnonId`, `createProject`, `listProjects`, `getProject`, `updateProject`, `deleteProject`, `uploadImage`, `getSignedImageUrl` |
| create | `packages/db/__tests__/set-anon-id.test.ts` | `setAnonId` calls `client.rpc('set_config', { parameter: 'app.anon_id', value: anonId, is_local: true })`; throws descriptive error when RPC returns an error |
| create | `packages/db/__tests__/project-service.test.ts` | Unit tests for all five project functions using a mock Supabase client; verifies correct table and column usage; verifies error is thrown when Supabase returns an error; verifies `setAnonId` is NOT called inside service functions (separation of concerns) |
| create | `packages/db/__tests__/image-service.test.ts` | Unit tests for `uploadImage` and `getSignedImageUrl` with mock storage client; verifies correct bucket and path construction; verifies error thrown when storage returns an error |
| create | `packages/db/__tests__/anon-id.test.ts` | `getOrCreateAnonId` generates UUID and writes to localStorage when absent; returns existing value on second call; does not call `crypto.randomUUID` on second call |
| edit | `packages/db/README.md` | Add "Service API" section documenting all exported functions with signatures, param descriptions, and return types |

**Steps:**
- [ ] Create `packages/db/src/anon-id.ts` — `getOrCreateAnonId()` with localStorage + `crypto.randomUUID()`
- [ ] Create `packages/db/src/set-anon-id.ts` — `setAnonId(client, anonId)` calls `set_config` RPC; throws on Supabase error; ≤15 lines
- [ ] Create `packages/db/src/project-service.ts` — five async functions; none calls `setAnonId` (Route Handler responsibility):
  - `createProject(client, anonId, name, editorState)` → `Project`
  - `listProjects(client, anonId)` → `Project[]` ordered by `updated_at desc`
  - `getProject(client, anonId, id)` → `Project | null`
  - `updateProject(client, anonId, id, patch: Partial<ProjectUpdate>)` → `Project`
  - `deleteProject(client, anonId, id)` → `void`
- [ ] Create `packages/db/src/image-service.ts` — `uploadImage` and `getSignedImageUrl`
- [ ] Update `packages/db/src/index.ts` with new exports
- [ ] Write `packages/db/__tests__/anon-id.test.ts` (uses `vi.stubGlobal('localStorage', ...)`)
- [ ] Write `packages/db/__tests__/set-anon-id.test.ts` (mock Supabase client `rpc`)
- [ ] Write `packages/db/__tests__/project-service.test.ts` (mock Supabase client with `vi.fn()` chains)
- [ ] Write `packages/db/__tests__/image-service.test.ts`
- [ ] Run `pnpm --filter @maga/db test` — all pass
- [ ] Run `pnpm typecheck` — exits 0
- [ ] Update `packages/db/README.md` with Service API section

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| create | `packages/db/__tests__/anon-id.test.ts` | Generates + stores UUID on first call; returns stored value on second call |
| create | `packages/db/__tests__/set-anon-id.test.ts` | `setAnonId` calls `rpc('set_config', ...)` with correct args; throws on error |
| create | `packages/db/__tests__/project-service.test.ts` | `createProject` inserts correct columns; `listProjects` orders by `updated_at desc`; `getProject` returns null when not found; `updateProject` patches `updated_at`; `deleteProject` calls delete with correct id; error from Supabase is re-thrown with descriptive message; `setAnonId` is NOT called inside any service function |
| create | `packages/db/__tests__/image-service.test.ts` | `uploadImage` calls `storage.from('project-images').upload` with path `{anonId}/{projectId}/{kind}.{ext}`; `getSignedImageUrl` calls `createSignedUrl` with correct path and default 3600s expiry; both throw on storage error |

**Verification:**
- [ ] `pnpm --filter @maga/db test` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] All five project-service functions and two image-service functions are exported from `packages/db/src/index.ts`
- [ ] No function body exceeds 30 lines
- [ ] `packages/db` does not import anything from `apps/web` (no circular dep)

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing (see Tests subsection above)
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(db): project service + image service — CRUD + Storage upload/download with anon-id scoping`
- [ ] Phase marked complete

---

### Phase 3: Editor Save / Load UI — end-to-end cloud persistence

**Risk:** medium
**Mode:** afk (smoke-test verification is hil)
**Type:** frontend + typescript
**Success criteria:** User opens the editor, uploads a source image, edits (adds at least one text node), clicks "Save Project", enters a name, and the project is saved to Supabase. User then reloads the page, sees a "My Projects" list, clicks their saved project, and the editor restores: source image is displayed, text nodes are in their saved positions with correct styling. The cartoonized result (if present from Stage 3) is also restored as `resultImage`. All Supabase calls go through `@maga/db` — `apps/web` never calls `@supabase/supabase-js` directly. Tests cover the hooks and Route Handler.

**Commit message:** `feat(web): save/load projects — editor state + images to Supabase Storage end-to-end`

**Execution note:** Use the `ui-ux-pro-max` skill (`--stack nextjs`) for all new UI components (`SaveProjectDialog`, `ProjectListPanel`, project list item). Keep entry points thin: page components ≤80 lines, all cloud logic in `useProjectSync` hook and the Route Handler.

**File changes:**
| Action | File | What changes |
|--------|------|--------------|
| create | `apps/web/src/app/api/projects/route.ts` | Route Handler: reads `x-anon-id` header (validated: non-empty string, else 400); instantiates server client via `getServerClient(cookies())`; calls `setAnonId(client, anonId)` once; `GET` → `listProjects(client, anonId)`; `POST` → `createProject(client, anonId, name, editorState)`, then upload source image via `uploadImage`, then `updateProject` with path — on upload failure, calls `deleteProject` to clean up orphaned row, returns 500. Returns typed JSON. ≤60 lines. |
| create | `apps/web/src/app/api/projects/[id]/route.ts` | Route Handler: reads `x-anon-id` header (validated); `getServerClient` + `setAnonId`; `GET` → `getProject(client, anonId, id)` + `getSignedImageUrl` for source/result paths; `PATCH` → `updateProject`; `DELETE` → `deleteProject`. ≤60 lines. |
| create | `apps/web/src/hooks/use-project-sync.ts` | `useProjectSync()` hook — exposes `saveProject(name, editorState, sourceBlob, resultBlob?)`, `loadProject(id)`, `listProjects()`, `deleteProject(id)`. Calls Route Handlers via `fetch` with `x-anon-id: getOrCreateAnonId()` header on every call. Never imports `@supabase/supabase-js` or `@maga/db` client factories. Manages `isSaving`, `isLoading`, `error` state. On any fetch error or non-2xx response: sets `error` state with message; does not throw. ≤80 lines; each sub-function ≤25 lines. |
| create | `apps/web/src/components/save-project-dialog.tsx` | shadcn `Dialog` — name input, Save/Cancel buttons. Accepts `onSave: (name: string) => void`, `isSaving: boolean`. No business logic. Use `ui-ux-pro-max --stack nextjs` |
| create | `apps/web/src/components/project-list-panel.tsx` | Sidebar or sheet listing saved projects (name, updatedAt). Each item has Load and Delete buttons. Accepts `projects: Project[]`, `onLoad: (id: string) => void`, `onDelete: (id: string) => void`, `isLoading: boolean`. No business logic. Use `ui-ux-pro-max --stack nextjs` |
| edit | `apps/web/src/app/editor/page.tsx` | Add "Save" button → opens `SaveProjectDialog`; add "My Projects" toggle → opens `ProjectListPanel`. Wire to `useProjectSync`. On load: call `useEditorState` with loaded `editorState`. Source image restored from signed URL. Page stays ≤80 lines |
| create | `apps/web/src/lib/blob-helpers.ts` | `canvasElementToBlob(el: HTMLElement): Promise<Blob>` — calls `html-to-image` to get PNG blob (no download, just blob); `dataUrlToBlob(dataUrl: string): Blob`. ≤25 lines total |
| create | `apps/web/src/__tests__/hooks/use-project-sync.test.ts` | Unit tests for `saveProject` (mocks `fetch`); `listProjects` (mocks `fetch`); `loadProject` (mocks `fetch`); `deleteProject` (mocks `fetch`); `getOrCreateAnonId` called and sent as `x-anon-id` header |
| create | `apps/web/src/__tests__/lib/blob-helpers.test.ts` | `dataUrlToBlob` returns a Blob of correct MIME type; `canvasElementToBlob` calls html-to-image and returns a Blob |
| edit | `apps/web/README.md` | Add "Projects" section documenting save/load workflow, anon-id model, and Stage 6 upgrade note |

**Steps:**
- [ ] Create `apps/web/src/lib/blob-helpers.ts` — `canvasElementToBlob` + `dataUrlToBlob`
- [ ] Create `apps/web/src/__tests__/lib/blob-helpers.test.ts`
- [ ] Create `apps/web/src/app/api/projects/route.ts` (`GET` + `POST`):
  - Validate `x-anon-id` header present and non-empty; return 400 if missing
  - `getServerClient(cookies())` + `setAnonId(client, anonId)`
  - `POST`: create row → upload source image → on upload failure: delete row and return 500 with message "Image upload failed; project rolled back"
  - Result image upload (if provided): separate try/catch; failure does not roll back the row (result is optional); log warning
- [ ] Create `apps/web/src/app/api/projects/[id]/route.ts` (`GET` + `PATCH` + `DELETE`):
  - Validate `x-anon-id`; return 400 if missing
  - `GET`: `getProject` + call `getSignedImageUrl` for each non-null path (1-hour expiry); return 404 if project not found or `owner` mismatch
- [ ] Create `apps/web/src/hooks/use-project-sync.ts`:
  - Every fetch call wrapped in try/catch; on network error or non-2xx: set `error` state with human-readable message, clear loading state, return early — editor continues working
  - `saveProject`: POST to `/api/projects` with `name`, `editorState` JSON, `sourceBlob`, optional `resultBlob`; on success clear `error`
  - `listProjects`: GET `/api/projects`; returns typed `Project[]`; on error: returns empty array + sets `error`
  - `loadProject(id)`: GET `/api/projects/[id]`; returns `{ project, sourceUrl, resultUrl }` with signed URLs from Route Handler; on 404: sets `error` "Project not found"
  - `deleteProject(id)`: DELETE `/api/projects/[id]`
- [ ] Create `apps/web/src/__tests__/hooks/use-project-sync.test.ts` (mock `fetch`)
- [ ] Create `apps/web/src/components/save-project-dialog.tsx` (use `ui-ux-pro-max --stack nextjs`)
- [ ] Create `apps/web/src/components/project-list-panel.tsx` (use `ui-ux-pro-max --stack nextjs`)
- [ ] Update `apps/web/src/app/editor/page.tsx`:
  - Add `useProjectSync` hook
  - "Save" button → `SaveProjectDialog`; on confirm: `saveProject(name, state, sourceBlob, resultBlob)`
  - "My Projects" button → `ProjectListPanel`; on load: restore `editorState` via `useEditorState`, restore source image URL
  - Page stays ≤80 lines (extract toolbar to `EditorToolbar` component if needed)
- [ ] Run `pnpm --filter @maga/web test` — all pass
- [ ] Run `pnpm typecheck` — exits 0
- [ ] Update `apps/web/README.md`

**Tests:**
| Action | File | What it covers |
|--------|------|----------------|
| create | `apps/web/src/__tests__/lib/blob-helpers.test.ts` | `dataUrlToBlob` returns correct Blob; `canvasElementToBlob` calls html-to-image |
| create | `apps/web/src/__tests__/hooks/use-project-sync.test.ts` | `saveProject` calls fetch with POST and `x-anon-id` header; `listProjects` calls GET; `loadProject` calls GET by id; `deleteProject` calls DELETE; `isSaving` transitions true → false; error state set on fetch failure |

**Verification:**
- [ ] `pnpm --filter @maga/web test` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] [hil] Open editor in browser; upload image; add text node; click "Save" → name dialog appears
- [ ] [hil] Enter project name and confirm → "Saved" feedback appears; no console errors
- [ ] [hil] Open Supabase dashboard → `projects` table has a new row with correct `owner`, `name`, `editor_state`
- [ ] [hil] `project-images` bucket has objects at `{anonId}/{projectId}/source.*`
- [ ] [hil] Reload the page → click "My Projects" → saved project appears in list
- [ ] [hil] Click "Load" on the project → source image is displayed; text node is at its saved position
- [ ] [hil] If Stage 3 result is present: result image is also restored
- [ ] [hil] Click "Delete" on a project → it disappears from the list; Supabase row is gone
- [ ] `apps/web` never calls `@supabase/supabase-js` directly — only through `@maga/db` factories (grep check: `grep -r "supabase-js" apps/web/src` returns empty)

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file (hil browser checks are orchestrator responsibility)
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing (see Tests subsection above)
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat(web): save/load projects — editor state + images to Supabase Storage end-to-end`
- [ ] Phase marked complete

---

### Phase 4: Final Verification

**Mode:** hil

**Overall success criteria:**

- User can open the editor, upload a source image, apply text nodes with full styling, optionally cartoonize (Stage 3), click "Save Project", name it, and the project is persisted to Supabase (Postgres row + Storage objects).
- User can reload the page, open "My Projects", see all saved projects ordered by most recently updated, and load any one of them — restoring the source image, all text/overlay nodes at their exact positions with all styling intact, and (if present) the cartoonized result.
- User can delete a project from the list — it is removed from both Postgres and Storage.
- All Supabase calls route through `@maga/db`; `apps/web` never imports `@supabase/supabase-js` directly.
- `packages/db` has a deliberate exports map — only `src/index.ts` is public.
- No CLAUDE.md invariants violated.
- All automated tests pass.

**Steps:**

- [ ] Every preceding phase's Steps / Verification / Phase review checkboxes are ticked
- [ ] Reviewer handoff prompt emitted in a fenced code block (end-to-end scope — see below)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent reviews the entire change end-to-end
- [ ] Any changes made in response to the final code-reviewer review have been reflected back into this plan file
- [ ] `pnpm --filter @maga/db test` exits 0
- [ ] `pnpm --filter @maga/web test` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `grep -r "supabase-js" apps/web/src` returns empty (no direct Supabase imports in web layer)
- [ ] `grep -r "apps/web" packages/db/src` returns empty (no circular dep)
- [ ] No CLAUDE.md invariants violated: pnpm only; thin entry points (page.tsx ≤80 lines, route.ts ≤60 lines); small focused functions (≤30 lines); reuse before reinvent; modular packages with clear public API; no circular deps; separation of concerns (fetch/transform/validate/side-effects separated); minimize deps; build our own before installing
- [ ] `grep -r "SERVICE_ROLE_KEY" apps/web/src` returns empty (service-role key never referenced in client code)
- [ ] `grep -rn "NEXT_PUBLIC_" packages/db/src` returns only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `getBrowserClient` — no other NEXT_PUBLIC_ usage
- [ ] Golden path tested manually:
  - [ ] Upload image → add 2 text nodes with styling → save as "Test Project"
  - [ ] Reload page → open "My Projects" → "Test Project" visible
  - [ ] Load "Test Project" → source image shown; both text nodes at correct positions with correct styling
  - [ ] Edit a text node → save again (update) → reload → changes persisted
  - [ ] Delete "Test Project" → gone from list; Supabase row deleted; Storage objects deleted
- [ ] Edge cases tested manually:
  - [ ] Save with no source image: graceful error ("Upload an image first") — no crash
  - [ ] Save fails (simulate network off via DevTools offline mode): error state shown in UI; editor remains usable; no partial row left in DB (rollback message shown)
  - [ ] Load project with missing Storage object (manually delete from Supabase dashboard): graceful degradation — editor opens, broken-image placeholder shown for source image, no crash, no white screen
  - [ ] Two browser tabs opened with `localStorage` cleared in one: each tab has a different `anonId`; each sees only its own projects
  - [ ] Save project with duplicate name ("Untitled"): both rows created with distinct UUIDs; both appear in list; no error
  - [ ] localStorage cleared mid-session: `getOrCreateAnonId()` generates a new UUID; old projects no longer visible; no crash; error state explains "Your projects are linked to your browser — clearing browser data may lose access"
  - [ ] Sign URL expiry: load a project, wait and reload `<img>` manually with DevTools network throttled (or mock expiry in test) — stale URL returns 403; note: Stage 5 does not auto-refresh URLs mid-session (documented limitation, Stage 6 mitigation)
- [ ] Overall success criteria met
- [ ] All phase checkboxes in this document are ticked

```
End-to-end review of stage-5-cloud-persistence. Branch: stage-5-cloud-persistence. Scope: all new and modified files under packages/db/ and apps/web/src/ on this branch.

Check:
(1) packages/db has a deliberate exports map — only src/index.ts is public; no internal files importable by name.
(2) packages/db does not import from apps/web — no circular dependency.
(3) apps/web never imports @supabase/supabase-js directly — all Supabase access via @maga/db factories (grep: "supabase-js" in apps/web/src returns empty).
(4) setAnonId is called once per Route Handler request BEFORE any service function — NOT inside service functions. Verify project-service.ts does not call setAnonId.
(5) Route Handlers use getServerClient (service-role key), never getBrowserClient, for DB operations.
(6) SUPABASE_SERVICE_ROLE_KEY is never referenced in any NEXT_PUBLIC_ variable, client component, or hook (grep: "SERVICE_ROLE_KEY" in apps/web/src returns empty).
(7) anon-id RLS caveat documented in code comments (client.ts getBrowserClient warning comment) and packages/db/README.md.
(8) Route Handlers validate x-anon-id header and return 400 if missing or empty.
(9) POST /api/projects: on Storage upload failure, orphaned DB row is deleted before returning 500.
(10) useProjectSync: all fetch calls wrapped in try/catch; errors set error state, never crash the editor; editor remains usable when Supabase is unreachable.
(11) Thin entry points: page.tsx ≤80 lines; route.ts files ≤60 lines; all cloud logic in useProjectSync and @maga/db.
(12) SaveProjectDialog and ProjectListPanel accept callbacks only — no business logic, no direct Supabase calls.
(13) blob-helpers.ts ≤25 lines; separates blob conversion from editor state.
(14) Each function in packages/db/src is ≤30 lines (except setAnonId ≤15 lines).
(15) pnpm --filter @maga/db test exits 0.
(16) pnpm --filter @maga/web test exits 0.
(17) pnpm typecheck exits 0.
(18) No dead code, no commented-out blocks.
(19) CLAUDE.md invariants: pnpm, thin entry points, small focused functions, reuse before reinvent, no speculative abstractions, separation of concerns, minimize deps, build own before installing.
(20) .env.example documents all three env vars with SERVER_ROLE_KEY warning comment; .env.local is gitignored.
(21) Storage object paths follow {anonId}/{projectId}/{kind}.{ext} consistently in uploadImage and all path references.
(22) getSignedImageUrl default expiry is 3600s; documented in README as a known limitation (no mid-session refresh in Stage 5).
(23) Duplicate project names allowed — no uniqueness constraint; verified no error thrown on duplicate name save.
```

---

## Documentation

| Change | Documentation location |
|--------|------------------------|
| `@maga/db` public API, client factories, env vars | `packages/db/README.md` — created in Phase 1, extended in Phase 2 |
| Anon-id ownership model + Stage 6 upgrade path | `packages/db/README.md` — "Ownership Model" section; caveat: anonId is organisational not a security boundary |
| `setAnonId` usage pattern (Route Handler responsibility, not service layer) | `packages/db/README.md` — "Service API" section (Phase 2) |
| Project service functions (signatures, params, returns) | `packages/db/README.md` — "Service API" section (Phase 2) |
| Storage bucket structure, object key pattern, signed URL expiry limitation | `packages/db/README.md` — "Storage" section (Phase 2) |
| `getBrowserClient` Stage 5 scaffolding-only caveat | `packages/db/README.md` — "Client Factories" section (Phase 1) |
| `useProjectSync` hook API, error state handling, offline behavior | `apps/web/README.md` — "Hooks" section (Phase 3) |
| Save / Load workflow, known limitations (anonId reset, signed URL expiry, duplicate names) | `apps/web/README.md` — "Projects" section (Phase 3) |
| Required env vars (`.env.example`) with `SERVICE_ROLE_KEY` server-only warning | `.env.example` — created Phase 1 |
| Route Handler API (GET/POST/PATCH/DELETE /api/projects) | `apps/web/README.md` — "API Routes" section (Phase 3) |

---

## Tests

| Phase | Logic under test | Test file |
|-------|-----------------|-----------|
| 1 | `getBrowserClient` / `getServerClient` factory args | `packages/db/__tests__/client.test.ts` |
| 2 | `getOrCreateAnonId` — generate + store on first call; return stored on second | `packages/db/__tests__/anon-id.test.ts` |
| 2 | `setAnonId` — calls `rpc('set_config', ...)` with correct args; throws on error | `packages/db/__tests__/set-anon-id.test.ts` |
| 2 | `createProject` / `listProjects` / `getProject` / `updateProject` / `deleteProject` — correct table, columns, error handling; `setAnonId` NOT called inside service functions | `packages/db/__tests__/project-service.test.ts` |
| 2 | `uploadImage` path construction; `getSignedImageUrl` expiry arg; both throw on storage error | `packages/db/__tests__/image-service.test.ts` |
| 3 | `dataUrlToBlob` returns correct Blob; `canvasElementToBlob` calls html-to-image | `apps/web/src/__tests__/lib/blob-helpers.test.ts` |
| 3 | `useProjectSync` — fetch calls with correct method, headers, body; `x-anon-id` header sent; state transitions (`isSaving`, `isLoading`); error state set on network failure / non-2xx without crashing | `apps/web/src/__tests__/hooks/use-project-sync.test.ts` |

---

## Human Summary

Stage 5 is the first cloud-connected stage. It introduces the project data model and wires the editor to Supabase from the start — no intermediate localStorage layer.

**Phase 1 (hil)** creates the Supabase project, runs the SQL migration to create the `projects` table with RLS enabled, creates the `project-images` Storage bucket with its own RLS policies, and wires env vars. It also scaffolds the new `packages/db` (`@maga/db`) package with Supabase client factories. The developer verifies the connection with a one-off script. Nothing user-facing lands yet — this phase is a justified infrastructure prerequisite.

**Phase 2** builds the full service layer inside `packages/db`: five project CRUD functions and two image storage helpers, all scoped by `anonId`. Every function is ≤30 lines, pure async, and client-injected (no global singletons). The anon-id RLS model is implemented here — each DB call sets `app.anon_id` as a Postgres session variable so RLS policies can evaluate it. Unit tests cover all functions with a mock Supabase client.

**Phase 3** wires everything to the editor UI: a Route Handler pair (`/api/projects` + `/api/projects/[id]`), a `useProjectSync` hook that drives save/load/list/delete via fetch, and two new UI components (`SaveProjectDialog`, `ProjectListPanel`). The user can save a named project (editor state + source/result images), reload the page, and restore it exactly. The cartoonized result from Stage 3 is included when present.

**Key architectural decisions:**
- All Supabase access is encapsulated in `packages/db`. `apps/web` never imports `@supabase/supabase-js` directly — only `@maga/db` factories. This mirrors the `packages/editor` pattern from Stage 2.
- **All DB writes and reads go through server Route Handlers using the service-role client.** The browser client is scaffolded but unused in Stage 5. This ensures `SERVICE_ROLE_KEY` never leaves the server and that `set_config('app.anon_id')` runs in a trusted context where RLS can evaluate it. Direct client DB writes (which would require the anon key and can't reliably set `app.anon_id`) are explicitly prohibited.
- `setAnonId` is the Route Handler's responsibility — called once per request before delegating to service functions. Service functions are pure: they accept an injected client, do not call `setAnonId`, and have no side effects beyond the Supabase call.
- The anon-id scoping model is intentionally permissive. It namespaces rows and Storage paths but cannot enforce isolation without auth. Documented in code and README. Stage 6 replaces `owner = current_setting('app.anon_id', true)` with `owner = auth.uid()` in all RLS policies.
- Images are stored in Supabase Storage (not base64 in Postgres). Signed URLs fetched at load time (1-hour expiry); URL refresh mid-session is a Stage 5 known limitation.
- Partial save failure is handled: if Storage upload fails after a DB row is created, the Route Handler deletes the orphaned row before returning 500.
- The editor degrades gracefully when Supabase is unreachable — `useProjectSync` surfaces errors in state but never crashes the editor. All local editing continues to work.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only; never appears in client-side code or `NEXT_PUBLIC_` variables.
