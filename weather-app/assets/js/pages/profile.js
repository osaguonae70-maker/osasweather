import { api } from '../lib/api.js';
import { $, toast, banner, wirePasswordToggles, wireStrengthMeter } from '../lib/ui.js';
import { requireSession, state, logout } from '../lib/session.js';
import { mountShell } from '../lib/shell.js';
import { wireForm, need } from '../lib/authpage.js';

async function main() {
  const s = await requireSession();
  if (!s) return;
  mountShell({ page: 'profile.html' });
  wirePasswordToggles();
  const meter = $('[data-meter]'); if (meter) wireStrengthMeter($('#newPassword'), meter, $('[data-strength-hint]'));
  $('[data-logout]', document.querySelector('main')).addEventListener('click', logout);

  const paint = () => {
    const u = state.user;
    $('[data-acc="name"]').textContent = u.fullName; $('[data-acc="email"]').textContent = u.email;
    $('[data-acc="verified"]').textContent = u.emailVerified ? 'Verified' : 'Not verified';
    $('[data-acc="since"]').textContent = new Date(u.createdAt).toLocaleDateString('en', { dateStyle: 'long' });
    $('#fullName').value = u.fullName;
  };
  if (s.error) return;
  paint();

  wireForm($('[data-form="name"]'), $('[data-banner="name"]'), 'Saving', async (v) => {
    need(v, { fullName: 'Enter your name' });
    const d = await api.patch('/auth/profile', { fullName: v.fullName.trim() });
    state.user = d.user; paint(); toast('Name saved');
  });

  const emailForm = $('[data-form="email"]');
  wireForm(emailForm, $('[data-banner="email"]'), 'Sending', async (v) => {
    need(v, { newEmail: 'Enter the new email address', password: 'Enter your current password' });
    const d = await api.post('/auth/email-change', { newEmail: v.newEmail.trim(), password: v.password });
    banner($('[data-banner="email"]'), d.message, 'ok'); emailForm.reset();
  });

  const pwForm = $('[data-form="password"]');
  wireForm(pwForm, $('[data-banner="password"]'), 'Updating', async (v) => {
    need(v, { currentPassword: 'Enter your current password', newPassword: 'Choose a new password', confirmPassword: 'Confirm the new password' });
    if (v.newPassword !== v.confirmPassword) { const e = new Error('x'); e.details = { confirmPassword: 'Passwords do not match' }; throw e; }
    const d = await api.patch('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword, confirmPassword: v.confirmPassword });
    pwForm.reset(); if (meter) meter.dataset.score = '0'; banner($('[data-banner="password"]'), d.message, 'ok'); toast('Password updated');
  });
}
main();
