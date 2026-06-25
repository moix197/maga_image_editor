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
  {
    rules: {
      // Underscore-prefixed bindings are intentionally unused (e.g. destructure-to-drop).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // React-Compiler advisories (perf/style, not correctness) — surfaced as
      // warnings so they don't block the production build.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    // Test mocks legitimately use `any`.
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
