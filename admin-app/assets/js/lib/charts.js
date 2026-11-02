let loading; const charts = new Map(); let redraw = [];
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function lib() {
  if (window.Chart) return Promise.resolve();
  loading ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'assets/js/vendor/chart.umd.min.js'; s.onload = res; s.onerror = () => rej(new Error('Charts could not be loaded.')); document.head.append(s); });
  return loading;
}
export const palette = () => ({ azure: css('--azure'), sun: '#ffb020', ok: css('--ok'), danger: css('--danger'), grid: css('--chart-grid'), text: css('--chart-text') });
/** Creates or updates a chart. build(palette) must return a Chart.js config; it is re-run on theme change. */
export async function chart(key, canvas, build) {
  await lib();
  const make = () => {
    const cfg = build(palette());
    cfg.options = { responsive: true, maintainAspectRatio: false, animation: reduce() ? false : { duration: 350 }, ...cfg.options };
    const ex = charts.get(key);
    if (ex && ex.canvas === canvas) { ex.data = cfg.data; ex.options = cfg.options; ex.update(); } else { ex?.destroy(); charts.set(key, new window.Chart(canvas, cfg)); }
  };
  make(); redraw = redraw.filter((r) => r.key !== key); redraw.push({ key, make });
}
export const axes = (p, extra = {}) => ({
  x: { ticks: { color: p.text, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false }, ...(extra.x || {}) },
  y: { ticks: { color: p.text, maxTicksLimit: 5, precision: 0 }, grid: { color: p.grid }, border: { display: false }, beginAtZero: true, ...(extra.y || {}) },
});
document.addEventListener('adm:theme', () => redraw.forEach((r) => r.make()));
export const destroyAll = () => { charts.forEach((c) => c.destroy()); charts.clear(); redraw = []; };
