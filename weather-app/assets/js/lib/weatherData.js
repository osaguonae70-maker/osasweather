import { api } from './api.js';
import { state } from './session.js';
import { describeWeather, compass } from './weatherCodes.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function normaliseOM(raw, { temperatureUnit, windSpeedUnit }) {
  if (!raw || !raw.current || !raw.hourly || !raw.daily) {
    throw new Error('The weather service returned an unexpected response.');
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
  const windUnitLabel = ({ kmh: 'km/h', mph: 'mp/h', ms: 'm/s', kn: 'kn' })[windSpeedUnit];

  return {
    location: {
      latitude: num(raw.latitude), longitude: num(raw.longitude), elevation: num(raw.elevation),
      timezone: raw.timezone, utcOffsetSeconds: num(raw.utc_offset_seconds),
    },
    units: {
      temperature: temperatureUnit === 'fahrenheit' ? '°F' : '°C',
      windSpeed: windUnitLabel,
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

async function fetchOpenMeteoDirect(loc, prefs) {
  const params = new URLSearchParams({
    latitude: String(loc.latitude), longitude: String(loc.longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
    timezone: 'auto',
    temperature_unit: prefs.temperatureUnit,
    wind_speed_unit: prefs.windSpeedUnit,
    forecast_days: '14'
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error('Could not reach Open-Meteo directly.');
  const raw = await res.json();
  const data = normaliseOM(raw, prefs);
  return { ...data, fetchedAt: new Date().toISOString(), meta: { cached: false, stale: false } };
}

export const loadOverview = async (loc, prefs = state.prefs) => {
  // If using Open-Meteo, try to fetch directly first to bypass Render IP rate limits.
  if (state.weatherProvider === 'open-meteo') {
    try {
      return await fetchOpenMeteoDirect(loc, prefs);
    } catch (err) {
      console.warn('Direct Open-Meteo fetch failed, falling back to backend:', err.message);
      // Fall through to backend call
    }
  }

  // Standard backend call (for OpenWeatherMap or as fallback)
  return api.get(`/weather/overview?${new URLSearchParams({
    lat: loc.latitude, lon: loc.longitude, temperatureUnit: prefs.temperatureUnit, windSpeedUnit: prefs.windSpeedUnit,
  })}`);
};

const LAST = 'osw-last-location';
const GEO_PREF = 'osw-geo-permission';

export const rememberLocation = (loc) => { try { localStorage.setItem(LAST, JSON.stringify({ name: loc.name, country: loc.country || null, region: loc.region || null, latitude: loc.latitude, longitude: loc.longitude })); } catch { /* ignore */ } };

export function lastLocation() {
  try { const v = JSON.parse(localStorage.getItem(LAST) || 'null'); return v && Number.isFinite(v.latitude) ? v : null; } catch { return null; }
}

export function getGeoPermission() {
  try { return localStorage.getItem(GEO_PREF); } catch { return null; }
}

export function setGeoPermission(status) {
  try { localStorage.setItem(GEO_PREF, status); } catch { /* ignore */ }
}

/** Best-effort starting place for visitors: the city component of the browser's IANA time zone. */
export async function guessLocation() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const city = tz.includes('/') ? tz.split('/').pop().replace(/_/g, ' ') : '';
    if (city) {
      const d = await api.get(`/weather/search?q=${encodeURIComponent(city)}`);
      if (d.results[0]) return d.results[0];
    }
  } catch { /* fall through */ }
  return null;
}

export function currentLocation(options = { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GEOLOCATION_NOT_SUPPORTED'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGeoPermission('granted');
        resolve({
          name: 'Current Location',
          country: null,
          region: null,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      },
      (err) => {
        let code = 'GEOLOCATION_ERROR';
        if (err.code === err.PERMISSION_DENIED) {
          code = 'GEOLOCATION_DENIED';
          setGeoPermission('denied');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          code = 'GEOLOCATION_UNAVAILABLE';
        } else if (err.code === err.TIMEOUT) {
          code = 'GEOLOCATION_TIMEOUT';
        }
        reject(new Error(code));
      },
      options
    );
  });
}
