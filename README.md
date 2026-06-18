# MAGA Image Editor

A pnpm monorepo for the MAGA Image Editor.

## Prerequisites

- **Node.js 20+** — the version is pinned in [`.nvmrc`](./.nvmrc) (`20`) and
  enforced via the root `package.json` `engines` field (`node >=20`). Use `nvm`
  / `fnm` to switch: `nvm use`.
- **pnpm** — the package manager for this repo (see `packageManager` in the root
  `package.json`). Enable via Corepack: `corepack enable`, or install globally:
  `npm i -g pnpm`. Do not use npm or yarn.

## Quickstart

```bash
pnpm install
```

This resolves the full workspace dependency graph, including the internal
`@maga/config` package linked via the workspace protocol.

## Project structure

```
.
├── apps/                 # Applications (each is a workspace package)
│   └── web/              # Next.js app (added in a later phase)
├── packages/             # Shared internal packages
│   └── config/           # @maga/config — shared TS / ESLint / Tailwind config
├── package.json          # Workspace root (pnpm workspaces, engines, scripts)
├── pnpm-workspace.yaml   # Declares workspace globs: apps/*, packages/*
└── .nvmrc                # Pinned Node version (20)
```

Workspaces are declared in [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) as
`apps/*` and `packages/*`.

### Shared configuration — `@maga/config`

All TypeScript, ESLint, and Tailwind configuration lives in
[`packages/config`](./packages/config). Apps extend it via the workspace
protocol (`"@maga/config": "workspace:*"`). See its
[README](./packages/config/README.md) for the public API.

## Local development

```bash
pnpm --filter web dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

Run from the repo root; each delegates across every workspace package via
`pnpm -r`:

| Script | Command | What it does |
|---|---|---|
| `pnpm typecheck` | `pnpm -r typecheck` | Type-checks every package |
| `pnpm lint` | `pnpm -r lint` | Lints every package |
| `pnpm build` | `pnpm -r build` | Builds every package |
