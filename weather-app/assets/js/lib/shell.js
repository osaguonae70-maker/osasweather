import { esc, $, $$ } from './ui.js';
import { mountThemeMenu } from './theme.js';
import { mountSearch } from './search.js';
import { state, logout } from './session.js';

const NAV = [
  ['dashboard.html', 'Dashboard', 'bi-speedometer2', null],
  ['dashboard.html#insights', 'Insights', 'bi-graph-up', 'insights'],
  ['favourites.html', 'Favourites', 'bi-star', null],
  ['profile.html', 'Profile', 'bi-person', null],
  ['settings.html', 'Settings', 'bi-sliders', null],
];

/** Builds the signed-in application chrome (top bar on desktop, bottom tabs on mobile). */
export function mountShell({ page, onLocation }) {
  const here = (href) => {
    const [file, hash] = href.split('#');
    if (file !== page) return false;
    return hash ? location.hash === `#${hash}` : !location.hash || location.hash !== '#insights';
  };
  const links = NAV.map(([href, label]) => `<li><a href="${href}" ${here(href) ? 'aria-current="page"' : ''}>${label}</a></li>`).join('');
  const tabs = NAV.map(([href, label, icon]) => `<a href="${href}" ${here(href) ? 'aria-current="page"' : ''}><i class="bi ${icon}" aria-hidden="true"></i>${label}</a>`).join('');
  const header = document.createElement('div');
  header.innerHTML = `<a class="osw-skip" href="#main">Skip to content</a>
  <header class="osw-topbar"><div class="container"><div class="osw-bar">
    <a class="osw-brand" href="dashboard.html" aria-label="OsasWeather dashboard"><img src="assets/images/logo-icon.svg" alt="" width="34" height="34"><span><b>Osas</b><span>Weather</span></span></a>
    <ul class="osw-links" aria-label="Main">${links}</ul>
    <div class="osw-search osw-search-top osw-hide-sm" data-shell-search>
      <i class="bi bi-search osw-search-ico" aria-hidden="true"></i>
      <input type="search" class="form-control" placeholder="Search city" aria-label="Search for a location" maxlength="100">
      <span class="osw-search-spin" hidden></span><div class="osw-results" hidden></div>
    </div>
    <div class="osw-actions">
      <button type="button" class="osw-iconbtn osw-show-sm" data-search-toggle aria-label="Search for a location" aria-expanded="false"><i class="bi bi-search" aria-hidden="true"></i></button>
      <div data-theme-host></div>
      <button type="button" class="btn btn-ghost btn-sm" data-logout aria-label="Log out"><i class="bi bi-box-arrow-right" aria-hidden="true"></i><span class="osw-hide-lg">Log out</span></button>
    </div>
  </div>
  <div class="osw-search tw-mb-3" hidden data-mobile-search><i class="bi bi-search osw-search-ico" aria-hidden="true"></i>
    <input type="search" class="form-control" placeholder="Search city" aria-label="Search for a location" maxlength="100"><span class="osw-search-spin" hidden></span><div class="osw-results" hidden></div></div>
  </div></header>
  <nav class="osw-tabbar" aria-label="Primary">${tabs}</nav>`;
  document.body.prepend(...header.childNodes);
  document.body.classList.add('has-tabbar');

  mountThemeMenu($('[data-theme-host]'), true);
  $('[data-logout]').addEventListener('click', logout);

  const pick = (loc) => {
    const q = new URLSearchParams({ lat: loc.latitude, lon: loc.longitude, name: loc.name, country: loc.country || '', region: loc.region || '' });
    if (onLocation) onLocation(loc, q); else location.href = `dashboard.html?${q}`;
  };
  for (const box of $$('[data-shell-search], [data-mobile-search]')) {
    mountSearch({ input: $('input', box), list: $('.osw-results', box), spinner: $('.osw-search-spin', box), onSelect: (r) => { box.hidden = box.hasAttribute('data-mobile-search') ? true : box.hidden; pick(r); } });
  }
  const tgl = $('[data-search-toggle]'); const mob = $('[data-mobile-search]');
  tgl.addEventListener('click', () => { mob.hidden = !mob.hidden; tgl.setAttribute('aria-expanded', String(!mob.hidden)); if (!mob.hidden) $('input', mob).focus(); });
  window.addEventListener('hashchange', () => { for (const a of $$('.osw-links a, .osw-tabbar a')) { const [f, h] = a.getAttribute('href').split('#'); const cur = f === page && (h ? location.hash === `#${h}` : location.hash !== '#insights'); cur ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); } });
  return { user: state.user };
}
export const shellEsc = esc;
