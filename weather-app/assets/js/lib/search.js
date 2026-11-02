import { api } from './api.js';
import { esc, debounce } from './ui.js';
import { placeLabel } from './format.js';

let uid = 0;
/**
 * Accessible location search (WAI-ARIA combobox). Debounced, cancels stale requests, and
 * shows loading / empty / error states. Ambiguous names show region + country to disambiguate.
 */
export function mountSearch({ input, list, spinner, onSelect }) {
  const id = `osw-sr-${++uid}`;
  list.id = id; list.setAttribute('role', 'listbox');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', id);
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');
  let results = []; let active = -1; let ctrl;

  const open = (html) => { list.innerHTML = html; list.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const setActive = (i) => {
    const opts = list.querySelectorAll('[role="option"]');
    if (!opts.length) return;
    active = (i + opts.length) % opts.length;
    opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === active)));
    input.setAttribute('aria-activedescendant', opts[active].id);
    opts[active].scrollIntoView({ block: 'nearest' });
  };
  const choose = (i) => { const r = results[i]; if (!r) return; close(); input.value = ''; onSelect(r); };

  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { ctrl?.abort(); spinner && (spinner.hidden = true); close(); return; }
    ctrl?.abort(); ctrl = new AbortController();
    spinner && (spinner.hidden = false);
    try {
      const d = await api.get(`/weather/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      results = d.results;
      if (!results.length) open(`<div class="osw-empty">No places found for “${esc(q)}”. Check the spelling or try a nearby city.</div>`);
      else {
        open(results.map((r, i) => `<button type="button" role="option" id="${id}-${i}" aria-selected="false" data-i="${i}"><span>${esc(r.name)}</span><small>${esc([r.region, r.country].filter(Boolean).join(', '))}</small></button>`).join(''));
      }
      spinner && (spinner.hidden = true);
    } catch (e) {
      if (e.name === 'AbortError') return;
      spinner && (spinner.hidden = true);
      open(`<div class="osw-empty" role="alert">${esc(e.message || 'Search failed. Please try again.')}</div>`);
    }
  }, 300);

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden && results.length) open(list.innerHTML); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter' && active >= 0 && !list.hidden) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
  list.addEventListener('click', (e) => { const b = e.target.closest('[role="option"]'); if (b) choose(Number(b.dataset.i)); });
  document.addEventListener('click', (e) => { if (!list.contains(e.target) && e.target !== input) close(); });
  return { close, label: placeLabel };
}
