export const dash = '–';
export const dt = (iso) => (iso ? new Date(iso).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : dash);
export const dOnly = (iso) => (iso ? new Date(iso).toLocaleDateString('en', { dateStyle: 'medium' }) : dash);
export const ago = (iso) => {
  if (!iso) return 'never'; const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} d ago`;
};
export const n = (v) => (v == null ? dash : Number(v).toLocaleString('en'));
export const pct = (v) => (v == null ? dash : `${v}%`);
export const ms = (v) => (v == null ? dash : `${v} ms`);
export const uptime = (s) => { const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
