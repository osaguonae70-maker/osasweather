// Original weather illustrations as inline SVG. Colours come from CSS tokens so they follow light/dark themes.
const CLOUD = 'M14 36a8 8 0 0 1-.5-16A11 11 0 0 1 35 18.5 8.5 8.5 0 0 1 36 36Z';
const cloud = (tx, ty, s, cls = 'cloud') => `<path class="${cls}" transform="translate(${tx} ${ty}) scale(${s})" d="${CLOUD}"/>`;
function sun(cx, cy, r, rays = 8, from = 0, to = 360) {
  let out = `<circle class="sun" cx="${cx}" cy="${cy}" r="${r}"/>`;
  for (let i = 0; i < rays; i += 1) {
    const a = ((from + ((to - from) * i) / rays) * Math.PI) / 180;
    const r1 = r + 3.2; const r2 = r + 6.4;
    out += `<line class="ray" x1="${(cx + r1 * Math.cos(a)).toFixed(1)}" y1="${(cy + r1 * Math.sin(a)).toFixed(1)}" x2="${(cx + r2 * Math.cos(a)).toFixed(1)}" y2="${(cy + r2 * Math.sin(a)).toFixed(1)}"/>`;
  }
  return out;
}
const MOON = (tx = 0, ty = 0, s = 1) => `<path class="moon" transform="translate(${tx} ${ty}) scale(${s})" d="M29 8.5A15.5 15.5 0 1 0 39.5 31 12 12 0 0 1 29 8.5Z"/>`;
const drops = (xs, y0, y1, cls = '') => xs.map((x) => `<line class="drop ${cls}" x1="${x}" y1="${y0}" x2="${x - 2.6}" y2="${y1}"/>`).join('');

const ART = {
  'clear-day': sun(24, 24, 9.5, 8, -90),
  'clear-night': `${MOON(0, 0, 1)}<circle class="star" cx="36" cy="12" r="1.6"/><circle class="star" cx="42" cy="22" r="1.2"/>`,
  'partly-cloudy-day': `${sun(18, 17, 7, 8, -90)}${cloud(8, 13, 0.82)}`,
  'partly-cloudy-night': `${MOON(-6, -6, 0.72)}${cloud(8, 13, 0.82)}`,
  cloudy: `${cloud(-3, -5, 0.78, 'cloud-back')}${cloud(5, 6, 0.86)}`,
  overcast: `${cloud(-2, -6, 0.8, 'cloud-back')}${cloud(5, 5, 0.9)}`,
  'rain-light': `${cloud(1, -7, 0.92)}${drops([17, 25, 33], 32, 38)}`,
  'rain-heavy': `${cloud(1, -8, 0.92, 'cloud-back')}${drops([14, 22, 30, 38], 27, 38, 'heavy')}${drops([18, 26, 34], 36, 46, 'heavy')}`,
  thunder: `${cloud(1, -9, 0.92, 'cloud-back')}<path class="bolt" d="M26 21l-9 13h6l-3 11 11-15h-6l3-9Z"/>`,
  snow: `${cloud(1, -7, 0.92)}<circle class="flake" cx="16" cy="35" r="2.2"/><circle class="flake" cx="24" cy="40" r="2.2"/><circle class="flake" cx="32" cy="35" r="2.2"/><circle class="flake" cx="20" cy="45" r="1.8"/><circle class="flake" cx="29" cy="45" r="1.8"/>`,
  fog: `${cloud(2, -9, 0.88)}<line class="fogline" x1="10" y1="30" x2="38" y2="30"/><line class="fogline" x1="14" y1="36.5" x2="42" y2="36.5"/><line class="fogline" x1="8" y1="43" x2="32" y2="43"/>`,
  mist: `${cloud(2, -9, 0.88)}<line class="fogline" x1="12" y1="31" x2="40" y2="31" opacity=".8"/><line class="fogline" x1="8" y1="38.5" x2="34" y2="38.5" opacity=".8"/>`,
  sunrise: `<path class="sun" d="M12 34a12 12 0 0 1 24 0Z"/><line class="hz" x1="5" y1="34" x2="43" y2="34"/><path class="arrow" d="M24 8v13M18.5 13.5L24 8l5.5 5.5"/><line class="hz" x1="14" y1="40" x2="34" y2="40" opacity=".6"/>`,
  sunset: `<path class="sun" d="M12 34a12 12 0 0 1 24 0Z"/><line class="hz" x1="5" y1="34" x2="43" y2="34"/><path class="arrow" d="M24 21V8M18.5 15.5L24 21l5.5-5.5" transform="translate(0 0)"/><line class="hz" x1="14" y1="40" x2="34" y2="40" opacity=".6"/>`,
  unknown: `<circle class="unk" cx="24" cy="24" r="15"/><text class="unkq" x="24" y="30" text-anchor="middle">?</text>`,
};

/** weatherIcon('rain-heavy', 'Heavy rain')  – label null => decorative (aria-hidden). */
export function weatherIcon(key, label = null, extraClass = '') {
  const art = ART[key] || ART.unknown;
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  return `<svg class="osw-ic ${extraClass}" viewBox="0 0 48 48" ${a11y} focusable="false">${art}</svg>`;
}
/** Maps an icon key to the sky palette used by .osw-sky / .osw-fav */
export const skyFor = (key) => (ART[key] ? key : 'cloudy');
export const ICON_KEYS = Object.keys(ART);
