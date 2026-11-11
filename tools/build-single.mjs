// Packs the whole game into one self-contained HTML file: moonwick.html
// Every JS module becomes a data: URL listed in an import map, so the modules
// keep working exactly as they do when served as separate files.
//   node tools/build-single.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } })(join(root, 'js'));

const spec = (p) => 'mw:' + relative(root, p).split('\\').join('/');
const imports = {};
for (const p of files) {
  const dir = posix.dirname(relative(root, p));
  const src = readFileSync(p, 'utf8').replace(/(from\s+|import\s+)'(\.{1,2}\/[^']+)'/g, (m, kw, rel) => `${kw}'mw:${posix.normalize(posix.join(dir, rel))}'`);
  imports[spec(p)] = 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
}

let html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'css/style.css'), 'utf8');
const icon = 'data:image/png;base64,' + readFileSync(join(root, 'icon-192.png')).toString('base64');
html = html
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/href="icon-192.png"/g, `href="${icon}"`)
  .replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="js/main.js"></script>', () =>
    `<script type="importmap">${JSON.stringify({ imports })}</script>\n<script type="module">import 'mw:js/main.js';</script>`);
writeFileSync(join(root, 'moonwick.html'), html);
console.log(`moonwick.html: ${files.length} modules, ${(html.length / 1024).toFixed(0)} KB`);
