// The colour-theme rules live in styles.css, because Obsidian loads that file itself and plugins may not add <style> elements.
// They are generated from src/themes.ts and kept between two markers. `node scripts/theme-css.mjs` rewrites them; `--check` only compares.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const START = '/* ── Colour themes (generated from src/themes.ts by scripts/theme-css.mjs; do not edit) ── */';
const END = '/* ── End of colour themes ── */';

export async function themeRules() {
  const { code } = await esbuild.transform(readFileSync(`${root}src/themes.ts`, 'utf8'), { loader: 'ts', format: 'esm' });
  const themes = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return themes.themeCss();
}

export async function syncThemeCss({ check = false } = {}) {
  const file = `${root}styles.css`;
  const css = readFileSync(file, 'utf8');
  const block = `${START}\n${await themeRules()}\n${END}\n`;
  const start = css.indexOf(START);
  const end = css.indexOf(END);
  const next = start >= 0 && end > start ? css.slice(0, start) + block + css.slice(end + END.length + 1) : `${css.replace(/\n*$/, '\n')}\n${block}`;
  if (next === css) return true;
  if (!check) writeFileSync(file, next);
  return false;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = await syncThemeCss({ check: process.argv.includes('--check') });
  if (process.argv.includes('--check') && !ok) {
    console.error('styles.css is out of date. Run `node scripts/theme-css.mjs`.');
    process.exit(1);
  }
}
