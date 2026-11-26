// Bundles the extension into dist/ (load that folder unpacked in chrome://extensions).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');

await build({
  entryPoints: {
    background: 'src/background/service-worker.js',
    'neetcode-main': 'src/neetcode/main-world.js',
    content: 'src/neetcode/content.js',
    popup: 'src/popup/popup.js',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  logLevel: 'info',
});

for (const f of ['manifest.json', 'src/popup/popup.html', 'src/popup/popup.css']) {
  cpSync(f, `dist/${f.split('/').pop()}`);
}
console.log('built dist/');
