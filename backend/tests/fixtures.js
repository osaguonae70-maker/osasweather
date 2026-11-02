'use strict';
// A response shaped like Open-Meteo's /v1/forecast (current + hourly + daily, timezone=auto).
function forecastPayload({ missing = [], fahrenheit = false, wind = 'km/h' } = {}) {
  const day = '2026-10-31';
  const hours = Array.from({ length: 24 * 7 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 31 + Math.floor(i / 24), i % 24));
    return d.toISOString().slice(0, 13) + ':00';
  });
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10));
  const t = (i) => (fahrenheit ? 80 + (i % 5) : 27 + (i % 5));
  const current = {
    time: `${day}T14:00`, interval: 900, temperature_2m: t(0), relative_humidity_2m: 61, apparent_temperature: t(0) + 3, is_day: 1,
    precipitation: 0, weather_code: 2, cloud_cover: 45, pressure_msl: 1011.2, wind_speed_10m: 9.4, wind_direction_10m: 225,
    wind_gusts_10m: 18.7, visibility: 24100, uv_index: 7.2,
  };
  for (const k of missing) delete current[k];
  return {
    latitude: 9.07, longitude: 7.4, elevation: 476, timezone: 'Africa/Lagos', utc_offset_seconds: 3600,
    current_units: { temperature_2m: fahrenheit ? '°F' : '°C', wind_speed_10m: wind, pressure_msl: 'hPa', visibility: 'm' },
    current,
    hourly_units: { precipitation_probability: '%' },
    hourly: {
      time: hours, temperature_2m: hours.map((_, i) => t(i)), precipitation_probability: hours.map((_, i) => (i * 7) % 100),
      weather_code: hours.map((_, i) => [0, 2, 3, 61, 95][i % 5]), wind_speed_10m: hours.map((_, i) => 5 + (i % 9)),
      is_day: hours.map((_, i) => (i % 24 >= 6 && i % 24 < 18 ? 1 : 0)),
    },
    daily: {
      time: days, weather_code: days.map((_, i) => [3, 61, 95, 0, 2, 1, 80][i]), temperature_2m_max: days.map((_, i) => t(i) + 4),
      temperature_2m_min: days.map((_, i) => t(i) - 6), sunrise: days.map((d) => `${d}T06:12`), sunset: days.map((d) => `${d}T18:09`),
      uv_index_max: days.map(() => 9.1), precipitation_probability_max: days.map((_, i) => i * 10), precipitation_sum: days.map((_, i) => i * 1.5),
      wind_speed_10m_max: days.map(() => 21),
    },
  };
}
const geoPayload = () => ({
  results: [
    { id: 1, name: 'Springfield', latitude: 39.8, longitude: -89.64, country: 'United States', country_code: 'US', admin1: 'Illinois', timezone: 'America/Chicago', population: 114000 },
    { id: 2, name: 'Springfield', latitude: 37.2, longitude: -93.29, country: 'United States', country_code: 'US', admin1: 'Missouri', timezone: 'America/Chicago' },
  ],
});
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** A programmable fake fetch that records the requested URLs. */
function fakeFetch(handler) {
  const calls = [];
  const f = async (url, opts) => { calls.push(String(url)); return handler(String(url), opts, calls.length); };
  f.calls = calls;
  return f;
}
module.exports = { forecastPayload, geoPayload, json, fakeFetch };
