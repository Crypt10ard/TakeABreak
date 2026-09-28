// Bundles every renderer page (JS + CSS + fonts) into dist/renderer/<page>/.
import * as esbuild from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outdir = path.join(root, 'dist', 'renderer');
const pages = ['settings', 'popover', 'island', 'break'];
const watch = process.argv.includes('--watch');

async function copyHtml() {
  for (const page of pages) {
    await mkdir(path.join(outdir, page), { recursive: true });
    await copyFile(path.join(root, 'src/renderer', page, 'index.html'), path.join(outdir, page, 'index.html'));
  }
}

const htmlPlugin = {
  name: 'html',
  setup(build) {
    build.onEnd(async (result) => {
      if (!result.errors.length) await copyHtml();
    });
  },
};

await rm(outdir, { recursive: true, force: true });

const ctx = await esbuild.context({
  absWorkingDir: root,
  entryPoints: pages.map((page) => ({ in: `src/renderer/${page}/main.js`, out: `${page}/bundle` })),
  outdir,
  bundle: true,
  format: 'iife',
  target: ['chrome120'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  loader: { '.woff2': 'file', '.woff': 'file', '.glsl': 'text' },
  assetNames: 'assets/[name]-[hash]',
  logLevel: 'info',
  plugins: [htmlPlugin],
});

if (watch) {
  await ctx.watch();
  console.log('watching renderer sources …');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
