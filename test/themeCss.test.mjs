import test from 'node:test';
import assert from 'node:assert/strict';
import { syncThemeCss } from '../scripts/theme-css.mjs';

test('the colour theme rules in styles.css match src/themes.ts', async () => {
  assert.equal(await syncThemeCss({ check: true }), true, 'Run `node scripts/theme-css.mjs` to regenerate them.');
});
