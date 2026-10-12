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
  assert.equal(says('Eligible: Btech/BCA/BE'), 'All branches');
  assert.equal(says('Eligible: B.Tech: Multiple; M.Tech: CSE, AFI, DSC, IT, SWE'), 'Not listed');
  assert.equal(says('Eligible: BTech, MBA, MA, BA, BBA, MTech, MSc, M.Des, B.Des (varies by role)'), 'Not listed');
  assert.equal(says('Eligible: MBA, M.Tech'), 'Not open to B.Tech');
  assert.equal(says('Location: Gurugram'), 'Not listed');
  // Prose before the real clause, and English words that look like codes.
  assert.equal(eligibilityClause('Eligible for FTE based on performance. Eligible: B.Tech (COE, IT, SE)'), 'B.Tech (COE, IT, SE)');
  assert.equal(says('Eligible: it will be open to all'), 'All branches');
  assert.equal(says('Location: Gurgaon. Eligible: Btech/BCA/BE + MBA'), 'Not open to B.Tech');
  // Branch codes without "Eligible:" — in the comments, or in the role name.
  assert.equal(says('Gurugram, ENE'), 'EN');
  assert.equal(says('Location: Delhi, IT'), 'Not listed');
  assert.equal(describeEligibility(parseEligibility('', 'Graduate Engineering Trainee - ME, CH')), 'ME, CH');
  assert.equal(describeEligibility(parseEligibility('', 'GET (Electronics / Mechanical / IT)')), 'IT, EC, ME');
  assert.equal(describeEligibility(parseEligibility('', 'Analyst - IT')), 'Not listed');
  assert.equal(describeEligibility(parseEligibility('', 'Field Application Engineer (Core - ECE)')), 'EC');
  assert.equal(describeEligibility(parseEligibility('', 'Core - Mechanical & Related, Electrical & Related, Biotech')), 'EE, ME, BT');
  assert.equal(says('Noida, ECE, EE'), 'EC, EE');
  assert.equal(says('Gurugram, COE, IT, SE, MCE'), 'CO, IT, SE, MC');
  assert.equal(says('Bengaluru, Software'), 'Not listed');
  assert.equal(says('Bangalore, Civil'), 'Not listed');
  assert.equal(says('Location: Noida, MTech (CSE, SWE)'), 'Not listed');
  assert.equal(says('Eligible: BTech (CSE, IT), MTech + MBA'), 'CO, IT');

  assert.deepEqual(eligibilityNotes('Placed Students aren\'t eligible. Eligible: BTech (ECE, EE)'), ['Unplaced only']);
  assert.deepEqual(eligibilityNotes('Strictly for PwDs only. Non-blocking opportunity'), ['PwD only']);
  assert.deepEqual(eligibilityNotes('29 Jul repost strictly for PwD students. Eligible: COE, IT'), []);
  assert.deepEqual(eligibilityNotes('PUNE, FEMALE ONLY'), ['Women only']);
  assert.deepEqual(eligibilityNotes('10th/12th: 70%. Eligible: B.Tech (All)'), ['Other criteria']);
  assert.deepEqual(eligibilityNotes('10&12th: 0%. Eligible: B.tech (ALL)'), []);
  assert.deepEqual(eligibilityNotes('PPO CTC 10-12 LPA'), []);
  assert.deepEqual(eligibilityNotes('CTC 35-45 LPA. Not open for placed students.'), ['Unplaced only']);
  assert.deepEqual(eligibilityNotes('Placed students do not apply.'), ['Unplaced only']);
  assert.deepEqual(eligibilityNotes('Class 10 - 70%, Class 12 - 70%.'), ['Other criteria']);
  assert.deepEqual(eligibilityNotes('10th: 75, 12th: 75'), ['Other criteria']);
  assert.deepEqual(eligibilityNotes('10% variable pay'), []);
  assert.deepEqual(eligibilityNotes('Variable: 10% - 15% of CTC'), []);
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
    // Bands tile the whole scale, and none is small enough to single anyone out.
    assert.equal(t.bands[0].min, null);
    assert.equal(t.bands.at(-1).max, null);
    t.bands.forEach((band, i) => {
      if (i) assert.equal(band.min, t.bands[i - 1].max);
      assert.ok(t.counts[i] >= 5, `${code} band ${i}: ${t.counts[i]} students`);
      const p = peers(m, code, band);
      assert.ok(p.placed <= t.counts[i], `${code} band ${i}: ${p.placed} placed of ${t.counts[i]}`);
    });
  }
  // CS (2K23) finds the CO (2K22) counts.
  assert.deepEqual(bandTotals(season, 'CS').counts, d.branchCgpa.CO.map((x) => x.total));
  const bands = bandTotals(season, 'CO').bands;
  assert.deepEqual(bands[bandIndex(bands, 8.0)], { min: 8, max: 8.5 });
  assert.deepEqual(bands[bandIndex(bands, 7.99)], { min: 7.5, max: 8 });
  assert.deepEqual(bands[bandIndex(bands, 9.9)], { min: 9.5, max: null });
  assert.deepEqual(bands[bandIndex(bands, 3)], { min: null, max: 5 });
});

test('company checks', async () => {
  const d26 = await json('data/2026.json');
  const prev = buildModel({ ...CONFIG.seasons['2026'], branchStrength: d26.branchStrength }, d26.offers.map(finalizeOffer), archiveCompanyRows(d26.companies));
  const d27 = await json('data/2027.json');
  const m = buildModel(CONFIG.seasons['2027'], offersFromRows(d27.tabs.Students), companyRowsFromRows(d27.tabs.Companies));

  const offer = (branch, cgpa, extra = {}) => ({ branch, cgpa, offer: 'FTE', ...extra });
  // A drive that lists CO, IT, SE, MCE with a 7.5 cut-off.
  const listed = { key: 'x', offers: [], roles: [{ offer: 'FTE', cgpa: 7.5, cat: 'Tech', role: 'SDE', comments: 'Eligible: B.Tech (COE, IT, SE, MCE)' }] };
  const status = (c, cgpa, branch, prevC) => checkCompany(c, { cgpa, branch }, prevC).status;
  assert.equal(status(listed, 8, 'CS'), 'eligible');
  assert.equal(status(listed, 7.5, 'IT'), 'eligible');
  assert.equal(status(listed, 7.49, 'IT'), 'below');
  assert.equal(status(listed, 9, 'ME'), 'branch');
  // Branches not listed: likely, unless someone from the branch was selected through a drive.
  const open = { ...listed, roles: [{ ...listed.roles[0], comments: 'Location: Noida' }] };
  assert.equal(status(open, 8, 'ME'), 'likely');
  assert.equal(status({ ...open, offers: [offer('ME', 8.4)] }, 8, 'ME'), 'eligible');
  assert.equal(status({ ...open, offers: [offer('ME', 8.4, { offer: 'PPO' })] }, 8, 'ME'), 'likely');
  // Last season's list is a hint only.
  const lastSeason = { roles: listed.roles, offers: [] };
  assert.equal(status(open, 8, 'ME', lastSeason), 'likely');
  assert.equal(checkCompany(open, { cgpa: 8, branch: 'ME' }, lastSeason).prevSays, 'no');
  assert.equal(checkCompany(open, { cgpa: 8, branch: 'CS' }, lastSeason).prevSays, 'yes');
  // No cut-off on record: confirmed only by a selection at or below this CGPA.
  const noCut = { ...listed, roles: [{ ...listed.roles[0], cgpa: null }] };
  assert.equal(status(noCut, 6, 'IT'), 'likely');
  assert.equal(status({ ...noCut, offers: [offer('ME', 5.9)] }, 6, 'IT'), 'eligible');
  assert.equal(status({ ...noCut, roles: [{ ...noCut.roles[0], cgpa: 0 }] }, 4, 'IT'), 'eligible');
  // A cut-off that differs by branch.
  const split = { ...listed, roles: [{ ...listed.roles[0], cgpa: 7, cgpaByBranch: { EC: 8 }, comments: 'Eligible: CS/IT related and Circuital' }] };
  assert.equal(status(split, 7.5, 'EC'), 'below');
  assert.equal(status(split, 7.5, 'CS'), 'eligible');
  // A listed exclusion, yet someone from the branch was selected.
  assert.equal(status({ ...listed, offers: [offer('ME', 8)] }, 9, 'ME'), 'likely');
  // Conversions of returning interns and off-campus challenges are not drives.
  assert.equal(status({ ...open, roles: [{ ...open.roles[0], offer: 'PPO' }] }, 8, 'CS'), 'conversion');
  assert.equal(status({ ...open, roles: [{ ...open.roles[0], comments: 'Hackathon Convert' }] }, 8, 'CS'), 'conversion');
  assert.equal(status({ ...open, roles: [{ ...open.roles[0], comments: 'via flipkart grid' }] }, 8, 'CS'), 'conversion');
  assert.equal(status({ key: 'y', roles: [], offers: [offer('CO', 8, { offer: 'PPO' })] }, 8, 'CS'), 'conversion');
  assert.equal(status({ key: 'y', roles: [], offers: [offer('CO', 8)] }, 8, 'CS'), 'eligible');
  assert.equal(status({ key: 'y', roles: [], offers: [offer('CO', 8.5)] }, 8, 'CS'), 'likely');
  // Offers for a role filled only off campus are not evidence.
  const grid = { key: 'f', roles: [{ ...open.roles[0], role: 'AI Engineer', comments: 'via flipkart grid' }, { ...open.roles[0], role: 'Assistant Manager', cgpa: 7 }], offers: [offer('ME', 7.5, { role: 'AI Engineer' })] };
  assert.equal(status(grid, 7.6, 'ME'), 'likely');
  assert.equal(status({ ...open, roles: [{ ...open.roles[0], comments: 'Non Blocking, HACKWITHINFY SELECTIONS' }] }, 8, 'CS'), 'conversion');
  // Listed exclusion with a selection from the branch: below every cut-off stays below.
  assert.equal(status({ ...listed, offers: [offer('ME', 8)] }, 7, 'ME'), 'below');
  assert.equal(checkCompany({ ...listed, offers: [offer('ME', 8)] }, { cgpa: 9, branch: 'ME' }).cutoff, null);
  assert.equal(status({ key: 'y', roles: [], offers: [offer('ME', 8)] }, 8, 'CS'), 'unlisted');

  // Real data: every company lands in exactly one bucket, and a 10.0 CS student
  // is never held back by CGPA.
  for (const c of m.companies) {
    const r = checkCompany(c, { cgpa: 10, branch: 'CS' }, prev.companyByKey.get(c.key) || null);
    assert.ok(['eligible', 'likely', 'branch', 'unlisted', 'conversion'].includes(r.status), `${c.name}: ${r.status}`);
  }
  // De Shaw 2026: 7.0 for CS/IT, 8.0 for circuit branches.
  const shaw = prev.companies.find((c) => c.name === 'De Shaw');
  assert.equal(checkCompany(shaw, { cgpa: 7.5, branch: 'EC' }).status, 'below');
  assert.equal(checkCompany(shaw, { cgpa: 7.5, branch: 'CO' }).status, 'eligible');
});

test('published CGPA counts cannot be subtracted down to a small group', async () => {
  const d = await json('data/2026.json');
  // Every span between the batch-wide band edges, worked out as an outsider could:
  // batch count minus each published branch band lying wholly inside the span.
  const cuts = [...new Set(d.cgpaBands.flatMap((b) => [b.min, b.max]).filter((x) => x !== null))].sort((a, b) => a - b);
  const points = [-Infinity, ...cuts, Infinity];
  const lo = (x) => (x === null ? -Infinity : x);
  const hi = (x) => (x === null ? Infinity : x);
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const [a, b] = [points[i], points[j]];
      if (a === -Infinity && b === Infinity) continue;
      const batch = d.cgpaBands.filter((x) => lo(x.min) >= a && hi(x.max) <= b).reduce((s, x) => s + x.total, 0);
      const known = Object.values(d.branchCgpa)
        .flat()
        .filter((x) => lo(x.min) >= a && hi(x.max) <= b)
        .reduce((s, x) => s + x.total, 0);
      const rest = batch - known;
      assert.ok(rest === 0 || rest >= 5, `CGPA ${a}–${b}: ${rest} students left after subtraction`);
    }
  }
});

test('archived postings keep a zero cut-off as "none"', async () => {
  const { archiveCompanyRows } = await import('../assets/js/lib/normalize.js');
  const [row] = archiveCompanyRows([{ company: 'Acme', role: 'SDE', offer: 'FTE', cgpa: 0, comments: 'Eligible: B.Tech (All)', cgpaByBranch: { ec: '8' } }]);
  assert.equal(row.cgpa, 0);
  assert.deepEqual(row.cgpaByBranch, { EC: 8 });
});
