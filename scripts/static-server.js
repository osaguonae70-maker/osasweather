'use strict';
// Tiny dev server for a static app folder:  node scripts/static-server.js weather-app 5500
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const [dir, port, indexFile = 'index.html'] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
const root = path.join(__dirname, '..', dir);

// Emulate the app's real vercel.json headers locally (so the strict CSP is exercised in development).
// Only dev-specific adjustments: API host -> localhost:5000; no HSTS / upgrade-insecure-requests on plain HTTP.
const extraHeaders = {};
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const all = (cfg.headers || []).find((h) => h.source === '/(.*)');
  for (const { key, value } of (all ? all.headers : [])) {
    if (key === 'Strict-Transport-Security' || key === 'Cache-Control') continue;
    extraHeaders[key] = value.replace('https://api.osasweather.com', 'http://localhost:5000').replace('; upgrade-insecure-requests', '');
  }
} catch { /* no vercel.json: serve without extra headers */ }
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/' + indexFile;
  const file = path.join(root, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { ...extraHeaders, 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(port, () => console.log(`${dir} on http://localhost:${port}`));
