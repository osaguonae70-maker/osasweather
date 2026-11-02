import { $ } from '../lib/ui.js';
import { applyCss } from '../lib/ui.js';
import { mountThemeMenu } from '../lib/theme.js';
import { mountSearch } from '../lib/search.js';
import { mountBurger } from '../lib/nav.js';
import { loadSession, state, hasSessionHint } from '../lib/session.js';
import { loadOverview, lastLocation, rememberLocation, guessLocation } from '../lib/weatherData.js';
import { renderSky } from '../lib/views.js';
import { clockLabel, windUnit, speed, pct } from '../lib/format.js';
import { esc } from '../lib/ui.js';

mountBurger();
const preview = $('[data-preview]');
let signedIn = false;

async function showPreview(loc) {
  preview.innerHTML = '<div class="osw-skel osw-skel-sky" aria-hidden="true"></div>';
  try {
    const d = await loadOverview(loc);
    rememberLocation(loc);
    preview.innerHTML = `${renderSky(d, loc, { signedIn: false, tag: 'h2' })}
      <div class="osw-preview-foot"><span><i class="bi bi-wind" aria-hidden="true"></i> ${speed(d.current.windSpeed)} ${esc(windUnit(d.units.windSpeed))}</span><span><i class="bi bi-droplet" aria-hidden="true"></i> ${pct(d.current.humidity)}</span><span><i class="bi bi-sunrise" aria-hidden="true"></i> ${clockLabel(d.today.sunrise)}</span><span><i class="bi bi-sunset" aria-hidden="true"></i> ${clockLabel(d.today.sunset)}</span></div>
      <p class="osw-preview-note">Live forecast for ${esc(loc.name)} from Open-Meteo. Search for any city to change it.</p>`;
    $('[data-refresh]', preview)?.remove();
    applyCss(preview);
  } catch (e) {
    preview.innerHTML = `<div class="osw-panel osw-state"><i class="bi bi-cloud-slash" aria-hidden="true"></i><h2>Live preview unavailable</h2><p class="osw-muted">${esc(e.message)} You can still search for a city above.</p></div>`;
  }
}

mountThemeMenu($('[data-theme-host]'), false);
const hero = $('[data-hero-search]');
hero.addEventListener('submit', (e) => e.preventDefault());
mountSearch({ input: $('input', hero), list: $('.osw-results', hero), spinner: $('.osw-search-spin', hero), onSelect: showPreview });

(async () => {
  // If you're already signed in, swap the sign-up buttons for a dashboard link.
  try {
    if (hasSessionHint() && (await loadSession())) {
      signedIn = true;
      const links = $('[data-auth-links]'); if (links) links.innerHTML = '<a class="btn btn-sun btn-sm" href="dashboard.html">Open dashboard</a>';
      const p = $('[data-cta-primary]'); p.textContent = 'Open dashboard'; p.href = 'dashboard.html';
      $('[data-cta-secondary]').hidden = true;
    }
  } catch { /* offline: stay in visitor mode */ }
  const start = (signedIn && state.prefs.defaultLocation) || lastLocation() || (await guessLocation());
  if (start) showPreview(start);
  else preview.innerHTML = '<div class="osw-panel osw-state"><i class="bi bi-search" aria-hidden="true"></i><h2>Search to see a live forecast</h2><p class="osw-muted">Type a city above and the current conditions appear here.</p></div>';
})();
