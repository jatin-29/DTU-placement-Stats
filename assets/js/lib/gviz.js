// Reads one tab of a Google Sheet through the Visualization ("gviz") endpoint.
// Works for any sheet shared as "Anyone with the link can view" — no API key.
// Used by the browser (live data) and by scripts/fetch-sheet.mjs (snapshot).

const BASE = 'https://docs.google.com/spreadsheets/d/';

export function gvizUrl(sheetId, tab, tqx = 'out:json') {
  const q = new URLSearchParams({ headers: '1', sheet: tab, tqx });
  return `${BASE}${sheetId}/gviz/tq?${q}`;
}

// Turns a gviz response (raw text or the parsed object) into an array of
// row objects keyed by the header row.
export function parseGviz(payload) {
  let obj = payload;
  if (typeof payload === 'string') {
    const start = payload.indexOf('{');
    const end = payload.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Unexpected response from the data source');
    obj = JSON.parse(payload.slice(start, end + 1));
  }
  if (obj.status === 'error') {
    const msg = (obj.errors || []).map((e) => e.detailed_message || e.message).join('; ');
    throw new Error(msg || 'The data source returned an error');
  }
  const table = obj.table || { cols: [], rows: [] };
  let headers = table.cols.map((c) => String(c.label || '').trim());
  let rows = table.rows.map((r) => table.cols.map((_, i) => cellValue(r.c && r.c[i])));

  // If Google did not detect a header row, use the first data row.
  if (headers.every((h) => !h) && rows.length) {
    headers = rows.shift().map((v) => String(v ?? '').trim());
  }
  return rows
    .filter((r) => r.some((v) => v !== null && v !== ''))
    .map((r) => {
      const o = {};
      headers.forEach((h, i) => {
        const key = h || `col${i}`;
        if (!(key in o)) o[key] = r[i];
      });
      return o;
    });
}

function cellValue(c) {
  if (!c) return null;
  const { v, f } = c;
  if (v === null || v === undefined) return f ?? null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string' && v.startsWith('Date(')) return f ?? v;
  return v;
}

async function fetchText(url, timeoutMs) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { signal: ctrl?.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Script-tag fallback for browsers/extensions that block the cross-origin fetch.
let jsonpSeq = 0;
function jsonp(sheetId, tab, timeoutMs) {
  return new Promise((resolve, reject) => {
    const cb = `__gviz_cb_${Date.now()}_${jsonpSeq++}`;
    const script = document.createElement('script');
    const cleanup = () => {
      delete window[cb];
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out'));
    }, timeoutMs);
    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('Network error'));
    };
    script.src = gvizUrl(sheetId, tab, `out:json;responseHandler:${cb}`);
    document.head.appendChild(script);
  });
}

export async function fetchSheetTab(sheetId, tab, { timeoutMs = 20000 } = {}) {
  try {
    return parseGviz(await fetchText(gvizUrl(sheetId, tab), timeoutMs));
  } catch (err) {
    if (typeof document === 'undefined') throw err;
    return parseGviz(await jsonp(sheetId, tab, timeoutMs));
  }
}
