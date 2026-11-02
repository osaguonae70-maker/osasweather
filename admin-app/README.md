# OsasWeather Admin (owner only)

A separate static app with its own deployment, design and session. It talks only to the shared API's `/api/admin/*` routes.

## Pages

`admin-login`, `dashboard`, `users`, `api-monitoring` (also shows system health), `activity-logs`, `reports`, `settings`.

## Privacy model: what actually protects it

1. **Backend authorization** is the real control. Every admin route requires a valid admin session for the single owner (verified against the database on each request). Anonymous: 401. Signed-in ordinary user: 403. A discovered URL grants nothing.
2. Admin and user sessions use different cookies, tables and secrets.
3. This app is never linked from the public app. Pages send `noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`; `robots.txt` disallows everything. **None of that makes it private**; it only avoids advertising it.
4. **Add an access gateway in front of the admin site** (recommended): Vercel Deployment Protection (availability depends on your plan), Cloudflare Access, or an IP allow-list. This hides the UI itself; it is defence in depth on top of (1).

## Local development

From the repo root: `npm install && npm run serve:admin` (http://localhost:5501; `/` serves the sign-in page). The API address lives in `assets/js/config.js`.

## Deploying to Vercel

Root directory `admin-app`, environment variable `API_BASE_URL`. `vercel.json` rewrites `/` to `admin-login.html` and applies the security headers. Create the owner account on the backend with `npm run bootstrap-owner` (never through this app). Owner password changes: Settings page; recovery: `npm run bootstrap-owner -- --reset-password`.
