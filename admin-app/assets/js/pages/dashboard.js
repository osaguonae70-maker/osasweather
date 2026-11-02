import { api } from '../lib/api.js';
import { $, esc, skel, stateBlock, applyCss } from '../lib/ui.js';
import { requireAdmin, mountShell } from '../lib/shell.js';
import { chart, axes } from '../lib/charts.js';
import { n, pct, ms, dt } from '../lib/format.js';

const root = $('[data-root]'); const tools = $('[data-tools]');
const dot = (up) => `<span class="adm-dot ${up ? '' : 'bad'}" aria-hidden="true"></span>`;

async function load() {
  root.innerHTML = skel(3);
  try {
    const d = await api.get('/dashboard'); const u = d.users; const w = d.weatherApi24h; const h = d.health;
    root.innerHTML = `
    <div class="adm-ledger">
      <div class="adm-fig"><div class="v">${n(u.total)}</div><div class="l">Registered users</div></div>
      <div class="adm-fig"><div class="v">${n(u.active)}</div><div class="l">Active accounts</div><div class="s">${n(u.logged_in_30d)} signed in, last 30 days</div></div>
      <div class="adm-fig"><div class="v">${n(u.suspended)}</div><div class="l">Suspended</div></div>
      <div class="adm-fig"><div class="v">${n(u.new_today)}</div><div class="l">New today</div></div>
      <div class="adm-fig"><div class="v">${n(u.new_7d)}</div><div class="l">New, 7 days</div></div>
      <div class="adm-fig"><div class="v">${n(u.new_30d)}</div><div class="l">New, 30 days</div></div>
    </div>
    <div class="adm-grid2">
      <section class="adm-panel" aria-labelledby="t1"><div class="adm-ph"><div><h2 id="t1">Registrations, last 30 days</h2><p>New accounts per day</p></div></div><div class="adm-chart"><canvas data-c="trend" role="img" aria-label="Bar chart of new registrations per day for the last 30 days"></canvas></div></section>
      <div>
        <section class="adm-panel" aria-labelledby="t2"><div class="adm-ph"><div><h2 id="t2">Weather API, last 24 hours</h2><p>Upstream calls to Open-Meteo</p></div><a href="api-monitoring.html">Details</a></div>
          <dl class="adm-dl"><dt>Upstream calls</dt><dd class="adm-num">${n(w.upstreamCalls)}</dd><dt>Failed</dt><dd class="adm-num">${n(w.failed)}</dd><dt>Error rate</dt><dd class="adm-num">${w.errorRate == null ? 'No calls yet' : pct(w.errorRate)}</dd><dt>Served from cache</dt><dd class="adm-num">${n(w.cacheHits)} ${w.cacheHitRate == null ? '' : `(${pct(w.cacheHitRate)})`}</dd></dl></section>
        <section class="adm-panel" aria-labelledby="t3"><div class="adm-ph"><h2 id="t3">System health</h2></div>
          <div class="adm-health"><span>${dot(h.backend === 'up')}</span><span>Backend</span><b>${h.backend === 'up' ? 'Up' : 'Down'}</b>
            <span>${dot(h.database === 'up')}</span><span>Database</span><b>${h.database === 'up' ? `Up · ${ms(h.dbLatencyMs)}` : 'Down'}</b>
            <span>${dot(h.systemErrors24h === 0)}</span><span>Server errors, 24 h</span><b class="adm-num">${n(h.systemErrors24h)}</b></div></section>
      </div>
    </div>`;
    applyCss(root);
    chart('trend', $('[data-c=trend]', root), (p) => ({ type: 'bar', data: { labels: d.registrationTrend.map((x) => x.day.slice(5)), datasets: [{ label: 'Registrations', data: d.registrationTrend.map((x) => x.count), backgroundColor: p.azure, borderRadius: 3, maxBarThickness: 18 }] }, options: { plugins: { legend: { display: false } }, scales: axes(p) } }))
      .catch((e) => { $('.adm-chart', root).innerHTML = `<p class="adm-muted">${esc(e.message)}</p>`; });
    tools.innerHTML = `<span class="adm-muted">Updated ${esc(dt(new Date().toISOString()))}</span><button class="btn btn-line btn-sm" data-refresh><i class="bi bi-arrow-clockwise" aria-hidden="true"></i>Refresh</button>`;
  } catch (e) {
    if (e.status === 401 || e.status === 403) { location.replace('admin-login.html'); return; }
    root.innerHTML = stateBlock('bi-exclamation-triangle', 'Could not load the dashboard', e.message) + '<div class="text-center"><button class="btn btn-line" data-refresh>Try again</button></div>';
  }
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-refresh]')) load(); });
(async () => { if (!(await requireAdmin())) return; mountShell('dashboard.html'); load(); })();
