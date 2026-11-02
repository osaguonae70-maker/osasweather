// Small DOM helpers. All dynamic styling goes through CSSOM (never inline style attributes),
// so the strict Content-Security-Policy (no 'unsafe-inline' styles) stays intact.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Applies data-css="prop:value;prop:value" (used for computed widths/positions) via CSSOM. */
export function applyCss(root = document) {
  for (const el of root.querySelectorAll('[data-css]')) {
    for (const decl of el.dataset.css.split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) el.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
    }
    el.removeAttribute('data-css');
  }
}

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

let toastBox;
export function toast(message, type = 'ok') {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'osw-toasts';
    toastBox.setAttribute('role', 'status'); toastBox.setAttribute('aria-live', 'polite');
    document.body.append(toastBox);
  }
  const t = document.createElement('div');
  t.className = `osw-toast${type === 'error' ? ' is-error' : ''}`;
  t.innerHTML = `<i class="bi ${type === 'error' ? 'bi-exclamation-circle' : 'bi-check-circle'}" aria-hidden="true"></i><span></span>`;
  t.querySelector('span').textContent = message;
  toastBox.append(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3500);
}

export function confirmDialog({ title, body, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'osw-dialog';
    d.innerHTML = `<h2></h2><p class="osw-muted mb-0"></p><div class="osw-dialog-actions"><button class="btn btn-ghost" value="no">Cancel</button><button class="btn ${danger ? 'btn-danger-soft' : 'btn-sun'}" value="yes"></button></div>`;
    d.querySelector('h2').textContent = title;
    d.querySelector('p').textContent = body;
    d.querySelector('[value="yes"]').textContent = confirmText;
    d.addEventListener('click', (e) => { const v = e.target.closest('button')?.value; if (v) d.close(v); });
    d.addEventListener('close', () => { resolve(d.returnValue === 'yes'); d.remove(); });
    document.body.append(d);
    d.showModal();
    d.querySelector('[value="no"]').focus();
  });
}

export function setLoading(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); btn.innerHTML = `<span class="osw-spin" aria-hidden="true"></span><span>${esc(label || 'Please wait')}</span>`; }
  else { btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

/** Shows server-side validation details next to the matching inputs (name attribute = field key). */
export function showFieldErrors(form, details = {}) {
  clearFieldErrors(form);
  let first = null;
  for (const [field, msg] of Object.entries(details)) {
    const input = form.querySelector(`[name="${CSS.escape(field)}"]`);
    const slot = form.querySelector(`[data-error-for="${CSS.escape(field)}"]`);
    if (input) { input.classList.add('is-invalid'); input.setAttribute('aria-invalid', 'true'); first ||= input; }
    if (slot) slot.textContent = msg;
  }
  if (first) first.focus();
}
export function clearFieldErrors(form) {
  form.querySelectorAll('.is-invalid').forEach((i) => { i.classList.remove('is-invalid'); i.removeAttribute('aria-invalid'); });
  form.querySelectorAll('[data-error-for]').forEach((s) => { s.textContent = ''; });
}

export function banner(el, message, type = 'error') {
  if (!el) return;
  if (!message) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.className = `osw-alert ${type === 'ok' ? 'is-ok' : 'is-error'}`;
  el.setAttribute('role', type === 'ok' ? 'status' : 'alert');
  el.innerHTML = `<i class="bi ${type === 'ok' ? 'bi-check-circle' : 'bi-exclamation-circle'}" aria-hidden="true"></i><span></span>`;
  el.querySelector('span').textContent = message;
}

/** Show/hide password toggles: <div class="osw-pw"><input type=password><button data-toggle-pw> */
export function wirePasswordToggles(root = document) {
  for (const btn of root.querySelectorAll('[data-toggle-pw]')) {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', String(show));
      btn.querySelector('i').className = `bi ${show ? 'bi-eye-slash' : 'bi-eye'}`;
    });
  }
}

/** 0-4 password strength estimate (length + variety); the server enforces the real policy. */
export function passwordScore(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 10) s += 1;
  if (pw.length >= 14) s += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s += 1;
  if (pw.length < 10) s = Math.min(s, 1);
  return Math.max(1, Math.min(4, s));
}
export function wireStrengthMeter(input, meter, hint) {
  const labels = ['', 'Too weak', 'Fair', 'Good', 'Strong'];
  input.addEventListener('input', () => {
    const s = input.value ? passwordScore(input.value) : 0;
    meter.dataset.score = String(s);
    if (hint) hint.textContent = s ? `Strength: ${labels[s]}. Use at least 10 characters with a letter and a number.` : 'Use at least 10 characters with a letter and a number.';
  });
}

export const skeleton = (cls) => `<div class="osw-skel ${cls}" aria-hidden="true"></div>`;
export const stateBlock = ({ icon = 'bi-cloud-slash', title, text, actionHtml = '' }) =>
  `<div class="osw-state"><i class="bi ${icon}" aria-hidden="true"></i><h2>${esc(title)}</h2><p class="osw-muted">${esc(text)}</p>${actionHtml}</div>`;
