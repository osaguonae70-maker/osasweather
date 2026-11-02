import { api } from '../lib/api.js';
import { $, esc, skel, stateBlock } from '../lib/ui.js';
import { requireAdmin, mountShell } from '../lib/shell.js';
import { dt, n } from '../lib/format.js';

const root = $('[data-root]'); const q = { page: 1, action: '', limit: 25 };
const ACTIONS = { 'admin.login': ['Admin login', 'ok'], 'admin.login_failed': ['Admin login failed', 'bad'], 'admin.logout': ['Admin logout', 'info'], 'admin.password_change': ['Admin password changed', 'warn'], 'admin.password_reset_cli': ['Admin password reset (CLI)', 'warn'], 'user.suspend': ['Account suspended', 'warn'], 'user.reactivate': ['Account reactivated', 'ok'], 'user.delete': ['Account deleted', 'bad'], 'settings.update': ['Settings changed', 'info'] };
const meta = (m) => Object.entries(m || {}).map(([k, v]) => `${esc(k)}: ${esc(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('<br>') || '–';

function frame() {
  root.innerHTML = `<section class="adm-panel"><div class="adm-toolbar"><div><label class="visually-hidden" for="l-action">Filter by action</label><select id="l-action" class="form-select"><option value="">All actions</option>${Object.entries(ACTIONS).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div><div data-table>${skel(2)}</div><div class="adm-pager" data-pager></div></section>`;
  $('#l-action').addEventListener('change', (e) => { q.action = e.target.value; q.page = 1; fetchLogs(); });
}
async function fetchLogs() {
  const params = new URLSearchParams({ page: q.page, limit: q.limit }); if (q.action) params.set('action', q.action);
  try {
    const d = await api.get(`/activity-logs?${params}`); const p = d.pagination;
    $('[data-table]').innerHTML = !d.logs.length ? stateBlock('bi-journal', 'No activity recorded') : `<div class="adm-tablewrap"><table class="adm-table"><caption class="visually-hidden">Administrative activity</caption><thead><tr><th>When</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>${d.logs.map((l) => { const a = ACTIONS[l.action] || [l.action, 'info']; return `<tr><td class="adm-num" tabindex="-1">${esc(dt(l.createdAt))}</td><td><span class="adm-pill ${a[1]}">${esc(a[0])}</span></td><td>${l.targetType ? `${esc(l.targetType)}<br><span class="adm-muted adm-num">${esc(String(l.targetId || '').slice(0, 8))}${l.targetId ? '…' : ''}</span>` : '–'}</td><td>${meta(l.metadata)}</td></tr>`; }).join('')}</tbody></table></div>`;
    $('[data-pager]').innerHTML = `<span>${n(p.total)} entr${p.total === 1 ? 'y' : 'ies'} · page ${p.page} of ${p.pages}</span><span class="d-flex gap-2"><button class="btn btn-line btn-sm" data-page="-1" ${p.page <= 1 ? 'disabled' : ''}>Newer</button><button class="btn btn-line btn-sm" data-page="1" ${p.page >= p.pages ? 'disabled' : ''}>Older</button></span>`;
  } catch (e) { if (e.status === 401 || e.status === 403) { location.replace('admin-login.html'); return; } $('[data-table]').innerHTML = stateBlock('bi-exclamation-triangle', 'Could not load the log', e.message); }
}
root.addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) { q.page += Number(b.dataset.page); fetchLogs(); } });
(async () => { if (!(await requireAdmin())) return; mountShell('activity-logs.html'); frame(); fetchLogs(); })();
