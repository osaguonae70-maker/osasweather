'use strict';
/**
 * DEV/TEST ONLY. A local stand-in for Open-Meteo so the stack can be exercised offline:
 *   node scripts/mock-open-meteo.js            (listens on :5600)
 * then start the backend with
 *   WEATHER_API_BASE_URL=http://localhost:5600/v1/forecast GEOCODING_API_URL=http://localhost:5600/v1/search
 * The shapes follow Open-Meteo's response format, but the numbers are synthetic. Never use it in production.
 */
const http = require('node:http');
const PORT = Number(process.env.MOCK_PORT || 5600);
const CITIES = [
  { id: 2332459, name: 'Lagos', latitude: 6.5244, longitude: 3.3792, country: 'Nigeria', country_code: 'NG', admin1: 'Lagos', timezone: 'Africa/Lagos', tz: 1 },
  { id: 2352778, name: 'Abuja', latitude: 9.0765, longitude: 7.3986, country: 'Nigeria', country_code: 'NG', admin1: 'FCT', timezone: 'Africa/Lagos', tz: 1 },
  { id: 2643743, name: 'London', latitude: 51.5085, longitude: -0.1257, country: 'United Kingdom', country_code: 'GB', admin1: 'England', timezone: 'Europe/London', tz: 0 },
  { id: 4250542, name: 'Springfield', latitude: 39.8017, longitude: -89.6437, country: 'United States', country_code: 'US', admin1: 'Illinois', timezone: 'America/Chicago', tz: -5 },
  { id: 4409896, name: 'Springfield', latitude: 37.2153, longitude: -93.2982, country: 'United States', country_code: 'US', admin1: 'Missouri', timezone: 'America/Chicago', tz: -5 },
  { id: 3936456, name: 'Lima', latitude: -12.0432, longitude: -77.0282, country: 'Peru', country_code: 'PE', admin1: 'Lima', timezone: 'America/Lima', tz: -5 },
  { id: 1850147, name: 'Tokyo', latitude: 35.6895, longitude: 139.6917, country: 'Japan', country_code: 'JP', admin1: 'Tokyo', timezone: 'Asia/Tokyo', tz: 9 },
  { id: 2267057, name: 'Lisbon', latitude: 38.7167, longitude: -9.1333, country: 'Portugal', country_code: 'PT', admin1: 'Lisbon', timezone: 'Europe/Lisbon', tz: 0 },
];
const CODES = [0, 2, 3, 61, 95, 45, 71, 1, 65, 80];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

function forecast(q) {
  const lat = Number(q.get('latitude')); const lon = Number(q.get('longitude'));
  const city = CITIES.reduce((a, c) => (Math.hypot(c.latitude - lat, c.longitude - lon) < Math.hypot(a.latitude - lat, a.longitude - lon) ? c : a));
  const tz = city.tz; const f = q.get('temperature_unit') === 'fahrenheit'; const wu = q.get('wind_speed_unit') || 'kmh';
  const T = (c) => (f ? Math.round((c * 9 / 5 + 32) * 10) / 10 : c); const W = (k) => Math.round((wu === 'mph' ? k * 0.621371 : wu === 'ms' ? k / 3.6 : wu === 'kn' ? k * 0.539957 : k) * 10) / 10;
  const base = Math.max(-5, 33 - Math.abs(lat) * 0.55);
  const nowLocal = new Date(Date.now() + tz * 3600 * 1000);
  const mid = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()));
  const hours = Array.from({ length: 168 }, (_, i) => new Date(mid.getTime() + i * 3600 * 1000));
  const code = CODES[Math.floor(Math.abs(lat * 7 + lon)) % CODES.length];
  const night = nowLocal.getUTCHours() < 6 || nowLocal.getUTCHours() >= 19;
  const hourT = (h) => base + 5 * Math.sin(((h.getUTCHours() - 9) / 24) * 2 * Math.PI);
  const curH = nowLocal.getUTCHours();
  return {
    latitude: lat, longitude: lon, generationtime_ms: 0.4, utc_offset_seconds: tz * 3600, timezone: city.timezone, timezone_abbreviation: 'GMT', elevation: 120,
    current_units: { time: 'iso8601', temperature_2m: f ? '°F' : '°C', wind_speed_10m: wu === 'mph' ? 'mp/h' : wu === 'ms' ? 'm/s' : wu === 'kn' ? 'kn' : 'km/h', pressure_msl: 'hPa', visibility: 'm' },
    current: { time: iso(new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate(), curH, Math.floor(nowLocal.getUTCMinutes() / 15) * 15))), interval: 900,
      temperature_2m: T(Math.round(hourT(nowLocal) * 10) / 10), relative_humidity_2m: 40 + (Math.round(lat) % 40), apparent_temperature: T(Math.round((hourT(nowLocal) + 2.5) * 10) / 10), is_day: night ? 0 : 1,
      precipitation: [61, 65, 80, 95].includes(code) ? 1.4 : 0, weather_code: code, cloud_cover: [0, 1].includes(code) ? 8 : 70, pressure_msl: 1008 + (Math.round(lon) % 9),
      wind_speed_10m: W(11.5), wind_direction_10m: (Math.round(lon * 3) + 360) % 360, wind_gusts_10m: W(24.8), visibility: code === 45 ? 700 : 24100, uv_index: night ? 0 : 6.4 },
    hourly_units: { precipitation_probability: '%' },
    hourly: { time: hours.map(iso), temperature_2m: hours.map((h) => T(Math.round(hourT(h) * 10) / 10)), precipitation_probability: hours.map((h, i) => ([61, 65, 80, 95].includes(code) ? 40 + ((i * 11) % 55) : (i * 3) % 12)),
      weather_code: hours.map((_, i) => (i % 29 === 0 ? CODES[(i + 3) % CODES.length] : code)), wind_speed_10m: hours.map((h, i) => W(8 + ((i * 5) % 13))), is_day: hours.map((h) => (h.getUTCHours() >= 6 && h.getUTCHours() < 19 ? 1 : 0)) },
    daily_units: {},
    daily: { time: Array.from({ length: 7 }, (_, i) => iso(new Date(mid.getTime() + i * 86400000)).slice(0, 10)),
      weather_code: Array.from({ length: 7 }, (_, i) => CODES[(CODES.indexOf(code) + i * 3) % CODES.length]),
      temperature_2m_max: Array.from({ length: 7 }, (_, i) => T(Math.round((base + 5 + ((i * 7) % 5) - 2) * 10) / 10)), temperature_2m_min: Array.from({ length: 7 }, (_, i) => T(Math.round((base - 6 + ((i * 3) % 4)) * 10) / 10)),
      sunrise: Array.from({ length: 7 }, (_, i) => `${iso(new Date(mid.getTime() + i * 86400000)).slice(0, 10)}T06:${pad(20 + i)}`), sunset: Array.from({ length: 7 }, (_, i) => `${iso(new Date(mid.getTime() + i * 86400000)).slice(0, 10)}T18:${pad(30 + i)}`),
      uv_index_max: Array.from({ length: 7 }, (_, i) => 6.5 + (i % 3)), precipitation_probability_max: Array.from({ length: 7 }, (_, i) => (i * 17) % 90), precipitation_sum: Array.from({ length: 7 }, (_, i) => Math.round((i % 4) * 2.2 * 10) / 10), wind_speed_10m_max: Array.from({ length: 7 }, () => W(26)) },
  };
}

http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/v1/forecast') { res.end(JSON.stringify(forecast(u.searchParams))); return; }
  if (u.pathname === '/v1/search') {
    const name = (u.searchParams.get('name') || '').toLowerCase();
    const results = CITIES.filter((c) => c.name.toLowerCase().startsWith(name));
    res.end(JSON.stringify(results.length ? { results, generationtime_ms: 0.3 } : { generationtime_ms: 0.3 })); return;
  }
  res.statusCode = 404; res.end('{}');
}).listen(PORT, () => console.log(`mock open-meteo on :${PORT}`));
