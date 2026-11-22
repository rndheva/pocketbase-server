// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Nama-nama yang disediakan Jest otomatis di file tes (tidak perlu di-import).
const jestGlobals = Object.fromEntries(
  ['describe', 'it', 'test', 'expect', 'jest', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'].map(
    (name) => [name, 'readonly'],
  ),
);

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['**/__tests__/**/*.{js,jsx,ts,tsx}', '**/*.test.{js,jsx,ts,tsx}'],
    languageOptions: { globals: jestGlobals },
  },
]);
