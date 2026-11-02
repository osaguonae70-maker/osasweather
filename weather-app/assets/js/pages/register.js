import { api } from '../lib/api.js';
import { $ } from '../lib/ui.js';
import { initAuthPage, wireForm, need } from '../lib/authpage.js';

initAuthPage();
wireForm($('[data-form]'), $('[data-banner]'), 'Creating account', async (v) => {
  need(v, { fullName: 'Enter your full name', email: 'Enter your email address', password: 'Choose a password', confirmPassword: 'Confirm your password', acceptTerms: 'You must accept the Terms and Conditions' });
  if (v.password !== v.confirmPassword) { const e = new Error('mismatch'); e.details = { confirmPassword: 'Passwords do not match' }; throw e; }
  await api.post('/auth/register', { fullName: v.fullName.trim(), email: v.email.trim(), password: v.password, confirmPassword: v.confirmPassword, acceptTerms: true });
  location.href = 'login.html?registered=1';
});
