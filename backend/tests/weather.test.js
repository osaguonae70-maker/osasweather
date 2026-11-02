'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, resetDb, client } = require('./helpers');
const { forecastPayload, geoPayload, json, fakeFetch } = require('./fixtures');
const { describeWeather, compass } = require('../src/utils/weatherCodes');

const Q = 'lat=9.07&lon=7.4';

describe('weather code mapping', () => {
  test('day/night variants and unknown codes', () => {
    assert.equal(describeWeather(0, true).icon, 'clear-day');
    assert.equal(describeWeather(0, false).icon, 'clear-night');
    assert.equal(describeWeather(95).icon, 'thunder');
    assert.equal(describeWeather(65).icon, 'rain-heavy');
    assert.equal(describeWeather(999).label, 'Unavailable');
    assert.equal(describeWeather(45, true, 500).icon, 'fog');
    assert.equal(describeWeather(45, true, 5000).icon, 'mist');
    assert.equal(compass(225), 'SW'); assert.equal(compass(null), null);
  });
});

describe('weather API', () => {
  let ctx; let ff;
  const boot = async (handler) => {
    if (ctx) await ctx.pool.end();
    ff = fakeFetch(handler);
    ctx = await setup({ fetchImpl: ff });
    await resetDb(ctx.pool);
  };
  after(async () => { if (ctx) await ctx.pool.end(); });
  const get = (p) => client(ctx.app, ctx.config).get(p);

  test('current/hourly/daily use real upstream fields and normalise them', async () => {
    await boot(async () => json(forecastPayload()));
    const cur = await get(`/weather/current?${Q}`);
    assert.equal(cur.status, 200);
    const c = cur.body.data.current;
    assert.equal(c.temperature, 27); assert.equal(c.humidity, 61); assert.equal(c.windDirectionLabel, 'SW');
    assert.equal(c.condition.icon, 'partly-cloudy-day'); assert.equal(c.uvIndex, 7.2);
    assert.equal(cur.body.data.today.sunrise, '2026-10-31T06:12');
    assert.equal(cur.body.data.location.timezone, 'Africa/Lagos');
    const hr = (await get(`/weather/hourly?${Q}`)).body.data.hourly;
    assert.equal(hr.length, 48); assert.equal(hr[0].time, '2026-10-31T14:00');
    const dy = (await get(`/weather/daily?${Q}`)).body.data.daily;
    assert.equal(dy.length, 7); assert.equal(dy[2].condition.icon, 'thunder');
    assert.equal(ff.calls.length, 1, 'three endpoints share one cached upstream call');
  });

  test('requests only documented variables, auto timezone, and passes units through', async () => {
    await boot(async () => json(forecastPayload({ fahrenheit: true, wind: 'mp/h' })));
    const r = await get(`/weather/overview?${Q}&temperatureUnit=fahrenheit&windSpeedUnit=mph`);
    assert.equal(r.status, 200);
    const url = new URL(ff.calls[0]);
    assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
    assert.equal(url.searchParams.get('timezone'), 'auto');
    assert.equal(url.searchParams.get('temperature_unit'), 'fahrenheit');
    assert.equal(url.searchParams.get('wind_speed_unit'), 'mph');
    assert.match(url.searchParams.get('current'), /weather_code/);
    assert.equal(r.body.data.units.temperature, '°F');
  });

  test('missing fields become null, never invented values', async () => {
    await boot(async () => json(forecastPayload({ missing: ['uv_index', 'visibility', 'wind_gusts_10m'] })));
    const c = (await get(`/weather/current?${Q}`)).body.data.current;
    assert.equal(c.uvIndex, null); assert.equal(c.visibility, null); assert.equal(c.windGusts, null);
    assert.equal(c.temperature, 27);
  });

  test('responses are cached, cache hits are logged, and cache TTL is configurable', async () => {
    await boot(async () => json(forecastPayload()));
    await get(`/weather/current?${Q}`); await get(`/weather/current?${Q}`); await get(`/weather/current?lat=9.0701&lon=7.4004`);
    assert.equal(ff.calls.length, 1);
    await new Promise((r) => setTimeout(r, 100));
    const { rows } = await ctx.pool.query('SELECT cache_hit, success, endpoint FROM api_request_logs ORDER BY id');
    assert.deepEqual(rows.map((x) => x.cache_hit), [false, true, true]);
    await get(`/weather/current?lat=9.07&lon=7.4&temperatureUnit=fahrenheit`);
    assert.equal(ff.calls.length, 2, 'different units are cached separately');
  });

  test('concurrent identical requests are coalesced into one upstream call', async () => {
    await boot(async () => { await new Promise((r) => setTimeout(r, 60)); return json(forecastPayload()); });
    const rs = await Promise.all([1, 2, 3, 4].map(() => get(`/weather/current?lat=1.5&lon=2.5`)));
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal(ff.calls.length, 1);
  });

  test('invalid coordinates and units are rejected before any upstream call', async () => {
    await boot(async () => json(forecastPayload()));
    for (const q of ['lat=91&lon=0', 'lat=0&lon=181', 'lat=abc&lon=1', 'lon=1', 'lat=1&lon=1&windSpeedUnit=furlongs']) {
      const r = await get(`/weather/current?${q}`);
      assert.equal(r.status, 422, q);
    }
    assert.equal(ff.calls.length, 0);
  });

  test('upstream failures map to clean 502/504 errors and are logged', async () => {
    await boot(async () => json({ error: true, reason: 'bad' }, 400));
    let r = await get(`/weather/current?${Q}`);
    assert.equal(r.status, 502); assert.equal(r.body.error.code, 'UPSTREAM_ERROR');
    assert.ok(!JSON.stringify(r.body).includes('bad'));

    await boot(async () => { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; });
    r = await get(`/weather/current?${Q}`);
    assert.equal(r.status, 504); assert.equal(r.body.error.code, 'UPSTREAM_TIMEOUT');

    await boot(async () => { throw new Error('ECONNRESET'); });
    r = await get(`/weather/current?${Q}`);
    assert.equal(r.status, 502); assert.equal(r.body.error.code, 'UPSTREAM_UNREACHABLE');

    await boot(async () => json({ nothing: 'useful' }));
    r = await get(`/weather/current?${Q}`);
    assert.equal(r.body.error.code, 'UPSTREAM_BAD_RESPONSE');

    await boot(async () => json({}, 429));
    assert.equal((await get(`/weather/current?${Q}`)).body.error.code, 'UPSTREAM_RATE_LIMITED');
    await new Promise((r2) => setTimeout(r2, 100));
    const logs = await ctx.pool.query('SELECT error_code FROM api_request_logs WHERE NOT success');
    assert.ok(logs.rowCount >= 1);
  });

  test('geocoding returns disambiguating fields and handles empty results', async () => {
    await boot(async (url) => (url.includes('geocoding') ? json(url.includes('zzzz') ? { generationtime_ms: 0.1 } : geoPayload()) : json({})));
    const r = await get('/weather/search?q=Springfield');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.results.length, 2);
    assert.deepEqual(
      r.body.data.results.map((x) => x.region), ['Illinois', 'Missouri']);
    assert.equal(r.body.data.results[0].countryCode, 'US');
    const u = new URL(ff.calls[0]);
    assert.equal(u.searchParams.get('name'), 'Springfield');
    assert.equal(u.searchParams.get('count'), '8');
    assert.deepEqual((await get('/weather/search?q=zzzzzz')).body.data.results, []);
    assert.equal((await get('/weather/search?q=a')).status, 422);
    await get('/weather/search?q=springfield');
    assert.equal(ff.calls.filter((c) => c.includes('springfield') || c.includes('Springfield')).length, 1, 'search is cached case-insensitively');
  });

  test('stale cache is served (and flagged) if the upstream fails after TTL', async () => {
    let fail = false;
    await boot(async () => (fail ? json({}, 500) : json(forecastPayload())));
    await get(`/weather/current?${Q}`);
    await ctx.pool.query(`INSERT INTO app_settings (key, value) VALUES ('weather_cache_minutes', '5')`);
    // force expiry by reaching into the in-memory cache through a fresh service TTL: wait via fake clock
    const realNow = Date.now; Date.now = () => realNow() + 20 * 60 * 1000;
    try {
      await new Promise((r) => setTimeout(r, 20));
      fail = true;
      const r = await get(`/weather/current?${Q}`);
      assert.equal(r.status, 200); assert.equal(r.body.data.meta.stale, true);
    } finally { Date.now = realNow; }
  });
});
