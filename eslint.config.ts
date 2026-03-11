/*
This file is forked from the following MIT licensed repo:
https://github.com/JoshuaKGoldberg/create-typescript-app/blob/3b6f004793df97e6c81a04a492e32a24fdd3e11a/eslint.config.ts
*/

import convexPlugin from "@convex-dev/eslint-plugin";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import eslint from "@eslint/js";
import markdown from "@eslint/markdown";
import vitest from "@vitest/eslint-plugin";
import jsonc from "eslint-plugin-jsonc";
import n from "eslint-plugin-n";
import packageJson from "eslint-plugin-package-json";
import perfectionist from "eslint-plugin-perfectionist";
import * as regexp from "eslint-plugin-regexp";
import yml from "eslint-plugin-yml";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(
    [
      "**/*.snap",
      ".cache",
      "confect/_generated",
      "coverage",
      "convex/_generated",
      "lib",
      "node_modules",
      "pnpm-lock.yaml",
    ],
    "Global Ignores",
  ),
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  {
    extends: [
      comments.recommended,
      eslint.configs.recommended,
      n.configs["flat/recommended"],
      perfectionist.configs["recommended-natural"],
      regexp.configs["flat/recommended"],
      tseslint.configs.recommendedTypeChecked,
    ],
    files: ["**/*.{js,ts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.config.*s"],
        },
      },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        { ignorePrimitives: true },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowBoolean: true, allowNullish: true, allowNumber: true },
      ],

      "logical-assignment-operators": [
        "error",
        "always",
        { enforceForIfStatements: true },
      ],

      "n/no-missing-import": "off",
      "n/no-unsupported-features/node-builtins": [
        "error",
        { allowExperimental: true, ignores: ["import.meta.dirname"] },
      ],
      "no-useless-rename": "error",
      "object-shorthand": "error",
      "operator-assignment": "error",
      "regexp/no-unused-capturing-group": "off",

      // https://github.com/eslint-community/eslint-plugin-n/issues/472
      "n/no-unpublished-bin": "off",
    },
    settings: {
      node: { version: ">=22.0.0" },
      perfectionist: { partitionByComment: true, type: "natural" },
    },
  },
  {
    extends: [jsonc.configs["flat/recommended-with-json"]],
    files: ["**/*.json"],
  },
  {
    extends: [markdown.configs.recommended],
    files: ["**/*.md"],
    rules: {
      // https://github.com/eslint/markdown/issues/294
      "markdown/no-missing-label-refs": "off",
    },
  },
  {
    extends: [tseslint.configs.disableTypeChecked],
    files: ["**/*.md/*.ts"],
    rules: { "n/no-missing-import": "off" },
  },
  {
    files: ["confect/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  ...convexPlugin.configs.recommended,
  {
    extends: [vitest.configs.recommended],
    files: ["**/*.test.*"],
    rules: { "@typescript-eslint/no-unsafe-assignment": "off" },
    settings: { vitest: { typecheck: true } },
  },
  {
    extends: [yml.configs["flat/standard"], yml.configs["flat/prettier"]],
    files: ["**/*.{yml,yaml}"],
    rules: {
      "yml/file-extension": "error",
      "yml/sort-keys": [
        "error",
        { order: { type: "asc" }, pathPattern: "^.*$" },
      ],
      "yml/sort-sequence-values": [
        "error",
        { order: { type: "asc" }, pathPattern: "^.*$" },
      ],
    },
  },
  { extends: [packageJson.configs.recommended], files: ["package.json"] },
);
