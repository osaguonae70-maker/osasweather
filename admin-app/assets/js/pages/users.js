import { api } from '../lib/api.js';
import { $, esc, skel, stateBlock, toast, dialog, confirmDialog, debounce, setLoading } from '../lib/ui.js';
import { requireAdmin, mountShell } from '../lib/shell.js';
import { dt, dOnly, ago, n } from '../lib/format.js';

const root = $('[data-root]');
const q = { search: '', status: '', sort: 'created_at', dir: 'desc', page: 1, limit: 15 };
let rows = [];
const pill = (s) => (s === 'active' ? '<span class="adm-pill ok"><i class="bi bi-check-circle" aria-hidden="true"></i>Active</span>' : '<span class="adm-pill bad"><i class="bi bi-slash-circle" aria-hidden="true"></i>Suspended</span>');
const th = (key, label) => `<th scope="col" aria-sort="${q.sort === key ? (q.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="adm-th-btn" data-sort="${key}">${label}<i class="bi ${q.sort === key ? (q.dir === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down') : 'bi-chevron-expand'}" aria-hidden="true"></i></button></th>`;

function frame() {
  root.innerHTML = `<section class="adm-panel"><div class="adm-toolbar">
      <div class="grow"><label class="visually-hidden" for="u-search">Search users</label><input id="u-search" class="form-control" type="search" placeholder="Search name or email" maxlength="100" value="${esc(q.search)}"></div>
      <div><label class="visually-hidden" for="u-status">Filter by status</label><select id="u-status" class="form-select"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div></div>
    <div data-table>${skel(2)}</div><div class="adm-pager" data-pager></div></section>`;
  $('#u-status').value = q.status;
  $('#u-search').addEventListener('input', debounce((e) => { q.search = e.target.value.trim(); q.page = 1; fetchUsers(); }, 300));
  $('#u-status').addEventListener('change', (e) => { q.status = e.target.value; q.page = 1; fetchUsers(); });
}

async function fetchUsers() {
  const tbl = $('[data-table]');
  const params = new URLSearchParams({ sort: q.sort, dir: q.dir, page: q.page, limit: q.limit }); if (q.search) params.set('search', q.search); if (q.status) params.set('status', q.status);
  try {
    const d = await api.get(`/users?${params}`); rows = d.users; const p = d.pagination;
    tbl.innerHTML = !rows.length ? stateBlock('bi-person-x', 'No users match', q.search || q.status ? 'Try clearing the search or filter.' : 'No one has registered yet.') :
      `<div class="adm-tablewrap"><table class="adm-table"><caption class="visually-hidden">Registered users</caption><thead><tr>${th('full_name', 'User')}<th scope="col">Status</th><th scope="col" class="num">Saved places</th>${th('created_at', 'Joined')}${th('last_login_at', 'Last login')}<th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${rows.map((u) => `<tr data-id="${esc(u.id)}">
        <td class="who"><b>${esc(u.fullName)}</b><span>${esc(u.email)}${u.emailVerified ? ' <i class="bi bi-patch-check" title="Email verified"></i>' : ''}</span></td><td>${pill(u.status)}</td><td class="num">${n(u.favourites)}</td>
        <td title="${esc(dt(u.createdAt))}">${esc(dOnly(u.createdAt))}</td><td title="${esc(dt(u.lastLoginAt))}">${esc(ago(u.lastLoginAt))}</td>
        <td class="acts"><button class="btn btn-line btn-sm" data-act="view">View</button>${u.status === 'active' ? '<button class="btn btn-warn-line btn-sm" data-act="suspend">Suspend</button>' : '<button class="btn btn-line btn-sm" data-act="reactivate">Reactivate</button>'}<button class="btn btn-danger-line btn-sm" data-act="delete" aria-label="Delete ${esc(u.fullName)}"><i class="bi bi-trash" aria-hidden="true"></i></button></td></tr>`).join('')}</tbody></table></div>`;
    $('[data-pager]').innerHTML = `<span>${n(p.total)} user${p.total === 1 ? '' : 's'} · page ${p.page} of ${p.pages}</span><span class="d-flex gap-2"><button class="btn btn-line btn-sm" data-page="-1" ${p.page <= 1 ? 'disabled' : ''}>Previous</button><button class="btn btn-line btn-sm" data-page="1" ${p.page >= p.pages ? 'disabled' : ''}>Next</button></span>`;
  } catch (e) {
    if (e.status === 401 || e.status === 403) { location.replace('admin-login.html'); return; }
    tbl.innerHTML = stateBlock('bi-exclamation-triangle', 'Could not load users', e.message);
  }
}

async function view(id) {
  const d = dialog(`<h2>User details</h2><div data-body>${skel(1)}</div><div class="adm-dactions"><button class="btn btn-line" data-close>Close</button></div>`);
  try {
    const { user: u } = await api.get(`/users/${id}`);
    $('[data-body]', d).innerHTML = `<dl class="adm-dl"><dt>Name</dt><dd>${esc(u.fullName)}</dd><dt>Email</dt><dd>${esc(u.email)} ${u.emailVerified ? '(verified)' : '(not verified)'}</dd><dt>Status</dt><dd>${pill(u.status)}</dd><dt>Joined</dt><dd>${esc(dt(u.createdAt))}</dd><dt>Last login</dt><dd>${esc(dt(u.lastLoginAt))}</dd><dt>Active sessions</dt><dd>${n(u.activeSessions)}</dd><dt>Terms accepted</dt><dd>${esc(dt(u.termsAcceptedAt))}</dd><dt>Preferences</dt><dd>${u.preferences ? `${esc(u.preferences.temperatureUnit)}, ${esc(u.preferences.windSpeedUnit)}, ${esc(u.preferences.theme)} theme` : '–'}</dd><dt>Saved places</dt><dd>${u.favourites.length ? u.favourites.map((f) => esc(`${f.name}${f.country ? `, ${f.country}` : ''}`)).join('<br>') : 'None'}</dd></dl>`;
  } catch (e) { $('[data-body]', d).innerHTML = `<p class="adm-err">${esc(e.message)}</p>`; }
}

async function setStatus(u, status) {
  const suspend = status === 'suspended';
  if (suspend && !(await confirmDialog({ title: `Suspend ${u.fullName}?`, body: 'They will be signed out everywhere immediately and cannot log in until reactivated.', confirmText: 'Suspend account', danger: true }))) return;
  try { await api.patch(`/users/${u.id}/status`, { status }); toast(suspend ? 'Account suspended' : 'Account reactivated'); fetchUsers(); } catch (e) { toast(e.message, 'error'); }
}

function del(u) {
  const d = dialog(`<h2>Delete ${esc(u.fullName)}?</h2><p class="adm-muted">This permanently removes the account, its preferences and saved places. It cannot be undone. Type the account email to confirm:</p><p><b class="adm-num">${esc(u.email)}</b></p>
    <input class="form-control" data-confirm type="text" autocomplete="off" aria-label="Type the email address to confirm" spellcheck="false"><div class="adm-err" data-err></div>
    <div class="adm-dactions"><button class="btn btn-line" data-close>Cancel</button><button class="btn btn-danger-adm" data-go disabled>Delete permanently</button></div>`);
  const input = $('[data-confirm]', d); const go = $('[data-go]', d);
  input.addEventListener('input', () => { go.disabled = input.value.trim().toLowerCase() !== u.email.toLowerCase(); });
  go.addEventListener('click', async () => {
    setLoading(go, true, 'Deleting');
    try { await api.del(`/users/${u.id}`, { confirmEmail: input.value.trim() }); d.close(); toast('Account deleted'); fetchUsers(); }
    catch (e) { setLoading(go, false); $('[data-err]', d).textContent = (e.details && e.details.confirmEmail) || e.message; }
  });
  input.focus();
}

root.addEventListener('click', (e) => {
  const s = e.target.closest('[data-sort]'); if (s) { q.dir = q.sort === s.dataset.sort && q.dir === 'desc' ? 'asc' : 'desc'; q.sort = s.dataset.sort; q.page = 1; fetchUsers(); return; }
  const pg = e.target.closest('[data-page]'); if (pg) { q.page += Number(pg.dataset.page); fetchUsers(); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const u = rows.find((r) => r.id === a.closest('tr').dataset.id); if (!u) return;
  if (a.dataset.act === 'view') view(u.id); else if (a.dataset.act === 'suspend') setStatus(u, 'suspended'); else if (a.dataset.act === 'reactivate') setStatus(u, 'active'); else if (a.dataset.act === 'delete') del(u);
});
(async () => { if (!(await requireAdmin())) return; mountShell('users.html'); frame(); fetchUsers(); })();
