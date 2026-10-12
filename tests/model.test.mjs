// Sanity checks for the normalizers and aggregations against the bundled data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../assets/js/config.js';
import { buildModel } from '../assets/js/lib/stats.js';
import { parseGviz } from '../assets/js/lib/gviz.js';
import {
  applyOverrides, companyKey, companyRowsFromRows, finalizeOffer, normCategory, normOffer, offersFromRows,
  parseCtc, parseStipendK, pickDisplayName, studentKey,
} from '../assets/js/lib/normalize.js';

const json = async (p) => JSON.parse(await readFile(new URL(`../${p}`, import.meta.url), 'utf8'));

test('normalizers', () => {
  assert.equal(normOffer('6m+FTe'), '6M + FTE');
  assert.equal(normOffer('6M + PPO'), '6M + PPO');
  assert.equal(normOffer('#REF!'), '');
  assert.equal(normCategory('NON TECH'), 'Non Tech');
  assert.equal(normCategory('', 'Software Engineer'), 'Tech');
  assert.equal(parseCtc('23.5 lpa (14 base)'), 23.5);
  assert.equal(parseCtc('21,36,442 (17 base)'), 21.36);
  assert.equal(parseStipendK('1.2 lakh'), 120);
  assert.equal(parseStipendK(100), 100);
  assert.equal(studentKey('2K22/CO/095', 'x'), '22/CO/95');
  assert.equal(studentKey('23/CS/084', 'x'), '23/CS/84');
  assert.equal(companyKey('Amazon(JULY-DEC)'), companyKey('Amazon'));
  assert.equal(companyKey('Texas Instrumetns'), companyKey('Texas Instruments'));
  assert.equal(pickDisplayName(['EVEREST', 'Everest']), 'Everest');
  assert.equal(pickDisplayName(['TOWER RESEARCH CAPITAL']), 'Tower Research Capital');
  assert.equal(pickDisplayName(['KPMG', 'KPMG']), 'KPMG');
});

test('gviz parser', () => {
  const text = `/*O_o*/\ngoogle.visualization.Query.setResponse({"version":"0.6","status":"ok","table":{"cols":[{"id":"A","label":"Name","type":"string"},{"id":"B","label":"CTC (in LPA)","type":"number"}],"rows":[{"c":[{"v":"A B"},{"v":23,"f":"23"}]},{"c":[null,null]}]}});`;
  assert.deepEqual(parseGviz(text), [{ Name: 'A B', 'CTC (in LPA)': 23 }]);
});

test('2026 archive model', async () => {
  const d = await json('data/2026.json');
  const m = buildModel({ ...CONFIG.seasons['2026'], ...d }, d.offers.map(finalizeOffer));
  assert.ok(m.totals.offers > 1100);
  assert.equal(m.totals.maxCtc, 82);
  assert.equal(m.totals.batchTotal, 2530);
  assert.ok(m.totals.pct > 30 && m.totals.pct < 60);
  assert.equal(new Set(m.companies.map((c) => c.slug)).size, m.companies.length, 'company slugs are unique');
  console.log('2026', JSON.stringify({ ...m.totals }));
});

test('2027 snapshot model', async () => {
  const d = await json('data/2027.json');
  const s = CONFIG.seasons['2027'];
  const m = buildModel(s, offersFromRows(d.tabs.Students), companyRowsFromRows(d.tabs.Companies));
  // The snapshot is refreshed from the live sheet, so check invariants rather than exact counts.
  assert.equal(m.totals.offers, d.tabs.Students.filter((r) => r.Company && r.Name).length);
  assert.ok(m.totals.placed > 0 && m.totals.placed <= m.totals.offers);
  assert.ok(m.totals.pct > 0 && m.totals.pct <= 100);
  assert.equal(m.totals.batchTotal, 2552);
  const drives = new Set(d.tabs.Companies.map((r) => r.Company).filter((n) => /^amazon/i.test(n)));
  const amazon = m.companies.filter((c) => /^amazon/i.test(c.name));
  if (drives.size) assert.equal(amazon.length, 1, 'Amazon drives merge into one company');
  for (const c of m.companies) assert.ok(c.slug, `company ${c.name} has a slug`);
  assert.equal(new Set(m.companies.map((c) => c.slug)).size, m.companies.length, 'company slugs are unique');
  console.log('2027', JSON.stringify(m.totals));
  console.log('top', m.companies.slice(0, 8).map((c) => `${c.name}:${c.count}`).join(', '));
  console.log('status', JSON.stringify(m.companies.reduce((a, c) => ((a[c.status] = (a[c.status] || 0) + 1), a), {})));
});

test('season overrides win over sheet values', async () => {
  const d = await json('data/2027.json');
  const s = CONFIG.seasons['2027'];
  const offers = applyOverrides(offersFromRows(d.tabs.Students), s.overrides);
  for (const o of s.overrides) {
    const hits = offers.filter((x) => x.studentKey === studentKey(o.roll, ''));
    for (const h of hits) for (const [k, v] of Object.entries(o.set)) assert.equal(h[k], v);
  }
  const hiten = offers.filter((x) => x.roll === '23/EE/355');
  assert.ok(hiten.length >= 1 && hiten.every((x) => x.cgpa === 8.4 && x.name === 'Hiten Sharma'));
});

test('recently placed: newest company batches from the end', async () => {
  const { recentBatches } = await import('../assets/js/lib/stats.js');
  const o = (company, name) => ({ companyKey: company, name });
  const rows = [o('a', 1), o('b', 2), o('b', 3), o('c', 4), o('a', 5), o('a', 6)];
  assert.deepEqual(
    recentBatches(rows, 3).map((b) => [b.companyKey, b.offers.map((x) => x.name)]),
    [['a', [5, 6]], ['c', [4]], ['b', [2, 3]]],
  );
  assert.equal(recentBatches(rows, 10).length, 4);
  assert.deepEqual(recentBatches([], 6), []);
});
