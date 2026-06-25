import js from "@eslint/js";

const nodeGlobals = {
  AbortController: "readonly",
  AbortSignal: "readonly",
  atob: "readonly",
  Blob: "readonly",
  btoa: "readonly",
  Buffer: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  crypto: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  Headers: "readonly",
  process: "readonly",
  Request: "readonly",
  Response: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  structuredClone: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly"
};

export default [
  {
    ignores: [
      "node_modules/**",
      "data/**",
      "output/**",
      "dist/**",
      "dist-desktop/**",
      "release/**",
      "release-local/**",
      "scripts/openclaw-*.mjs",
      "scripts/lib/openclaw-*.mjs",
      "tests/openclaw-*.test.mjs"
    ]
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "warn",
      "no-undef": "error",
      "require-await": "warn",
      "no-empty": "warn"
    }
  },
  {
    files: ["scripts/desktop/desktop-visible-text-audit.mjs"],
    languageOptions: {
      globals: {
        CSS: "readonly",
        document: "readonly"
      }
    }
  },
  {
    files: ["tests/**/*.mjs"],
    rules: {
      "require-await": "off"
    }
  }
];
