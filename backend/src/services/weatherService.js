'use strict';
const { E } = require('../utils/errors');
const { describeWeather, compass } = require('../utils/weatherCodes');
const apiLogRepo = require('../repositories/apiLogRepository');
const logger = require('../utils/logger');

const CURRENT_VARS = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation',
  'weather_code', 'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'visibility', 'uv_index'];
const HOURLY_VARS = ['temperature_2m', 'precipitation_probability', 'weather_code', 'wind_speed_10m', 'is_day'];
const DAILY_VARS = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset', 'uv_index_max',
  'precipitation_probability_max', 'precipitation_sum', 'wind_speed_10m_max'];

const STALE_MAX_MS = 3 * 3600 * 1000;
const MAX_ENTRIES = 500;
const GEO_TTL_MS = 24 * 3600 * 1000;

/** Small TTL cache with insertion-order eviction. */
class TtlCache {
  constructor(max) { this.max = max; this.map = new Map(); }
  get(key) { const e = this.map.get(key); return e || null; }
  set(key, value) {
    this.map.delete(key); this.map.set(key, { value, at: Date.now() });
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const at = (arr, i) => (Array.isArray(arr) ? num(arr[i]) : null);
const str = (arr, i) => (Array.isArray(arr) && typeof arr[i] === 'string' ? arr[i] : null);

function createWeatherService({ pool, config, settingsService, fetchImpl = globalThis.fetch }) {
  const forecastCache = new TtlCache(MAX_ENTRIES);
  const geoCache = new TtlCache(MAX_ENTRIES);
  const inflight = new Map();

  const log = (entry) => apiLogRepo.insert(pool, entry).catch((err) => logger.warn('api_log_failed', { message: err.message }));

  /** One upstream call with timeout, structured error mapping and request logging. */
  async function upstream(endpoint, url) {
    const started = Date.now();
    let statusCode = null;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(config.weatherTimeoutMs), headers: { Accept: 'application/json' } });
      statusCode = res.status;
      let body = null;
      try { body = await res.json(); } catch { /* handled below */ }
      if (!res.ok || !body || body.error === true) {
        const code = res.status === 429 ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_ERROR';
        await log({ provider: 'open-meteo', endpoint, statusCode, success: false, durationMs: Date.now() - started, errorCode: code });
        throw E.upstream('The weather service returned an error. Please try again shortly.', code);
      }
      await log({ provider: 'open-meteo', endpoint, statusCode, success: true, durationMs: Date.now() - started });
      return body;
    } catch (err) {
      if (err.status) throw err; // already mapped
      const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      await log({ provider: 'open-meteo', endpoint, statusCode, success: false, durationMs: Date.now() - started, errorCode: timedOut ? 'TIMEOUT' : 'NETWORK' });
      throw timedOut ? E.timeout() : E.upstream('Could not reach the weather service.', 'UPSTREAM_UNREACHABLE');
    }
  }

  function normalise(raw, { temperatureUnit, windSpeedUnit }) {
    if (!raw || !raw.current || !raw.hourly || !raw.daily || !Array.isArray(raw.hourly.time) || !Array.isArray(raw.daily.time)) {
      throw E.upstream('The weather service returned an unexpected response.', 'UPSTREAM_BAD_RESPONSE');
    }
    const c = raw.current; const h = raw.hourly; const d = raw.daily; const cu = raw.current_units || {};
    const isDay = c.is_day === 1 ? true : c.is_day === 0 ? false : true;
    const visibility = num(c.visibility);
    const cond = describeWeather(c.weather_code, isDay, visibility);

    // Hourly: from the current local hour onward, 48 entries.
    const nowHour = typeof c.time === 'string' ? c.time.slice(0, 13) : '';
    let start = h.time.findIndex((t) => t.slice(0, 13) >= nowHour);
    if (start < 0) start = 0;
    const hourly = h.time.slice(start, start + 48).map((time, k) => {
      const i = start + k; const hDay = h.is_day ? h.is_day[i] === 1 : true;
      return {
        time, temperature: at(h.temperature_2m, i), precipitationProbability: at(h.precipitation_probability, i),
        weatherCode: at(h.weather_code, i), isDay: hDay, windSpeed: at(h.wind_speed_10m, i),
        condition: describeWeather(at(h.weather_code, i), hDay),
      };
    });
    const daily = d.time.slice(0, 7).map((date, i) => ({
      date, weatherCode: at(d.weather_code, i), condition: describeWeather(at(d.weather_code, i), true),
      high: at(d.temperature_2m_max, i), low: at(d.temperature_2m_min, i),
      precipitationProbability: at(d.precipitation_probability_max, i), precipitationSum: at(d.precipitation_sum, i),
      windSpeedMax: at(d.wind_speed_10m_max, i), sunrise: str(d.sunrise, i), sunset: str(d.sunset, i), uvIndexMax: at(d.uv_index_max, i),
    }));
    const todayIdx = Math.max(0, d.time.findIndex((t) => typeof c.time === 'string' && t === c.time.slice(0, 10)));
    const today = daily[todayIdx] || daily[0] || {};
    const hu = raw.hourly_units || {};
    return {
      location: {
        latitude: num(raw.latitude), longitude: num(raw.longitude), elevation: num(raw.elevation),
        timezone: raw.timezone || null, utcOffsetSeconds: num(raw.utc_offset_seconds),
      },
      units: {
        temperature: cu.temperature_2m || (temperatureUnit === 'fahrenheit' ? '°F' : '°C'),
        windSpeed: cu.wind_speed_10m || ({ kmh: 'km/h', mph: 'mp/h', ms: 'm/s', kn: 'kn' })[windSpeedUnit],
        pressure: cu.pressure_msl || 'hPa', visibility: cu.visibility || 'm', precipitation: hu.precipitation_probability || '%',
      },
      current: {
        time: typeof c.time === 'string' ? c.time : null, isDay, condition: cond, weatherCode: num(c.weather_code),
        temperature: num(c.temperature_2m), apparentTemperature: num(c.apparent_temperature), humidity: num(c.relative_humidity_2m),
        precipitation: num(c.precipitation), cloudCover: num(c.cloud_cover), pressure: num(c.pressure_msl),
        windSpeed: num(c.wind_speed_10m), windDirection: num(c.wind_direction_10m), windDirectionLabel: compass(c.wind_direction_10m),
        windGusts: num(c.wind_gusts_10m), visibility, uvIndex: num(c.uv_index),
      },
      today: {
        high: today.high ?? null, low: today.low ?? null, sunrise: today.sunrise ?? null, sunset: today.sunset ?? null,
        uvIndexMax: today.uvIndexMax ?? null, precipitationProbability: today.precipitationProbability ?? null,
      },
      hourly, daily,
    };
  }

  async function getForecast({ latitude, longitude, temperatureUnit = 'celsius', windSpeedUnit = 'kmh' }) {
    const lat = Math.round(latitude * 100) / 100; const lon = Math.round(longitude * 100) / 100;
    const key = `${lat},${lon}|${temperatureUnit}|${windSpeedUnit}`;
    const { weatherCacheMinutes } = await settingsService.get();
    const ttl = weatherCacheMinutes * 60 * 1000;

    const hit = forecastCache.get(key);
    if (hit && Date.now() - hit.at < ttl) {
      log({ provider: 'open-meteo', endpoint: 'forecast', success: true, cacheHit: true, durationMs: 0 });
      return { ...hit.value, meta: { cached: true, stale: false } };
    }
    if (inflight.has(key)) return inflight.get(key); // coalesce concurrent identical requests

    const params = new URLSearchParams({
      latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '7',
      current: CURRENT_VARS.join(','), hourly: HOURLY_VARS.join(','), daily: DAILY_VARS.join(','),
    });
    if (temperatureUnit === 'fahrenheit') params.set('temperature_unit', 'fahrenheit');
    if (windSpeedUnit !== 'kmh') params.set('wind_speed_unit', windSpeedUnit);

    const p = (async () => {
      try {
        const raw = await upstream('forecast', `${config.weatherApiBaseUrl}?${params}`);
        const data = { ...normalise(raw, { temperatureUnit, windSpeedUnit }), fetchedAt: new Date().toISOString() };
        forecastCache.set(key, data);
        return { ...data, meta: { cached: false, stale: false } };
      } catch (err) {
        // Serve a recent stale copy rather than failing outright, clearly flagged.
        if (hit && Date.now() - hit.at < STALE_MAX_MS) return { ...hit.value, meta: { cached: true, stale: true } };
        throw err;
      } finally { inflight.delete(key); }
    })();
    inflight.set(key, p);
    return p;
  }

  async function searchLocations(query) {
    const q = query.trim();
    const key = q.toLowerCase();
    const hit = geoCache.get(key);
    if (hit && Date.now() - hit.at < GEO_TTL_MS) {
      log({ provider: 'open-meteo', endpoint: 'geocoding', success: true, cacheHit: true, durationMs: 0 });
      return hit.value;
    }
    const params = new URLSearchParams({ name: q, count: '8', language: 'en', format: 'json' });
    const raw = await upstream('geocoding', `${config.geocodingApiUrl}?${params}`);
    const results = (Array.isArray(raw.results) ? raw.results : [])
      .filter((r) => num(r.latitude) !== null && num(r.longitude) !== null && r.name)
      .map((r) => ({
        id: r.id ?? null, name: r.name, country: r.country || null, countryCode: r.country_code || null,
        region: r.admin1 || null, latitude: r.latitude, longitude: r.longitude, timezone: r.timezone || null,
        population: num(r.population),
      }));
    geoCache.set(key, results);
    return results;
  }

  return { getForecast, searchLocations };
}
module.exports = { createWeatherService };
