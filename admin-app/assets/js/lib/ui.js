export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/** data-css="prop:value;..." -> CSSOM (keeps the strict CSP free of inline styles). */
export function applyCss(root = document) {
  for (const el of root.querySelectorAll('[data-css]')) {
    for (const d of el.dataset.css.split(';')) { const i = d.indexOf(':'); if (i > 0) el.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); }
    el.removeAttribute('data-css');
  }
}
let box;
export function toast(msg, type = 'ok') {
  if (!box) { box = document.createElement('div'); box.className = 'adm-toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const t = document.createElement('div'); t.className = `adm-toast${type === 'error' ? ' is-error' : ''}`;
  t.innerHTML = `<i class="bi ${type === 'error' ? 'bi-exclamation-circle' : 'bi-check-circle'}" aria-hidden="true"></i><span></span>`;
  t.querySelector('span').textContent = msg; box.append(t); setTimeout(() => t.remove(), type === 'error' ? 6000 : 3200);
}
export function dialog(html, { onOpen } = {}) {
  const d = document.createElement('dialog'); d.className = 'adm-dialog'; d.innerHTML = html;
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
  document.body.append(d); d.showModal(); onOpen && onOpen(d); return d;
}
export function confirmDialog({ title, body, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const d = dialog(`<h2></h2><p class="adm-muted mb-0"></p><div class="adm-dactions"><button class="btn btn-line" value="no" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger-adm' : 'btn-primary-adm'}" data-yes></button></div>`);
    d.querySelector('h2').textContent = title; d.querySelector('p').textContent = body; d.querySelector('[data-yes]').textContent = confirmText;
    d.querySelector('[data-yes]').addEventListener('click', () => { d.returnValue = 'yes'; d.close(); });
    d.addEventListener('close', () => resolve(d.returnValue === 'yes'));
    d.querySelector('[data-close]').focus();
  });
}
export function setLoading(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); btn.innerHTML = `<span class="adm-spin" aria-hidden="true"></span><span>${esc(label || 'Please wait')}</span>`; }
  else { btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}
export function banner(el, msg, type = 'error') {
  if (!el) return;
  if (!msg) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false; el.className = `adm-alert ${type === 'ok' ? 'is-ok' : 'is-error'}`; el.setAttribute('role', type === 'ok' ? 'status' : 'alert');
  el.innerHTML = `<i class="bi ${type === 'ok' ? 'bi-check-circle' : 'bi-exclamation-circle'}" aria-hidden="true"></i><span></span>`; el.querySelector('span').textContent = msg;
}
export function fieldErrors(form, details = {}) {
  form.querySelectorAll('.is-invalid').forEach((i) => i.classList.remove('is-invalid'));
  form.querySelectorAll('[data-error-for]').forEach((s) => { s.textContent = ''; });
  let first;
  for (const [f, m] of Object.entries(details)) {
    const i = form.querySelector(`[name="${CSS.escape(f)}"]`); const s = form.querySelector(`[data-error-for="${CSS.escape(f)}"]`);
    if (i) { i.classList.add('is-invalid'); first ||= i; } if (s) s.textContent = m;
  }
  first && first.focus();
}
export function wirePwToggles(root = document) {
  for (const b of root.querySelectorAll('[data-toggle-pw]')) b.addEventListener('click', () => {
    const i = b.parentElement.querySelector('input'); const show = i.type === 'password'; i.type = show ? 'text' : 'password';
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.querySelector('i').className = `bi ${show ? 'bi-eye-slash' : 'bi-eye'}`;
  });
}
export const stateBlock = (icon, title, text = '') => `<div class="adm-state"><i class="bi ${icon}" aria-hidden="true"></i><b>${esc(title)}</b><div>${esc(text)}</div></div>`;
export const skel = (n = 1) => Array.from({ length: n }, () => '<div class="adm-skel tw-mb-3" aria-hidden="true"></div>').join('');
