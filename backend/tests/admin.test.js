'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, resetDb, client, registerAndLogin } = require('./helpers');
const { bootstrapOwner, resetOwnerPassword } = require('../src/services/ownerBootstrap');

const OWNER = { email: 'owner@osasweather.test', password: 'Owner-Passw0rd-123' };

describe('owner bootstrap', () => {
  let ctx;
  before(async () => { ctx = await setup(); });
  after(async () => { await ctx.pool.end(); });
  beforeEach(() => resetDb(ctx.pool));

  test('creates exactly one owner and is idempotent', async () => {
    const first = await bootstrapOwner(ctx.pool, OWNER);
    assert.equal(first.created, true);
    const again = await bootstrapOwner(ctx.pool, OWNER);
    assert.equal(again.created, false);
    const other = await bootstrapOwner(ctx.pool, { email: 'attacker@example.com', password: 'Another-Passw0rd-1' });
    assert.equal(other.created, false);
    const { rows } = await ctx.pool.query('SELECT email, role, password_hash FROM administrators');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, OWNER.email);
    assert.match(rows[0].password_hash, /^\$argon2id\$/);
  });

  test('database itself refuses a second administrator (race-proof)', async () => {
    await bootstrapOwner(ctx.pool, OWNER);
    await assert.rejects(
      ctx.pool.query(`INSERT INTO administrators (email, password_hash) VALUES ('x@y.com','h')`),
      /administrators_single_owner/);
  });

  test('rejects weak owner passwords', async () => {
    await assert.rejects(bootstrapOwner(ctx.pool, { email: OWNER.email, password: 'short' }), /at least 12/);
  });

  test('owner-verified reset changes the password and revokes admin sessions', async () => {
    await bootstrapOwner(ctx.pool, OWNER);
    const a = client(ctx.app, ctx.config, '/admin');
    assert.equal((await a.post('/auth/login', OWNER)).status, 200);
    await resetOwnerPassword(ctx.pool, { password: 'Brand-New-Passw0rd-9' });
    assert.equal((await a.get('/auth/me')).status, 401);
    const b = client(ctx.app, ctx.config, '/admin');
    assert.equal((await b.post('/auth/login', OWNER)).status, 401);
    assert.equal((await b.post('/auth/login', { email: OWNER.email, password: 'Brand-New-Passw0rd-9' })).status, 200);
  });
});

describe('admin authentication and isolation', () => {
  let ctx;
  before(async () => { ctx = await setup(); });
  after(async () => { await ctx.pool.end(); });
  beforeEach(async () => { await resetDb(ctx.pool); await bootstrapOwner(ctx.pool, OWNER); });
  const admin = () => client(ctx.app, ctx.config, '/admin');
  const user = () => client(ctx.app, ctx.config);

  test('there is no public admin registration route', async () => {
    for (const p of ['/api/admin/auth/register', '/api/admin/register', '/api/auth/register-admin']) {
      const r = await request(ctx.app).post(p).send({});
      assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
    }
  });

  test('owner can log in; cookie is separate, HTTP-only and the activity is logged', async () => {
    const a = admin();
    const r = await a.post('/auth/login', OWNER);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.admin.role, 'owner');
    assert.ok(!JSON.stringify(r.body).includes('password'));
    const cookie = r.headers['set-cookie'].find((c) => c.startsWith('osw_admin_sid='));
    assert.match(cookie, /HttpOnly/i);
    assert.ok(!r.headers['set-cookie'].some((c) => c.startsWith('osw_sid=')));
    assert.equal((await a.get('/auth/me')).status, 200);
    const logs = await ctx.pool.query('SELECT action, target_type FROM admin_activity_logs');
    assert.deepEqual(logs.rows.map((l) => l.action), ['admin.login']);
  });

  test('failed owner logins are audited without storing the password', async () => {
    const a = admin();
    assert.equal((await a.post('/auth/login', { email: OWNER.email, password: 'Wrong-Passw0rd-123' })).status, 401);
    const { rows } = await ctx.pool.query('SELECT action, metadata FROM admin_activity_logs');
    assert.equal(rows[0].action, 'admin.login_failed');
    assert.ok(!JSON.stringify(rows).includes('Wrong-Passw0rd'));
  });

  test('a normal user cannot log in through the admin endpoint', async () => {
    const u = user();
    const { u: creds } = await registerAndLogin(u);
    const a = admin();
    assert.equal((await a.post('/auth/login', { email: creds.email, password: creds.password })).status, 401);
  });

  test('unauthenticated -> 401, logged-in ordinary user -> 403 on admin routes', async () => {
    assert.equal((await admin().get('/auth/me')).status, 401);
    const u = user();
    await registerAndLogin(u);
    // The user's osw_sid cookie is sent to the admin route as well (same API host).
    const res = await u.agent.get('/api/admin/auth/me').set('Origin', ctx.config.adminFrontendUrl);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'ADMIN_REQUIRED');
  });

  test('an admin session does not authenticate as a user, and vice versa', async () => {
    const a = admin();
    await a.post('/auth/login', OWNER);
    // Send the admin cookie jar to the *user* realm.
    const asUser = await a.agent.get('/api/auth/me').set('Origin', ctx.config.frontendUrl);
    assert.equal(asUser.status, 401);
    assert.equal((await a.get('/auth/me')).status, 200);
  });

  test('forged / tampered admin cookies are rejected', async () => {
    const r = await request(ctx.app).get('/api/admin/auth/me').set('Cookie', 'osw_admin_sid=s%3Aforged.signature');
    assert.equal(r.status, 401);
    const r2 = await request(ctx.app).get('/api/admin/auth/me').set('Cookie', 'osw_sid=s%3Aforged.signature');
    assert.equal(r2.status, 401);
  });

  test('logout destroys the admin session and is logged', async () => {
    const a = admin();
    await a.post('/auth/login', OWNER);
    assert.equal((await a.post('/auth/logout', {})).status, 200);
    assert.equal((await a.get('/auth/me')).status, 401);
    const { rows } = await ctx.pool.query('SELECT action FROM admin_activity_logs ORDER BY created_at');
    assert.deepEqual(rows.map((r) => r.action), ['admin.login', 'admin.logout']);
  });

  test('deactivating the owner row kills the live session (server-side truth)', async () => {
    const a = admin();
    await a.post('/auth/login', OWNER);
    await ctx.pool.query('UPDATE administrators SET is_active = FALSE');
    assert.equal((await a.get('/auth/me')).status, 401);
  });

  test('admin API requires CSRF and the admin origin', async () => {
    const a = admin();
    const noToken = await a.agent.post('/api/admin/auth/login').set('Origin', ctx.config.adminFrontendUrl).send(OWNER);
    assert.equal(noToken.status, 403); assert.equal(noToken.body.error.code, 'CSRF_INVALID');
    await a.csrf();
    const wrongOrigin = await a.agent.post('/api/admin/auth/login')
      .set('Origin', ctx.config.frontendUrl).set('X-CSRF-Token', a.state.token).send(OWNER);
    assert.equal(wrongOrigin.status, 403); assert.equal(wrongOrigin.body.error.code, 'ORIGIN_NOT_ALLOWED');
  });

  test('user realm rejects the admin frontend origin on writes', async () => {
    const u = user(); await u.csrf();
    const r = await u.agent.post('/api/auth/login').set('Origin', ctx.config.adminFrontendUrl)
      .set('X-CSRF-Token', u.state.token).send({ email: 'a@b.co', password: 'x' });
    assert.equal(r.status, 403); assert.equal(r.body.error.code, 'ORIGIN_NOT_ALLOWED');
  });

  test('unknown /api/admin routes never fall through into the user realm', async () => {
    assert.equal((await request(ctx.app).get('/api/admin/does-not-exist')).status, 401); // reveals nothing unauthenticated
    const a = admin(); await a.post('/auth/login', OWNER);
    assert.equal((await a.get('/does-not-exist')).status, 404);
  });
});

describe('CORS', () => {
  let ctx;
  before(async () => { ctx = await setup(); });
  after(async () => { await ctx.pool.end(); });

  test('trusted origins get credentialed CORS headers with an exact origin match', async () => {
    for (const origin of [ctx.config.frontendUrl, ctx.config.adminFrontendUrl]) {
      const r = await request(ctx.app).options('/api/auth/login').set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type,x-csrf-token');
      assert.equal(r.headers['access-control-allow-origin'], origin);
      assert.equal(r.headers['access-control-allow-credentials'], 'true');
      assert.match(r.headers['access-control-allow-headers'], /X-CSRF-Token/i);
    }
  });

  test('untrusted origins receive no CORS headers (no wildcard)', async () => {
    for (const origin of ['https://evil.example', 'http://localhost:5502', 'null']) {
      const r = await request(ctx.app).get('/api/health').set('Origin', origin);
      assert.equal(r.headers['access-control-allow-origin'], undefined, origin);
    }
  });

  test('security headers are present', async () => {
    const r = await request(ctx.app).get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.ok(r.headers['content-security-policy']);
    assert.equal(r.headers['x-powered-by'], undefined);
    assert.equal(r.headers['cross-origin-resource-policy'], 'same-site');
  });

  test('health reports database status and sets no cookies', async () => {
    const r = await request(ctx.app).get('/api/health');
    assert.equal(r.body.data.database, 'up');
    assert.equal(r.headers['set-cookie'], undefined);
  });
});

describe('production configuration guards', () => {
  const { loadConfig } = require('../src/config');
  const base = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', FRONTEND_URL: 'https://osasweather.com', ADMIN_FRONTEND_URL: 'https://admin.osasweather.com' };
  const good = 'a'.repeat(40);

  test('refuses weak, missing or identical secrets', () => {
    assert.throws(() => loadConfig({ ...base }), /SESSION_SECRET is required/);
    assert.throws(() => loadConfig({ ...base, SESSION_SECRET: 'short', ADMIN_SESSION_SECRET: good, CSRF_SECRET: good }), /at least 32/);
    assert.throws(() => loadConfig({ ...base, SESSION_SECRET: good, ADMIN_SESSION_SECRET: good, CSRF_SECRET: good }), /must be different/);
  });
  test('requires https frontends in production and enables secure cookies', () => {
    assert.throws(() => loadConfig({ ...base, FRONTEND_URL: 'http://osasweather.com', SESSION_SECRET: good, ADMIN_SESSION_SECRET: 'b'.repeat(40), CSRF_SECRET: good }), /https/);
    const cfg = loadConfig({ ...base, SESSION_SECRET: good, ADMIN_SESSION_SECRET: 'b'.repeat(40), CSRF_SECRET: 'c'.repeat(40) });
    assert.equal(cfg.cookies.secure, true);
  });
});
