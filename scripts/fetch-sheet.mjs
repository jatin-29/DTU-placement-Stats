#!/usr/bin/env node
// Saves the live season's Google Sheet tabs to data/<season>.json.
// The site reads the sheet directly in the browser; this snapshot is the
// fallback for when Google can't be reached (CI runs it on every deploy).
//
//   node scripts/fetch-sheet.mjs            # live season from config.js
//   node scripts/fetch-sheet.mjs 2027

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../assets/js/config.js';
import { fetchSheetTab } from '../assets/js/lib/gviz.js';
import { offersFromRows } from '../assets/js/lib/normalize.js';

const id = process.argv[2] || Object.keys(CONFIG.seasons).find((k) => CONFIG.seasons[k].live);
const season = CONFIG.seasons[id];
if (!season?.sheetId) {
  console.error(`Season ${id} has no Google Sheet configured`);
  process.exit(1);
}

const tabs = {};
for (const tab of Object.values(season.tabs)) {
  tabs[tab] = await fetchSheetTab(season.sheetId, tab, { timeoutMs: 60000 });
  console.log(`${tab}: ${tabs[tab].length} rows`);
}

const offers = offersFromRows(tabs[season.tabs.students]);
if (!offers.length) {
  console.error('No student rows found — keeping the previous snapshot');
  process.exit(1);
}

const out = fileURLToPath(new URL(`../${season.snapshot}`, import.meta.url));
await writeFile(out, JSON.stringify({ fetchedAt: new Date().toISOString(), sheetId: season.sheetId, tabs }));
console.log(`Wrote ${offers.length} offers to ${season.snapshot}`);
