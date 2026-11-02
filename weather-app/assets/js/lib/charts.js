import { hourLabel, weekday, dash } from './format.js';

let loading; let charts = {}; let last = null;
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function loadLib() {
  if (window.Chart) return Promise.resolve();
  loading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/js/vendor/chart.umd.min.js'; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error('Charts could not be loaded.'));
    document.head.append(s);
  });
  return loading;
}

function base(unitLabel) {
  const text = css('--chart-text'); const grid = css('--chart-grid');
  return {
    responsive: true, maintainAspectRatio: false, animation: reduce() ? false : { duration: 400 },
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? dash : c.parsed.y}${unitLabel}` } } },
    scales: {
      x: { ticks: { color: text, maxTicksLimit: 7, maxRotation: 0, autoSkip: true }, grid: { display: false } },
      y: { ticks: { color: text, maxTicksLimit: 5 }, grid: { color: grid }, border: { display: false } },
    },
  };
}

function specs(d) {
  const sun = css('--ic-sun'); const azure = css('--azure'); const t = d.units.temperature; const w = d.units.windSpeed === 'mp/h' ? 'mph' : d.units.windSpeed;
  const h = d.hourly.slice(0, 24); const hl = h.map((x, i) => (i === 0 ? 'Now' : hourLabel(x.time)));
  const optsT = base(t); const optsP = base('%'); optsP.scales.y.min = 0; optsP.scales.y.max = 100;
  return {
    daily: { type: 'line', data: { labels: d.daily.map((x, i) => weekday(x.date, i)), datasets: [
      { label: 'High', data: d.daily.map((x) => x.high), borderColor: sun, backgroundColor: sun, tension: 0.35, pointRadius: 3 },
      { label: 'Low', data: d.daily.map((x) => x.low), borderColor: azure, backgroundColor: azure, tension: 0.35, pointRadius: 3 }] }, options: { ...optsT, plugins: { ...optsT.plugins, legend: { display: true, labels: { color: css('--chart-text'), boxWidth: 10 } } } } },
    hourly: { type: 'line', data: { labels: hl, datasets: [{ label: 'Temperature', data: h.map((x) => x.temperature), borderColor: sun, backgroundColor: `${sun}33`, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4 }] }, options: optsT },
    rain: { type: 'bar', data: { labels: hl, datasets: [{ label: 'Chance of precipitation', data: h.map((x) => x.precipitationProbability), backgroundColor: azure, borderRadius: 4, maxBarThickness: 16 }] }, options: optsP },
    wind: { type: 'line', data: { labels: hl, datasets: [{ label: 'Wind speed', data: h.map((x) => x.windSpeed), borderColor: azure, backgroundColor: `${azure}26`, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4 }] }, options: base(` ${w}`) },
  };
}

/** Creates or updates the four charts. Existing instances are updated in place (no re-initialisation). */
export async function renderCharts(d, root = document) {
  last = d;
  await loadLib();
  const s = specs(d);
  for (const [key, spec] of Object.entries(s)) {
    const canvas = root.querySelector(`[data-chart="${key}"]`);
    if (!canvas) continue;
    if (charts[key] && charts[key].canvas === canvas) { charts[key].data = spec.data; charts[key].options = spec.options; charts[key].update(); }
    else { charts[key]?.destroy(); charts[key] = new window.Chart(canvas, spec); }
  }
}
// Re-theme charts when the theme changes (rebuild options only; data stays).
document.addEventListener('osw:theme', () => { if (last && Object.keys(charts).length) renderCharts(last); });
export const destroyCharts = () => { Object.values(charts).forEach((c) => c.destroy()); charts = {}; };
