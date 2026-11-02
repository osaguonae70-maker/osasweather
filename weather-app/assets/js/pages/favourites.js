import { api } from '../lib/api.js';
import { $, esc, applyCss, toast, confirmDialog, stateBlock } from '../lib/ui.js';
import { requireSession } from '../lib/session.js';
import { mountShell } from '../lib/shell.js';
import { loadOverview } from '../lib/weatherData.js';
import { weatherIcon, skyFor } from '../lib/icons.js';
import { deg } from '../lib/format.js';

const root = $('[data-root]');
const href = (f) => `dashboard.html?${new URLSearchParams({ lat: f.latitude, lon: f.longitude, name: f.name, country: f.country || '' })}`;

function card(f) {
  return `<article class="osw-fav" data-id="${esc(f.id)}" data-sky="cloudy">
    <a class="top" href="${esc(href(f))}">
      <div><div class="nm">${esc(f.name)}</div><div class="osw-sky-sub tw-opacity-80 tw-text-sm">${esc(f.country || '')}</div></div>
      <div class="tw-text-right" data-wx><span class="osw-skel tw-inline-block tw-w-16 tw-h-10" aria-hidden="true"></span></div>
    </a>
    <div class="bot"><span data-cond>Loading…</span><button type="button" class="btn btn-danger-soft btn-sm" data-remove aria-label="Remove ${esc(f.name)} from favourites"><i class="bi bi-trash" aria-hidden="true"></i>Remove</button></div>
  </article>`;
}

async function fillWeather(el, f) {
  try {
    const d = await loadOverview(f);
    const c = d.current;
    el.dataset.sky = skyFor(c.condition.icon);
    $('[data-wx]', el).innerHTML = `<div class="d-flex align-items-center gap-2 justify-content-end">${weatherIcon(c.condition.icon, c.condition.label)}<div class="tm">${deg(c.temperature)}</div></div>`;
    $('[data-cond]', el).textContent = `${c.condition.label} · H ${deg(d.today.high)} L ${deg(d.today.low)}`;
  } catch {
    $('[data-wx]', el).innerHTML = '';
    $('[data-cond]', el).textContent = 'Forecast unavailable';
  }
}

async function pool(items, n, fn) { const q = [...items]; await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()); })); }

async function main() {
  const s = await requireSession();
  if (!s) return;
  mountShell({ page: 'favourites.html' });
  if (s.error) { root.innerHTML = stateBlock({ title: 'Can’t reach the server', text: 'Check your connection and reload the page.' }); return; }
  let favs;
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-reload]')) { location.reload(); return; }
    const btn = e.target.closest('[data-remove]'); if (!btn) return;
    const el = btn.closest('[data-id]'); const f = favs.find((x) => x.id === el.dataset.id);
    if (!(await confirmDialog({ title: `Remove ${f.name}?`, body: 'It will no longer appear in your favourites. You can add it again any time.', confirmText: 'Remove', danger: true }))) return;
    try { await api.del(`/favourites/${f.id}`); el.remove(); favs = favs.filter((x) => x.id !== f.id); toast('Removed from favourites'); if (!favs.length) location.reload(); }
    catch (err) { toast(err.message, 'error'); }
  });
  try { favs = (await api.get('/favourites')).favourites; }
  catch (e) { root.innerHTML = stateBlock({ title: 'Couldn’t load your favourites', text: e.message, actionHtml: '<button class="btn btn-sun" data-reload>Try again</button>' }); return; }
  if (!favs.length) {
    root.innerHTML = stateBlock({ icon: 'bi-star', title: 'No favourite locations yet', text: 'Open any forecast and tap the star to save the place here.', actionHtml: '<a class="btn btn-sun" href="dashboard.html">Find a place</a>' });
    return;
  }
  root.innerHTML = `<div class="osw-fav-grid">${favs.map(card).join('')}</div>`;
  applyCss(root);
  const els = new Map(favs.map((f) => [f.id, $(`[data-id="${CSS.escape(f.id)}"]`, root)]));
  pool(favs, 4, (f) => fillWeather(els.get(f.id), f));

}
main();
