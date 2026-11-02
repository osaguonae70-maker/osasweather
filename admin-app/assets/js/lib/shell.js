import { api, forgetCsrf } from './api.js';
import { $, esc } from './ui.js';
import { cycle, getPref } from './theme.js';

const NAV = [
  ['dashboard.html', 'Dashboard', 'bi-speedometer2'], ['users.html', 'Users', 'bi-people'], ['api-monitoring.html', 'API monitoring', 'bi-activity'],
  ['activity-logs.html', 'Activity logs', 'bi-journal-text'], ['reports.html', 'Reports', 'bi-bar-chart-line'], ['settings.html', 'Settings', 'bi-gear'],
];
export let admin = null;

/** Verifies the admin session with the server. Redirects to the login page when there is none. */
export async function requireAdmin() {
  try { const d = await api.get('/auth/me'); admin = d.admin; return admin; }
  catch (e) {
    if (e.status === 401 || e.status === 403) { location.replace('admin-login.html'); return null; }
    throw e;
  }
}

export function mountShell(page) {
  const side = $('[data-side]');
  const themeLabel = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };
  side.innerHTML = `<a class="adm-brand" href="dashboard.html"><img src="assets/images/logo-icon.svg" alt="" width="32" height="32"><span><b>Osas</b><span>Weather</span></span><span class="adm-badge-admin">Admin</span></a>
    <nav aria-label="Admin"><ul class="adm-nav">${NAV.map(([h, l, i]) => `<li><a href="${h}" ${h === page ? 'aria-current="page"' : ''}><i class="bi ${i}" aria-hidden="true"></i>${l}</a></li>`).join('')}</ul></nav>
    <div class="adm-side-foot"><span>Signed in as</span><b>${esc(admin.email)}</b>
      <button type="button" class="btn btn-sm" data-theme-cycle><i class="bi bi-circle-half" aria-hidden="true"></i><span>${themeLabel[getPref()]}</span></button>
      <button type="button" class="btn btn-sm" data-logout><i class="bi bi-box-arrow-right" aria-hidden="true"></i>Log out</button></div>`;
  const toggle = $('[data-menu]'); let scrim;
  const set = (open) => { side.classList.toggle('is-open', open); toggle?.setAttribute('aria-expanded', String(open)); if (open && !scrim) { scrim = document.createElement('div'); scrim.className = 'adm-scrim'; scrim.addEventListener('click', () => set(false)); document.body.append(scrim); } else if (!open && scrim) { scrim.remove(); scrim = null; } };
  toggle?.addEventListener('click', () => set(!side.classList.contains('is-open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  $('[data-theme-cycle]', side).addEventListener('click', (e) => { const next = cycle(); e.currentTarget.querySelector('span').textContent = themeLabel[next]; });
  $('[data-logout]', side).addEventListener('click', async () => { try { await api.post('/auth/logout'); } catch { /* already gone */ } forgetCsrf(); location.href = 'admin-login.html'; });
}
