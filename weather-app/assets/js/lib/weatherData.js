import { api } from './api.js';
import { state } from './session.js';

export const loadOverview = (loc, prefs = state.prefs) => api.get(`/weather/overview?${new URLSearchParams({
  lat: loc.latitude, lon: loc.longitude, temperatureUnit: prefs.temperatureUnit, windSpeedUnit: prefs.windSpeedUnit,
})}`);

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
