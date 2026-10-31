// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. ESLint flat config: typescript-eslint (type-aware), React hooks and
// fast-refresh rules. Formatting is Prettier's job. Generated code is excluded.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. And the generated coverage report.
  { ignores: ["dist", "coverage", "src/api/generated", "src/routeTree.gen.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "no-console": "error",
      // +++===+++ 2026-11-01 — Hasan Alizada — HAAL-144. Static security rules (SAST): no code from strings, no HTML
      // written into the page past React, links opening a new tab never hand it the opener.
      "no-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "No raw HTML: render React elements (Markdown goes through MarkdownView).",
        },
        {
          selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
          message: "No raw HTML: build elements instead of assigning innerHTML / outerHTML.",
        },
        {
          selector:
            "CallExpression[callee.property.name='insertAdjacentHTML'], CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
          message: "No raw HTML: insertAdjacentHTML and document.write are not used.",
        },
        {
          selector:
            "JSXOpeningElement:has(JSXAttribute[name.name='target'][value.value='_blank']):not(:has(JSXAttribute[name.name='rel'][value.value=/noopener/]))",
          message: 'A link that opens a new tab needs rel="noopener noreferrer".',
        },
      ],
      "@typescript-eslint/only-throw-error": [
        "error",
        { allow: [{ from: "package", package: "@tanstack/router-core", name: "Redirect" }] },
      ],
    },
  },
  {
    // TanStack file routes export `Route` next to a local page component; the router plugin code-splits and
    // hot-reloads them itself, so the generic fast-refresh rule does not apply here.
    files: ["src/routes/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off", "@typescript-eslint/require-await": "off" },
  },
);
