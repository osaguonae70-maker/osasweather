import { api } from '../lib/api.js';
import { $, banner } from '../lib/ui.js';
import { initAuthPage, wireForm, need } from '../lib/authpage.js';

initAuthPage();
const b = $('[data-banner]');
wireForm($('[data-form]'), b, 'Sending', async (v) => {
  need(v, { email: 'Enter your email address' });
  const d = await api.post('/auth/forgot-password', { email: v.email.trim() });
  banner(b, d.message, 'ok');
});
