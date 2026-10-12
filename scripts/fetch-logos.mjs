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
// Bump when the sources change, so earlier misses are retried straight away.
const SOURCES_VERSION = 5;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

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
  // SVG scales to any size. (Files often open with an XML declaration, comments
  // and a DOCTYPE before the <svg> element.)
  const head = buf.subarray(0, 8192).toString('utf8').trimStart();
  if (head.startsWith('<') && /<svg[\s>]/i.test(head)) return { ext: 'svg', size: 512 };
  return null;
}

async function get(url, ms = 15000, ua = UA) {
  return fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(ms), headers: { 'user-agent': ua, accept: '*/*' } });
}

async function tryFetch(url, ua, minSize = MIN_SIZE) {
  try {
    const res = await get(url, 15000, ua);
    const type = res.headers.get('content-type') || '';
    if (!res.ok || (type && !/^image\/|octet-stream/.test(type))) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const info = imageSize(buf);
    if (info?.ext === 'svg' && !/svg/.test(type)) return null;
    return info && info.size >= minSize ? { buf, ...info } : null;
  } catch {
    return null;
  }
}

// Icons a site declares itself: <link rel="apple-touch-icon" / "icon"> and the
// web-app manifest's icons, largest first.
async function siteIcons(domain) {
  for (const origin of [`https://${domain}/`, `https://www.${domain}/`]) {
    let html;
    let base;
    try {
      const res = await get(origin, 12000);
      if (!res.ok || !/html/.test(res.headers.get('content-type') || '')) continue;
      base = res.url || origin;
      html = (await res.text()).slice(0, 600000);
    } catch {
      continue;
    }
    const found = [];
    const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')) || []).slice(2).find((x) => x !== undefined) || '';
    let manifest = '';
    for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
      const rel = attr(tag, 'rel').toLowerCase();
      const href = attr(tag, 'href');
      if (!href) continue;
      if (rel.includes('manifest')) manifest = href;
      if (!/(^|\s)(apple-touch-icon(-precomposed)?|icon)(\s|$)/.test(rel) || rel.includes('mask-icon')) continue;
      const sizes = attr(tag, 'sizes');
      const declared = /svg/i.test(attr(tag, 'type')) || /\.svg(\?|$)/i.test(href) ? 512 : Math.max(0, ...(sizes.match(/\d+/g) || []).map(Number));
      found.push({ href, size: declared || (rel.includes('apple') ? 180 : 16) });
    }
    if (manifest) {
      try {
        const murl = new URL(manifest, base).href;
        const m = await (await get(murl, 10000)).json();
        for (const icon of m.icons || []) {
          if (icon.src) found.push({ href: new URL(icon.src, murl).href, size: Math.max(0, ...(String(icon.sizes || '').match(/\d+/g) || []).map(Number)) || 192 });
        }
      } catch {
        /* no usable manifest */
      }
    }
    found.sort((a, b) => b.size - a.size);
    for (const { href } of found) {
      let url;
      try {
        url = new URL(href, base).href;
      } catch {
        continue;
      }
      const hit = await tryFetch(url);
      if (hit) return hit;
    }
  }
  return null;
}

// Big companies whose sites refuse automated requests: the logo at the top of
// their Wikipedia article. Only an SVG, or a file named "...logo...", is taken,
// so a photo of a head office never is.
const WIKIPEDIA = {
  'amd.com': 'AMD',
  'verizon.com': 'Verizon',
  'blackrock.com': 'BlackRock',
  'deshaw.com': 'D. E. Shaw & Co.',
  'natwestgroup.com': 'NatWest Group',
  'marutisuzuki.com': 'Maruti Suzuki',
  'airtel.in': 'Bharti Airtel',
  'havells.com': 'Havells',
  'itcportal.com': 'ITC Limited',
  'fluor.com': 'Fluor Corporation',
  'cadence.com': 'Cadence Design Systems',
  'samsungena.com': 'Samsung E&A',
  'tataadvancedsystems.com': 'Tata Advanced Systems',
  'axtria.com': 'Axtria',
  'joveo.com': 'Joveo',
};
const WIKI_UA = 'DTU-placement-stats logo bundler (https://github.com/jatin-29/DTU-placement-Stats)';

async function wikipediaLogo(domain) {
  const title = WIKIPEDIA[domain];
  if (!title) return null;
  try {
    const res = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, 15000, WIKI_UA);
    if (!res.ok) return null;
    const page = await res.json();
    const original = page.originalimage?.source || '';
    const thumb = page.thumbnail?.source || '';
    const looksLikeLogo = (u) => /\.svg(\.png)?$/i.test(u) || /logo/i.test(decodeURIComponent(u.split('/').pop() || ''));
    if (/\.svg$/i.test(original)) return await tryFetch(original, WIKI_UA);
    if (thumb && looksLikeLogo(thumb)) return await tryFetch(thumb, WIKI_UA);
  } catch {
    /* no article or no logo */
  }
  return null;
}

const SOURCES = [
  (d) => tryFetch(`https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${d}&size=128`),
  (d) => siteIcons(d),
  (d) => tryFetch(`https://icons.duckduckgo.com/ip3/${d}.ico`),
  (d) => tryFetch(`https://icon.horse/icon/${d}`),
  // Aggregators; both answer 404 (not a placeholder) when they have nothing.
  (d) => tryFetch(`https://unavatar.io/${d}?fallback=false`),
  (d) => tryFetch(`https://logo.clearbit.com/${d}?size=128`),
  (d) => wikipediaLogo(d),
  (d) => tryFetch(`https://${d}/apple-touch-icon.png`),
  (d) => tryFetch(`https://www.${d}/apple-touch-icon.png`),
];

async function fetchLogo(domain) {
  for (const src of SOURCES) {
    const hit = await src(domain);
    if (hit) return hit;
  }
  // Last resort: a small favicon (16-31px). The page draws these smaller so they
  // stay sharp; still better than initials.
  return (
    (await tryFetch(`https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`, undefined, 16)) ||
    (await tryFetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, undefined, 16))
  );
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
  if (!e.file && e.v !== SOURCES_VERSION) return true;
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
      index[d] = { file: null, at: now, v: SOURCES_VERSION };
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
