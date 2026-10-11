// Loads a season: the archive JSON for finished seasons; for the live season
// the Google Sheet itself, with the deployed snapshot as a fallback.

import { CONFIG } from '../config.js';
import { fetchSheetTab } from './gviz.js';
import { buildModel } from './stats.js';
import { companyRowsFromRows, finalizeOffer, offersFromRows } from './normalize.js';

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
  const s = { ...season, branchStrength: json.branchStrength, cgpaBands: json.cgpaBands };
  return buildModel(s, json.offers.map(finalizeOffer), [], {
    source: 'archive',
    updated: json.updated,
    note: json.source,
  });
}

function modelFromTabs(season, tabs, meta) {
  const students = tabs[season.tabs.students] || [];
  const companies = tabs[season.tabs.companies] || [];
  return buildModel(season, offersFromRows(students), companyRowsFromRows(companies), {
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
