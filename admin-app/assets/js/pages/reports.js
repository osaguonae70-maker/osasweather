import { api } from '../lib/api.js';
import { $, esc, skel, stateBlock, applyCss } from '../lib/ui.js';
import { requireAdmin, mountShell } from '../lib/shell.js';
import { chart, axes } from '../lib/charts.js';
import { n } from '../lib/format.js';

const root = $('[data-root]');
const bars = (items, key, label) => { const max = Math.max(1, ...items.map((i) => i.count)); return items.length ? `<div class="adm-bars">${items.map((i) => `<div class="adm-bar"><span>${esc(label(i))}</span><span class="t"><i data-css="width:${((i.count / max) * 100).toFixed(1)}%"></i></span><b class="adm-num">${n(i.count)}</b></div>`).join('')}</div>` : stateBlock('bi-inbox', 'No data yet'); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

async function load() {
  root.innerHTML = skel(3);
  try {
    const r = await api.get('/reports'); const f = r.favourites;
    const total = r.status.reduce((s, x) => s + x.count, 0);
    root.innerHTML = `
    <div class="adm-ledger">
      <div class="adm-fig"><div class="v">${n(total)}</div><div class="l">Total users</div></div>
      <div class="adm-fig"><div class="v">${n(f.users_with_favourites)}</div><div class="l">Users with saved places</div><div class="s">${total ? Math.round((f.users_with_favourites / total) * 100) : 0}% of all users</div></div>
      <div class="adm-fig"><div class="v">${n(f.total_favourites)}</div><div class="l">Saved places in total</div><div class="s">${f.users_with_favourites ? (f.total_favourites / f.users_with_favourites).toFixed(1) : '0'} per user who saves</div></div>
    </div>
    <div class="adm-grid2">
      <section class="adm-panel"><div class="adm-ph"><div><h2>Registrations by month</h2><p>Last 12 months</p></div></div><div class="adm-chart"><canvas data-c="monthly" role="img" aria-label="Bar chart of new registrations per month for the last 12 months"></canvas></div></section>
      <section class="adm-panel"><div class="adm-ph"><div><h2>Weather requests per day</h2><p>Last 14 days</p></div></div><div class="adm-chart"><canvas data-c="weather" role="img" aria-label="Stacked bar chart of weather requests per day for the last 14 days"></canvas></div></section>
    </div>
    <div class="adm-grid3 tw-mt-4">
      <section class="adm-panel"><div class="adm-ph"><h2>Account status</h2></div>${bars(r.status, 'status', (i) => cap(i.status))}</section>
      <section class="adm-panel"><div class="adm-ph"><h2>Theme preference</h2></div>${bars(r.themes, 'theme', (i) => cap(i.theme))}</section>
      <section class="adm-panel"><div class="adm-ph"><h2>Temperature unit</h2></div>${bars(r.units, 'unit', (i) => cap(i.unit))}</section>
    </div>
    <section class="adm-panel"><div class="adm-ph"><div><h2>Most saved locations</h2><p>Across all users</p></div></div>${r.topLocations.length ? `<div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>#</th><th>Location</th><th>Country</th><th class="num">Saved by</th></tr></thead><tbody>${r.topLocations.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.country || '–')}</td><td class="num">${n(l.saves)}</td></tr>`).join('')}</tbody></table></div>` : stateBlock('bi-inbox', 'No saved places yet')}</section>`;
    applyCss(root);
    const fail = (e) => { for (const c of root.querySelectorAll('.adm-chart')) c.innerHTML = `<p class="adm-muted">${esc(e.message)}</p>`; };
    chart('monthly', $('[data-c=monthly]', root), (p) => ({ type: 'bar', data: { labels: r.monthly.map((x) => x.month), datasets: [{ label: 'Registrations', data: r.monthly.map((x) => x.count), backgroundColor: p.azure, borderRadius: 4, maxBarThickness: 28 }] }, options: { plugins: { legend: { display: false } }, scales: axes(p) } })).catch(fail);
    chart('weather', $('[data-c=weather]', root), (p) => ({ type: 'bar', data: { labels: r.weatherDaily.map((x) => x.day.slice(5)), datasets: [{ label: 'Upstream calls', data: r.weatherDaily.map((x) => x.upstream), backgroundColor: p.azure, stack: 's' }, { label: 'Served from cache', data: r.weatherDaily.map((x) => x.cached), backgroundColor: p.sun, stack: 's' }] }, options: { plugins: { legend: { labels: { color: p.text, boxWidth: 10 } } }, scales: axes(p, { x: { stacked: true }, y: { stacked: true } }) } })).catch(fail);
  } catch (e) { if (e.status === 401 || e.status === 403) { location.replace('admin-login.html'); return; } root.innerHTML = stateBlock('bi-exclamation-triangle', 'Could not load reports', e.message); }
}
(async () => { if (!(await requireAdmin())) return; mountShell('reports.html'); load(); })();
