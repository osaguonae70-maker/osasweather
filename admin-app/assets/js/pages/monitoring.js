import { api } from '../lib/api.js';
import { $, esc, skel, stateBlock, applyCss } from '../lib/ui.js';
import { requireAdmin, mountShell } from '../lib/shell.js';
import { chart, axes } from '../lib/charts.js';
import { n, pct, ms, dt, uptime } from '../lib/format.js';

const root = $('[data-root]'); const tools = $('[data-tools]'); let range = '24h';
const dot = (up) => `<span class="adm-dot ${up ? '' : 'bad'}" aria-hidden="true"></span>`;
const label = { forecast: 'Forecast', geocoding: 'Location search' };

async function load() {
  root.innerHTML = skel(3);
  tools.innerHTML = `<div class="adm-seg" role="group" aria-label="Time range">${['24h', '7d', '30d'].map((r) => `<button type="button" data-range="${r}" aria-pressed="${r === range}">${r === '24h' ? '24 hours' : r === '7d' ? '7 days' : '30 days'}</button>`).join('')}</div><button class="btn btn-line btn-sm" data-refresh><i class="bi bi-arrow-clockwise" aria-hidden="true"></i>Refresh</button>`;
  try {
    const [m, h] = await Promise.all([api.get(`/api-monitoring?range=${range}`), api.get('/system-health')]);
    const u = m.usage;
    root.innerHTML = `
    <div class="adm-ledger">
      <div class="adm-fig"><div class="v">${n(u.upstreamCalls)}</div><div class="l">Upstream calls</div></div>
      <div class="adm-fig"><div class="v">${n(u.succeeded)}</div><div class="l">Successful</div></div>
      <div class="adm-fig"><div class="v">${n(u.failed)}</div><div class="l">Failed</div></div>
      <div class="adm-fig"><div class="v">${u.errorRate == null ? '–' : pct(u.errorRate)}</div><div class="l">Error rate</div></div>
      <div class="adm-fig"><div class="v">${u.cacheHitRate == null ? '–' : pct(u.cacheHitRate)}</div><div class="l">Cache hit rate</div><div class="s">${n(u.cacheHits)} served from cache</div></div>
    </div>
    <section class="adm-panel"><div class="adm-ph"><div><h2>Requests per hour, last 24 hours</h2><p>Upstream successes and failures, plus requests served from cache</p></div></div><div class="adm-chart"><canvas data-c="hourly" role="img" aria-label="Stacked bar chart of weather API requests per hour for the last 24 hours"></canvas></div></section>
    <div class="adm-grid2">
      <section class="adm-panel"><div class="adm-ph"><h2>By endpoint</h2><p>Response times cover successful upstream calls</p></div>${u.byEndpoint.length ? `<div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>Endpoint</th><th class="num">Calls</th><th class="num">Failed</th><th class="num">Cached</th><th class="num">Avg</th><th class="num">p95</th></tr></thead><tbody>${u.byEndpoint.map((e) => `<tr><td>${esc(label[e.endpoint] || e.endpoint)}</td><td class="num">${n(e.upstreamCalls)}</td><td class="num">${n(e.failed)}</td><td class="num">${n(e.cacheHits)}</td><td class="num">${ms(e.avgMs)}</td><td class="num">${ms(e.p95Ms)}</td></tr>`).join('')}</tbody></table></div>` : stateBlock('bi-inbox', 'No requests recorded', 'Weather lookups will appear here once users search or open a forecast.')}</section>
      <section class="adm-panel"><div class="adm-ph"><h2>System</h2></div>
        <div class="adm-health"><span>${dot(h.backend.status === 'up')}</span><span>Backend</span><b>Up · ${uptime(h.backend.uptimeSeconds)}</b>
          <span>${dot(h.database.status === 'up')}</span><span>Database</span><b>${h.database.status === 'up' ? `Up · ${ms(h.database.latencyMs)}` : 'Down'}</b>
          <span>${dot(true)}</span><span>DB pool</span><b class="adm-num">${h.database.pool.total} open · ${h.database.pool.idle} idle · ${h.database.pool.waiting} waiting</b>
          <span>${dot(true)}</span><span>Memory (RSS)</span><b class="adm-num">${h.memory.rssMb} MB</b>
          <span>${dot(h.services.emailConfigured)}</span><span>Email provider</span><b>${h.services.emailConfigured ? 'Configured' : 'Not configured'}</b></div></section>
    </div>
    <section class="adm-panel"><div class="adm-ph"><div><h2>Recent upstream failures</h2><p>Newest first</p></div></div>${m.recentErrors.length ? `<div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>When</th><th>Endpoint</th><th>Error</th><th class="num">HTTP</th><th class="num">Duration</th></tr></thead><tbody>${m.recentErrors.map((e) => `<tr><td>${esc(dt(e.createdAt))}</td><td>${esc(label[e.endpoint] || e.endpoint)}</td><td><span class="adm-pill bad">${esc(e.errorCode || 'ERROR')}</span></td><td class="num">${e.statusCode ?? '–'}</td><td class="num">${ms(e.durationMs)}</td></tr>`).join('')}</tbody></table></div>` : stateBlock('bi-check2-circle', 'No failures recorded')}</section>
    <section class="adm-panel"><div class="adm-ph"><div><h2>Recent server errors</h2><p>Unexpected errors in this API (messages only, no request data)</p></div></div>${h.recentErrors.length ? `<div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>When</th><th>Route</th><th>Message</th></tr></thead><tbody>${h.recentErrors.map((e) => `<tr><td>${esc(dt(e.createdAt))}</td><td><code>${esc(e.method)} ${esc(e.path)}</code></td><td>${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>` : stateBlock('bi-check2-circle', 'No server errors recorded')}</section>`;
    applyCss(root);
    chart('hourly', $('[data-c=hourly]', root), (p) => ({ type: 'bar', data: { labels: m.hourly.map((x) => x.hour.slice(11, 13) + ':00'), datasets: [
      { label: 'Succeeded', data: m.hourly.map((x) => x.ok), backgroundColor: p.ok, stack: 's' }, { label: 'Failed', data: m.hourly.map((x) => x.failed), backgroundColor: p.danger, stack: 's' }, { label: 'From cache', data: m.hourly.map((x) => x.cached), backgroundColor: p.azure, stack: 's' }] },
      options: { plugins: { legend: { labels: { color: p.text, boxWidth: 10 } } }, scales: axes(p, { x: { stacked: true }, y: { stacked: true } }) } })).catch((e) => { $('.adm-chart', root).innerHTML = `<p class="adm-muted">${esc(e.message)}</p>`; });
  } catch (e) {
    if (e.status === 401 || e.status === 403) { location.replace('admin-login.html'); return; }
    root.innerHTML = stateBlock('bi-exclamation-triangle', 'Could not load monitoring data', e.message);
  }
}
document.addEventListener('click', (e) => { const r = e.target.closest('[data-range]'); if (r) { range = r.dataset.range; load(); } else if (e.target.closest('[data-refresh]')) load(); });
(async () => { if (!(await requireAdmin())) return; mountShell('api-monitoring.html'); load(); })();
