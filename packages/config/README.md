# @maga/config

Shared, centralized build/lint/style configuration for the MAGA Image Editor
monorepo. This package has no runtime code — it only ships configuration that
other packages and apps extend.

It is referenced via the workspace protocol:

```jsonc
// consumer package.json
"devDependencies": {
  "@maga/config": "workspace:*"
}
```

## Public API

Three deliberate export surfaces. Do not import internal files directly.

| Export | File | Purpose |
|---|---|---|
| `@maga/config/tsconfig.base.json` | `tsconfig.base.json` | Strict TypeScript base config |
| `@maga/config/eslint.config` | `eslint.config.js` | Shared flat ESLint config (Next.js + TypeScript) |
| `@maga/config/tailwind.preset` | `tailwind.preset.js` | Shared Tailwind preset (content globs, theme tokens, plugins) |

### 1. TypeScript base — `@maga/config/tsconfig.base.json`

Strict settings: `strict: true`, `target: ES2022`, `moduleResolution: bundler`,
`jsx: preserve`, plus extra safety flags (`noUncheckedIndexedAccess`,
`verbatimModuleSyntax`, etc.).

Extend it from any package's `tsconfig.json`:

```jsonc
{
  "extends": "@maga/config/tsconfig.base.json",
  "compilerOptions": {
    // package/app-specific options (paths, plugins, etc.)
  }
}
```

### 2. ESLint flat config — `@maga/config/eslint.config`

A flat-config array combining `typescript-eslint` recommended rules with
`eslint-config-next`. The consuming app must have `next` installed (which
`eslint-config-next` resolves its parser against at lint time).

```js
// apps/<app>/eslint.config.js
import maga from "@maga/config/eslint.config";

export default [
  ...maga,
  {
    // app-specific overrides
    rules: {},
  },
];
```

### 3. Tailwind preset — `@maga/config/tailwind.preset`

A Tailwind preset object with shared content globs, theme tokens, and plugins.
Each app still declares its own `content` globs scoped to its source.

```ts
// apps/<app>/tailwind.config.ts
import preset from "@maga/config/tailwind.preset";

export default {
  presets: [preset],
  content: ["./src/**/*.{ts,tsx}"],
};
```

> On Node 20.19+ / 22 the preset can also be loaded from CommonJS via
> `require("@maga/config/tailwind.preset")` thanks to stable `require(esm)`
> support; prefer the `import` form shown above.

## Conventions

- This package is `private` and never published to a registry.
- Keep its surface to the three exports above — internals stay private.
