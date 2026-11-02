import { api } from '../lib/api.js';
import { $ } from '../lib/ui.js';
import { initAuthPage, wireForm, need } from '../lib/authpage.js';

initAuthPage();
// The token travels in the URL fragment (never sent to servers or in Referer headers); remove it from the address bar.
const token = new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null, '', location.pathname);
const form = $('[data-form]'); const checking = $('[data-checking]'); const invalid = $('[data-invalid]');

(async () => {
  let valid = false;
  if (token) { try { valid = (await api.post('/auth/reset-password/validate', { token })).valid; } catch { valid = false; } }
  checking.hidden = true;
  if (valid) form.hidden = false; else invalid.hidden = false;
})();

wireForm(form, $('[data-banner]'), 'Updating', async (v) => {
  need(v, { password: 'Choose a new password', confirmPassword: 'Confirm your password' });
  if (v.password !== v.confirmPassword) { const e = new Error('mismatch'); e.details = { confirmPassword: 'Passwords do not match' }; throw e; }
  try { await api.post('/auth/reset-password', { token, password: v.password, confirmPassword: v.confirmPassword }); }
  catch (e) { if (e.status === 400) { form.hidden = true; invalid.hidden = false; return; } throw e; }
  location.href = 'login.html?reset=1';
});
