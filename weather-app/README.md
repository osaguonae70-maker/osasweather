# OsasWeather: public app

Static site: HTML, CSS, vanilla JavaScript (ES modules), no framework and no build step beyond writing the API address.

## Pages

`index` (landing with live preview), `login`, `register`, `forgot-password`, `reset-password`, `confirm-email`, `dashboard`, `favourites`, `profile`, `settings`, `terms` (placeholder text), `404`.
There is no administrator link, page, or reference anywhere in this folder.

## Local development

From the repo root: `npm install && npm run serve:weather` (http://localhost:5500), with the backend on :5000. API address lives in `assets/js/config.js`.

## Styling convention

Bootstrap (compiled subset: reboot, grid, forms, buttons, utilities) owns layout; Tailwind (`tw-` prefix, preflight off) owns detail; `assets/css/app.css` owns tokens (light/dark) and `.osw-*` components. Do not set the same property with two systems on one element. Rebuild with `npm run build` at the repo root.

## Content-Security-Policy

`vercel.json` sets `script-src 'self'; style-src 'self'`. So: no inline `<script>`, no `style=""` attributes, no inline event handlers. Computed values are applied through the CSSOM (`data-css` -> `applyCss()`). `connect-src` lists the API origin; change `https://api.osasweather.com` in `vercel.json` if yours differs.

## Deploying to Vercel

Root directory `weather-app`, environment variable `API_BASE_URL=https://api.yourdomain.com` (origin only). The build command writes `assets/js/config.js`. See [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md). Update the host in `robots.txt` and `sitemap.xml`.

## Data and privacy notes

Theme, units and default location are stored in PostgreSQL for signed-in users. `localStorage` only caches the theme choice (to avoid a flash), the last viewed place, and a "was signed in" hint. It never holds credentials.
