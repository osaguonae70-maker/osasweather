'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, resetDb, client, validUser, registerAndLogin } = require('./helpers');
const { sha256 } = require('../src/utils/crypto');

describe('user authentication', () => {
  let ctx;
  before(async () => { ctx = await setup(); });
  after(async () => { await ctx.pool.end(); });
  beforeEach(async () => { await resetDb(ctx.pool); ctx.sent.length = 0; });
  const newClient = () => client(ctx.app, ctx.config);

  test('registration stores an Argon2id hash and never returns it', async () => {
    const c = newClient();
    const r = await c.post('/auth/register', validUser());
    assert.equal(r.status, 201);
    assert.equal(r.body.data.user.email, 'user1@example.com');
    assert.ok(!JSON.stringify(r.body).includes('argon2'));
    assert.ok(!('password_hash' in r.body.data.user) && !('passwordHash' in r.body.data.user));
    const { rows } = await ctx.pool.query('SELECT password_hash FROM users');
    assert.match(rows[0].password_hash, /^\$argon2id\$/);
    assert.ok(!rows[0].password_hash.includes('Sup3rSecret123'));
    const prefs = await ctx.pool.query('SELECT theme, temperature_unit FROM user_preferences');
    assert.equal(prefs.rowCount, 1);
  });

  test('duplicate email (case-insensitive) is rejected', async () => {
    const c = newClient();
    await c.post('/auth/register', validUser());
    const r = await c.post('/auth/register', { ...validUser(), email: 'USER1@Example.com' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'EMAIL_TAKEN');
  });

  test('registration validation: weak password, mismatch, terms, unknown fields (no self-promotion)', async () => {
    const c = newClient();
    let r = await c.post('/auth/register', { ...validUser(), password: 'short1', confirmPassword: 'short1' });
    assert.equal(r.status, 422); assert.ok(r.body.error.details.password);
    r = await c.post('/auth/register', { ...validUser(), confirmPassword: 'different123' });
    assert.ok(r.body.error.details.confirmPassword);
    r = await c.post('/auth/register', { ...validUser(), acceptTerms: false });
    assert.ok(r.body.error.details.acceptTerms);
    r = await c.post('/auth/register', { ...validUser(), role: 'admin', isAdmin: true });
    assert.equal(r.status, 422);
    assert.equal((await ctx.pool.query('SELECT count(*) FROM users')).rows[0].count, '0');
  });

  test('state-changing requests without a CSRF token are rejected', async () => {
    const r = await newClient().agent.post('/api/auth/register').send(validUser());
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'CSRF_INVALID');
  });

  test('a CSRF token from another session is rejected', async () => {
    const a = newClient(); const b = newClient();
    await a.csrf(); await b.csrf();
    const r = await b.agent.post('/api/auth/register').set('X-CSRF-Token', a.state.token).send(validUser());
    assert.equal(r.status, 403);
  });

  test('wrong password and unknown email give the same generic 401', async () => {
    const c = newClient();
    await c.post('/auth/register', validUser());
    const bad = await c.post('/auth/login', { email: 'user1@example.com', password: 'WrongPass123' });
    const none = await c.post('/auth/login', { email: 'nobody@example.com', password: 'WrongPass123' });
    assert.equal(bad.status, 401); assert.equal(none.status, 401);
    assert.equal(bad.body.error.message, none.body.error.message);
  });

  test('login sets an HTTP-only cookie, rotates the session id, and logout invalidates it', async () => {
    const c = newClient();
    await c.csrf();
    await c.post('/auth/register', validUser());
    const unauth = await c.get('/auth/me');
    assert.equal(unauth.status, 401);
    const preSid = (await ctx.pool.query('SELECT sid FROM user_sessions')).rows.map((r) => r.sid);
    const login = await c.post('/auth/login', { email: 'user1@example.com', password: 'Sup3rSecret123' });
    assert.equal(login.status, 200);
    const cookie = login.headers['set-cookie'].find((x) => x.startsWith('osw_sid='));
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i); assert.ok(!/Domain=/i.test(cookie));
    const postSid = (await ctx.pool.query(`SELECT sid FROM user_sessions WHERE sess->>'userId' IS NOT NULL`)).rows[0].sid;
    assert.ok(!preSid.includes(postSid), 'session id must change on login');
    assert.ok(!JSON.stringify(login.body).includes('password'));
    assert.equal(login.body.data.preferences.theme, 'system');
    assert.equal((await c.get('/auth/me')).status, 200);
    assert.equal((await c.post('/auth/logout', {})).status, 200);
    assert.equal((await c.get('/auth/me')).status, 401);
    assert.equal((await ctx.pool.query(`SELECT 1 FROM user_sessions WHERE sid=$1`, [postSid])).rowCount, 0);
  });

  test('remember-me extends cookie lifetime', async () => {
    const c = newClient();
    const { login } = await registerAndLogin(c, 1, { rememberMe: true });
    const cookie = login.headers['set-cookie'].find((x) => x.startsWith('osw_sid='));
    assert.match(cookie, /Max-Age=2592000|Expires=/i);
  });

  test('suspended accounts cannot log in and live sessions die immediately', async () => {
    const c = newClient();
    const { u } = await registerAndLogin(c);
    assert.equal((await c.get('/auth/me')).status, 200);
    await ctx.pool.query(`UPDATE users SET account_status='suspended'`);
    const r = await c.get('/auth/me');
    assert.equal(r.status, 403); assert.equal(r.body.error.code, 'ACCOUNT_SUSPENDED');
    assert.equal((await c.get('/auth/me')).status, 401); // session was destroyed
    const c2 = newClient();
    const login = await c2.post('/auth/login', { email: u.email, password: u.password });
    assert.equal(login.status, 403);
    await ctx.pool.query(`UPDATE users SET account_status='active'`);
    assert.equal((await c2.post('/auth/login', { email: u.email, password: u.password })).status, 200);
  });

  test('forgot-password never reveals whether an email exists', async () => {
    const c = newClient();
    await c.post('/auth/register', validUser());
    const a = await c.post('/auth/forgot-password', { email: 'user1@example.com' });
    const b = await c.post('/auth/forgot-password', { email: 'ghost@example.com' });
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.deepEqual(a.body, b.body);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(ctx.sent.length, 1);
    assert.equal(ctx.sent[0].to, 'user1@example.com');
  });

  test('full reset flow: hashed token, single use, sessions revoked, new password works', async () => {
    const c = newClient();
    const { u } = await registerAndLogin(c);
    await c.post('/auth/forgot-password', { email: u.email });
    await new Promise((r) => setTimeout(r, 50));
    const token = new URL(ctx.sent[0].url).hash.replace('#token=', '');
    assert.ok(token.length >= 40);
    const stored = (await ctx.pool.query('SELECT token_hash FROM password_reset_tokens')).rows[0].token_hash;
    assert.equal(stored, sha256(token)); assert.notEqual(stored, token);

    const other = newClient();
    assert.equal((await other.post('/auth/reset-password/validate', { token })).body.data.valid, true);
    assert.equal((await other.post('/auth/reset-password/validate', { token: 'x'.repeat(40) })).body.data.valid, false);
    const bad = await other.post('/auth/reset-password', { token, password: 'weak', confirmPassword: 'weak' });
    assert.equal(bad.status, 422);
    const done = await other.post('/auth/reset-password', { token, password: 'Brand9NewPassword', confirmPassword: 'Brand9NewPassword' });
    assert.equal(done.status, 200);
    const reuse = await other.post('/auth/reset-password', { token, password: 'Another9Password', confirmPassword: 'Another9Password' });
    assert.equal(reuse.status, 400);
    assert.equal((await c.get('/auth/me')).status, 401, 'existing sessions revoked');
    assert.equal((await newClient().post('/auth/login', { email: u.email, password: u.password })).status, 401);
    assert.equal((await newClient().post('/auth/login', { email: u.email, password: 'Brand9NewPassword' })).status, 200);
  });

  test('expired reset tokens are rejected', async () => {
    const c = newClient();
    const { u } = await registerAndLogin(c);
    await c.post('/auth/forgot-password', { email: u.email });
    await new Promise((r) => setTimeout(r, 50));
    const token = new URL(ctx.sent[0].url).hash.replace('#token=', '');
    await ctx.pool.query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`);
    const r = await c.post('/auth/reset-password', { token, password: 'Brand9NewPassword', confirmPassword: 'Brand9NewPassword' });
    assert.equal(r.status, 400);
  });

  test('change-password verifies current password and signs out other devices only', async () => {
    const a = newClient(); const b = newClient();
    const { u } = await registerAndLogin(a);
    await b.post('/auth/login', { email: u.email, password: u.password });
    const wrong = await a.patch('/auth/change-password', { currentPassword: 'nope12345678', newPassword: 'Fresh9Password1', confirmPassword: 'Fresh9Password1' });
    assert.equal(wrong.status, 422);
    const ok = await a.patch('/auth/change-password', { currentPassword: u.password, newPassword: 'Fresh9Password1', confirmPassword: 'Fresh9Password1' });
    assert.equal(ok.status, 200);
    assert.equal((await a.get('/auth/me')).status, 200);
    assert.equal((await b.get('/auth/me')).status, 401);
  });

  test('protected routes reject unauthenticated callers', async () => {
    assert.equal((await newClient().get('/auth/me')).status, 401);
    assert.equal((await newClient().patch('/auth/change-password', {})).status, 401);
  });

  test('malformed JSON and oversized bodies get clean errors', async () => {
    const c = newClient(); await c.csrf();
    const bad = await c.agent.post('/api/auth/login').set('Content-Type', 'application/json').set('X-CSRF-Token', c.state.token).send('{oops');
    assert.equal(bad.status, 400);
    const big = await c.agent.post('/api/auth/login').set('X-CSRF-Token', c.state.token).send({ email: 'a@b.co', password: 'x'.repeat(20000) });
    assert.equal(big.status, 413);
  });

  test('errors never leak stack traces', async () => {
    const r = await newClient().get('/nope');
    assert.equal(r.status, 404);
    assert.ok(!JSON.stringify(r.body).includes('at '));
  });
});

describe('login brute-force protection', () => {
  let ctx;
  before(async () => { ctx = await setup({ rateLimit: { login: 3 } }); });
  after(async () => { await ctx.pool.end(); });
  beforeEach(() => resetDb(ctx.pool));

  test('repeated failures for one account are rate limited with 429', async () => {
    const c = client(ctx.app, ctx.config);
    await c.post('/auth/register', validUser());
    const codes = [];
    for (let i = 0; i < 5; i += 1) codes.push((await c.post('/auth/login', { email: 'user1@example.com', password: 'WrongPass123' })).status);
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  });
});
