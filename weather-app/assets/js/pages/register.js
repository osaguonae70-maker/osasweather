import { api } from '../lib/api.js';
import { $ } from '../lib/ui.js';
import { initAuthPage, wireForm, need } from '../lib/authpage.js';

initAuthPage();
const form = $('[data-form]');
const KEY = 'osw-register-draft';

// Restore draft
try {
  const draft = JSON.parse(sessionStorage.getItem(KEY) || '{}');
  if (draft.fullName) form.fullName.value = draft.fullName;
  if (draft.email) form.email.value = draft.email;
  if (draft.acceptTerms) form.acceptTerms.checked = true;
} catch { /* ignore */ }

// Save draft on input
form.addEventListener('input', () => {
  sessionStorage.setItem(KEY, JSON.stringify({
    fullName: form.fullName.value,
    email: form.email.value,
    acceptTerms: form.acceptTerms.checked
  }));
});

wireForm(form, $('[data-banner]'), 'Creating account', async (v) => {
  need(v, { fullName: 'Enter your full name', email: 'Enter your email address', password: 'Choose a password', confirmPassword: 'Confirm your password', acceptTerms: 'You must accept the Terms and Conditions' });
  if (v.password !== v.confirmPassword) { const e = new Error('mismatch'); e.details = { confirmPassword: 'Passwords do not match' }; throw e; }
  await api.post('/auth/register', { fullName: v.fullName.trim(), email: v.email.trim(), password: v.password, confirmPassword: v.confirmPassword, acceptTerms: true });
  sessionStorage.removeItem(KEY);
  location.href = 'login.html?registered=1';
});
