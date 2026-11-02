// API client. Auth is cookie-based (HTTP-only, set by the server); nothing sensitive is kept in JS-accessible storage.
// The CSRF token lives only in memory and is re-fetched when missing or rejected.
const BASE = String((window.OSW_CONFIG && window.OSW_CONFIG.API_BASE_URL) || '').replace(/\/$/, '');
let csrf = null;

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

async function fetchCsrf() {
  const data = await request('GET', '/csrf-token');
  csrf = data.csrfToken;
}

async function request(method, path, body, retried = false, signal) {
  const unsafe = method !== 'GET' && method !== 'HEAD';
  const headers = { Accept: 'application/json' };
  if (unsafe) {
    if (!csrf) await fetchCsrf();
    headers['X-CSRF-Token'] = csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, { method, headers, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  if (res.ok && json && json.success) {
    if (json.data && json.data.csrfToken) csrf = json.data.csrfToken; // rotated on login / refreshed on /me
    return json.data;
  }
  if (res.status === 403 && json && json.error && json.error.code === 'CSRF_INVALID' && !retried) {
    csrf = null;
    return request(method, path, body, true, signal);
  }
  const err = (json && json.error) || {};
  throw new ApiError(res.status, err.code || 'ERROR', err.message || 'Something went wrong. Please try again.', err.details);
}

export const forgetCsrf = () => { csrf = null; };
export const api = {
  get: (p, opts = {}) => request('GET', p, undefined, false, opts.signal),
  post: (p, b = {}) => request('POST', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p, b) => request('DELETE', p, b),
};
