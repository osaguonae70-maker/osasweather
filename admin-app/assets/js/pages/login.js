import { api } from '../lib/api.js';
import { $, banner, setLoading, fieldErrors, wirePwToggles } from '../lib/ui.js';

wirePwToggles();
const form = $('[data-form]'); const b = $('[data-banner]');
// Already signed in? Go straight to the console.
api.get('/auth/me').then(() => { location.replace('dashboard.html'); }).catch(() => {});
form.addEventListener('submit', async (e) => {
  e.preventDefault(); banner(b, ''); fieldErrors(form, {});
  const btn = form.querySelector('button[type=submit]'); if (btn.classList.contains('is-loading')) return;
  const email = form.email.value.trim(); const password = form.password.value;
  if (!email || !password) return fieldErrors(form, { ...(email ? {} : { email: 'Enter your email' }), ...(password ? {} : { password: 'Enter your password' }) });
  setLoading(btn, true, 'Signing in');
  try { await api.post('/auth/login', { email, password }); location.href = 'dashboard.html'; }
  catch (err) { banner(b, err.status === 429 ? 'Too many attempts. Wait a while and try again.' : err.message); }
  finally { setLoading(btn, false); }
});
