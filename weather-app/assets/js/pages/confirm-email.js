import { api } from '../lib/api.js';
import { $, banner } from '../lib/ui.js';
import { initAuthPage } from '../lib/authpage.js';

initAuthPage();
const token = new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null, '', location.pathname);
(async () => {
  const b = $('[data-banner]'); $('[data-checking]').hidden = true;
  if (!token) return banner(b, 'This confirmation link is incomplete. Open the link from your email again.');
  try { const d = await api.post('/auth/email-change/confirm', { token }); banner(b, d.message, 'ok'); $('[data-done]').hidden = false; }
  catch (e) { banner(b, e.message); }
})();
