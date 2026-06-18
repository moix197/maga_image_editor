# Plan: Stage 0 — Foundation & Deploy Pipeline

**Created:** 2026-06-17
**Branch:** dev
**Status:** not started

## Context

Greenfield project with nothing but `CLAUDE.md` and `.claude/` in the working directory — no git repo, no package.json, no node_modules. The goal is to prove the full deploy loop (code → PR → Vercel preview deploy → merge → production) before any feature work begins. Every subsequent stage depends on this foundation being solid and repeatable. Stage 0 ends when an empty-but-deployed Next.js placeholder is live on Vercel and a PR from `dev` to `main` produces a Vercel preview URL. No database, no auth, no API keys, no external services beyond GitHub + Vercel. App state (any placeholder) is local only.

## Risk: medium

External services (GitHub, Vercel) must be configured manually. The branch-protection and preview-deploy wiring involves UI steps that can't be automated. Risk is medium because the technical work is straightforward, but human misconfiguration of Vercel ↔ GitHub linkage is the most likely failure point.

## Dependencies & Risks

- **No git repo yet** — Phase 0 must create it before any other phase can run.
- **GitHub repo must exist before Vercel can be connected** — Phase 0 (git init + GitHub push) must complete before Phase 3 (Vercel setup).
- **Vercel account required** — user must have or create a free Vercel account.
- **Node 20 must be available locally** — `.nvmrc` will pin it, but the machine must have it installed.
- **pnpm must be available** — all commands use pnpm; `npm i -g pnpm` or `corepack enable` needed if absent.
- **shadcn/ui `init` is interactive** — Phase 2 runs it non-interactively via flags to keep it automatable.
- **`packages/config` Tailwind preset must be resolvable** in `apps/web` at build time — workspace symlink via `pnpm` handles this, but the order of scaffold matters (Phase 1 before Phase 2).
- **No GitHub Actions CI in Stage 0** — Vercel's own build (on preview + production deploys) is the gate for now. A real CI workflow is deferred to a later hardening stage to minimize setup.
- **User-overridable assumptions** (documented here; change before executing if needed):
  - GitHub repo name: `maga_image_editor` (can be renamed; update remote URL in Phase 0)
  - Node version: `20` (change `.nvmrc` and `engines` field if needed)
  - shadcn style: `new-york`; base color: `neutral` (change `--style` / `--base-color` flags in Phase 2)
  - Vercel production branch: `main` (set in Vercel project settings during Phase 3)

## Phases

---

### Phase 0: Initialize git repo + create GitHub repo + establish branch model

**Deviation from standard Phase 0 (worktree creation):** The standard plan-sequential format requires Phase 0 to be `git worktree add`. That is impossible here — there is no git repo yet, so there is nothing to branch from and no worktree to create. This Phase 0 therefore bootstraps the repository itself: `git init`, initial commit, GitHub repo creation, push, and branch model (`main` + `dev`). This is the mandatory prerequisite for every subsequent phase and for the worktree workflow to ever apply. Mode is `hil` because creating the GitHub repo requires browser/CLI authentication that a subagent cannot perform unattended.

**Risk:** low
**Mode:** hil
**Type:** config
**Success criteria:** Remote GitHub repo exists; both `main` and `dev` branches are pushed and visible on github.com; running `git branch -a` locally shows `remotes/origin/main` and `remotes/origin/dev`.
**Commit message:** `chore: initial commit — empty repo with CLAUDE.md`

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `.gitignore` | Standard Node/Next.js gitignore (node_modules, .next, .env*, dist, .vercel) |
| keep | `CLAUDE.md` | Already exists; included in initial commit |
| keep | `.claude/` | Already exists; included in initial commit |

**Steps:**

- [ ] Confirm the machine has git installed (`git --version`)
- [ ] Confirm pnpm is available (`pnpm --version`); if not, run `corepack enable` or `npm i -g pnpm`
- [ ] Confirm Node 20 is installed (`node --version`); install via nvm/fnm if needed
- [ ] In `C:\proyectos\maga_image_editor`, run `git init`
- [ ] Create `.gitignore` with standard Node/Next.js ignores (see File changes)
- [ ] Run `git add .gitignore CLAUDE.md .claude/` then `git commit -m "chore: initial commit — empty repo with CLAUDE.md"`
- [ ] Create the GitHub repo named `maga_image_editor` (private or public — your choice) via `gh repo create maga_image_editor --source=. --remote=origin --push` **or** via the GitHub web UI then `git remote add origin https://github.com/<your-username>/maga_image_editor.git && git push -u origin main`
- [ ] Rename local branch to `main` if needed: `git branch -M main`
- [ ] Push `main` to origin: `git push -u origin main`
- [ ] Create and push `dev` branch: `git checkout -b dev && git push -u origin dev`
- [ ] Verify both branches exist on GitHub (check the repository page)
- [ ] (Optional but recommended) Set `dev` as the default branch in GitHub repo Settings → Branches

**Tests:**

No automated tests — justified because: this phase contains no application logic; it is pure VCS and hosting setup. Verification is by observing the remote state on github.com.

**Verification:**

- [ ] `git branch -a` shows `remotes/origin/main` and `remotes/origin/dev`
- [ ] GitHub repo page at `https://github.com/<username>/maga_image_editor` is accessible and shows both branches

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing — or no-tests justification accepted
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `chore: initial commit — empty repo with CLAUDE.md`
- [ ] Phase marked complete

---

### Phase 1: pnpm workspace root + packages/config scaffold

**Risk:** low
**Mode:** afk
**Type:** config
**Success criteria:** Running `pnpm typecheck` from the repo root exits 0. The `packages/config` package exports are importable via workspace protocol references. A developer cloning the repo and running `pnpm install` gets a fully resolved dependency graph with no errors.
**Commit message:** `chore: scaffold pnpm workspace root and packages/config`

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `package.json` | Workspace root: `"workspaces": ["apps/*", "packages/*"]`, `engines: {node: ">=20"}`, `packageManager: "pnpm@<version>"`, scripts: `typecheck`, `lint`, `build` delegating to `pnpm -r` |
| create | `.nvmrc` | Single line: `20` |
| create | `pnpm-workspace.yaml` | Declares `packages: ["apps/*", "packages/*"]` |
| create | `packages/config/package.json` | Name `@maga/config`, `version: "0.0.1"`, `private: true`, exports map for tsconfig, eslint, tailwind preset |
| create | `packages/config/tsconfig.base.json` | Strict TypeScript base config (strict: true, target: ES2022, moduleResolution: bundler, jsx: preserve) |
| create | `packages/config/tsconfig.json` | Minimal tsconfig for the config package itself (extends base, no emit) |
| create | `packages/config/eslint.config.js` | Shared flat ESLint config exporting rules for Next.js + TypeScript (uses `eslint-config-next` and `@typescript-eslint`) |
| create | `packages/config/tailwind.preset.js` | Tailwind preset exporting shared content globs, theme tokens, and plugins — public API for all apps |
| create | `packages/config/README.md` | Documents the three exported surfaces and how to consume them |

**Public API of `packages/config`** (deliberate exports per CLAUDE.md package-boundary rule):
- `packages/config/tsconfig.base.json` — extended by all packages via `"extends": "@maga/config/tsconfig.base.json"`
- `packages/config/eslint.config.js` — re-exported or spread into each app's `eslint.config.js`
- `packages/config/tailwind.preset.js` — consumed via `presets: [require("@maga/config/tailwind.preset")]` in each app's Tailwind config

**Steps:**

- [ ] Create `pnpm-workspace.yaml` declaring `apps/*` and `packages/*`
- [ ] Create root `package.json` with workspace config, `engines`, `packageManager`, and delegating scripts (`typecheck: pnpm -r typecheck`, `lint: pnpm -r lint`, `build: pnpm -r build`)
- [ ] Create `.nvmrc` containing `20`
- [ ] Create `packages/config/` directory and `packages/config/package.json` with name `@maga/config`, exports map pointing to the three public files
- [ ] Create `packages/config/tsconfig.base.json` with strict TypeScript settings
- [ ] Create `packages/config/tsconfig.json` that extends the base (used internally by the package)
- [ ] Create `packages/config/eslint.config.js` exporting shared flat ESLint config
- [ ] Create `packages/config/tailwind.preset.js` exporting the shared Tailwind preset (content globs, neutral color palette extension placeholder)
- [ ] Run `pnpm install` from repo root to verify workspace resolves correctly
- [ ] Add `README.md` to `packages/config/` documenting all three exported surfaces with usage examples
- [ ] Update root `README.md` (create if absent) with monorepo layout section, Node version requirement, and `pnpm install` quickstart

**Tests:**

No automated tests — justified because: `packages/config` contains no runtime logic; it is pure configuration. Correctness is verified by the TypeScript compiler and ESLint consuming it (confirmed in Phase 2 when `apps/web` extends these configs and `pnpm typecheck` passes end-to-end).

**Verification:**

- [ ] `pnpm install` from repo root exits 0 with no errors
- [ ] `ls packages/config/` shows `tsconfig.base.json`, `eslint.config.js`, `tailwind.preset.js`, `package.json`, `README.md`
- [ ] `cat pnpm-workspace.yaml` confirms both `apps/*` and `packages/*` are declared
- [ ] `.nvmrc` contains `20`

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing — or no-tests justification accepted
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `chore: scaffold pnpm workspace root and packages/config`
- [ ] Phase marked complete

---

### Phase 2: apps/web — Next.js app with Tailwind, shadcn/ui, and theme toggle

**Risk:** low
**Mode:** afk
**Type:** frontend
**Success criteria:** Running `pnpm --filter web dev` starts a local dev server; visiting `http://localhost:3000` shows a placeholder home page with a working dark/light theme toggle button, Tailwind styles applied, and no console errors. Running `pnpm --filter web build` exits 0. Use the `ui-ux-pro-max` skill (`--stack nextjs`) when implementing any UI in this phase.
**Commit message:** `feat: scaffold apps/web with Next.js, Tailwind, shadcn/ui, and theme toggle`

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `apps/web/package.json` | Name `@maga/web`, scripts (dev/build/start/lint/typecheck), deps: next, react, react-dom, next-themes; devDeps: typescript, @types/react, @types/node, tailwindcss, postcss, autoprefixer; workspace ref `"@maga/config": "workspace:*"` |
| create | `apps/web/tsconfig.json` | Extends `@maga/config/tsconfig.base.json`; adds Next.js-specific paths and plugin |
| create | `apps/web/next.config.ts` | Minimal Next.js config (App Router is default in Next.js 15; no extra flags needed) |
| create | `apps/web/tailwind.config.ts` | Extends `@maga/config/tailwind.preset`; adds `apps/web` content glob |
| create | `apps/web/postcss.config.js` | Standard Tailwind PostCSS config |
| create | `apps/web/eslint.config.js` | Spreads `@maga/config/eslint.config.js`; adds `apps/web` overrides |
| create | `apps/web/components.json` | shadcn/ui config: style `new-york`, baseColor `neutral`, tailwind CSS path, RSC true |
| create | `apps/web/src/app/layout.tsx` | Root layout: `ThemeProvider` wrapping `{children}`, Inter font, global CSS import |
| create | `apps/web/src/app/page.tsx` | Placeholder home: title "MAGA Image Editor", subtitle, theme toggle button |
| create | `apps/web/src/app/globals.css` | Tailwind directives (`@tailwind base/components/utilities`) + shadcn CSS variables for `new-york` / `neutral` |
| create | `apps/web/src/components/theme-toggle.tsx` | Client component: button that calls `useTheme()` to cycle light/dark; uses shadcn `Button` if available |
| create | `apps/web/.env.example` | Documents `NEXT_PUBLIC_APP_URL=http://localhost:3000` |
| create | `apps/web/.env.local` | (gitignored) `NEXT_PUBLIC_APP_URL=http://localhost:3000` for local dev |

**shadcn/ui initialization notes:**
- Run `pnpm dlx shadcn@latest init --yes --style new-york --base-color neutral --css-variables true` inside `apps/web/` to generate `components.json` and install shadcn dependencies.
- Run `pnpm dlx shadcn@latest add button` to add the Button component (used by theme toggle).
- shadcn writes to `src/components/ui/` — do not hand-write those files.

**Steps:**

- [ ] Create `apps/web/package.json` with correct name, scripts, dependencies, and `@maga/config` workspace reference
- [ ] Run `pnpm install` from repo root to link the new workspace package
- [ ] Create `apps/web/tsconfig.json` extending `@maga/config/tsconfig.base.json`
- [ ] Create `apps/web/tailwind.config.ts` using `@maga/config/tailwind.preset`
- [ ] Create `apps/web/postcss.config.js`
- [ ] Create `apps/web/eslint.config.js` spreading the shared config
- [ ] Inside `apps/web/`, run `pnpm dlx shadcn@latest init --yes --style new-york --base-color neutral --css-variables true` (generates `components.json`, installs shadcn deps, writes `globals.css` CSS variables)
- [ ] Inside `apps/web/`, run `pnpm dlx shadcn@latest add button` (adds Button component to `src/components/ui/`)
- [ ] Create `apps/web/next.config.ts` (minimal)
- [ ] Create `apps/web/src/app/globals.css` — add Tailwind directives at top; shadcn init may have already added CSS variables; verify both are present
- [ ] Create `apps/web/src/app/layout.tsx` with `ThemeProvider` from `next-themes` wrapping children; set `attribute="class"` and `defaultTheme="system"` on provider
- [ ] Create `apps/web/src/components/theme-toggle.tsx` as a `"use client"` component using `useTheme()` from `next-themes`; use `ui-ux-pro-max --stack nextjs` skill for implementation
- [ ] Create `apps/web/src/app/page.tsx` placeholder with project title and `<ThemeToggle />` component; use `ui-ux-pro-max --stack nextjs` skill for implementation
- [ ] Create `apps/web/.env.example` and `apps/web/.env.local` with `NEXT_PUBLIC_APP_URL`
- [ ] Ensure `.gitignore` at root includes `**/.env.local` and `.next/`
- [ ] Run `pnpm --filter web dev` and visit `http://localhost:3000` — confirm page loads, toggle works, no console errors
- [ ] Run `pnpm --filter web build` — confirm exits 0
- [ ] Run `pnpm --filter web lint` — confirm exits 0
- [ ] Run `pnpm typecheck` from root — confirm exits 0
- [ ] Update root `README.md`: add "Local development" section with `pnpm --filter web dev` command and localhost URL

**Tests:**

No automated tests — justified because: this phase scaffolds a placeholder page with no business logic. The build command (`pnpm --filter web build`) and typecheck (`pnpm typecheck`) act as the automated correctness gate for the configuration and type setup. No logic to unit-test exists yet.

**Verification:**

- [ ] `pnpm --filter web dev` starts without errors; `http://localhost:3000` renders the placeholder page
- [ ] Dark/light theme toggle button switches the `class` attribute on `<html>` between `dark` and `light`
- [ ] `pnpm --filter web build` exits 0
- [ ] `pnpm typecheck` from root exits 0
- [ ] `pnpm --filter web lint` exits 0
- [ ] `apps/web/.env.example` is committed; `apps/web/.env.local` is gitignored

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing — or no-tests justification accepted
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `feat: scaffold apps/web with Next.js, Tailwind, shadcn/ui, and theme toggle`
- [ ] Phase marked complete

---

### Phase 3: Vercel project creation + production deploy

**Risk:** medium — human must configure Vercel ↔ GitHub linkage via dashboard; misconfiguration here (wrong root directory, wrong branch) is the most likely failure mode.
**Mode:** hil
**Type:** config
**Success criteria:** Pushing to `main` triggers a Vercel production deploy automatically. The placeholder page is accessible at the Vercel-assigned URL (e.g., `https://maga-image-editor.vercel.app`). The Vercel dashboard shows the deployment as "Ready" and linked to the `main` branch. No database, auth, or API keys are configured — only `NEXT_PUBLIC_APP_URL`.
**Commit message:** `chore: add .vercelignore and document Vercel deploy setup`

**File changes:**
| Action | File | What changes |
|---|---|---|
| create | `.vercelignore` | Excludes `node_modules`, `.git`, `plans/`, `.claude/`, `**/.env.local` from Vercel uploads |
| modify | `README.md` (root) | Add "Deploy" section documenting Vercel project setup steps and production URL |

**Steps:**

- [ ] Go to [vercel.com](https://vercel.com) and log in (create account if needed)
- [ ] Click "Add New Project" → "Import Git Repository" → connect GitHub and select `maga_image_editor`
- [ ] In Vercel project settings:
  - **Root Directory:** `apps/web`
  - **Framework Preset:** Next.js (auto-detected)
  - **Build Command:** `cd ../.. && pnpm --filter web build` (or let Vercel detect; override if needed)
  - **Install Command:** `pnpm install --frozen-lockfile`
  - **Output Directory:** leave as `.next` (Vercel default for Next.js)
  - **Node.js Version:** 20.x
- [ ] Add environment variable in Vercel dashboard: `NEXT_PUBLIC_APP_URL` = your Vercel production URL (e.g., `https://maga-image-editor.vercel.app`)
- [ ] Set **Production Branch** to `main` in Vercel project → Settings → Git
- [ ] Confirm **Preview Deploys** are enabled for all branches / pull requests (Vercel default — verify it is not disabled)
- [ ] Click "Deploy" — Vercel will deploy the `main` branch
- [ ] Wait for deploy to complete; confirm the Vercel URL loads the placeholder page
- [ ] Create `.vercelignore` in repo root
- [ ] Update root `README.md` with "Deploy" section (Vercel URL, how to deploy, environment variable documentation)
- [ ] Commit `.vercelignore` and README update on `dev`: `git add .vercelignore README.md && git commit -m "chore: add .vercelignore and document Vercel deploy setup"`
- [ ] Push `dev` to origin

**Tests:**

No automated tests — justified because: this phase is pure infrastructure registration (Vercel ↔ GitHub hookup). The deploy itself is the observable proof of correctness, and it requires human interaction with external dashboards.

**Verification:**

- [ ] Vercel dashboard shows project linked to `maga_image_editor` GitHub repo
- [ ] Production deploy is "Ready" and the URL loads the placeholder page
- [ ] Vercel dashboard shows `main` as the production branch
- [ ] Vercel preview deploys are enabled for pull requests
- [ ] `NEXT_PUBLIC_APP_URL` is set as a Vercel environment variable
- [ ] No other services (database, auth, external APIs) are configured

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing — or no-tests justification accepted
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `chore: add .vercelignore and document Vercel deploy setup`
- [ ] Phase marked complete

---

### Phase 4: Open PR dev→main — prove the full loop end-to-end

**Risk:** low — this phase exercises infrastructure already built; no new code.
**Mode:** hil
**Type:** config
**Success criteria:** A PR from `dev` to `main` shows a Vercel preview deploy URL in the PR comments/checks. Merging the PR triggers a Vercel production deploy that updates the live URL. The full push-to-main → deploy loop is proven. (No GitHub Actions checks are expected — CI is deferred to a later hardening stage.)
**Commit message:** N/A — no new commit; this phase exercises existing commits via PR workflow.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `README.md` (root) | Final pass: confirm all sections are accurate and the live Vercel URL is documented |

**Steps:**

- [ ] Ensure all previous phase commits are on `dev` and pushed to origin
- [ ] Open a PR on GitHub: base `main` ← compare `dev`
- [ ] Confirm Vercel posts a "Deploy Preview" comment or check with a preview URL within ~2 minutes of PR open
- [ ] Click the Vercel preview URL — confirm placeholder page loads correctly with working dark/light toggle
- [ ] Merge the PR (squash or merge commit — your preference)
- [ ] Confirm Vercel production deploy triggers automatically after merge
- [ ] Visit the production Vercel URL — confirm it reflects the merged state
- [ ] Update root `README.md` with the final production URL if it changed, then commit on `main` (or open a follow-up PR) if any README edits were needed

**Tests:**

No automated tests — justified because: this phase is a human-operated end-to-end smoke test of the deploy pipeline itself. The observable outcomes (preview URL, production deploy) are the test.

**Verification:**

- [ ] PR from `dev` to `main` exists on GitHub
- [ ] Vercel preview URL appears on the PR and the placeholder page loads with working theme toggle
- [ ] PR is merged to `main`
- [ ] Vercel production deploy completes after merge
- [ ] Production URL (`NEXT_PUBLIC_APP_URL`) serves the placeholder page

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing — or no-tests justification accepted
- [ ] Documentation updated (see Documentation section)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: N/A — see note above
- [ ] Phase marked complete

---

### Phase 5: Final Verification

**Mode:** hil

**Overall success criteria:**

- The GitHub repo `maga_image_editor` has `main` and `dev` branches; `main` is the production branch.
- `pnpm install && pnpm --filter web dev` runs locally and serves the placeholder page at `http://localhost:3000` with a working dark/light theme toggle.
- `pnpm --filter web build`, `pnpm typecheck`, and `pnpm --filter web lint` all exit 0 from the repo root.
- A PR from `dev` to `main` produces a Vercel preview deploy URL.
- Merging to `main` triggers a Vercel production deploy; the placeholder page is live at the production URL.
- No database, no auth, no API keys, no external services beyond GitHub + Vercel are configured.
- Root `README.md` documents: monorepo layout, local dev quickstart, Vercel deploy URL, and `NEXT_PUBLIC_APP_URL` env var.
- No CLAUDE.md invariants are violated (pnpm only, thin entry points, modular packages, no circular deps, small functions, minimal dependencies).

**Steps:**

- [ ] Every preceding phase's Steps/Verification/Phase review checkboxes are ticked in this plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review of all Stage 0 changes)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent reviews the entire Stage 0 change end-to-end
- [ ] Any changes made in response to the final code-reviewer review have been reflected back into this plan file
- [ ] `pnpm --filter web build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm --filter web lint` passes
- [ ] No CLAUDE.md invariants violated (pnpm, thin entry points, modular packages, no circular deps, small functions, minimize dependencies)
- [ ] Feature tested manually: local dev server, theme toggle, production URL
- [ ] Overall success criteria above are all met
- [ ] All phase checkboxes in this document are ticked

---

## Documentation

| Change | Documentation location |
|--------|----------------------|
| Monorepo layout (apps/web, packages/config) | `README.md` (root) — "Project structure" section |
| Node 20 requirement and pnpm setup | `README.md` (root) — "Prerequisites" section |
| Local dev quickstart (`pnpm install`, `pnpm --filter web dev`) | `README.md` (root) — "Local development" section |
| `NEXT_PUBLIC_APP_URL` env var | `README.md` (root) — "Environment variables" section; `apps/web/.env.example` |
| Vercel deploy setup and production URL | `README.md` (root) — "Deploy" section |
| `packages/config` public API (tsconfig, eslint, tailwind preset) | `packages/config/README.md` |
| `.vercelignore` rationale | `README.md` (root) — "Deploy" section |

## Tests

| Phase | Logic under test | Test file |
|-------|-----------------|-----------|
| Phase 0 | No testable logic — VCS bootstrap | No test file — git remote state verified manually |
| Phase 1 | No testable logic — pure config files | No test file — verified by `pnpm install` and downstream typecheck in Phase 2 |
| Phase 2 | TypeScript types + ESLint rules + Next.js build | Verified by `pnpm --filter web build` (build-time type check) and `pnpm typecheck` and `pnpm --filter web lint`; no separate test file justified because no runtime logic exists |
| Phase 3 | No testable logic — Vercel dashboard configuration | No test file — verified by observing Vercel deploy status |
| Phase 4 | No testable logic — end-to-end pipeline smoke test | No test file — human-observed: preview URL, production deploy |

## Human Summary

**What and why:** Stage 0 builds the foundation every future stage depends on — a working deploy pipeline from local code to production. Constraint: least setup possible, local-first. No database, no auth, no API keys, no CI service. The only external setup is GitHub + Vercel (push-to-main → deploy). No features are built here; the goal is to prove that code written on `dev` can travel safely through a PR (with a Vercel preview deploy) all the way to the live Vercel production URL on `main`.

**How the phases connect:**
1. **Phase 0** creates the git repo and GitHub remote — nothing else can happen without this.
2. **Phase 1** sets up the monorepo skeleton (`pnpm` workspaces, `packages/config` with shared TypeScript/ESLint/Tailwind config) — this is the configuration backbone that `apps/web` depends on.
3. **Phase 2** scaffolds the actual Next.js app inside `apps/web`, wiring up Tailwind, shadcn/ui (new-york / neutral), and a `next-themes` dark/light toggle. First observable local artifact. UI implementation uses the `ui-ux-pro-max` skill (`--stack nextjs`).
4. **Phase 3** connects the GitHub repo to Vercel and triggers the first production deploy — first time the app is live on the internet.
5. **Phase 4** opens a real `dev → main` PR and walks through the full loop: preview deploy from Vercel, merge, production update. This is the acceptance test for the entire stage.
6. **Phase 5** is the final sign-off checklist.

**End result:** A minimal Next.js placeholder (dark/light theme toggle, Tailwind styles, shadcn/ui scaffolded) deployed to Vercel, with a proven `dev → main` PR pipeline producing both preview and production deploys. Every future stage builds on top of this without touching the pipeline setup.

**Key trade-offs and decisions:**
- **No GitHub Actions CI in Stage 0.** Rationale: minimizing setup. Vercel's own build (on every preview + production deploy) catches build/type errors without any additional YAML. A real CI workflow (lint, typecheck, test) is deferred to a later hardening stage when there is actual logic to gate on.
- **No database, auth, or API keys.** Stage 0 is purely local state. Introducing any external service here would add setup friction with zero benefit to a placeholder app.
- `packages/config` is scaffolded even though Stage 0 only has one app — this avoids a painful retrofit when the second package arrives and keeps the monorepo shape consistent from day one.
- shadcn/ui is initialized at Stage 0 rather than deferred — waiting would require re-running `init` and potentially breaking existing globals; doing it once at scaffold time is cleaner.
- Vercel deploy is wired before the PR loop (Phase 3 before Phase 4) so that the preview-deploy feature is available when the first real PR is opened in Phase 4.
- `apps/web/.env.local` is gitignored; `.env.example` is committed as documentation. Only `NEXT_PUBLIC_APP_URL` is needed at Stage 0.
