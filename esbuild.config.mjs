import esbuild from 'esbuild';

const production = process.argv[2] === 'production';
const harness = process.argv.includes('harness');

const plugin = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  sourcemap: production ? false : 'inline',
  minify: production,
  treeShaking: true,
  outfile: 'main.js',
  logLevel: 'info',
};

// A browser-only test page that mounts the editor without Obsidian.
const devHarness = {
  entryPoints: ['dev/harness.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  sourcemap: 'inline',
  outfile: 'dev/harness.js',
  logLevel: 'info',
};

if (harness) {
  await esbuild.build(devHarness);
} else if (production) {
  await esbuild.build(plugin);
} else {
  const ctx = await esbuild.context(plugin);
  await ctx.watch();
}
