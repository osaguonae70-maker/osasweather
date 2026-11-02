import { $, banner, clearFieldErrors, showFieldErrors, setLoading, wirePasswordToggles, wireStrengthMeter } from './ui.js';
import { mountThemeMenu } from './theme.js';
import { weatherIcon } from './icons.js';

/** Shared setup for the split-screen auth pages. */
export function initAuthPage() {
  const side = $('[data-side-icon]');
  if (side) side.innerHTML = weatherIcon('partly-cloudy-day', null);
  wirePasswordToggles();
  const meter = $('[data-meter]'); const pw = $('input[name="password"]');
  if (meter && pw) wireStrengthMeter(pw, meter, $('[data-strength-hint]'));
  const host = document.createElement('div'); host.className = 'tw-fixed tw-top-4 tw-right-4 tw-z-40'; host.dataset.themeHost = '';
  document.body.append(host); mountThemeMenu(host, false);
}

/** Wires a form: clears errors, sets loading, calls handler(values), maps API errors to fields/banner. */
export function wireForm(form, bannerEl, label, handler) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form); banner(bannerEl, '');
    const btn = form.querySelector('button[type="submit"]');
    if (btn.classList.contains('is-loading')) return; // submission protection
    const values = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      values[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    setLoading(btn, true, label);
    try { await handler(values); }
    catch (err) {
      if (err.details) showFieldErrors(form, err.details);
      banner(bannerEl, err.details ? 'Please correct the highlighted fields.' : err.message);
    } finally { setLoading(btn, false); }
  });
}
export const need = (values, rules) => {
  const d = {};
  for (const [k, msg] of Object.entries(rules)) if (!String(values[k] ?? '').trim() || values[k] === false) d[k] = msg;
  if (Object.keys(d).length) { const e = new Error('Please correct the highlighted fields.'); e.details = d; throw e; }
};
