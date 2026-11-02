# OsasWeather

**Your World. Your Weather. Your Forecast.**

A monorepo containing three independently deployable components:

| Folder | What it is | Deploys to |
|---|---|---|
| [`weather-app/`](weather-app/README.md) | Public weather app: HTML, CSS, vanilla JS, Bootstrap 5 (compiled subset), Tailwind (`tw-` prefix), Chart.js | Vercel project 1, root directory `weather-app` |
| [`admin-app/`](admin-app/README.md) | Private owner-only console. Never linked from the public app | Vercel project 2, root directory `admin-app` |
| [`backend/`](backend/README.md) | Shared Node.js / Express / PostgreSQL REST API | Render, root directory `backend` (see `render.yaml`) |

Start with [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) to deploy, or "Run everything locally" below.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Monorepo, `.gitignore`, env template, docs | Done |
| 2 | Migrations, DB layer, Express, validation, errors, health | Done, tested |
| 3 | Auth, sessions, CSRF, password reset, owner bootstrap | Done, tested |
| 4 | Branding, landing, auth pages, dashboard, themes, admin UI | Done, browser-tested |
| 5 | Open-Meteo weather + geocoding, caching, charts | Done; tested against a **mock** provider (see below) |
| 6 | Favourites, preferences, profile, verified email change | Done, tested |
| 7 | Admin dashboard, users, monitoring, logs, reports, settings | Done, tested |
| 8 | QA: API suite, browser E2E, CSP, XSS, a11y, overflow, perf | Done (results below) |
| 9 | Vercel + Render configs, deployment docs | Prepared. **Nothing has been deployed.** |

### What was verified, and how

* **Backend:** 72 automated tests (`npm test` in `backend/`) against a real PostgreSQL 16: validation, Argon2id, sessions, CSRF, CORS, rate limiting, password reset, ownership isolation, admin authorization (anonymous 401 / ordinary user 403 on **every** admin endpoint), single-owner database constraint, suspension, audit log, monitoring accuracy.
* **Browser (Chromium via Playwright), against the real stack on three separate local origins:** register / login / logout, forgot + reset password, location search with look-alike city names, favourites, units, theme and default location persisting across devices (from the database), profile edits, password change signing out other devices, the full admin console, and cross-app effects (suspending a user in the admin console cuts their live session in the public app; closing registrations in admin settings blocks sign-up in the public app).
* **Security headers:** both apps run under a strict CSP (`script-src 'self'; style-src 'self'`, no inline script or style). A sweep of every page, dialog and menu produced no violations. XSS probes with hostile names rendered as literal text.
* **Accessibility:** axe-core (WCAG 2.0/2.1 A + AA + best practices) reports no violations on any page of either app, in light and dark themes. Automated tools find only part of the problems, so do a manual keyboard and screen-reader pass before launch.
* **Responsiveness:** no horizontal overflow on any page of either app at 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px.
* **Performance (390 px phone profile, 4x CPU slowdown, 1.6 Mbps / 150 ms):** first paint about 1.8 s, forecast visible in about 3.2 s. Compressed CSS is about 26 KB, app JS about 29 KB; Chart.js (69 KB gzip) loads lazily only when the Insights section nears the viewport. This was measured against a local server; real numbers depend on your hosting and network.

### What was NOT verified (please do these)

* **A live Open-Meteo call.** The build environment could not reach the internet, so the weather integration was tested against a local mock (`scripts/mock-open-meteo.js`) that follows Open-Meteo's response format, and the request parameters were checked against Open-Meteo's published documentation and OpenAPI definition. Run the app once against the real API and compare. If a variable name was rejected you would see `UPSTREAM_ERROR` in the admin monitoring page.
* **Real email delivery.** No SMTP provider is configured here. Password-reset and email-change emails are only sent when the `EMAIL_*` variables are set. Test with a real provider.
* **Cross-domain cookies on real Vercel + Render domains.** Local ports share a site, as will `osasweather.com` / `admin.osasweather.com` / `api.osasweather.com`, but test in real Chrome, Safari and Firefox after deploying.
* **Terms and Conditions.** `terms.html` is placeholder text and says so on the page. Have it reviewed before launch.
* **Air quality and severe-weather alerts** are intentionally **not implemented** (no verified data source is integrated). The dashboard says "Not available" instead of implying safety.
* **HTMX** was listed as "where genuinely useful". It was not needed, so it is not used.

## Run everything locally

Requirements: Node 20+ and PostgreSQL 14+ with the `citext` extension (`postgresql-contrib`).

```bash
# 1. backend
cd backend && npm install && cp .env.example .env     # fill in DATABASE_URL and three different secrets
npm run migrate
npm run bootstrap-owner                                # create the single owner account (interactive)
npm run dev                                            # http://localhost:5000

# 2. frontends (separate terminals, from the repo root)
npm install                                            # tooling only: CSS build + static server
npm run serve:weather                                  # http://localhost:5500
npm run serve:admin                                    # http://localhost:5501
```

Developing offline or without hitting Open-Meteo: `node scripts/mock-open-meteo.js` and start the backend with
`WEATHER_API_BASE_URL=http://localhost:5600/v1/forecast GEOCODING_API_URL=http://localhost:5600/v1/search`.
The mock's numbers are synthetic. Never use it in production.

Rebuild static assets after changing styles or icons: `npm run build` (vendors Chart.js, fonts and a pruned icon font; compiles the Bootstrap subset and Tailwind).
The static dev server applies each app's real `vercel.json` headers (only the API host is swapped for localhost), so CSP problems show up locally.

## Architecture decisions

* **Three origins, one site.** `osasweather.com`, `admin.osasweather.com`, `api.osasweather.com` share a registrable domain, so `SameSite=Lax` host-only cookies work and no cookie weakening is needed. If you cannot use one registrable domain, reassess the auth design rather than loosening cookies.
* **Two session realms.** User and admin sessions use different cookies, tables and secrets. An admin cookie is never accepted by user routes and vice versa. A logged-in ordinary user hitting an admin route gets 403.
* **Admin identity is separate from users.** `administrators` is its own table with a unique index that permits at most one row, so a second owner is impossible even by direct SQL.
* **The server decides everything.** Every protected request re-loads the user or admin from PostgreSQL. Role, ID and status are never read from the client, so suspension is immediate.
* **No tokens in browser storage.** Sessions are HTTP-only cookies. `localStorage` holds only UI conveniences (theme choice, last viewed place, a "was signed in" hint) and never grants access.
* **Weather is proxied.** Browsers never call Open-Meteo. The backend validates input, caches (5 to 60 min, admin-adjustable), coalesces concurrent identical requests, applies timeouts, serves a flagged stale copy if the provider fails, and records each call for the monitoring page.
* **Styling convention.** Bootstrap handles layout, forms and buttons; Tailwind (prefix `tw-`, preflight off) handles fine detail; `.osw-*` / `.adm-*` classes hold design tokens and components. They cannot collide.
* **Attribution.** Weather data is by [Open-Meteo.com](https://open-meteo.com/) under CC BY 4.0, credited in the UI. Review Open-Meteo's terms for commercial use before launching commercially.
