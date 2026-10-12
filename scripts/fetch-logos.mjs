#!/usr/bin/env node
// Downloads every company's logo into the built site, so visitors load logos
// from this site rather than from third-party icon services (which some
// networks and blockers stop). CI runs it on every deploy.
//
//   node scripts/fetch-logos.mjs <site-dir> [cache-dir]
//
// Writes <site-dir>/assets/logos/<domain>.<ext> and <site-dir>/data/logos.json
// ({ domain: path }). Downloads are kept in the cache dir between runs; a logo
// is fetched again after 30 days, and a miss is retried after 2 days.
// Companies with no known domain, and domains with no usable icon, are listed
// as warnings in the build log.

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../assets/js/config.js';
import { buildModel } from '../assets/js/lib/stats.js';
import { archiveCompanyRows, companyRowsFromRows, finalizeOffer, offersFromRows } from '../assets/js/lib/normalize.js';
import { domainFor, knownDomains } from '../assets/js/lib/logos.js';

const [siteDir, cacheDir = '.logo-cache'] = process.argv.slice(2);
if (!siteDir) {
  console.error('Usage: node scripts/fetch-logos.mjs <site-dir> [cache-dir]');
  process.exit(1);
}
const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const DAY = 86400000;
const MIN_SIZE = 32;

// ---------- which domains ----------

async function seasonCompanies() {
  const out = [];
  for (const [id, season] of Object.entries(CONFIG.seasons)) {
    try {
      if (season.data) {
        const d = JSON.parse(await readFile(root(season.data), 'utf8'));
        out.push(...buildModel({ ...season, branchStrength: d.branchStrength }, d.offers.map(finalizeOffer), archiveCompanyRows(d.companies)).companies);
      } else if (season.snapshot) {
        const d = JSON.parse(await readFile(root(season.snapshot), 'utf8'));
        const t = d.tabs || {};
        out.push(...buildModel(season, offersFromRows(t[season.tabs.students] || []), companyRowsFromRows(t[season.tabs.companies] || [])).companies);
      }
    } catch (e) {
      console.log(`::warning::Could not read season ${id}: ${e.message}`);
    }
  }
  return out;
}

// ---------- image sizes ----------

function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { ext: 'png', size: Math.min(buf.readUInt32BE(16), buf.readUInt32BE(20)) };
  if (buf.length > 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
    // .ico: the largest image in the directory (0 means 256)
    const n = buf.readUInt16LE(4);
    let best = 0;
    for (let i = 0; i < n && 6 + i * 16 + 16 <= buf.length; i++) best = Math.max(best, buf[6 + i * 16] || 256);
    return { ext: 'ico', size: best };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    // JPEG: walk the segments to the frame header (SOF0-SOF15, bar DHT/JPG/DAC)
    for (let i = 2; i + 9 < buf.length; ) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { ext: 'jpg', size: Math.min(buf.readUInt16BE(i + 5), buf.readUInt16BE(i + 7)) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

async function tryFetch(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (logo bundler)' } });
    if (!res.ok || !/^image\//.test(res.headers.get('content-type') || 'image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const info = imageSize(buf);
    return info && info.size >= MIN_SIZE ? { buf, ...info } : null;
  } catch {
    return null;
  }
}

const SOURCES = [
  (d) => `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${d}&size=128`,
  (d) => `https://icons.duckduckgo.com/ip3/${d}.ico`,
  (d) => `https://${d}/apple-touch-icon.png`,
  (d) => `https://www.${d}/apple-touch-icon.png`,
];

async function fetchLogo(domain) {
  for (const src of SOURCES) {
    const hit = await tryFetch(src(domain));
    if (hit) return hit;
  }
  return null;
}

// ---------- main ----------

const companies = await seasonCompanies();
const domains = new Set(knownDomains());
const noDomain = new Map();
for (const c of companies) {
  const d = domainFor(c);
  if (d) domains.add(d);
  else noDomain.set(c.key, c.name);
}

await mkdir(cacheDir, { recursive: true });
const indexPath = join(cacheDir, 'index.json');
const index = existsSync(indexPath) ? JSON.parse(await readFile(indexPath, 'utf8')) : {};
const now = Date.now();
const todo = [...domains].filter((d) => {
  const e = index[d];
  if (!e) return true;
  return now - e.at > (e.file ? 30 : 2) * DAY;
});
console.log(`${domains.size} domains; ${todo.length} to fetch, ${domains.size - todo.length} from cache`);

let next = 0;
async function worker() {
  while (next < todo.length) {
    const d = todo[next++];
    const hit = await fetchLogo(d);
    if (hit) {
      const file = `${d}.${hit.ext}`;
      await writeFile(join(cacheDir, file), hit.buf);
      index[d] = { file, size: hit.size, at: now };
    } else {
      index[d] = { file: null, at: now };
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
await writeFile(indexPath, JSON.stringify(index));

const outDir = join(siteDir, 'assets', 'logos');
await mkdir(outDir, { recursive: true });
await mkdir(join(siteDir, 'data'), { recursive: true });
const manifest = {};
const missing = [];
for (const d of [...domains].sort()) {
  const e = index[d];
  if (e?.file && existsSync(join(cacheDir, e.file))) {
    await copyFile(join(cacheDir, e.file), join(outDir, e.file));
    manifest[d] = `assets/logos/${e.file}`;
  } else {
    missing.push(d);
  }
}
await writeFile(join(siteDir, 'data', 'logos.json'), JSON.stringify(manifest));

console.log(`Bundled ${Object.keys(manifest).length} of ${domains.size} logos`);
if (missing.length) console.log(`::warning::No usable icon (${missing.length}): ${missing.join(', ')}`);
if (noDomain.size) console.log(`::warning::Companies with no known website domain (${noDomain.size}): ${[...noDomain.values()].sort().join('; ')}`);
