// The 2026 vs 2027 company comparison: matching employers across seasons
// and the per-season numbers shown for each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../assets/js/config.js';
import { buildModel } from '../assets/js/lib/stats.js';
import { archiveCompanyRows, companyRowsFromRows, finalizeOffer, offersFromRows } from '../assets/js/lib/normalize.js';
import { joinSeasons, looseKey, previousCompany, sameEmployer, sideStats } from '../assets/js/lib/match.js';

const json = async (p) => JSON.parse(await readFile(new URL(`../${p}`, import.meta.url), 'utf8'));

async function seasons() {
  const d26 = await json('data/2026.json');
  const before = buildModel({ ...CONFIG.seasons['2026'], ...d26 }, d26.offers.map(finalizeOffer), archiveCompanyRows(d26.companies));
  const d27 = await json('data/2027.json');
  const now = buildModel(CONFIG.seasons['2027'], offersFromRows(d27.tabs.Students), companyRowsFromRows(d27.tabs.Companies));
  return { now, before };
}

// A minimal season built from hand-written rows.
function model(live, rows) {
  const offers = rows.flatMap(([company, n = 0, ctc = 10]) =>
    Array.from({ length: n }, (_, i) => finalizeOffer({ roll: `23/CS/${i + 1}`, name: `S${i}`, company, ctc, branch: 'CS' })),
  );
  return buildModel({ id: live ? '2027' : '2026', live, branchStrength: { CS: 100 } }, offers, []);
}

test('loose keys drop legal suffixes and brackets only', () => {
  assert.equal(looseKey('Fluor Daniel India Pvt Ltd'), looseKey('Fluor Daniel India Private Limited'));
  assert.equal(looseKey('Schlumberger(SLB)'), looseKey('Schlumberger'));
  assert.equal(looseKey('ICICI Bank Ltd'), looseKey('ICICI Bank'));
  assert.equal(looseKey('OneBanc Technologies'), looseKey('OneBanc'));
  assert.notEqual(looseKey('Siemens Energy'), looseKey('Siemens EDA'));
  assert.notEqual(looseKey('Everest Group'), looseKey('Everest Fleet'));
  // A name made only of suffix words keeps its last word.
  assert.equal(looseKey('India'), 'india');
});

test('seasons join into employer groups', () => {
  const now = model(true, [['ICICI Bank', 3], ['Acme', 2], ['Newco', 1]]);
  const before = model(false, [['ICICI Bank Ltd', 2], ['Acme', 1], ['Gone Pvt Ltd', 4]]);
  const j = joinSeasons(now, before);
  const pairs = j.both.map((g) => [g.now.map((c) => c.name).join('+'), g.before.map((c) => c.name).join('+')]).sort();
  assert.deepEqual(pairs, [['Acme', 'Acme'], ['ICICI Bank', 'ICICI Bank Ltd']]);
  assert.deepEqual(j.onlyNow.map((g) => g.now[0].name), ['Newco']);
  assert.deepEqual(j.onlyBefore.map((g) => g.before[0].name), ['Gone Pvt Ltd']);
  assert.equal(previousCompany(before, now.companyByKey.get('icicibank')).name, 'ICICI Bank Ltd');
  assert.equal(previousCompany(null, now.companies[0]), null);

  // An off-campus hire is not a campus visit.
  const offCampus = model(false, [['Myntra (off-campus)', 1]]);
  assert.equal(previousCompany(offCampus, model(true, [['Myntra', 3]]).companies[0]), null);
});

test('every company lands in exactly one group', async () => {
  const { now, before } = await seasons();
  const j = joinSeasons(now, before);
  const seenNow = [...j.both, ...j.onlyNow].flatMap((g) => g.now.map((c) => c.key));
  const seenBefore = [...j.both, ...j.onlyBefore].flatMap((g) => g.before.map((c) => c.key));
  assert.equal(seenNow.length, now.companies.length);
  assert.equal(new Set(seenNow).size, now.companies.length);
  assert.equal(seenBefore.length, before.companies.length);
  assert.equal(new Set(seenBefore).size, before.companies.length);
  // Exact matches are never lost.
  for (const c of now.companies) {
    if (before.companyByKey.has(c.key)) assert.ok(sameEmployer(before, c).some((p) => p.key === c.key), c.name);
  }
  console.log('groups', JSON.stringify({ both: j.both.length, onlyNow: j.onlyNow.length, onlyBefore: j.onlyBefore.length }));
});

test('side numbers: offers, packages, cut-offs, status', () => {
  const role = (o) => ({ role: 'SDE', offer: 'FTE', cat: 'Tech', ctc: null, stipend: null, cgpa: null, count: null, ...o });
  const offer = (o) => ({ ctc: null, stipend: null, branch: 'CS', studentKey: Math.random().toString(), cat: 'Tech', role: 'SDE', offer: 'FTE', ...o });
  const company = (offers, roles) => ({ count: Math.max(offers.length, roles.reduce((a, r) => a + (r.count || 0), 0)), offers, roles });

  // Results out for one role, another still running at a higher package.
  const a = sideStats([company([offer({ ctc: 20 }), offer({ ctc: 24 })], [role({ ctc: 24, count: 2, cgpa: 7 }), role({ ctc: 30, count: null, cgpa: 0 })])], { live: true });
  assert.equal(a.count, 2);
  assert.equal(a.status, 'hired');
  assert.equal(a.partial, true);
  assert.equal(a.maxCtc, 30);
  assert.equal(a.ctcPosted, true);
  assert.equal(a.avgCtc, 22);
  // One role has no cut-off, so the lowest is none.
  assert.equal(a.cutoff, 0);

  // Nothing out yet: ongoing, package from the posting.
  const b = sideStats([company([], [role({ ctc: 15, count: null })])], { live: true });
  assert.deepEqual([b.status, b.count, b.maxCtc, b.ctcPosted, b.cutoff], ['ongoing', 0, 15, true, null]);

  // Every role reported zero.
  // Every role reported zero: the posted package was offered to nobody.
  const c = sideStats([company([], [role({ ctc: 15, stipend: 40, count: 0, cgpa: 0 })])], { live: true });
  assert.deepEqual([c.status, c.cutoff, c.maxCtc, c.maxStipend], ['none', 0, null, null]);

  // Archive offers noted without names still count.
  const u = sideStats([company([], [role({ ctc: 9, comments: '2 offers reported without names' })])]);
  assert.deepEqual([u.count, u.status, u.maxCtc], [2, 'hired', null]);

  // Archive: postings never count as pending; offered CTC wins.
  const d = sideStats([company([offer({ ctc: 12 })], [role({ ctc: 40, cgpa: 8 })])]);
  assert.deepEqual([d.status, d.partial, d.maxCtc, d.ctcPosted, d.cutoff], ['hired', false, 12, false, 8]);

  // Two spellings of one employer add up.
  const e = sideStats([company([offer({ ctc: 10 })], []), company([offer({ ctc: 11, branch: 'IT' })], [])]);
  assert.equal(e.count, 2);
  assert.deepEqual(e.branches, { CS: 1, IT: 1 });
});
