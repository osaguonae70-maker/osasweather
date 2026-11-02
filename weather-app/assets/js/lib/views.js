import { esc } from './ui.js';
import { weatherIcon, skyFor } from './icons.js';
import { deg, pct, hourLabel, clockLabel, weekday, shortDate, localNow, windUnit, speed, visibilityKm, uvBand, dash } from './format.js';

const unitLetter = (u) => (String(u || '').includes('F') ? 'F' : 'C');
const num = (n, d = 0) => (n == null ? dash : Number(n).toFixed(d));

/* ------------------------------------------------------------- sky panel */
export function renderSky(d, loc, { isFav = false, signedIn = true, tag = 'h1' } = {}) {
  const c = d.current; const cond = c.condition;
  const sky = skyFor(cond.icon);
  const now = localNow(d.location.timezone);
  const title = loc.name;
  const sub = [loc.region, loc.country].filter(Boolean).join(', ');
  return `<section class="osw-sky" data-sky="${sky}" aria-labelledby="sky-title">
    <div class="osw-sky-top">
      <div>
        <${tag} class="osw-sky-loc" id="sky-title">${esc(title)}</${tag}>
        <div class="osw-sky-sub">${esc(sub)}${sub && now ? ' · ' : ''}<span data-live-clock>${now ? `${esc(now.date)}, ${esc(now.time)}` : ''}</span></div>
      </div>
      <div class="d-flex gap-2">
        ${signedIn ? `<button type="button" class="osw-iconbtn ${isFav ? 'is-on' : ''}" data-fav-toggle aria-pressed="${isFav}" aria-label="${isFav ? 'Remove from favourites' : 'Add to favourites'}"><i class="bi ${isFav ? 'bi-star-fill' : 'bi-star'}" aria-hidden="true"></i></button>` : ''}
        <button type="button" class="osw-iconbtn" data-refresh aria-label="Refresh forecast"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i></button>
      </div>
    </div>
    <div class="osw-sky-main">
      <div>
        <div class="osw-temp" aria-label="Temperature ${c.temperature == null ? 'unavailable' : Math.round(c.temperature) + ' degrees'}">${c.temperature == null ? dash : Math.round(c.temperature)}<sup>°${unitLetter(d.units.temperature)}</sup></div>
        <div class="osw-cond">${esc(cond.label)}</div>
        <div class="osw-sky-meta">
          <span>Feels like <b>${deg(c.apparentTemperature)}</b></span>
          <span>High <b>${deg(d.today.high)}</b></span>
          <span>Low <b>${deg(d.today.low)}</b></span>
        </div>
        <div class="osw-sky-meta"><span>${esc(cond.description)}</span></div>
      </div>
      <div class="osw-sky-art">${weatherIcon(cond.icon, cond.label)}</div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------- hourly timeline */
const COL = 68; const H = 232; const Y_TOP = 112; const Y_BOT = 172;
export function renderTimeline(d, count = 24) {
  const hrs = d.hourly.slice(0, count);
  const temps = hrs.map((h) => h.temperature).filter((t) => t != null);
  if (!hrs.length || !temps.length) return '<p class="osw-muted">Hourly forecast is unavailable right now.</p>';
  const lo = Math.min(...temps); const hi = Math.max(...temps); const span = hi - lo || 1;
  const pts = hrs.map((h, i) => ({ x: i * COL + COL / 2, y: h.temperature == null ? null : Y_BOT - ((h.temperature - lo) / span) * (Y_BOT - Y_TOP) }));
  const line = pts.filter((p) => p.y != null);
  let path = '';
  line.forEach((p, i) => {
    if (!i) { path = `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`; return; }
    const q = line[i - 1]; const mx = (q.x + p.x) / 2;
    path += ` C${mx.toFixed(1)} ${q.y.toFixed(1)} ${mx.toFixed(1)} ${p.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  });
  const area = line.length ? `${path} L${line.at(-1).x.toFixed(1)} 196 L${line[0].x.toFixed(1)} 196 Z` : '';
  const width = hrs.length * COL;
  const cols = hrs.map((h, i) => {
    const p = pts[i]; const rain = h.precipitationProbability;
    return `<div class="osw-tl-col ${i === 0 ? 'is-now' : ''}" role="listitem">
      <span class="t">${i === 0 ? 'Now' : hourLabel(h.time)}</span>
      <span class="ic">${weatherIcon(h.condition.icon, h.condition.label)}</span>
      ${p.y == null ? '' : `<span class="deg" data-css="top:${p.y.toFixed(1)}px">${deg(h.temperature)}</span><span class="dot" data-css="top:${p.y.toFixed(1)}px"></span>`}
      <span class="rain ${rain ? '' : 'is-zero'}" title="Chance of precipitation">${rain == null ? dash : `${Math.round(rain)}%`}</span>
      <span class="wind" title="Wind speed">${speed(h.windSpeed)} ${esc(windUnit(d.units.windSpeed))}</span>
    </div>`;
  }).join('');
  return `<div class="osw-timeline" tabindex="0" role="region" aria-label="Hourly forecast, scrolls horizontally">
    <div class="osw-tl-inner" role="list" data-css="width:${width}px">
      <svg class="osw-tl-curve" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" aria-hidden="true" focusable="false"><path class="area" d="${area}"/><path d="${path}"/></svg>
      ${cols}
    </div>
  </div>`;
}

/* ------------------------------------------------------------- 7-day */
export function renderWeek(d) {
  const days = d.daily;
  const lows = days.map((x) => x.low).filter((v) => v != null); const highs = days.map((x) => x.high).filter((v) => v != null);
  if (!lows.length || !highs.length) return '<p class="osw-muted">The daily forecast is unavailable right now.</p>';
  const min = Math.min(...lows); const max = Math.max(...highs); const span = max - min || 1;
  return `<div class="osw-week" role="list">${days.map((x, i) => {
    const left = x.low == null ? 0 : ((x.low - min) / span) * 100;
    const width = x.low == null || x.high == null ? 0 : Math.max(4, ((x.high - x.low) / span) * 100);
    const p = x.precipitationProbability;
    return `<div class="osw-day ${i === 0 ? 'is-today' : ''}" role="listitem">
      <div class="d">${weekday(x.date, i)}<small>${shortDate(x.date)}</small></div>
      <div>${weatherIcon(x.condition.icon, x.condition.label, 'tw-w-8 tw-h-8')}</div>
      <div class="c">${esc(x.condition.label)}</div>
      <div class="p ${p ? '' : 'is-zero'}" title="Chance of precipitation">${p == null ? dash : `${Math.round(p)}%`}</div>
      <div class="lo" title="Low">${deg(x.low)}</div>
      <div class="osw-range" aria-hidden="true"><i data-css="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></i></div>
      <div class="hi" title="High">${deg(x.high)}</div>
    </div>`;
  }).join('')}</div>`;
}

/* ------------------------------------------------------------- highlights */
const UV_COLORS = ['#3ea85a', '#3ea85a', '#3ea85a', '#e0c21f', '#e0c21f', '#e0c21f', '#f08a1c', '#f08a1c', '#d8362f', '#d8362f', '#d8362f'];
const na = '<span class="osw-unavail">Not available</span>';

function uvCard(c, today) {
  const v = c.uvIndex;
  const segs = UV_COLORS.map((col, i) => `<i class="${v != null && i < Math.round(v) ? 'on' : ''} ${v != null && i === Math.min(10, Math.max(0, Math.round(v) - 1)) ? 'mark' : ''}" data-css="--c:${col}"></i>`).join('');
  return `<article class="s4"><h3><i class="bi bi-brightness-high" aria-hidden="true"></i>UV index</h3>
    ${v == null ? `<div class="big">${na}</div>` : `<div class="big">${num(v, 1)}<small>${uvBand(v)}</small></div><div class="osw-uv" aria-hidden="true">${segs}</div>`}
    <div class="note">${today.uvIndexMax != null ? `Peak today: ${num(today.uvIndexMax, 1)} (${uvBand(today.uvIndexMax)})` : 'Daily peak not available'}</div></article>`;
}

function windCard(c, units) {
  const unit = windUnit(units.windSpeed);
  const dir = c.windDirection;
  const needle = dir == null ? '' : `<g transform="rotate(${((dir + 180) % 360).toFixed(0)} 66 66)"><path class="needle" d="M66 22l8 28H58z"/><circle cx="66" cy="66" r="4" class="needle"/></g>`;
  return `<article class="s5"><h3><i class="bi bi-wind" aria-hidden="true"></i>Wind</h3>
    <div class="osw-wind"><div>
      <div class="big">${speed(c.windSpeed)}<small>${esc(unit)}</small></div>
      <div class="note">${c.windDirectionLabel ? `From the ${esc(c.windDirectionLabel)} (${Math.round(dir)}°)` : 'Direction not available'}</div>
      <div class="note">${c.windGusts != null ? `Gusts up to ${speed(c.windGusts)} ${esc(unit)}` : 'Gusts not available'}</div></div>
      <svg class="osw-compass" viewBox="0 0 132 132" role="img" aria-label="${c.windDirectionLabel ? `Wind from ${c.windDirectionLabel}` : 'Wind direction unavailable'}">
        <circle class="ring" cx="66" cy="66" r="60"/><text x="66" y="17" text-anchor="middle">N</text><text x="66" y="125" text-anchor="middle">S</text><text x="12" y="70" text-anchor="middle">W</text><text x="120" y="70" text-anchor="middle">E</text>${needle}</svg></div></article>`;
}

function fillCard(cls, icon, title, value, suffix, note) {
  return `<article class="${cls}"><h3><i class="bi ${icon}" aria-hidden="true"></i>${title}</h3>
    ${value == null ? `<div class="big">${na}</div>` : `<div class="big">${Math.round(value)}<small>${suffix}</small></div><div class="osw-fill" role="presentation"><i data-css="width:${Math.max(0, Math.min(100, value))}%"></i></div>`}
    <div class="note">${note}</div></article>`;
}

const toMin = (iso) => (iso ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : null);
function sunCard(c, today) {
  const rise = toMin(today.sunrise); const set = toMin(today.sunset); const nowM = toMin(c.time);
  let dot = '';
  if (rise != null && set != null && nowM != null && set > rise) {
    const t = Math.max(0, Math.min(1, (nowM - rise) / (set - rise)));
    const x = 150 - 130 * Math.cos(Math.PI * t); const y = 100 - 90 * Math.sin(Math.PI * t);
    dot = nowM >= rise && nowM <= set ? `<circle class="sun" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/>` : '';
  }
  const hours = rise != null && set != null && set > rise ? `${Math.floor((set - rise) / 60)} h ${(set - rise) % 60} min of daylight` : '';
  return `<article class="s6"><h3><i class="bi bi-sunrise" aria-hidden="true"></i>Sunrise and sunset</h3>
    <svg class="osw-arc" viewBox="0 0 300 112" role="img" aria-label="Sun position today"><line class="horizon" x1="6" y1="100" x2="294" y2="100"/>
      <path class="track" d="M20 100A130 90 0 0 1 280 100"/>${dot}</svg>
    <div class="osw-arc-times"><div>${weatherIcon('sunrise', null, 'tw-w-7 tw-h-7 tw-inline-block tw-align-middle')} Sunrise<b>${clockLabel(today.sunrise)}</b></div><div class="text-end">Sunset ${weatherIcon('sunset', null, 'tw-w-7 tw-h-7 tw-inline-block tw-align-middle')}<b>${clockLabel(today.sunset)}</b></div></div>
    <div class="note">${hours}</div></article>`;
}

export function renderHighlights(d) {
  const c = d.current; const u = d.units;
  const vis = visibilityKm(c.visibility);
  return `<div class="osw-hl">
    ${windCard(c, u)}
    ${uvCard(c, d.today)}
    ${fillCard('s3', 'bi-droplet-half', 'Humidity', c.humidity, '%', c.humidity == null ? '' : c.humidity >= 70 ? 'Feels muggy' : c.humidity <= 30 ? 'Dry air' : 'Comfortable range')}
    ${sunCard(c, d.today)}
    <article class="s3"><h3><i class="bi bi-speedometer2" aria-hidden="true"></i>Pressure</h3>${c.pressure == null ? `<div class="big">${na}</div>` : `<div class="big">${Math.round(c.pressure)}<small>${esc(u.pressure)}</small></div>`}<div class="note">Sea-level pressure</div></article>
    <article class="s3"><h3><i class="bi bi-eye" aria-hidden="true"></i>Visibility</h3>${vis == null ? `<div class="big">${na}</div>` : `<div class="big">${vis}<small>km</small></div>`}<div class="note">${vis == null ? '' : Number(vis) >= 10 ? 'Clear view' : Number(vis) >= 4 ? 'Slightly reduced' : 'Poor visibility'}</div></article>
    ${fillCard('s4', 'bi-cloud', 'Cloud cover', c.cloudCover, '%', 'Share of the sky covered')}
    <article class="s4"><h3><i class="bi bi-cloud-rain" aria-hidden="true"></i>Precipitation</h3>${c.precipitation == null ? `<div class="big">${na}</div>` : `<div class="big">${num(c.precipitation, 1)}<small>mm now</small></div>`}<div class="note">${d.today.precipitationProbability != null ? `Chance today: ${Math.round(d.today.precipitationProbability)}%` : 'Chance today not available'}</div></article>
    <article class="s4"><h3><i class="bi bi-shield-exclamation" aria-hidden="true"></i>Air quality and alerts</h3><div class="big"><span class="osw-unavail">Not available</span></div><div class="note">No verified air-quality or severe-weather data source is connected, so nothing is shown. This is not a sign that conditions are safe.</div></article>
  </div>`;
}

export const pctText = pct;
