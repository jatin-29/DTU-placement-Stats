// Eligibility parsing and the "students like you" counts, against the bundled data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../assets/js/config.js';
import { buildModel } from '../assets/js/lib/stats.js';
import { archiveCompanyRows, companyRowsFromRows, finalizeOffer, offersFromRows } from '../assets/js/lib/normalize.js';
import {
  bandIndex, bandTotals, checkCompany, describeEligibility, eligibilityClause, eligibilityNotes, eligibilityWords, parseEligibility, peers,
} from '../assets/js/lib/eligibility.js';

const json = async (p) => JSON.parse(await readFile(new URL(`../${p}`, import.meta.url), 'utf8'));
const says = (comments) => describeEligibility(parseEligibility(comments));

test('eligibility notes', () => {
  assert.equal(says('Eligible: B.Tech – CO, IT, SE, MCE; M.Tech - CSE, SWE, DSC, AFI, ITY'), 'CO, IT, SE, MC');
  assert.equal(says('Eligible: B.E./B.Tech – CS / IT / MC / SE / ECE / EE'), 'CO, IT, SE, MC, EC, EE');
  assert.equal(says('Eligible: B.Tech (CSE, SWE, IT, M&C); M.Tech (CSE, AFI, DSC, IT, SWE)'), 'CO, IT, SE, MC');
  assert.equal(says('Eligible: BTech (All) (Except BT & CHE)'), 'All except BT, CH');
  assert.equal(says('Eligible: All except CH, PIE, ENE'), 'All except CH, PE, EN');
  assert.equal(says('Eligible: All except Masters'), 'All branches');
  assert.equal(says('Eligible: CS/IT related and Circuital'), 'CO, IT, SE, MC, EC, EE, EP');
  assert.equal(says('Eligible: Btech (Electronics / Mechanical / IT)'), 'IT, EC, ME');
  assert.equal(says('Eligible: COE, IT, SE, MCE, ECE, EE, EP, Civil, Mechanical, Chemical'), 'CO, IT, SE, MC, EC, EE, EP, ME, CE, CH');
  assert.equal(says('PPO (Performance Based). Eligible: Open for all'), 'All branches');
  assert.equal(says('Eligible: B.tech (All). 56 LPA quoted for the drive is the SDE package'), 'All branches');
  assert.equal(says('Eligible: Btech/BCA/BE + MBA'), 'All branches');
  assert.equal(says('Eligible: B.Tech: Multiple; M.Tech: CSE, AFI, DSC, IT, SWE'), 'Not listed');
  assert.equal(says('Eligible: BTech, MBA, MA, BA, BBA, MTech, MSc, M.Des, B.Des (varies by role)'), 'Not listed');
  assert.equal(says('Eligible: MBA, M.Tech'), 'Not open to B.Tech');
  assert.equal(says('Location: Gurugram'), 'Not listed');
  // Prose before the real clause, and English words that look like codes.
  assert.equal(eligibilityClause('Eligible for FTE based on performance. Eligible: B.Tech (COE, IT, SE)'), 'B.Tech (COE, IT, SE)');
  assert.equal(says('Eligible: it will be open to all'), 'All branches');

  assert.deepEqual(eligibilityNotes('Placed Students aren\'t eligible. Eligible: BTech (ECE, EE)'), ['Unplaced only']);
  assert.deepEqual(eligibilityNotes('Strictly for PwDs only. Non-blocking opportunity'), ['PwD only']);
  assert.deepEqual(eligibilityNotes('29 Jul repost strictly for PwD students. Eligible: COE, IT'), []);
  assert.deepEqual(eligibilityNotes('PUNE, FEMALE ONLY'), ['Women only']);
  assert.deepEqual(eligibilityNotes('10th/12th: 70%. Eligible: B.Tech (All)'), ['Other criteria']);
  assert.deepEqual(eligibilityNotes('10&12th: 0%. Eligible: B.tech (ALL)'), []);
  assert.deepEqual(eligibilityNotes('PPO CTC 10-12 LPA'), []);
});

test('every listed eligibility note uses known words', async () => {
  const d26 = await json('data/2026.json');
  const d27 = await json('data/2027.json');
  const notes = [...d26.companies.map((p) => p.comments), ...d27.tabs.Companies.map((r) => r.Comments)];
  const unknown = new Set(notes.flatMap((c) => eligibilityWords(eligibilityClause(c))));
  assert.deepEqual([...unknown], []);
});

test('students like you: band counts match the batch', async () => {
  const d = await json('data/2026.json');
  const season = { ...CONFIG.seasons['2026'], branchStrength: d.branchStrength, cgpaBands: d.cgpaBands, branchCgpa: d.branchCgpa };
  const m = buildModel(season, d.offers.map(finalizeOffer), archiveCompanyRows(d.companies));
  for (const [code, strength] of Object.entries(d.branchStrength)) {
    const t = bandTotals(season, code);
    const sum = t.counts.reduce((a, b) => a + b, 0);
    assert.ok(sum <= strength && sum >= strength - 2, `${code}: ${sum} of ${strength}`);
    t.bands.forEach((band, i) => {
      const p = peers(m, code, band);
      assert.ok(p.placed <= t.counts[i], `${code} ${band.label}: ${p.placed} placed of ${t.counts[i]}`);
    });
  }
  // CS (2K23) finds the CO (2K22) counts.
  assert.deepEqual(bandTotals(season, 'CS').counts, d.branchCgpa.counts.CO);
  const bands = d.branchCgpa.bands;
  assert.equal(bands[bandIndex(bands, 8.0)].label, '8.0 - 8.5');
  assert.equal(bands[bandIndex(bands, 7.99)].label, '7.5 - 8.0');
  assert.equal(bands[bandIndex(bands, 9.9)].label, '>= 9.5');
  assert.equal(bands[bandIndex(bands, 3)].label, '< 5.0');
});

test('company checks', async () => {
  const d26 = await json('data/2026.json');
  const prev = buildModel({ ...CONFIG.seasons['2026'], branchStrength: d26.branchStrength }, d26.offers.map(finalizeOffer), archiveCompanyRows(d26.companies));
  const d27 = await json('data/2027.json');
  const m = buildModel(CONFIG.seasons['2027'], offersFromRows(d27.tabs.Students), companyRowsFromRows(d27.tabs.Companies));

  // A drive that lists CO, IT, SE, MCE with a 7.5 cut-off.
  const listed = { key: 'x', branches: {}, offers: [], roles: [{ offer: 'FTE', cgpa: 7.5, cat: 'Tech', role: 'SDE', comments: 'Eligible: B.Tech (COE, IT, SE, MCE)' }] };
  assert.equal(checkCompany(listed, { cgpa: 8, branch: 'CS' }).status, 'eligible');
  assert.equal(checkCompany(listed, { cgpa: 7.5, branch: 'IT' }).status, 'eligible');
  assert.equal(checkCompany(listed, { cgpa: 7.49, branch: 'IT' }).status, 'below');
  assert.equal(checkCompany(listed, { cgpa: 9, branch: 'ME' }).status, 'branch');
  // Branches not listed: likely, unless someone from the branch was selected.
  const open = { ...listed, roles: [{ ...listed.roles[0], comments: 'Location: Noida' }] };
  assert.equal(checkCompany(open, { cgpa: 8, branch: 'ME' }).status, 'likely');
  assert.equal(checkCompany({ ...open, branches: { ME: 2 } }, { cgpa: 8, branch: 'ME' }).status, 'eligible');
  // Last season's list fills the gap.
  const lastSeason = { roles: listed.roles };
  assert.equal(checkCompany(open, { cgpa: 8, branch: 'ME' }, lastSeason).status, 'branch');
  assert.equal(checkCompany(open, { cgpa: 8, branch: 'CS' }, lastSeason).status, 'likely');
  // Conversions of returning interns are not drives.
  assert.equal(checkCompany({ ...open, roles: [{ ...open.roles[0], offer: 'PPO' }] }, { cgpa: 8, branch: 'CS' }).status, 'conversion');

  // Real data: every company lands in exactly one bucket, and a 10.0 CS student
  // is never held back by CGPA.
  for (const c of m.companies) {
    const r = checkCompany(c, { cgpa: 10, branch: 'CS' }, prev.companyByKey.get(c.key) || null);
    assert.ok(['eligible', 'likely', 'branch', 'unlisted', 'conversion'].includes(r.status), `${c.name}: ${r.status}`);
  }
});
