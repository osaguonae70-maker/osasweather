'use strict';
const n = (v) => (v === null || v === undefined ? 0 : Number(v));
const rangeInterval = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' };

async function userTotals(db) {
  const r = (await db.query(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE account_status = 'active') AS active,
           count(*) FILTER (WHERE account_status = 'suspended') AS suspended,
           count(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS new_today,
           count(*) FILTER (WHERE created_at > now() - interval '7 days') AS new_7d,
           count(*) FILTER (WHERE created_at > now() - interval '30 days') AS new_30d,
           count(*) FILTER (WHERE last_login_at > now() - interval '30 days') AS logged_in_30d
      FROM users`)).rows[0];
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, n(v)]));
}

async function registrationTrend(db, days = 30) {
  const { rows } = await db.query(`
    SELECT to_char(d::date, 'YYYY-MM-DD') AS day, count(u.id)::int AS count
      FROM generate_series(current_date - ($1::int - 1) * interval '1 day', current_date, interval '1 day') d
      LEFT JOIN users u ON u.created_at::date = d::date
     GROUP BY d ORDER BY d`, [days]);
  return rows;
}

async function apiUsage(db, range = '24h') {
  const iv = rangeInterval[range] || rangeInterval['24h'];
  const { rows } = await db.query(`
    SELECT provider, endpoint,
           count(*) FILTER (WHERE NOT cache_hit) AS upstream_calls,
           count(*) FILTER (WHERE NOT cache_hit AND success) AS succeeded,
           count(*) FILTER (WHERE NOT cache_hit AND NOT success) AS failed,
           count(*) FILTER (WHERE cache_hit) AS cache_hits,
           round(avg(duration_ms) FILTER (WHERE NOT cache_hit AND success))::int AS avg_ms,
           round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE NOT cache_hit AND success))::int AS p95_ms
      FROM api_request_logs WHERE created_at > now() - $1::interval
     GROUP BY provider, endpoint ORDER BY endpoint`, [iv]);
  const by = rows.map((r) => ({
    provider: r.provider, endpoint: r.endpoint, upstreamCalls: n(r.upstream_calls), succeeded: n(r.succeeded),
    failed: n(r.failed), cacheHits: n(r.cache_hits), avgMs: r.avg_ms, p95Ms: r.p95_ms,
  }));
  const sum = by.reduce((a, r) => ({
    upstreamCalls: a.upstreamCalls + r.upstreamCalls, succeeded: a.succeeded + r.succeeded,
    failed: a.failed + r.failed, cacheHits: a.cacheHits + r.cacheHits,
  }), { upstreamCalls: 0, succeeded: 0, failed: 0, cacheHits: 0 });
  const lookups = sum.upstreamCalls + sum.cacheHits;
  return {
    range, ...sum,
    errorRate: sum.upstreamCalls ? Math.round((sum.failed / sum.upstreamCalls) * 1000) / 10 : null,
    cacheHitRate: lookups ? Math.round((sum.cacheHits / lookups) * 1000) / 10 : null,
    byEndpoint: by,
  };
}

async function apiHourlySeries(db) {
  const { rows } = await db.query(`
    SELECT to_char(h, 'YYYY-MM-DD"T"HH24:00') AS hour,
           count(l.id) FILTER (WHERE NOT l.cache_hit AND l.success)::int AS ok,
           count(l.id) FILTER (WHERE NOT l.cache_hit AND NOT l.success)::int AS failed,
           count(l.id) FILTER (WHERE l.cache_hit)::int AS cached
      FROM generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h
      LEFT JOIN api_request_logs l ON date_trunc('hour', l.created_at) = h
     GROUP BY h ORDER BY h`);
  return rows;
}

async function recentApiErrors(db, limit = 20) {
  const { rows } = await db.query(
    `SELECT endpoint, status_code, error_code, duration_ms, created_at FROM api_request_logs
      WHERE NOT success ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({ endpoint: r.endpoint, statusCode: r.status_code, errorCode: r.error_code, durationMs: r.duration_ms, createdAt: r.created_at }));
}

const USER_SORT = { created_at: 'u.created_at', last_login_at: 'u.last_login_at', full_name: 'u.full_name', email: 'u.email' };

async function listUsers(db, { search, status, sort, dir, page, limit }) {
  const where = []; const vals = [];
  if (search) {
    vals.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(u.full_name ILIKE $${vals.length} OR u.email::text ILIKE $${vals.length})`);
  }
  if (status) { vals.push(status); where.push(`u.account_status = $${vals.length}`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await db.query(`SELECT count(*) AS n FROM users u ${w}`, vals)).rows[0].n);
  const col = USER_SORT[sort] || USER_SORT.created_at; // whitelisted identifier, never user text
  const direction = dir === 'asc' ? 'ASC' : 'DESC';
  const { rows } = await db.query(`
    SELECT u.id, u.full_name, u.email, u.account_status, u.email_verified_at, u.created_at, u.last_login_at,
           (SELECT count(*) FROM favourite_locations f WHERE f.user_id = u.id)::int AS favourites
      FROM users u ${w} ORDER BY ${col} ${direction} NULLS LAST, u.id
     LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`, [...vals, limit, (page - 1) * limit]);
  return { total, rows };
}

async function userDetail(db, id) {
  const u = (await db.query(
    `SELECT id, full_name, email, account_status, email_verified_at, terms_accepted_at, created_at, updated_at, last_login_at
       FROM users WHERE id = $1`, [id])).rows[0];
  if (!u) return null;
  const prefs = (await db.query('SELECT temperature_unit, wind_speed_unit, theme, default_location FROM user_preferences WHERE user_id = $1', [id])).rows[0] || null;
  const favs = (await db.query('SELECT location_name, country FROM favourite_locations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [id])).rows;
  const sessions = Number((await db.query(
    `SELECT count(*) AS n FROM user_sessions WHERE sess ->> 'userId' = $1 AND expire > now()`, [String(id)])).rows[0].n);
  return { u, prefs, favs, sessions };
}

async function setStatus(db, id, status) {
  const { rows } = await db.query(
    `UPDATE users SET account_status = $2 WHERE id = $1 AND account_status <> $2 RETURNING id`, [id, status]);
  return rows.length > 0;
}
const findUserBrief = async (db, id) => (await db.query('SELECT id, email, account_status FROM users WHERE id = $1', [id])).rows[0] || null;
const deleteUser = async (db, id) => (await db.query('DELETE FROM users WHERE id = $1', [id])).rowCount;

async function activityLogs(db, { page, limit, action }) {
  const vals = []; let w = '';
  if (action) { vals.push(action); w = `WHERE action = $1`; }
  const total = Number((await db.query(`SELECT count(*) AS n FROM admin_activity_logs ${w}`, vals)).rows[0].n);
  const { rows } = await db.query(
    `SELECT id, action, target_type, target_id, metadata, created_at FROM admin_activity_logs ${w}
      ORDER BY created_at DESC, id LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`, [...vals, limit, (page - 1) * limit]);
  return { total, rows };
}

async function reports(db) {
  const monthly = (await db.query(`
    SELECT to_char(m, 'YYYY-MM') AS month, count(u.id)::int AS count
      FROM generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m
      LEFT JOIN users u ON date_trunc('month', u.created_at) = m GROUP BY m ORDER BY m`)).rows;
  const status = (await db.query('SELECT account_status AS status, count(*)::int AS count FROM users GROUP BY 1 ORDER BY 1')).rows;
  const themes = (await db.query('SELECT theme, count(*)::int AS count FROM user_preferences GROUP BY 1 ORDER BY 2 DESC')).rows;
  const units = (await db.query('SELECT temperature_unit AS unit, count(*)::int AS count FROM user_preferences GROUP BY 1 ORDER BY 2 DESC')).rows;
  const topLocations = (await db.query(`
    SELECT location_name AS name, country, count(*)::int AS saves FROM favourite_locations
     GROUP BY location_name, country ORDER BY saves DESC, name LIMIT 10`)).rows;
  const fav = (await db.query(`
    SELECT count(DISTINCT user_id)::int AS users_with_favourites, count(*)::int AS total_favourites FROM favourite_locations`)).rows[0];
  const weatherDaily = (await db.query(`
    SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
           count(l.id) FILTER (WHERE NOT l.cache_hit)::int AS upstream, count(l.id) FILTER (WHERE l.cache_hit)::int AS cached
      FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') d
      LEFT JOIN api_request_logs l ON l.created_at::date = d::date GROUP BY d ORDER BY d`)).rows;
  return { monthly, status, themes, units, topLocations, favourites: fav, weatherDaily };
}

module.exports = {
  userTotals, registrationTrend, apiUsage, apiHourlySeries, recentApiErrors,
  listUsers, userDetail, setStatus, findUserBrief, deleteUser, activityLogs, reports,
};
