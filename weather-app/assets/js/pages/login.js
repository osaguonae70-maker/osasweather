import { api } from '../lib/api.js';
import { $, banner } from '../lib/ui.js';
import { safeNext, setSessionHint } from '../lib/session.js';
import { initAuthPage, wireForm, need } from '../lib/authpage.js';

initAuthPage();
const form = $('[data-form]'); const b = $('[data-banner]');
const q = new URLSearchParams(location.search);
if (q.get('registered')) banner(b, 'Account created. Log in to continue.', 'ok');
else if (q.get('reset')) banner(b, 'Password updated. Log in with your new password.', 'ok');
else if (q.get('loggedout')) banner(b, 'You have been logged out.', 'ok');

wireForm(form, b, 'Logging in', async (v) => {
  need(v, { email: 'Enter your email address', password: 'Enter your password' });
  await api.post('/auth/login', { email: v.email.trim(), password: v.password, rememberMe: v.rememberMe });
  setSessionHint(true);
  location.href = safeNext(q.get('next'));
});
