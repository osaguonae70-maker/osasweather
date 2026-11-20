'use strict';
// Vercel build step:
// 1. Writes assets/js/config.js from the API_BASE_URL environment variable.
// 2. Appends a cache-busting version query (?v=...) to every relative ES module import
//    path across all JS files so a fresh deploy always busts browser caches.
// Only the public API address goes into the browser bundle. Never put secrets in this file or in API_BASE_URL.
const fs = require('node:fs');
const path = require('node:path');

const raw = (process.env.API_BASE_URL || '').trim().replace(/\/$/, '');
const isProd = process.env.VERCEL_ENV === 'production';
if (!raw) { console.error('API_BASE_URL is required (e.g. https://api.osasweather.com).'); process.exit(1); }
let url;
try { url = new URL(raw); } catch { console.error(`API_BASE_URL is not a valid URL: ${raw}`); process.exit(1); }
if (isProd && url.protocol !== 'https:') { console.error('API_BASE_URL must use https:// in production.'); process.exit(1); }
if (url.pathname !== '/' || url.search || url.hash) { console.error('API_BASE_URL must be an origin only (no path, query or fragment).'); process.exit(1); }

const BUILD_VERSION = process.env.BUILD_VERSION || String(Date.now());
const V = `?v=${BUILD_VERSION}`;

const configOut = `// Generated at build time from API_BASE_URL. Public configuration only.\nwindow.OSW_CONFIG = { API_BASE_URL: ${JSON.stringify(url.origin)} };\n`;
fs.writeFileSync(path.join(__dirname, 'assets', 'js', 'config.js'), configOut);
console.log(`config.js written for ${url.origin} (build ${BUILD_VERSION})`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// Rewrite relative module specifiers in import/export statements to append the build version.
// Captures: 1=keyword(import|export), 2=whitespace+everything before the first quote,
// 3=first quote, 4=spec, 5=second quote.
const importRe = /(import|export)(\s+[^'";]*?)(['"])(\.[^'"]+\.js)(['"])/g;

let changed = 0;
for (const file of walk(path.join(__dirname, 'assets', 'js'))) {
  if (file.endsWith(path.join('assets', 'js', 'config.js'))) continue;
  const src = fs.readFileSync(file, 'utf8');
  let modified = src.replace(importRe, (m, kw, middle, q1, spec, q2) => {
    if (spec.includes('?v=')) return m;
    return `${kw}${middle}${q1}${spec}${V}${q2}`;
  });
  if (modified !== src) {
    fs.writeFileSync(file, modified);
    changed++;
  }
}

// Rewrite entry <script src="assets/js/..."> tags in HTML files so the entry module
// itself is cache-busted (its imports are already rewritten above).
const scriptRe = /(<script\b[^>]*\bsrc=")(assets\/js\/[^"?]+\.js)("[^>]*>)/g;
let htmlChanged = 0;
for (const file of fs.readdirSync(__dirname, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.html')).map((e) => path.join(__dirname, e.name))) {
  const src = fs.readFileSync(file, 'utf8');
  const modified = src.replace(scriptRe, (m, pre, srcPath, post) => pre + srcPath + V + post);
  if (modified !== src) { fs.writeFileSync(file, modified); htmlChanged++; }
}
console.log(`cache-busted imports in ${changed} JS file(s) and ${htmlChanged} HTML file(s) (build ${BUILD_VERSION})`);
