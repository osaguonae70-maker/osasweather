import { api, forgetCsrf } from './api.js';
import { syncThemeFromServer } from './theme.js';

export const state = {
  user: null,
  prefs: { temperatureUnit: 'celsius', windSpeedUnit: 'kmh', defaultLocation: null, theme: 'system' },
};

/** Returns the session ({user, preferences}) or null when signed out / suspended. Never trusts local state. */
const HINT = 'osw-hint'; // UI-only: lets public pages skip a pointless /auth/me call. NOT authentication.
export const setSessionHint = (on) => { try { on ? localStorage.setItem(HINT, '1') : localStorage.removeItem(HINT); } catch { /* ignore */ } };
export const hasSessionHint = () => { try { return localStorage.getItem(HINT) === '1'; } catch { return false; } };

export async function loadSession() {
  try {
    const d = await api.get('/auth/me');
    state.user = d.user;
    Object.assign(state.prefs, d.preferences || {});
    syncThemeFromServer(state.prefs.theme); setSessionHint(true);
    return d;
  } catch (e) {
    if (e.status === 401 || e.status === 403) { setSessionHint(false); return null; }
    throw e;
  }
}

const SAFE_NEXT = /^[a-z-]+\.html(\?[\w=&.%-]*)?(#[\w=&.-]*)?$/i;
export const safeNext = (n) => (n && SAFE_NEXT.test(n) ? n : 'dashboard.html');

export async function requireSession() {
  let s;
  try { s = await loadSession(); } catch { return { error: true }; }
  if (!s) {
    const here = location.pathname.split('/').pop() + location.search + location.hash;
    location.replace(`login.html?next=${encodeURIComponent(here)}`);
    return null;
  }
  return s;
}

export async function logout() {
  try { await api.post('/auth/logout'); } catch { /* cookie may already be gone */ }
  forgetCsrf(); state.user = null; setSessionHint(false);
  location.href = 'login.html?loggedout=1';
}
