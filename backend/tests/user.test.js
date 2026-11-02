'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, resetDb, client, registerAndLogin } = require('./helpers');

describe('favourites, preferences, profile', () => {
  let ctx;
  before(async () => { ctx = await setup(); });
  after(async () => { await ctx.pool.end(); });
  beforeEach(async () => { await resetDb(ctx.pool); ctx.sent.length = 0; });
  const nc = () => client(ctx.app, ctx.config);
  const abuja = { name: 'Abuja', country: 'Nigeria', latitude: 9.0765, longitude: 7.3986 };

  test('all private endpoints require authentication', async () => {
    const c = nc();
    assert.equal((await c.get('/favourites')).status, 401);
    assert.equal((await c.post('/favourites', abuja)).status, 401);
    assert.equal((await c.del('/favourites/7f1ad8d4-9a65-4c3e-8b8a-3f0b7a6b9c11')).status, 401);
    assert.equal((await c.get('/preferences')).status, 401);
    assert.equal((await c.patch('/preferences', { theme: 'dark' })).status, 401);
    assert.equal((await c.patch('/auth/profile', { fullName: 'X Y' })).status, 401);
  });

  test('add, list, duplicate-protect and delete favourites', async () => {
    const c = nc(); await registerAndLogin(c);
    const add = await c.post('/favourites', abuja);
    assert.equal(add.status, 201);
    assert.equal(add.body.data.favourite.latitude, 9.0765);
    assert.equal((await c.post('/favourites', abuja)).status, 409);
    // ~5 m away rounds to the same spot -> still a duplicate
    assert.equal((await c.post('/favourites', { ...abuja, latitude: 9.07651, longitude: 7.39862 })).body.error.code, 'FAVOURITE_EXISTS');
    await c.post('/favourites', { name: 'Lagos', country: 'Nigeria', latitude: 6.5244, longitude: 3.3792 });
    const list = (await c.get('/favourites')).body.data.favourites;
    assert.deepEqual(list.map((f) => f.name), ['Lagos', 'Abuja']);
    assert.equal((await c.del(`/favourites/${list[0].id}`)).status, 200);
    assert.equal((await c.get('/favourites')).body.data.favourites.length, 1);
  });

  test('favourite input validation', async () => {
    const c = nc(); await registerAndLogin(c);
    for (const bad of [{ ...abuja, latitude: 120 }, { ...abuja, name: '' }, { ...abuja, userId: 'x' }, { name: 'X' }, { ...abuja, latitude: '9' }]) {
      assert.equal((await c.post('/favourites', bad)).status, 422, JSON.stringify(bad));
    }
    assert.equal((await c.del('/favourites/not-a-uuid')).status, 422);
  });

  test('ownership isolation: another user cannot read or delete my favourites by id', async () => {
    const a = nc(); const b = nc();
    await registerAndLogin(a, 1); await registerAndLogin(b, 2);
    const fav = (await a.post('/favourites', abuja)).body.data.favourite;
    assert.deepEqual((await b.get('/favourites')).body.data.favourites, []);
    const attack = await b.del(`/favourites/${fav.id}`);
    assert.equal(attack.status, 404);
    assert.equal((await a.get('/favourites')).body.data.favourites.length, 1, 'victim data intact');
    // the same place can be saved independently by the other user
    assert.equal((await b.post('/favourites', abuja)).status, 201);
  });

  test('favourites are capped per user', async () => {
    const c = nc(); const { u } = await registerAndLogin(c);
    const id = (await ctx.pool.query('SELECT id FROM users WHERE email=$1', [u.email])).rows[0].id;
    await ctx.pool.query(`INSERT INTO favourite_locations (user_id, location_name, latitude, longitude)
      SELECT $1, 'P'||g, (g % 80)::numeric, (g)::numeric FROM generate_series(1,50) g`, [id]);
    assert.equal((await c.post('/favourites', abuja)).body.error.code, 'FAVOURITES_LIMIT');
  });

  test('preferences: defaults, partial update, validation, persistence across logins', async () => {
    const a = nc(); const { u } = await registerAndLogin(a);
    assert.deepEqual((await a.get('/preferences')).body.data.preferences,
      { temperatureUnit: 'celsius', windSpeedUnit: 'kmh', defaultLocation: null, theme: 'system' });
    const up = await a.patch('/preferences', { temperatureUnit: 'fahrenheit', theme: 'dark', defaultLocation: abuja });
    assert.equal(up.status, 200);
    assert.equal(up.body.data.preferences.defaultLocation.name, 'Abuja');
    assert.equal((await a.patch('/preferences', { windSpeedUnit: 'mph' })).body.data.preferences.theme, 'dark');
    for (const bad of [{ theme: 'neon' }, { temperatureUnit: 'kelvin' }, {}, { isAdmin: true }, { defaultLocation: { name: 'x' } }]) {
      assert.equal((await a.patch('/preferences', bad)).status, 422, JSON.stringify(bad));
    }
    const other = nc(); // "another device"
    const login = await other.post('/auth/login', { email: u.email, password: u.password });
    assert.equal(login.body.data.preferences.temperatureUnit, 'fahrenheit');
    assert.equal(login.body.data.preferences.theme, 'dark');
    assert.equal((await nc().get('/preferences')).status, 401);
  });

  test('preferences are per user', async () => {
    const a = nc(); const b = nc();
    await registerAndLogin(a, 1); await registerAndLogin(b, 2);
    await a.patch('/preferences', { theme: 'dark' });
    assert.equal((await b.get('/preferences')).body.data.preferences.theme, 'system');
  });

  test('profile name update validates and trims', async () => {
    const c = nc(); await registerAndLogin(c);
    assert.equal((await c.patch('/auth/profile', { fullName: '  Ada Obi  ' })).body.data.user.fullName, 'Ada Obi');
    assert.equal((await c.patch('/auth/profile', { fullName: 'A' })).status, 422);
    assert.equal((await c.patch('/auth/profile', { fullName: 'x', email: 'new@x.com' })).status, 422);
  });

  test('email change needs the password, a link to the NEW address, and is single-use', async () => {
    const c = nc(); const { u } = await registerAndLogin(c);
    assert.equal((await c.post('/auth/email-change', { newEmail: 'new@example.com', password: 'wrongwrong1' })).status, 422);
    const r = await c.post('/auth/email-change', { newEmail: 'New@Example.com', password: u.password });
    assert.equal(r.status, 200);
    await new Promise((x) => setTimeout(x, 50));
    assert.equal(ctx.sent.length, 1);
    assert.equal(ctx.sent[0].to, 'new@example.com', 'link goes to the NEW address, not the old one');
    assert.equal(ctx.sent[0].kind, 'email-change');
    assert.match(ctx.sent[0].url, /\/confirm-email\.html#token=/);
    const row = (await ctx.pool.query('SELECT token_hash, new_email FROM email_change_tokens')).rows[0];
    assert.equal(row.new_email, 'new@example.com');
    assert.equal((await ctx.pool.query('SELECT email FROM users')).rows[0].email, u.email, 'not changed until confirmed');
  });

  test('email change confirmation updates the address once; taken addresses leak nothing', async () => {
    const { sha256 } = require('../src/utils/crypto');
    const c = nc(); const { u } = await registerAndLogin(c, 1);
    await registerAndLogin(nc(), 2);
    const taken = await c.post('/auth/email-change', { newEmail: 'user2@example.com', password: u.password });
    const free = await c.post('/auth/email-change', { newEmail: 'fresh@example.com', password: u.password });
    assert.deepEqual(taken.body, free.body, 'identical responses');
    assert.equal((await ctx.pool.query(`SELECT count(*) FROM email_change_tokens WHERE new_email='user2@example.com'`)).rows[0].count, '0');
    const token = 'T'.repeat(43);
    await ctx.pool.query(`UPDATE email_change_tokens SET token_hash=$1`, [sha256(token)]);
    assert.equal((await nc().post('/auth/email-change/confirm', { token: 'x'.repeat(43) })).status, 400);
    assert.equal((await nc().post('/auth/email-change/confirm', { token })).status, 200);
    assert.equal((await nc().post('/auth/email-change/confirm', { token })).status, 400);
    const row = (await ctx.pool.query('SELECT email, email_verified_at FROM users WHERE email=$1', ['fresh@example.com'])).rows[0];
    assert.ok(row.email_verified_at);
    assert.equal((await nc().post('/auth/login', { email: 'fresh@example.com', password: u.password })).status, 200);
  });
});
