// Aggregations behind every view. Pure functions: offers in, numbers out.

import { CATEGORIES } from '../config.js';
import { pickDisplayName } from './normalize.js';

export const CTC_BUCKETS = [
  { label: '< 6', min: 0, max: 6 },
  { label: '6–10', min: 6, max: 10 },
  { label: '10–15', min: 10, max: 15 },
  { label: '15–20', min: 15, max: 20 },
  { label: '20–30', min: 20, max: 30 },
  { label: '30–45', min: 30, max: 45 },
  { label: '45–60', min: 45, max: 60 },
  { label: '60+', min: 60, max: Infinity },
];

export function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function ctcStats(offers) {
  const v = offers.map((o) => o.ctc).filter((x) => x !== null);
  return { avg: mean(v), median: median(v), max: v.length ? Math.max(...v) : null, n: v.length };
}

function catCounts(offers) {
  const c = { Tech: 0, 'Non Tech': 0, Core: 0, Unknown: 0 };
  for (const o of offers) c[o.cat] = (c[o.cat] || 0) + 1;
  return c;
}

function countBy(items, fn) {
  const m = new Map();
  for (const it of items) {
    const k = fn(it);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function inBand(cgpa, band) {
  return (band.min === null || cgpa >= band.min) && (band.max === null || cgpa < band.max);
}

export function buildModel(season, offers, companyRows = [], meta = {}) {
  const strength = season.branchStrength || {};
  const batchTotal = Object.values(strength).reduce((a, b) => a + b, 0);

  // ----- students -----
  const students = new Map();
  for (const o of offers) {
    let s = students.get(o.studentKey);
    if (!s) {
      s = { key: o.studentKey, roll: o.roll, name: o.name, cgpa: o.cgpa, branch: o.branch, offers: [] };
      students.set(o.studentKey, s);
    }
    s.offers.push(o);
    if (s.cgpa === null && o.cgpa !== null) s.cgpa = o.cgpa;
  }
  for (const s of students.values()) {
    s.bestCtc = Math.max(0, ...s.offers.map((o) => o.ctc || 0)) || null;
  }
  const inBatch = [...students.values()].filter((s) => s.branch in strength);

  // ----- companies -----
  const byKey = new Map();
  const ensure = (key, name) => {
    let c = byKey.get(key);
    if (!c) {
      c = { key, names: [], offers: [], roles: [], domain: '' };
      byKey.set(key, c);
    }
    c.names.push(name);
    return c;
  };
  for (const o of offers) ensure(o.companyKey, o.company).offers.push(o);
  for (const r of companyRows) {
    const c = ensure(r.companyKey, r.company);
    c.roles.push(r);
    if (r.domain && !c.domain) c.domain = r.domain;
  }

  const companies = [...byKey.values()].map((c) => {
    const name = pickDisplayName(c.names);
    const listedCount = c.roles.reduce((a, r) => a + (r.count || 0), 0);
    const count = Math.max(c.offers.length, listedCount);
    // Only a live season has processes still running; archived postings without offers are 'none'.
    const anyOngoing = !!season.live && c.roles.some((r) => r.count === null);
    const status = count > 0 ? 'hired' : anyOngoing ? 'ongoing' : c.roles.length ? 'none' : 'hired';
    const cats = catCounts(c.offers.length ? c.offers : c.roles);
    const mainCat = CATEGORIES.reduce((best, k) => (cats[k] > (cats[best] || 0) ? k : best), 'Unknown');
    const ctcs = [...c.offers.map((o) => o.ctc), ...c.roles.map((r) => r.ctc)].filter((x) => x !== null);
    const cutoffs = c.roles.map((r) => r.cgpa).filter((x) => x !== null && x > 0);
    const branches = Object.fromEntries([...countBy(c.offers, (o) => o.branch)].sort((a, b) => b[1] - a[1]));
    const offerTypes = [...new Set([...c.offers.map((o) => o.offer), ...c.roles.map((r) => r.offer)].filter(Boolean))];
    const roleNames = [...new Set([...c.roles.map((r) => r.role), ...c.offers.map((o) => o.role)].filter(Boolean))];
    const stip = [...c.offers.map((o) => o.stipend), ...c.roles.map((r) => r.stipend)].filter((x) => x !== null);
    return {
      key: c.key,
      slug: slugify(name) || c.key,
      name,
      domain: c.domain,
      offers: c.offers,
      roles: c.roles,
      count,
      listedCount,
      status,
      cats,
      mainCat,
      catsPresent: CATEGORIES.filter((k) => cats[k] > 0),
      maxCtc: ctcs.length ? Math.max(...ctcs) : null,
      avgCtc: mean(c.offers.map((o) => o.ctc).filter((x) => x !== null)),
      maxStipend: stip.length ? Math.max(...stip) : null,
      cgpaCutoff: cutoffs.length ? Math.min(...cutoffs) : null,
      branches,
      offerTypes,
      roleNames,
      students: new Set(c.offers.map((o) => o.studentKey)).size,
    };
  });
  companies.sort((a, b) => b.count - a.count || (b.maxCtc || 0) - (a.maxCtc || 0) || a.name.localeCompare(b.name));
  const usedSlugs = new Set();
  for (const c of companies) {
    if (usedSlugs.has(c.slug)) c.slug = `${c.slug}-${c.key}`;
    usedSlugs.add(c.slug);
  }
  const companyBySlug = new Map(companies.map((c) => [c.slug, c]));
  const companyByKey = new Map(companies.map((c) => [c.key, c]));

  // ----- branches -----
  const branchCodes = [...new Set([...Object.keys(strength), ...offers.map((o) => o.branch)])];
  const branches = branchCodes.map((code) => {
    const bo = offers.filter((o) => o.branch === code);
    const placed = new Set(bo.map((o) => o.studentKey)).size;
    const byCat = {};
    for (const k of [...CATEGORIES, 'Unknown']) {
      const co = bo.filter((o) => o.cat === k);
      byCat[k] = { count: co.length, ...ctcStats(co) };
    }
    const top = [...countBy(bo, (o) => o.companyKey)]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, n]) => ({ company: companyByKey.get(key), n }));
    return {
      code,
      strength: strength[code] ?? null,
      placed,
      offers: bo.length,
      pct: strength[code] ? (placed / strength[code]) * 100 : null,
      byCat,
      ...ctcStats(bo),
      top,
    };
  });
  branches.sort((a, b) => (b.strength !== null) - (a.strength !== null) || b.offers - a.offers);

  // ----- headline numbers -----
  const all = ctcStats(offers);
  const top = offers.reduce((best, o) => (o.ctc !== null && (!best || o.ctc > best.ctc) ? o : best), null);
  const stipends = offers.map((o) => o.stipend).filter((x) => x !== null);
  const totals = {
    offers: offers.length,
    placed: students.size,
    placedInBatch: inBatch.length,
    batchTotal,
    pct: batchTotal ? (inBatch.length / batchTotal) * 100 : null,
    companiesVisited: companies.length,
    companiesWithOffers: companies.filter((c) => c.offers.length > 0).length,
    companiesOngoing: companies.filter((c) => c.status === 'ongoing').length,
    avgCtc: all.avg,
    medianCtc: all.median,
    maxCtc: all.max,
    maxCtcCompany: top ? top.company : null,
    avgStipend: mean(stipends),
    cats: catCounts(offers),
    multiOffer: [...students.values()].filter((s) => s.offers.length > 1).length,
  };

  const offerTypes = [...countBy(offers.filter((o) => o.offer), (o) => o.offer)].sort((a, b) => b[1] - a[1]);

  const ctcBuckets = CTC_BUCKETS.map((b) => {
    const inB = offers.filter((o) => o.ctc !== null && o.ctc >= b.min && o.ctc < b.max);
    return { ...b, cats: catCounts(inB), total: inB.length };
  });

  const cgpaBands = (season.cgpaBands || []).map((band) => {
    const placed = inBatch.filter((s) => s.cgpa !== null && inBand(s.cgpa, band)).length;
    return { ...band, placed, pct: band.total ? (placed / band.total) * 100 : null };
  });

  return {
    season,
    meta,
    offers,
    students,
    companies,
    companyBySlug,
    companyByKey,
    branches,
    totals,
    offerTypes,
    ctcBuckets,
    cgpaBands,
  };
}
