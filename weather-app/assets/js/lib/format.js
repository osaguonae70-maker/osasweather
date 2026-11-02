// Formatting helpers. Values arrive already converted to the user's units by the API; we only label them.
export const dash = '–';
export const deg = (n) => (n == null ? dash : `${Math.round(n)}°`);
export const pct = (n) => (n == null ? dash : `${Math.round(n)}%`);

const pad = (n) => String(n).padStart(2, '0');
export function hourLabel(iso) {
  const h = Number(iso.slice(11, 13));
  return h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
}
export function clockLabel(iso) {
  if (!iso) return dash;
  const h = Number(iso.slice(11, 13)); const m = iso.slice(14, 16);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}
const dateOf = (d) => new Date(`${d}T12:00:00Z`);
export const weekday = (d, i) => (i === 0 ? 'Today' : dateOf(d).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }));
export const shortDate = (d) => dateOf(d).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Live local date/time at the forecast location (DST-correct via IANA zone). */
export function localNow(tz) {
  try {
    const now = new Date();
    return {
      date: now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz }),
      time: now.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', timeZone: tz }),
    };
  } catch { return null; }
}
export const windUnit = (u) => ({ 'mp/h': 'mph', 'km/h': 'km/h', 'm/s': 'm/s', kn: 'kn' })[u] || u || '';
export const speed = (n) => (n == null ? dash : Math.round(n));
export function visibilityKm(m) {
  if (m == null) return null;
  const km = m / 1000;
  return km >= 10 ? String(Math.round(km)) : km.toFixed(1);
}
export const placeLabel = (l) => [l.name, l.region, l.country].filter(Boolean).join(', ');
export const uvBand = (v) => (v == null ? null : v < 3 ? 'Low' : v < 6 ? 'Moderate' : v < 8 ? 'High' : v < 11 ? 'Very high' : 'Extreme');
export const timeAgo = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
};
export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : dash);
