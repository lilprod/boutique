// Construit un fichier HTML autonome (dist-single/index.html) sans réseau : esbuild + inline JS/CSS.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_PATH || 'esbuild');
const res = await esbuild.build({
  entryPoints: ['src/main.tsx'], bundle: true, minify: true, format: 'iife', write: false, outdir: 'out', jsx: 'automatic', target: 'es2020',
  define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'css' }, nodePaths: (process.env.NODE_PATHS || '').split(':').filter(Boolean),
});
const js = res.outputFiles.find(f => f.path.endsWith('.js')).text.replace(/<\/script/g, '<\\/script');
const css = res.outputFiles.find(f => f.path.endsWith('.css')).text;
const html = fs.readFileSync('index.html', 'utf8')
  .replace(/\s*<link rel="manifest"[^>]*>/, '').replace(/\s*<link rel="icon"[^>]*>/, '')
  .replace('</head>', `<style>${css}</style></head>`)
  .replace(/<script type="module"[^>]*><\/script>/, () => `<script>${js}</script>`);
fs.mkdirSync('dist-single', { recursive: true });
fs.writeFileSync('dist-single/index.html', html);
console.log('OK', (html.length / 1024).toFixed(0) + ' Ko');
