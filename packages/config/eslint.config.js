import next from "eslint-config-next";
import tseslint from "typescript-eslint";

/**
 * Shared flat ESLint config for Next.js + TypeScript apps in this monorepo.
 *
 * Consume from an app's `eslint.config.js` (the app must have `next`
 * installed, which `eslint-config-next` resolves against at lint time):
 *
 *   import maga from "@maga/config/eslint.config";
 *   export default [...maga, { rules: { ...app overrides } }];
 *
 * @type {import("eslint").Linter.Config[]}
 */
const config = [
  { ignores: ["**/.next/**", "**/dist/**", "**/build/**", "**/node_modules/**"] },
  ...tseslint.configs.recommended,
  ...next,
];

export default config;
