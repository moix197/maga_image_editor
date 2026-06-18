/**
 * Shared Tailwind CSS preset for all apps in this monorepo.
 *
 * Consume from an app's Tailwind config:
 *
 *   // tailwind.config.ts
 *   import preset from "@maga/config/tailwind.preset";
 *   export default { presets: [preset], content: [...app globs] };
 *
 * Each app still declares its own `content` globs scoped to its source;
 * the globs here cover shared packages that ship class names.
 *
 * @type {import("tailwindcss").Config}
 */
const preset = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // Neutral base palette placeholder — apps layer their own tokens on top.
      colors: {},
    },
  },
  plugins: [],
};

export default preset;
