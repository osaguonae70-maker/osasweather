import { api } from '../lib/api.js';
import { $, $$, toast } from '../lib/ui.js';
import { requireSession, state } from '../lib/session.js';
import { mountShell } from '../lib/shell.js';
import { chooseTheme, getThemePref } from '../lib/theme.js';
import { mountSearch } from '../lib/search.js';

async function save(patch) {
  try { const d = await api.patch('/preferences', patch); Object.assign(state.prefs, d.preferences); toast('Settings saved'); return true; }
  catch (e) { toast(e.message, 'error'); return false; }
}

async function main() {
  const s = await requireSession();
  if (!s) return;
  mountShell({ page: 'settings.html' });
  if (s.error) return;

  const current = (key) => (key === 'theme' ? getThemePref() : state.prefs[key]);
  const paintSeg = (seg) => $$('button', seg).forEach((b) => { const on = b.dataset.v === current(seg.dataset.seg); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  for (const seg of $$('[data-seg]')) {
    paintSeg(seg);
    const choose = async (btn) => {
      const key = seg.dataset.seg; const prev = current(key);
      if (btn.dataset.v === prev) return;
      if (key === 'theme') { await chooseTheme(btn.dataset.v, true); state.prefs.theme = btn.dataset.v; toast('Settings saved'); }
      else { state.prefs[key] = btn.dataset.v; if (!(await save({ [key]: btn.dataset.v }))) state.prefs[key] = prev; }
      paintSeg(seg);
    };
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choose(b); });
    seg.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const btns = $$('button', seg); const i = btns.indexOf(document.activeElement);
      const next = btns[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length];
      next.focus(); choose(next);
    });
  }

  const label = $('[data-default-label]'); const clear = $('[data-clear-default]');
  const paintDefault = () => {
    const d = state.prefs.defaultLocation;
    label.textContent = d ? `${d.name}${d.country ? `, ${d.country}` : ''} opens when you visit the dashboard.` : 'None. The dashboard opens your last viewed place.';
    clear.hidden = !d;
  };
  paintDefault();
  const box = $('.osw-search', $('[data-default-box]'));
  mountSearch({
    input: $('input', box), list: $('.osw-results', box), spinner: $('.osw-search-spin', box),
    onSelect: async (r) => {
      const name = r.region && !r.name.includes(r.region) ? `${r.name}, ${r.region}` : r.name;
      const loc = { name, country: r.country || null, latitude: r.latitude, longitude: r.longitude };
      if (await save({ defaultLocation: loc })) paintDefault();
    },
  });
  clear.addEventListener('click', async () => { if (await save({ defaultLocation: null })) paintDefault(); });
}
main();
