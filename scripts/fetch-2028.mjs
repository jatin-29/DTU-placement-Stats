#!/usr/bin/env node
// Saves the 2028 batch's (2K24) internship selections to data/2028.json.
// The source page embeds its data as a Next.js flight payload; the company
// list and totals are read from it. CI runs this on every deploy and keeps
// the committed file when the page can't be read.
//
//   node scripts/fetch-2028.mjs

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://app.rankify-dtu.workers.dev/placement';
const OUT = fileURLToPath(new URL('../data/2028.json', import.meta.url));

// The flight payload is a series of self.__next_f.push([1,"<json string>"]) calls.
export function flightText(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = '';
  for (const m of html.matchAll(re)) out += JSON.parse(`"${m[1]}"`);
  return out;
}

// The JSON value that follows "key": in the payload.
export function valueAfter(text, key) {
  const at = text.indexOf(`"${key}":`);
  if (at < 0) return undefined;
  let i = at + key.length + 3;
  const open = text[i];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) return undefined;
  let depth = 0;
  let inStr = false;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (inStr) {
      if (ch === '\\') j++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(text.slice(i, j + 1));
  }
  return undefined;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function internshipsFrom(html) {
  const text = flightText(html);
  const companies = valueAfter(text, 'companies2028');
  if (!Array.isArray(companies) || !companies.length) throw new Error('No 2028 companies found on the page');
  return companies
    .filter((c) => c && c.name && (c.hired || 0) > 0)
    .map((c) => ({
      company: String(c.name).trim(),
      cat: c.type === 'Non-Tech' ? 'Non Tech' : c.type === 'Core' ? 'Core' : 'Tech',
      count: c.hired,
      roles: Object.keys(c.roles || {}),
      offer: c.offerType || '',
      ppo: !!c.hasPPO,
      // Monthly stipend in thousands, like the other seasons.
      stipend: num(c.stipend) !== null ? Math.round(c.stipend / 100) / 10 : null,
      // null: not on record; 0: no cut-off.
      cgpa: num(c.cutoffCgpa),
      ppoCtc: c.fullTimeCtcDisplay || '',
      branches: Object.fromEntries(
        Object.entries(c.branches || {})
          .filter(([, n]) => n > 0)
          .map(([b, n]) => [b === 'Other' ? 'MISC' : b, n]),
      ),
    }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = await fetch(SOURCE, { headers: { 'user-agent': 'Mozilla/5.0 (placement-stats build)' }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const companies = internshipsFrom(await res.text());
  await writeFile(OUT, `${JSON.stringify({ updated: new Date().toISOString(), companies }, null, 1)}\n`);
  console.log(`Wrote ${companies.length} companies, ${companies.reduce((a, c) => a + c.count, 0)} selections to data/2028.json`);
}
