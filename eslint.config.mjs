import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default tseslint.config(
  { ignores: ['main.js', 'dev/harness.js', 'node_modules/**', 'scripts/**', 'vendor/**', 'test/**', 'esbuild.config.mjs', 'version-bump.mjs', 'dev/serve.mjs'] },
  ...obsidianmd.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { parserOptions: { project: './tsconfig.json' } },
  },
  // The review does not ask for these, and the editor draws in the window that opened it.
  { rules: { 'obsidianmd/prefer-active-doc': 'off' } },
);
