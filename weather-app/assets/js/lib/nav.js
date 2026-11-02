// Mobile menu for the public pages.
export function mountBurger() {
  const b = document.querySelector('[data-burger]'); const p = document.getElementById('mobile-nav');
  if (!b || !p) return;
  const set = (open) => { p.classList.toggle('is-open', open); b.setAttribute('aria-expanded', String(open)); b.querySelector('i').className = `bi ${open ? 'bi-x-lg' : 'bi-list'}`; };
  b.addEventListener('click', () => set(!p.classList.contains('is-open')));
  p.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}
