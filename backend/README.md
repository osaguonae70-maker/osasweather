# OsasWeather backend

Node.js + Express REST API: authentication, owner authorization, weather proxy, favourites, preferences, admin operations. PostgreSQL via `pg` with parameterized SQL only.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm start` | Start the API (`PORT`, default 5000) |
| `npm run migrate` | Apply `migrations/*.sql` (transactional, idempotent, advisory-locked) |
| `npm run bootstrap-owner` | One-time owner creation. `-- --reset-password` for owner-verified recovery |
| `npm test` | 72 tests; needs a Postgres database `osasweather_test` (or `TEST_DATABASE_URL`) |

## Layout

`src/config` env + DB pool, `routes` -> `controllers` -> `services` -> `repositories` (all SQL), `middleware` (sessions, CSRF, auth, rate limits, errors), `validators` (Zod, `.strict()`), `models` (response serializers: explicit allow-lists, so hashes cannot leak), `utils`.

## Response format

`{ "success": true, "data": ... }` or `{ "success": false, "error": { "code", "message", "details?" } }`.
State-changing requests need the `X-CSRF-Token` header (get it from `GET /api/csrf-token` or `GET /api/admin/csrf-token`; login responses rotate it).

## Endpoints

**System:** `GET /api/health` (public, minimal).

**Auth (user):** `POST /api/auth/register`, `login`, `logout`; `GET /api/auth/me`; `POST /api/auth/forgot-password`, `reset-password/validate`, `reset-password`; `PATCH /api/auth/change-password`, `profile`; `POST /api/auth/email-change`, `email-change/confirm`.

**Weather (public, rate limited):** `GET /api/weather/current|hourly|daily|overview?lat&lon&temperatureUnit&windSpeedUnit`, `GET /api/weather/search?q`. (`overview` is an addition: all three from one cached upstream call.)

**Favourites (signed in):** `GET/POST /api/favourites`, `DELETE /api/favourites/:id` (ownership enforced in SQL; others' ids return 404).

**Preferences (signed in):** `GET/PATCH /api/preferences`.

**Admin (owner only, separate cookie):** `GET /api/admin/csrf-token`; `POST /api/admin/auth/login|logout|change-password`, `GET /api/admin/auth/me`; `GET /api/admin/dashboard|users|users/:id|api-monitoring|system-health|activity-logs|reports|settings`; `PATCH /api/admin/users/:id/status`, `PATCH /api/admin/settings`; `DELETE /api/admin/users/:id` (requires the typed account email). Anonymous: 401. Ordinary signed-in user: 403.

## Environment variables

See [`.env.example`](.env.example). In production the app refuses to start with missing, short (<32), or identical secrets, or non-HTTPS frontend URLs. Rate-limit defaults can be tuned with `RL_*` variables. `DEV_LOG_RESET_LINKS=true` prints reset links to the console in development only (ignored in production).

## Notes

* Rate limiting uses an in-memory store: correct for a single instance. If you scale to several instances, move it to a shared store (e.g. Redis).
* The weather cache is in-memory per instance as well.
* `api_request_logs`, `system_error_logs` and sessions grow over time. Add a retention job (for example delete rows older than 90 days) when you go live.
