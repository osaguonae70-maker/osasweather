// Admin API client. The admin session uses its own cookie (osw_admin_sid) and its own CSRF token; nothing is stored in JS-readable storage.
const BASE = String((window.OSW_CONFIG && window.OSW_CONFIG.API_BASE_URL) || '').replace(/\/$/, '') + '/api/admin';
let csrf = null;

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

async function request(method, path, body, retried = false) {
  const unsafe = method !== 'GET';
  const headers = { Accept: 'application/json' };
  if (unsafe) {
    if (!csrf) csrf = (await request('GET', '/csrf-token')).csrfToken;
    headers['X-CSRF-Token'] = csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
  }
  let res;
  try { res = await fetch(`${BASE}${path}`, { method, headers, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch { throw new ApiError(0, 'NETWORK', 'Cannot reach the API. Check your connection.'); }
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (res.ok && json && json.success) { if (json.data && json.data.csrfToken) csrf = json.data.csrfToken; return json.data; }
  if (res.status === 403 && json && json.error && json.error.code === 'CSRF_INVALID' && !retried) { csrf = null; return request(method, path, body, true); }
  const e = (json && json.error) || {};
  throw new ApiError(res.status, e.code || 'ERROR', e.message || 'Something went wrong.', e.details);
}
export const forgetCsrf = () => { csrf = null; };
export const api = {
  get: (p) => request('GET', p), post: (p, b = {}) => request('POST', p, b),
  patch: (p, b = {}) => request('PATCH', p, b), del: (p, b) => request('DELETE', p, b),
};
