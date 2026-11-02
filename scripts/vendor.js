'use strict';
// Copies third-party browser assets into each app (committed, so deploys need no install step)
// and prunes Bootstrap Icons down to the glyph classes actually referenced in that app's code.
const fs = require('node:fs');
const subsetFont = require('subset-font');
const path = require('node:path');

const root = path.join(__dirname, '..');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const apps = ['weather-app', 'admin-app'];

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'vendor' || e.name === 'fonts' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else if (/\.(html|js)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

(async () => {
for (const app of apps) {
  const base = path.join(root, app, 'assets');
  for (const d of ['js/vendor', 'css', 'fonts']) fs.mkdirSync(path.join(base, d), { recursive: true });

  fs.copyFileSync(nm('chart.js', 'dist', 'chart.umd.js'), path.join(base, 'js/vendor/chart.umd.min.js'));
  fs.copyFileSync(nm('@fontsource-variable/sora/files/sora-latin-wght-normal.woff2'), path.join(base, 'fonts/sora-latin-wght-normal.woff2'));

  const used = new Set();
  for (const f of walk(path.join(root, app))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bbi-([a-z0-9-]+)/g)) used.add(m[1]);
  }
  const src = fs.readFileSync(nm('bootstrap-icons/font/bootstrap-icons.css'), 'utf8');
  const rules = [...src.matchAll(/\.bi-([a-z0-9-]+)::before\s*\{\s*content:\s*"([^"]+)";?\s*\}/g)];
  const keep = rules.filter((r) => used.has(r[1]));
  // Subset the icon font to the glyphs this app actually uses (131 KB -> a few KB).
  const text = keep.map((r) => String.fromCodePoint(parseInt(r[2].replace('\\', ''), 16))).join('');
  const subset = await subsetFont(fs.readFileSync(nm('bootstrap-icons/font/fonts/bootstrap-icons.woff2')), text, { targetFormat: 'woff2' });
  fs.writeFileSync(path.join(base, 'fonts/bootstrap-icons.woff2'), subset);
  const css = `@font-face{font-display:swap;font-family:"bootstrap-icons";src:url("../fonts/bootstrap-icons.woff2") format("woff2")}` +
    `.bi::before,[class^="bi-"]::before,[class*=" bi-"]::before{display:inline-block;font-family:bootstrap-icons!important;font-style:normal;font-weight:400!important;font-variant:normal;text-transform:none;line-height:1;vertical-align:-.125em;-webkit-font-smoothing:antialiased}` +
    keep.map((r) => `.bi-${r[1]}::before{content:"${r[2]}"}`).join('');
  fs.writeFileSync(path.join(base, 'css/bootstrap-icons.min.css'), css);
  const missing = [...used].filter((u) => !rules.some((r) => r[1] === u) && !/^(icons|\d)/.test(u));
  console.log(`${app}: ${keep.length} icons kept, font ${(subset.length / 1024).toFixed(1)} KB${missing.length ? `, UNKNOWN: ${missing.join(', ')}` : ''}`);
}
})().catch((e) => { console.error(e); process.exit(1); });
