// Loads a season: the archive JSON for finished seasons; for the live season
// the Google Sheet itself, with the deployed snapshot as a fallback.

import { CONFIG } from '../config.js';
import { fetchSheetTab } from './gviz.js';
import { buildModel, slugify } from './stats.js';
import { addReported, applyOverrides, archiveCompanyRows, companyKey, companyRowsFromRows, finalizeOffer, offersFromRows } from './normalize.js';

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return res.json();
}

// Cheap fingerprint so an unchanged sheet does not trigger a re-render.
function fingerprint(obj) {
  const s = JSON.stringify(obj);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${s.length}:${h >>> 0}`;
}

export async function loadArchive(id) {
  const season = CONFIG.seasons[id];
  const json = await fetchJson(season.data);
  const s = { ...season, branchStrength: json.branchStrength, cgpaBands: json.cgpaBands, branchCgpa: json.branchCgpa };
  return buildModel(s, applyOverrides(json.offers.map(finalizeOffer), season.overrides), archiveCompanyRows(json.companies), {
    source: 'archive',
    updated: json.updated,
    note: json.source,
  });
}

function modelFromTabs(season, tabs, meta) {
  const students = tabs[season.tabs.students] || [];
  const companies = tabs[season.tabs.companies] || [];
  const offers = applyOverrides(addReported(offersFromRows(students), season.reported), season.overrides);
  return buildModel(season, offers, companyRowsFromRows(companies), {
    ...meta,
    fingerprint: fingerprint([students, companies]),
  });
}

export async function loadSnapshot(id) {
  const season = CONFIG.seasons[id];
  const snap = await fetchJson(season.snapshot);
  return modelFromTabs(season, snap.tabs, { source: 'snapshot', fetchedAt: new Date(snap.fetchedAt) });
}

export async function loadLive(id) {
  const season = CONFIG.seasons[id];
  const [students, companies] = await Promise.all([
    fetchSheetTab(season.sheetId, season.tabs.students),
    fetchSheetTab(season.sheetId, season.tabs.companies).catch(() => []),
  ]);
  if (!students.length) throw new Error('No data came back');
  return modelFromTabs(
    season,
    { [season.tabs.students]: students, [season.tabs.companies]: companies },
    { source: 'live', fetchedAt: new Date() },
  );
}

// An internship season: selections per company, without student names.
export async function loadInternships(id) {
  const season = CONFIG.seasons[id];
  const json = await fetchJson(season.data);
  const companies = json.companies
    .map((c) => ({ ...c, name: c.company, key: companyKey(c.company), slug: slugify(c.company), domain: '' }))
    .sort((a, b) => b.count - a.count || (b.stipend || 0) - (a.stipend || 0) || a.name.localeCompare(b.name));
  const branches = {};
  for (const c of companies) for (const [b, n] of Object.entries(c.branches)) branches[b] = (branches[b] || 0) + n;
  const total = companies.reduce((a, c) => a + c.count, 0);
  const paid = companies.filter((c) => c.stipend !== null);
  const paidCount = paid.reduce((a, c) => a + c.count, 0);
  return {
    season,
    meta: { source: 'archive', updated: json.updated },
    companies,
    totals: {
      selections: total,
      companies: companies.length,
      // Weighted by selections: the stipend an average intern gets.
      avgStipend: paidCount ? paid.reduce((a, c) => a + c.stipend * c.count, 0) / paidCount : null,
      maxStipend: paid.length ? Math.max(...paid.map((c) => c.stipend)) : null,
      withPpo: companies.filter((c) => c.ppo).reduce((a, c) => a + c.count, 0),
      branches: Object.fromEntries(Object.entries(branches).sort((a, b) => b[1] - a[1])),
    },
  };
}
