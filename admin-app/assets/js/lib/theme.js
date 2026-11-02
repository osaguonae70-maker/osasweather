const KEY = 'osw-admin-theme';
export const getPref = () => { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } };
export function setPref(p) {
  try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
  const dark = p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); document.dispatchEvent(new CustomEvent('adm:theme'));
}
export const cycle = () => { const o = ['system', 'light', 'dark']; const next = o[(o.indexOf(getPref()) + 1) % 3]; setPref(next); return next; };
