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
    const provider = config.weatherProvider;

    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(config.weatherTimeoutMs), headers: { Accept: 'application/json' } });
      statusCode = res.status;
      let body = null;
      try { body = await res.json(); } catch { /* handled below */ }
      
      if (!res.ok || !body || body.error === true || (body.cod && String(body.cod) !== '200')) {
        const code = res.status === 429 ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_ERROR';
        const message = (body && (body.message || body.reason)) || 'The weather service returned an error. Please try again shortly.';
        
        await log({ 
          provider, 
          endpoint, 
          statusCode, 
          success: false, 
          durationMs: Date.now() - started, 
          errorCode: code,
          errorMessage: message
        });

        if (res.status === 429) {
          logger.error('upstream_rate_limited', { provider, url, message });
          throw E.upstream(message, 'UPSTREAM_RATE_LIMITED');
        }
        throw E.upstream(message, code);
      }
      await log({ provider, endpoint, statusCode, success: true, durationMs: Date.now() - started });
      return body;
    } catch (err) {
      if (err.status) throw err; // already mapped
      const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      const code = timedOut ? 'TIMEOUT' : 'NETWORK';
      
      await log({ 
        provider,
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

  function normaliseOWM(raw, { temperatureUnit, windSpeedUnit }) {
    if (!raw || !raw.current || !Array.isArray(raw.hourly) || !Array.isArray(raw.daily)) {
      throw E.upstream('The weather service returned an unexpected response.', 'UPSTREAM_BAD_RESPONSE');
    }
    const c = raw.current;
    const isDay = c.dt >= c.sunrise && c.dt <= c.sunset;
    const visibility = num(c.visibility);
    const owmCond = (c.weather && c.weather[0]) || {};
    const cond = describeWeather(owmToWmo(owmCond.id), isDay, visibility);

    const hourly = raw.hourly.slice(0, 48).map((h) => {
      const hOwmCond = (h.weather && h.weather[0]) || {};
      const hIsDay = h.dt >= c.sunrise && h.dt <= c.sunset; // approximation
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

  function normaliseOM(raw, { temperatureUnit, windSpeedUnit }) {
    if (!raw || !raw.current || !raw.hourly || !raw.daily) {
      throw E.upstream('The weather service returned an unexpected response.', 'UPSTREAM_BAD_RESPONSE');
    }
    const c = raw.current;
    const isDay = !!c.is_day;
    const cond = describeWeather(c.weather_code, isDay);

    const hourly = (raw.hourly.time || []).map((time, i) => ({
      time: time.slice(0, 16),
      temperature: num(raw.hourly.temperature_2m[i]),
      precipitationProbability: num(raw.hourly.precipitation_probability[i]),
      weatherCode: raw.hourly.weather_code[i],
      isDay: !!raw.hourly.is_day[i],
      windSpeed: num(raw.hourly.wind_speed_10m[i]),
      condition: describeWeather(raw.hourly.weather_code[i], !!raw.hourly.is_day[i]),
    }));

    const daily = (raw.daily.time || []).map((date, i) => ({
      date,
      weatherCode: raw.daily.weather_code[i],
      condition: describeWeather(raw.daily.weather_code[i], true),
      high: num(raw.daily.temperature_2m_max[i]),
      low: num(raw.daily.temperature_2m_min[i]),
      precipitationProbability: num(raw.daily.precipitation_probability_max[i]),
      precipitationSum: num(raw.daily.precipitation_sum[i]),
      windSpeedMax: num(raw.daily.wind_speed_10m_max[i]),
      sunrise: raw.daily.sunrise[i],
      sunset: raw.daily.sunset[i],
      uvIndexMax: num(raw.daily.uv_index_max[i]),
    }));

    const today = daily[0] || {};
    
    return {
      location: {
        latitude: num(raw.latitude), longitude: num(raw.longitude), elevation: num(raw.elevation),
        timezone: raw.timezone, utcOffsetSeconds: num(raw.utc_offset_seconds),
      },
      units: {
        temperature: temperatureUnit === 'fahrenheit' ? '°F' : '°C',
        windSpeed: ({ kmh: 'km/h', mph: 'mp/h', ms: 'm/s', kn: 'kn' })[windSpeedUnit],
        pressure: 'hPa', visibility: 'm', precipitation: '%',
      },
      current: {
        time: c.time,
        isDay,
        condition: cond,
        weatherCode: c.weather_code,
        temperature: num(c.temperature_2m),
        apparentTemperature: num(c.apparent_temperature),
        humidity: num(c.relative_humidity_2m),
        precipitation: num(c.precipitation),
        cloudCover: num(c.cloud_cover),
        pressure: num(c.surface_pressure),
        windSpeed: num(c.wind_speed_10m),
        windDirection: num(c.wind_direction_10m),
        windDirectionLabel: compass(c.wind_direction_10m),
        windGusts: num(c.wind_gusts_10m),
        visibility: null,
        uvIndex: null,
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
      log({ provider: config.weatherProvider, endpoint: 'forecast', success: true, cacheHit: true, durationMs: 0 });
      return { ...hit.value, meta: { cached: true, stale: false } };
    }
    if (inflight.has(key)) return inflight.get(key);

    const p = (async () => {
      try {
        let raw, data;
        if (config.weatherProvider === 'openweathermap') {
          const units = temperatureUnit === 'fahrenheit' ? 'imperial' : 'metric';
          const params = new URLSearchParams({ lat: String(lat), lon: String(lon), appid: config.openweathermapApiKey, units, exclude: 'minutely,alerts' });
          raw = await upstream('forecast', `${config.weatherApiBaseUrl}?${params}`);
          data = normaliseOWM(raw, { temperatureUnit, windSpeedUnit });
        } else {
          const params = new URLSearchParams({
            latitude: String(lat), longitude: String(lon),
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
            hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,is_day',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
            timezone: 'auto',
            temperature_unit: temperatureUnit,
            wind_speed_unit: windSpeedUnit,
            forecast_days: '14'
          });
          raw = await upstream('forecast', `${config.weatherApiBaseUrl}?${params}`);
          data = normaliseOM(raw, { temperatureUnit, windSpeedUnit });
        }
        
        const finalData = { ...data, fetchedAt: new Date().toISOString() };
        forecastCache.set(key, finalData);
        return { ...finalData, meta: { cached: false, stale: false } };
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
      log({ provider: config.weatherProvider, endpoint: 'geocoding', success: true, cacheHit: true, durationMs: 0 });
      return hit.value;
    }

    let results = [];
    if (config.weatherProvider === 'openweathermap') {
      const params = new URLSearchParams({ q, limit: '8', appid: config.openweathermapApiKey });
      const raw = await upstream('geocoding', `${config.geocodingApiUrl}?${params}`);
      results = (Array.isArray(raw) ? raw : []).map((r) => ({
        id: `${r.lat},${r.lon}`, name: r.name, country: r.country || null, countryCode: r.country || null,
        region: r.state || null, latitude: r.lat, longitude: r.lon, timezone: null, population: null,
      }));
    } else {
      const params = new URLSearchParams({ name: q, count: '10', language: 'en', format: 'json' });
      const raw = await upstream('geocoding', `${config.geocodingApiUrl}?${params}`);
      results = (raw.results || []).map((r) => ({
        id: String(r.id), name: r.name, country: r.country || null, countryCode: r.country_code || null,
        region: r.admin1 || null, latitude: r.latitude, longitude: r.longitude, timezone: r.timezone || null,
        population: r.population || null,
      }));
    }
    
    geoCache.set(key, results);
    return results;
  }

  async function reverseGeocode({ latitude, longitude }) {
    const key = `rev|${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const hit = geoCache.get(key);
    if (hit && Date.now() - hit.at < GEO_TTL_MS) {
      log({ provider: config.weatherProvider, endpoint: 'reverse-geocode', success: true, cacheHit: true, durationMs: 0 });
      return hit.value;
    }

    try {
      let result;
      if (config.weatherProvider === 'openweathermap') {
        const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude), limit: '1', appid: config.openweathermapApiKey });
        const raw = await upstream('reverse-geocode', `${config.reverseGeocodingApiUrl}?${params}`);
        const r = (Array.isArray(raw) && raw[0]) || {};
        result = { name: r.name || 'Current Location', country: r.country || null, countryCode: r.country || null, region: r.state || null };
      } else {
        // Nominatim for Open-Meteo path
        const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude), format: 'jsonv2', 'accept-language': 'en' });
        const raw = await upstream('reverse-geocode', `${config.reverseGeocodingApiUrl}?${params}`);
        const addr = raw.address || {};
        result = {
          name: addr.city || addr.town || addr.village || addr.suburb || 'Current Location',
          country: addr.country || null,
          countryCode: addr.country_code ? addr.country_code.toUpperCase() : null,
          region: addr.state || null,
        };
      }
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
