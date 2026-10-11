// Small DOM and formatting helpers shared by the views.

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Tagged template that escapes interpolated values unless wrapped with raw().
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += toHtml(values[i]);
  });
  return new Raw(out);
}

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export function raw(s) {
  return new Raw(String(s));
}

function toHtml(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(toHtml).join('');
  return escapeHtml(v);
}

const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const fmt = {
  int: (v) => (v === null || v === undefined ? '—' : nf0.format(v)),
  n1: (v) => (v === null || v === undefined ? '—' : nf1.format(v)),
  n2: (v) => (v === null || v === undefined ? '—' : nf2.format(v)),
  pct: (v) => (v === null || v === undefined ? '—' : `${nf1.format(v)}%`),
  lpa: (v) => (v === null || v === undefined ? '—' : `${nf2.format(v)} LPA`),
  stipend: (v) => (v === null || v === undefined ? '—' : v >= 100 ? `₹${nf2.format(v / 100)}L/mo` : `₹${nf1.format(v)}K/mo`),
  cgpa: (v) => (v === null || v === undefined ? '—' : v.toFixed(2)),
};

export function timeAgo(date) {
  if (!date) return '';
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const catVar = (cat) => ({ Tech: 'var(--tech)', 'Non Tech': 'var(--nontech)', Core: 'var(--core)' })[cat] || 'var(--unknown)';
export const catClass = (cat) => `key-${String(cat).replace(/\s+/g, '')}`;

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const ICONS = {
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  external:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
};
