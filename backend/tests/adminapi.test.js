'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, resetDb, client, registerAndLogin, validUser } = require('./helpers');
const { bootstrapOwner } = require('../src/services/ownerBootstrap');
const { forecastPayload, json, fakeFetch } = require('./fixtures');

const OWNER = { email: 'owner@osasweather.test', password: 'Owner-Passw0rd-123' };

describe('admin API', () => {
  let ctx;
  before(async () => { ctx = await setup({ fetchImpl: fakeFetch(async () => json(forecastPayload())) }); });
  after(async () => { await ctx.pool.end(); });
  beforeEach(async () => { await resetDb(ctx.pool); await bootstrapOwner(ctx.pool, OWNER); ctx.sent.length = 0; });

  const user = () => client(ctx.app, ctx.config);
  const loggedInAdmin = async () => { const a = client(ctx.app, ctx.config, '/admin'); await a.post('/auth/login', OWNER); return a; };
  const mk = async (n) => { const c = user(); const r = await registerAndLogin(c, n); return { c, ...r.u, id: (await ctx.pool.query('SELECT id FROM users WHERE email=$1', [r.u.email])).rows[0].id }; };

  const ENDPOINTS = [
    ['get', '/dashboard'], ['get', '/users'], ['get', '/users/7f1ad8d4-9a65-4c3e-8b8a-3f0b7a6b9c11'],
    ['patch', '/users/7f1ad8d4-9a65-4c3e-8b8a-3f0b7a6b9c11/status', { status: 'suspended' }],
    ['del', '/users/7f1ad8d4-9a65-4c3e-8b8a-3f0b7a6b9c11', { confirmEmail: 'a@b.co' }],
    ['get', '/api-monitoring'], ['get', '/system-health'], ['get', '/activity-logs'], ['get', '/reports'],
    ['get', '/settings'], ['patch', '/settings', { registrationsOpen: false }],
  ];

  test('EVERY admin endpoint: anonymous -> 401, ordinary logged-in user -> 403', async () => {
    const anon = client(ctx.app, ctx.config, '/admin');
    const u = user(); await registerAndLogin(u);
    for (const [m, p, body] of ENDPOINTS) {
      const r1 = m === 'get' ? await anon.get(p) : await anon[m](p, body);
      assert.equal(r1.status, 401, `anon ${m} ${p}`);
      // the ordinary user's cookie goes to the admin routes (same API host), with the admin origin header
      const req = u.agent[m === 'del' ? 'delete' : m](`/api/admin${p}`).set('Origin', ctx.config.adminFrontendUrl);
      const tok = (await anon.csrf(), anon.state.token);
      const r2 = await (m === 'get' ? req : req.set('X-CSRF-Token', tok).send(body));
      assert.ok([401, 403].includes(r2.status), `user ${m} ${p} -> ${r2.status}`);
      if (m === 'get') assert.equal(r2.status, 403, `user GET ${p}`);
    }
  });

  test('dashboard statistics match the database exactly (no invented numbers)', async () => {
    const a1 = await mk(1); await mk(2); await mk(3);
    await ctx.pool.query(`UPDATE users SET account_status='suspended' WHERE id=$1`, [a1.id]);
    await ctx.pool.query(`UPDATE users SET created_at = now() - interval '10 days' WHERE email='user2@example.com'`);
    await ctx.pool.query(`INSERT INTO api_request_logs (provider, endpoint, success, cache_hit, duration_ms) VALUES
      ('open-meteo','forecast',true,false,120),('open-meteo','forecast',false,false,30),('open-meteo','forecast',true,true,0),('open-meteo','geocoding',true,false,80)`);
    const admin = await loggedInAdmin();
    const d = (await admin.get('/dashboard')).body.data;
    assert.equal(d.users.total, 3); assert.equal(d.users.active, 2); assert.equal(d.users.suspended, 1);
    assert.equal(d.users.new_7d, 2); assert.equal(d.users.new_30d, 3); assert.equal(d.users.logged_in_30d, 3);
    assert.equal(d.registrationTrend.length, 30);
    assert.equal(d.registrationTrend.reduce((s, x) => s + x.count, 0), 3);
    assert.equal(d.weatherApi24h.upstreamCalls, 3); assert.equal(d.weatherApi24h.failed, 1);
    assert.equal(d.weatherApi24h.errorRate, 33.3); assert.equal(d.weatherApi24h.cacheHits, 1);
    assert.equal(d.health.database, 'up'); assert.equal(d.health.backend, 'up');
  });

  test('user list: search, status filter, sort, pagination, and SQL-injection safety', async () => {
    for (let i = 1; i <= 5; i += 1) await mk(i);
    await ctx.pool.query(`UPDATE users SET account_status='suspended' WHERE email IN ('user2@example.com','user4@example.com')`);
    const admin = await loggedInAdmin();
    let r = (await admin.get('/users?limit=2&page=1&sort=email&dir=asc')).body.data;
    assert.equal(r.pagination.total, 5); assert.equal(r.pagination.pages, 3);
    assert.deepEqual(r.users.map((u) => u.email), ['user1@example.com', 'user2@example.com']);
    r = (await admin.get('/users?status=suspended')).body.data;
    assert.equal(r.users.length, 2);
    r = (await admin.get('/users?search=USER3')).body.data;
    assert.equal(r.users.length, 1);
    assert.equal((await admin.get(`/users?search=${encodeURIComponent("%' OR '1'='1")}`)).body.data.users.length, 0);
    assert.equal((await admin.get(`/users?search=${encodeURIComponent('%')}`)).body.data.users.length, 0, 'LIKE wildcards are escaped');
    assert.equal((await admin.get('/users?sort=password_hash')).status, 422);
    assert.equal((await admin.get('/users?limit=1000')).status, 422);
    assert.ok(!JSON.stringify(r).match(/argon2|password/i));
  });

  test('user detail exposes no hashes or session ids', async () => {
    const u = await mk(1); await u.c.post('/favourites', { name: 'Abuja', country: 'Nigeria', latitude: 9.07, longitude: 7.39 });
    const admin = await loggedInAdmin();
    const res = await admin.get(`/users/${u.id}`);
    assert.equal(res.status, 200);
    const d = res.body.data.user;
    assert.equal(d.activeSessions, 1); assert.equal(d.favourites[0].name, 'Abuja'); assert.equal(d.preferences.theme, 'system');
    assert.ok(!JSON.stringify(res.body).match(/argon2|password|sid|osw_/i));
    assert.equal((await admin.get('/users/7f1ad8d4-9a65-4c3e-8b8a-3f0b7a6b9c11')).status, 404);
    assert.equal((await admin.get('/users/not-a-uuid')).status, 422);
  });

  test('suspension: immediate lockout of live sessions + login blocked; reactivation restores; both audited', async () => {
    const u = await mk(1);
    assert.equal((await u.c.get('/favourites')).status, 200);
    const admin = await loggedInAdmin();
    const s = await admin.patch(`/users/${u.id}/status`, { status: 'suspended' });
    assert.equal(s.status, 200); assert.equal(s.body.data.changed, true);
    assert.equal((await u.c.get('/favourites')).status, 401, 'session already destroyed');
    const blocked = await user().post('/auth/login', { email: u.email, password: u.password });
    assert.equal(blocked.status, 403); assert.equal(blocked.body.error.code, 'ACCOUNT_SUSPENDED');
    assert.equal((await admin.patch(`/users/${u.id}/status`, { status: 'suspended' })).body.data.changed, false, 'idempotent');
    assert.equal((await admin.patch(`/users/${u.id}/status`, { status: 'active' })).status, 200);
    assert.equal((await user().post('/auth/login', { email: u.email, password: u.password })).status, 200);
    const logs = (await admin.get('/activity-logs')).body.data.logs.map((l) => l.action);
    assert.deepEqual(logs.filter((a) => a.startsWith('user.')), ['user.reactivate', 'user.suspend']);
    assert.equal((await admin.patch(`/users/${u.id}/status`, { status: 'banned' })).status, 422);
    assert.equal((await admin.patch(`/users/${u.id}/status`, { status: 'active', role: 'admin' })).status, 422);
  });

  test('delete needs the typed email, removes all related data, and is audited', async () => {
    const u = await mk(1); await u.c.post('/favourites', { name: 'Abuja', country: 'NG', latitude: 9.07, longitude: 7.39 });
    const admin = await loggedInAdmin();
    assert.equal((await admin.del(`/users/${u.id}`, { confirmEmail: 'wrong@example.com' })).status, 422);
    assert.equal((await ctx.pool.query('SELECT count(*) FROM users')).rows[0].count, '1', 'nothing deleted yet');
    assert.equal((await admin.del(`/users/${u.id}`, { confirmEmail: u.email.toUpperCase() })).status, 200);
    for (const t of ['users', 'user_preferences', 'favourite_locations']) assert.equal((await ctx.pool.query(`SELECT count(*) FROM ${t}`)).rows[0].count, '0', t);
    assert.equal((await ctx.pool.query(`SELECT count(*) FROM user_sessions WHERE sess->>'userId'=$1`, [u.id])).rows[0].count, '0');
    assert.equal((await u.c.get('/favourites')).status, 401);
    const del = (await admin.get('/activity-logs?action=user.delete')).body.data.logs[0];
    assert.equal(del.targetType, 'user'); assert.equal(del.targetId, u.id);
    assert.equal((await admin.del(`/users/${u.id}`, { confirmEmail: u.email })).status, 404);
  });

  test('API monitoring reports genuine measurements for the chosen range', async () => {
    await ctx.pool.query(`INSERT INTO api_request_logs (provider, endpoint, success, cache_hit, duration_ms, error_code, status_code, created_at) VALUES
      ('open-meteo','forecast',true,false,100,null,200,now()),('open-meteo','forecast',true,false,300,null,200,now()),
      ('open-meteo','forecast',false,false,50,'TIMEOUT',null,now()),('open-meteo','forecast',true,true,0,null,null,now()),
      ('open-meteo','forecast',true,false,999,null,200,now() - interval '3 days')`);
    const admin = await loggedInAdmin();
    const day = (await admin.get('/api-monitoring?range=24h')).body.data;
    assert.equal(day.usage.upstreamCalls, 3); assert.equal(day.usage.succeeded, 2); assert.equal(day.usage.failed, 1);
    assert.equal(day.usage.errorRate, 33.3); assert.equal(day.usage.cacheHitRate, 25);
    assert.equal(day.usage.byEndpoint[0].avgMs, 200);
    assert.equal(day.hourly.length, 24); assert.equal(day.recentErrors[0].errorCode, 'TIMEOUT');
    assert.equal((await admin.get('/api-monitoring?range=7d')).body.data.usage.upstreamCalls, 4);
    assert.equal((await admin.get('/api-monitoring?range=1y')).status, 422);
  });

  test('system health: real DB probe, no secrets; unexpected errors are recorded', async () => {
    await ctx.pool.query(`INSERT INTO system_error_logs (method, path, message) VALUES ('GET','/api/x','boom')`);
    const admin = await loggedInAdmin();
    const res = await admin.get('/system-health');
    const d = res.body.data;
    assert.equal(d.database.status, 'up'); assert.ok(d.database.latencyMs >= 0); assert.ok(d.backend.uptimeSeconds >= 0);
    assert.equal(d.recentErrors[0].message, 'boom');
    assert.equal(typeof d.services.emailConfigured, 'boolean');
    const txt = JSON.stringify(res.body);
    for (const secret of ['postgres://', ctx.config.sessionSecret, ctx.config.csrfSecret, 'osas_dev_pw']) assert.ok(!txt.includes(secret), secret);
  });

  test('reports aggregate real data', async () => {
    const a = await mk(1); await mk(2);
    await a.c.patch('/preferences', { theme: 'dark', temperatureUnit: 'fahrenheit' });
    await a.c.post('/favourites', { name: 'Abuja', country: 'NG', latitude: 9.07, longitude: 7.39 });
    const admin = await loggedInAdmin();
    const r = (await admin.get('/reports')).body.data;
    assert.equal(r.monthly.length, 12); assert.equal(r.monthly.at(-1).count, 2);
    assert.deepEqual(r.themes.map((t) => [t.theme, t.count]).sort(), [['dark', 1], ['system', 1]]);
    assert.equal(r.topLocations[0].name, 'Abuja'); assert.equal(r.favourites.users_with_favourites, 1);
    assert.equal(r.weatherDaily.length, 14);
  });

  test('settings: registrations switch is enforced by the public API; cache TTL validated; audited', async () => {
    const admin = await loggedInAdmin();
    assert.deepEqual((await admin.get('/settings')).body.data.settings, { registrationsOpen: true, weatherCacheMinutes: 10 });
    assert.equal((await admin.patch('/settings', { weatherCacheMinutes: 2 })).status, 422);
    assert.equal((await admin.patch('/settings', { weatherCacheMinutes: 20, registrationsOpen: false })).status, 200);
    const closed = await user().post('/auth/register', validUser(9));
    assert.equal(closed.status, 403); assert.equal(closed.body.error.code, 'REGISTRATIONS_CLOSED');
    await admin.patch('/settings', { registrationsOpen: true });
    assert.equal((await user().post('/auth/register', validUser(9))).status, 201);
    assert.equal((await admin.patch('/settings', {})).status, 422);
    assert.equal((await admin.patch('/settings', { hack: 1 })).status, 422);
    assert.ok((await admin.get('/activity-logs?action=settings.update')).body.data.pagination.total >= 2);
  });

  test('activity log pagination and content safety', async () => {
    const admin = await loggedInAdmin();
    await admin.post('/auth/change-password', { currentPassword: OWNER.password, newPassword: 'Another-Owner-Passw0rd-2' });
    const res = await admin.get('/activity-logs?limit=1&page=1');
    assert.equal(res.body.data.logs.length, 1); assert.ok(res.body.data.pagination.total >= 2);
    const all = JSON.stringify((await admin.get('/activity-logs?limit=100')).body);
    assert.ok(!all.match(/Passw0rd|argon2|osw_admin_sid/));
  });

  test('admin change-password: verifies current password, signs out other admin sessions, audited', async () => {
    const a = await loggedInAdmin(); const b = await loggedInAdmin();
    assert.equal((await a.post('/auth/change-password', { currentPassword: 'nope-nope-nope1', newPassword: 'Another-Owner-Passw0rd-2' })).status, 422);
    assert.equal((await a.post('/auth/change-password', { currentPassword: OWNER.password, newPassword: 'weak' })).status, 422);
    assert.equal((await a.post('/auth/change-password', { currentPassword: OWNER.password, newPassword: 'Another-Owner-Passw0rd-2' })).status, 200);
    assert.equal((await a.get('/auth/me')).status, 200);
    assert.equal((await b.get('/auth/me')).status, 401);
    assert.equal((await client(ctx.app, ctx.config, '/admin').post('/auth/login', OWNER)).status, 401);
    assert.equal((await client(ctx.app, ctx.config, '/admin').post('/auth/login', { email: OWNER.email, password: 'Another-Owner-Passw0rd-2' })).status, 200);
  });

  test('admin writes require a valid CSRF token', async () => {
    const u = await mk(1); const admin = await loggedInAdmin();
    const r = await admin.agent.patch(`/api/admin/users/${u.id}/status`).set('Origin', ctx.config.adminFrontendUrl).send({ status: 'suspended' });
    assert.equal(r.status, 403); assert.equal(r.body.error.code, 'CSRF_INVALID');
    assert.equal((await ctx.pool.query('SELECT account_status FROM users')).rows[0].account_status, 'active');
  });
});
