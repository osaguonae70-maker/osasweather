'use strict';
// Vercel build step: writes assets/js/config.js from the API_BASE_URL environment variable.
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

const out = `// Generated at build time from API_BASE_URL. Public configuration only.\nwindow.OSW_CONFIG = { API_BASE_URL: ${JSON.stringify(url.origin)} };\n`;
fs.writeFileSync(path.join(__dirname, 'assets', 'js', 'config.js'), out);
console.log(`config.js written for ${url.origin}`);
