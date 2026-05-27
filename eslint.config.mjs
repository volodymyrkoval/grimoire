import tsparser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default [
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        project: "./tsconfig.build.json",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // obsidianmd/no-nodejs-modules sanctions a Platform.isDesktop-guarded require()
      // for desktop-only Node builtins; allow that single specifier through the
      // TS-plugin's no-require-imports rule so the two recommended rules don't conflict.
      "@typescript-eslint/no-require-imports": ["error", { allow: ["^child_process$"] }],
      // 'Refine' and 'Forge' are proper-noun feature names in Grimoire — treat them as brands to preserve casing
      "obsidianmd/ui/sentence-case": ["error", { brands: ["Refine", "Forge"] }],
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_" }
      ],
      "obsidianmd/sample-names": "off",
      "no-restricted-syntax": [
        "error",
        {
          "selector": "MethodDefinition[accessibility='private']",
          "message": "Use # private fields instead of the 'private' keyword.",
        },
        {
          "selector": "PropertyDefinition[accessibility='private']",
          "message": "Use # private fields instead of the 'private' keyword.",
        },
      ],
    },
  },
];
