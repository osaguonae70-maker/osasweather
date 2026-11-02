import { api } from '../lib/api.js';
import { $, banner, toast, setLoading, fieldErrors, wirePwToggles } from '../lib/ui.js';
import { requireAdmin, mountShell } from '../lib/shell.js';

(async () => {
  if (!(await requireAdmin())) return; mountShell('settings.html'); wirePwToggles();
  const form = $('[data-form=settings]'); const b1 = $('[data-banner=settings]');
  try { const { settings } = await api.get('/settings'); form.registrationsOpen.checked = settings.registrationsOpen; form.weatherCacheMinutes.value = settings.weatherCacheMinutes; }
  catch (e) { if (e.status === 401 || e.status === 403) return location.replace('admin-login.html'); banner(b1, e.message); }
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); banner(b1, ''); fieldErrors(form, {}); const btn = form.querySelector('button[type=submit]'); setLoading(btn, true, 'Saving');
    try { await api.patch('/settings', { registrationsOpen: form.registrationsOpen.checked, weatherCacheMinutes: Number(form.weatherCacheMinutes.value) }); toast('Settings saved'); }
    catch (err) { if (err.details) fieldErrors(form, err.details); banner(b1, err.details ? 'Please correct the highlighted field.' : err.message); } finally { setLoading(btn, false); }
  });
  const pf = $('[data-form=password]'); const b2 = $('[data-banner=password]');
  pf.addEventListener('submit', async (e) => {
    e.preventDefault(); banner(b2, ''); fieldErrors(pf, {}); const btn = pf.querySelector('button[type=submit]');
    if (pf.newPassword.value !== pf.confirmPassword.value) return fieldErrors(pf, { confirmPassword: 'Passwords do not match' });
    setLoading(btn, true, 'Updating');
    try { const d = await api.post('/auth/change-password', { currentPassword: pf.currentPassword.value, newPassword: pf.newPassword.value }); pf.reset(); banner(b2, d.message, 'ok'); }
    catch (err) { if (err.details) fieldErrors(pf, err.details); banner(b2, err.details ? 'Please correct the highlighted fields.' : err.message); } finally { setLoading(btn, false); }
  });
})();
