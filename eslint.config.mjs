// TypeScript is checked by the strict application and browser-test projects.
// The TS-aware ESLint parser does not yet support this repository's TypeScript
// version, so this gate intentionally uses only ESLint's native JavaScript parser.
export default [
  // Generated builds/reports are not editable source. Dependencies are already
  // ignored by ESLint itself; do not exclude any application source or rule errors.
  { ignores: ["dist/**", "test-results/**", "playwright-report/**"] },
  {
    name: "inflamm-menu/javascript-correctness",
    files: ["eslint.config.mjs", "scripts/**/*.mjs", "tests/**/*.mjs", "tools/**/*.mjs", "public/sw.js", "worker/index.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    // Correctness only: no formatting, naming, unused-variable or environment
    // globals policy. Running this gate never applies automatic fixes.
    rules: {
      "no-dupe-args": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-dupe-else-if": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "no-unsafe-negation": "error",
      "no-async-promise-executor": "error",
      "valid-typeof": "error",
      "use-isnan": "error",
      "for-direction": "error",
      "no-debugger": "error",
      "no-cond-assign": ["error", "except-parens"],
    },
  },
];
