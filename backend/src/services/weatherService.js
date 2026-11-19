'use strict';
const { E } = require('../utils/errors');
const { describeWeather, compass } = require('../utils/weatherCodes');
const apiLogRepo = require('../repositories/apiLogRepository');
const logger = require('../utils/logger');

const STALE_MAX_MS = 24 * 3600 * 1000; // 24 hours
const MAX_ENTRIES = 1000;
const GEO_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

/** Maps OpenWeatherMap condition codes to WMO codes for describeWeather() */
function owmToWmo(id) {
  if (id >= 200 && id < 300) return 95; // Thunderstorm
  if (id >= 300 && id < 400) return 51; // Drizzle
  if (id >= 500 && id < 600) {
    if (id === 500) return 61; // light rain
    if (id === 501) return 63; // moderate rain
    if (id === 511) return 66; // freezing rain
    if (id >= 520) return 81; // showers
    return 65; // heavy rain
  }
  if (id >= 600 && id < 700) return 73; // Snow
  if (id >= 700 && id < 800) return 45; // Fog/Atmosphere
  if (id === 800) return 0; // Sunny
  if (id === 801) return 1; // Mainly clear
  if (id === 802) return 2; // Partly cloudy
  return 3; // Overcast
}

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
      
      if (!res.ok || !body || body.error === true || (body.cod && String(body.cod) !== '200')) {
        const code = res.status === 429 ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_ERROR';
        const message = (body && (body.message || body.reason)) || 'The weather service returned an error. Please try again shortly.';
        
        await log({ 
          provider: 'openweathermap', 
          endpoint, 
          statusCode, 
          success: false, 
          durationMs: Date.now() - started, 
          errorCode: code,
          errorMessage: message
        });

        if (res.status === 429) {
          logger.error('upstream_rate_limited', { provider: endpoint, url, message });
          throw E.upstream(message, 'UPSTREAM_RATE_LIMITED');
        }
        throw E.upstream(message, code);
      }
      await log({ provider: 'openweathermap', endpoint, statusCode, success: true, durationMs: Date.now() - started });
      return body;
    } catch (err) {
      if (err.status) throw err; // already mapped
      const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      const code = timedOut ? 'TIMEOUT' : 'NETWORK';
      
      await log({ 
        provider: 'openweathermap',
        endpoint, 
        statusCode, 
        success: false, 
        durationMs: Date.now() - started, 
        errorCode: code,
        errorMessage: err.message
      });

      throw timedOut ? E.timeout() : E.upstream('Could not reach the weather service.', 'UPSTREAM_UNREACHABLE');
    }
  }

  function normalise(raw, { temperatureUnit, windSpeedUnit }) {
    if (!raw || !raw.current || !Array.isArray(raw.hourly) || !Array.isArray(raw.daily)) {
      throw E.upstream('The weather service returned an unexpected response.', 'UPSTREAM_BAD_RESPONSE');
    }
    const c = raw.current;
    const isDay = Date.now() / 1000 > c.sunrise && Date.now() / 1000 < c.sunset;
    const visibility = num(c.visibility);
    const owmCond = (c.weather && c.weather[0]) || {};
    const cond = describeWeather(owmToWmo(owmCond.id), isDay, visibility);

    const hourly = raw.hourly.slice(0, 48).map((h) => {
      const hOwmCond = (h.weather && h.weather[0]) || {};
      const hIsDay = h.dt > c.sunrise && h.dt < c.sunset; // approximation
      return {
        time: new Date(h.dt * 1000).toISOString().slice(0, 16),
        temperature: num(h.temp),
        precipitationProbability: num(h.pop ? h.pop * 100 : 0),
        weatherCode: owmToWmo(hOwmCond.id),
        isDay: hIsDay,
        windSpeed: num(h.wind_speed),
        condition: describeWeather(owmToWmo(hOwmCond.id), hIsDay),
      };
    });

    const daily = raw.daily.slice(0, 7).map((d) => {
      const dOwmCond = (d.weather && d.weather[0]) || {};
      return {
        date: new Date(d.dt * 1000).toISOString().slice(0, 10),
        weatherCode: owmToWmo(dOwmCond.id),
        condition: describeWeather(owmToWmo(dOwmCond.id), true),
        high: num(d.temp.max),
        low: num(d.temp.min),
        precipitationProbability: num(d.pop ? d.pop * 100 : 0),
        precipitationSum: num(d.rain || d.snow || 0),
        windSpeedMax: num(d.wind_speed),
        sunrise: new Date(d.sunrise * 1000).toISOString(),
        sunset: new Date(d.sunset * 1000).toISOString(),
        uvIndexMax: num(d.uvi),
      };
    });

    const today = daily[0] || {};
    
    return {
      location: {
        latitude: num(raw.lat), longitude: num(raw.lon), elevation: null,
        timezone: raw.timezone || null, utcOffsetSeconds: num(raw.timezone_offset),
      },
      units: {
        temperature: temperatureUnit === 'fahrenheit' ? '°F' : '°C',
        windSpeed: ({ kmh: 'km/h', mph: 'mp/h', ms: 'm/s', kn: 'kn' })[windSpeedUnit],
        pressure: 'hPa', visibility: 'm', precipitation: '%',
      },
      current: {
        time: new Date(c.dt * 1000).toISOString(),
        isDay,
        condition: cond,
        weatherCode: owmToWmo(owmCond.id),
        temperature: num(c.temp),
        apparentTemperature: num(c.feels_like),
        humidity: num(c.humidity),
        precipitation: num(c.rain ? c.rain['1h'] : (c.snow ? c.snow['1h'] : 0)),
        cloudCover: num(c.clouds),
        pressure: num(c.pressure),
        windSpeed: num(c.wind_speed),
        windDirection: num(c.wind_deg),
        windDirectionLabel: compass(c.wind_deg),
        windGusts: num(c.wind_gust),
        visibility,
        uvIndex: num(c.uvi),
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
      log({ provider: 'openweathermap', endpoint: 'forecast', success: true, cacheHit: true, durationMs: 0 });
      return { ...hit.value, meta: { cached: true, stale: false } };
    }
    if (inflight.has(key)) return inflight.get(key);

    const units = temperatureUnit === 'fahrenheit' ? 'imperial' : 'metric';
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      appid: config.openweathermapApiKey,
      units,
      exclude: 'minutely,alerts'
    });

    const p = (async () => {
      try {
        const raw = await upstream('forecast', `${config.weatherApiBaseUrl}?${params}`);
        const data = { ...normalise(raw, { temperatureUnit, windSpeedUnit }), fetchedAt: new Date().toISOString() };
        forecastCache.set(key, data);
        return { ...data, meta: { cached: false, stale: false } };
      } catch (err) {
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
      log({ provider: 'openweathermap', endpoint: 'geocoding', success: true, cacheHit: true, durationMs: 0 });
      return hit.value;
    }
    const params = new URLSearchParams({ q, limit: '8', appid: config.openweathermapApiKey });
    const raw = await upstream('geocoding', `${config.geocodingApiUrl}?${params}`);
    const results = (Array.isArray(raw) ? raw : [])
      .map((r) => ({
        id: `${r.lat},${r.lon}`, name: r.name, country: r.country || null, countryCode: r.country || null,
        region: r.state || null, latitude: r.lat, longitude: r.lon, timezone: null,
        population: null,
      }));
    geoCache.set(key, results);
    return results;
  }

  async function reverseGeocode({ latitude, longitude }) {
    const key = `rev|${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const hit = geoCache.get(key);
    if (hit && Date.now() - hit.at < GEO_TTL_MS) {
      log({ provider: 'openweathermap', endpoint: 'reverse-geocode', success: true, cacheHit: true, durationMs: 0 });
      return hit.value;
    }

    const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude), limit: '1', appid: config.openweathermapApiKey });
    try {
      const raw = await upstream('reverse-geocode', `${config.reverseGeocodingApiUrl}?${params}`);
      const r = (Array.isArray(raw) && raw[0]) || {};
      const result = {
        name: r.name || 'Current Location',
        country: r.country || null,
        countryCode: r.country || null,
        region: r.state || null,
      };
      geoCache.set(key, result);
      return result;
    } catch (err) {
      logger.warn('reverse_geocode_failed', { message: err.message, latitude, longitude });
      return { name: 'Current Location', country: null, countryCode: null, region: null };
    }
  }

  return { getForecast, searchLocations, reverseGeocode };
}
module.exports = { createWeatherService };
