'use strict';

const IGNORED = ['node_modules/**', 'dist/**', 'scratch/**', '.test-output/**', '.worktrees/**'];

const nodeGlobals = {
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  clearImmediate: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  exports: 'writable',
  global: 'readonly',
  module: 'writable',
  process: 'readonly',
  require: 'readonly',
  setImmediate: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly'
};

const browserGlobals = {
  Blob: 'readonly',
  Chart: 'readonly',
  CSS: 'readonly',
  DOMParser: 'readonly',
  Document: 'readonly',
  Element: 'readonly',
  Event: 'readonly',
  File: 'readonly',
  FileList: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLElement: 'readonly',
  HTMLSelectElement: 'readonly',
  Image: 'readonly',
  IntersectionObserver: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  MutationObserver: 'readonly',
  Node: 'readonly',
  NodeList: 'readonly',
  Option: 'readonly',
  openAddPaymentModal: 'readonly',
  openExtendStayModal: 'readonly',
  ResizeObserver: 'readonly',
  TextDecoder: 'readonly',
  XLSX: 'readonly',
  alert: 'readonly',
  cancelAnimationFrame: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  confirm: 'readonly',
  console: 'readonly',
  document: 'readonly',
  event: 'readonly',
  fetch: 'readonly',
  getComputedStyle: 'readonly',
  history: 'readonly',
  localStorage: 'readonly',
  location: 'readonly',
  navigator: 'readonly',
  performance: 'readonly',
  prompt: 'readonly',
  requestAnimationFrame: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  sessionStorage: 'readonly',
  window: 'readonly'
};

module.exports = [
  { ignores: IGNORED },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs'
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'after-used', caughtErrors: 'none' }],
      'no-redeclare': 'error'
    }
  },
  {
    files: ['**/*.js'],
    ignores: ['dashboard.js', 'dashboard-*.js', 'login.js', 'renderer.js', 'hotkeys.js', 'command-palette.js'],
    languageOptions: { globals: nodeGlobals }
  },
  {
    files: ['dashboard.js', 'dashboard-*.js', 'login.js', 'renderer.js', 'hotkeys.js', 'command-palette.js'],
    languageOptions: { sourceType: 'script', globals: browserGlobals }
  },
  {
    // Playwright evaluates these callbacks in the page's browser context.
    files: ['tests/e2e-sandbox/**/*.spec.js'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly'
      }
    }
  }
];
