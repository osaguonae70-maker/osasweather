import { api } from './api.js';
import { $$ } from './ui.js';

const KEY = 'osw-theme';
export const getThemePref = () => { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } };

export function applyTheme(pref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.dispatchEvent(new CustomEvent('osw:theme'));
}
export function cacheTheme(pref) { try { localStorage.setItem(KEY, pref); } catch { /* ignore */ } }

/** Signed-in users: PostgreSQL is the source of truth, so server value wins on load. */
export function syncThemeFromServer(pref) { if (pref) { cacheTheme(pref); applyTheme(pref); } }

export async function chooseTheme(pref, signedIn) {
  cacheTheme(pref); applyTheme(pref);
  if (signedIn) { try { await api.patch('/preferences', { theme: pref }); } catch { /* offline: local choice still applies */ } }
}

const OPTIONS = [['light', 'Light', 'bi-sun'], ['dark', 'Dark', 'bi-moon-stars'], ['system', 'System', 'bi-circle-half']];

/** Accessible theme dropdown. host: element that receives the button + panel. */
export function mountThemeMenu(host, signedIn) {
  host.innerHTML = `<div class="osw-menu"><button type="button" class="osw-iconbtn" aria-haspopup="true" aria-expanded="false" aria-label="Change theme"><i class="bi bi-circle-half" aria-hidden="true"></i></button>
    <div class="osw-menu-panel" role="menu" hidden><div class="osw-menu-label">Theme</div>${OPTIONS.map(([v, l, i]) =>
      `<button type="button" role="menuitemradio" aria-checked="false" data-theme-opt="${v}"><i class="bi ${i}" aria-hidden="true"></i>${l}</button>`).join('')}</div></div>`;
  const btn = host.querySelector('.osw-iconbtn'); const panel = host.querySelector('.osw-menu-panel');
  const icon = btn.querySelector('i');
  const sync = () => {
    const p = getThemePref();
    $$('[data-theme-opt]', panel).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeOpt === p)));
    icon.className = `bi ${p === 'dark' ? 'bi-moon-stars' : p === 'light' ? 'bi-sun' : 'bi-circle-half'}`;
  };
  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) panel.querySelector('[aria-checked="true"]')?.focus(); });
  panel.addEventListener('click', async (e) => { const b = e.target.closest('[data-theme-opt]'); if (!b) return; await chooseTheme(b.dataset.themeOpt, signedIn); sync(); close(); btn.focus(); });
  document.addEventListener('click', (e) => { if (!host.contains(e.target)) close(); });
  host.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); btn.focus(); } });
  sync();
}
