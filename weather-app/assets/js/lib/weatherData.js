import { api } from './api.js';
import { state } from './session.js';

export const loadOverview = (loc, prefs = state.prefs) => api.get(`/weather/overview?${new URLSearchParams({
  lat: loc.latitude, lon: loc.longitude, temperatureUnit: prefs.temperatureUnit, windSpeedUnit: prefs.windSpeedUnit,
})}`);

const LAST = 'osw-last-location';
export const rememberLocation = (loc) => { try { localStorage.setItem(LAST, JSON.stringify({ name: loc.name, country: loc.country || null, region: loc.region || null, latitude: loc.latitude, longitude: loc.longitude })); } catch { /* ignore */ } };
export function lastLocation() {
  try { const v = JSON.parse(localStorage.getItem(LAST) || 'null'); return v && Number.isFinite(v.latitude) ? v : null; } catch { return null; }
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
