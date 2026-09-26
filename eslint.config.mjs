import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python sidecar venv (torch ships bundled JS).
    "ml-service/.venv/**",
    "ml-service/pose/.venv/**",
    // Mock-mode dev server build (scripts/dev-mock.mjs).
    ".next-mock/**",
    ".next-demo/**",
  ]),
]);

export default eslintConfig;
