import { api } from '../lib/api.js';
import { $, esc, applyCss, toast, stateBlock, banner } from '../lib/ui.js';
import { requireSession, state } from '../lib/session.js';
import { mountShell } from '../lib/shell.js';
import { loadOverview, lastLocation, rememberLocation, guessLocation, currentLocation } from '../lib/weatherData.js';
import { renderSky, renderTimeline, renderWeek, renderHighlights } from '../lib/views.js';
import { renderCharts } from '../lib/charts.js';
import { localNow, timeAgo } from '../lib/format.js';

const root = $('[data-root]');
let favs = []; let loc = null; let data = null; let hours = 24; let chartsWanted = location.hash === '#insights'; let clockTimer; let token = 0;

const near = (a, b) => Math.abs(a.latitude - b.latitude) < 0.0002 && Math.abs(a.longitude - b.longitude) < 0.0002;
const findFav = () => (loc ? favs.find((f) => near(f, loc)) : null);

function fromUrl() {
  const p = new URLSearchParams(location.search);
  const latitude = Number(p.get('lat')); const longitude = Number(p.get('lon'));
  if (p.get('lat') === null || p.get('lon') === null || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { name: (p.get('name') || 'Selected location').slice(0, 150), country: p.get('country') || null, region: p.get('region') || null, latitude, longitude };
}

async function resolveStart() {
  return fromUrl() || state.prefs.defaultLocation || lastLocation() || (await currentLocation()) || (await guessLocation());
}

function skeleton() {
  root.innerHTML = '<div class="osw-stack"><div class="osw-skel osw-skel-sky" aria-hidden="true"></div><div class="osw-skel osw-skel-block" aria-hidden="true"></div><div class="osw-skel osw-skel-block" aria-hidden="true"></div></div>';
}

function paintSky() {
  const slot = $('[data-sky-slot]', root);
  slot.innerHTML = renderSky(data, loc, { isFav: Boolean(findFav()) });
  applyCss(slot);
}

function paintTimeline() {
  const slot = $('[data-timeline]', root);
  slot.innerHTML = renderTimeline(data, hours); applyCss(slot);
  const b = $('[data-hours-toggle]', root); if (b) b.textContent = hours === 24 ? 'Show 48 hours' : 'Show 24 hours';
}

function render() {
  const { meta } = data;
  root.innerHTML = `<div class="osw-stack">
    <div data-sky-slot></div>
    <div class="d-flex flex-wrap justify-content-between gap-2 osw-muted tw-text-sm"><span>Updated ${esc(timeAgo(meta.fetchedAt))}</span><span>Weather data by Open-Meteo.com</span></div>
    <div data-stale hidden></div>
    <section class="osw-section" aria-labelledby="h-hourly"><div class="osw-sec-head"><div><h2 id="h-hourly">Hourly forecast</h2><p>Temperature, chance of precipitation and wind</p></div><button type="button" class="btn btn-ghost btn-sm" data-hours-toggle>Show 48 hours</button></div><div class="osw-panel" data-timeline></div></section>
    <section class="osw-section" aria-labelledby="h-week"><div class="osw-sec-head"><div><h2 id="h-week">7-day forecast</h2><p>Bars share one temperature scale, so days compare at a glance</p></div></div><div class="osw-panel" data-week></div></section>
    <section class="osw-section" aria-labelledby="h-hl"><div class="osw-sec-head"><div><h2 id="h-hl">Weather highlights</h2><p>Current measurements</p></div></div><div data-hl></div></section>
    <section class="osw-section" id="insights" aria-labelledby="h-in"><div class="osw-sec-head"><div><h2 id="h-in">Weather insights</h2><p>Trends drawn from the same live forecast</p></div></div>
      <div class="osw-charts">
        <figure class="osw-chart m-0"><h3>7-day highs and lows</h3><div class="box"><canvas data-chart="daily" role="img" aria-label="Line chart of daily high and low temperatures for the next seven days"></canvas></div></figure>
        <figure class="osw-chart m-0"><h3>Temperature, next 24 hours</h3><div class="box"><canvas data-chart="hourly" role="img" aria-label="Line chart of hourly temperature for the next 24 hours"></canvas></div></figure>
        <figure class="osw-chart m-0"><h3>Chance of precipitation, next 24 hours</h3><div class="box"><canvas data-chart="rain" role="img" aria-label="Bar chart of hourly chance of precipitation for the next 24 hours"></canvas></div></figure>
        <figure class="osw-chart m-0"><h3>Wind speed, next 24 hours</h3><div class="box"><canvas data-chart="wind" role="img" aria-label="Line chart of hourly wind speed for the next 24 hours"></canvas></div></figure>
      </div></section>
  </div>`;
  paintSky(); paintTimeline();
  $('[data-week]', root).innerHTML = renderWeek(data); applyCss($('[data-week]', root));
  $('[data-hl]', root).innerHTML = renderHighlights(data); applyCss($('[data-hl]', root));
  if (meta.stale) banner($('[data-stale]', root), `The weather service isn't responding, so this is a saved forecast from ${timeAgo(data.fetchedAt)}.`);
  observeCharts();
}

let observer;
function observeCharts() {
  observer?.disconnect();
  const sec = $('#insights', root);
  if (chartsWanted) { drawCharts(); return; }
  observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { chartsWanted = true; observer.disconnect(); drawCharts(); } }, { rootMargin: '300px' });
  observer.observe(sec);
}
async function drawCharts() {
  try { await renderCharts(data, root); }
  catch (e) { for (const box of root.querySelectorAll('.osw-chart .box')) box.innerHTML = `<p class="osw-muted">${esc(e.message)}</p>`; }
}

function startClock() {
  clearInterval(clockTimer);
  const tick = () => { const el = $('[data-live-clock]', root); const n = data && localNow(data.location.timezone); if (el && n) el.textContent = `${n.date}, ${n.time}`; };
  clockTimer = setInterval(tick, 30000);
}

async function load(next) {
  loc = next; const mine = ++token;
  skeleton();
  try {
    const d = await loadOverview(loc);
    if (mine !== token) return; // a newer request superseded this one
    data = d; rememberLocation(loc); render(); startClock();
    document.title = `${loc.name} · OsasWeather`;
  } catch (e) {
    if (mine !== token) return;
    root.innerHTML = stateBlock({ icon: 'bi-cloud-slash', title: 'We couldn’t load this forecast', text: e.message, actionHtml: '<button type="button" class="btn btn-sun" data-retry>Try again</button>' });
  }
}

root.addEventListener('click', async (e) => {
  if (e.target.closest('[data-retry]') || e.target.closest('[data-refresh]')) { if (loc) load(loc); return; }
  if (e.target.closest('[data-hours-toggle]')) { hours = hours === 24 ? 48 : 24; paintTimeline(); return; }
  const fav = e.target.closest('[data-fav-toggle]');
  if (fav && data) {
    fav.disabled = true;
    try {
      const existing = findFav();
      if (existing) { await api.del(`/favourites/${existing.id}`); favs = favs.filter((f) => f.id !== existing.id); toast('Removed from favourites'); }
      else {
        const name = loc.region && !loc.name.includes(loc.region) ? `${loc.name}, ${loc.region}` : loc.name;
        const r = await api.post('/favourites', { name, country: loc.country || null, latitude: loc.latitude, longitude: loc.longitude });
        favs = [r.favourite, ...favs]; toast('Added to favourites');
      }
    } catch (err) { toast(err.message, 'error'); }
    paintSky();
  }
});

(async () => {
  const s = await requireSession();
  if (!s) return;
  mountShell({
    page: 'dashboard.html',
    onLocation: (l, q) => { history.pushState(null, '', `dashboard.html?${q}`); load(l); },
  });
  if (s.error) { root.innerHTML = stateBlock({ title: 'Can’t reach the server', text: 'Check your connection and reload the page.' }); return; }
  try { favs = (await api.get('/favourites')).favourites; } catch { favs = []; }
  const start = await resolveStart();
  if (!start) {
    root.innerHTML = stateBlock({ icon: 'bi-search', title: 'Search for a city', text: 'Use the search box above to see its forecast. Set a default location in Settings to open it automatically.' });
    return;
  }
  load(start);
  window.addEventListener('popstate', async () => { const l = fromUrl() || (await resolveStart()); if (l) load(l); });
  window.addEventListener('hashchange', () => { if (location.hash === '#insights') { chartsWanted = true; if (data) drawCharts(); } });
})();
