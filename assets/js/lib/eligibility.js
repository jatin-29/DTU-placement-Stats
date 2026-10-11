// "Where could I get in?" — which drives a student could sit for, from each
// posting's CGPA cut-off and the branches it lists, plus who was selected.
// Pure functions, so they can be tested against the bundled data.

// CO (2K22) and CS (2K23) are the same programme; compare branches through this.
export const unifyBranch = (code) => (code === 'CS' ? 'CO' : code);

export const BTECH_BRANCHES = ['CO', 'IT', 'SE', 'MC', 'EC', 'EE', 'EP', 'ME', 'AE', 'PE', 'EN', 'CE', 'CH', 'BT'];
const CIRCUITAL = ['CO', 'IT', 'SE', 'MC', 'EC', 'EE', 'EP'];

// Spellings of B.Tech branches seen in eligibility notes, mapped to roll-number codes.
const BRANCH_WORDS = {
  CO: 'CO', COE: 'CO', CS: 'CO', CSE: 'CO', COMPUTER: 'CO',
  IT: 'IT', ITY: 'IT',
  SE: 'SE', SWE: 'SE', SOFTWARE: 'SE',
  MC: 'MC', MCE: 'MC', MAC: 'MC', MNC: 'MC',
  EC: 'EC', ECE: 'EC', ELECTRONICS: 'EC',
  EE: 'EE', EEE: 'EE', ELECTRICAL: 'EE',
  EP: 'EP', PHYSICS: 'EP',
  ME: 'ME', MECH: 'ME', MECHANICAL: 'ME',
  AE: 'AE', MAM: 'AE', AUTOMOTIVE: 'AE',
  PE: 'PE', PIE: 'PE', PRODUCTION: 'PE',
  EN: 'EN', ENE: 'EN', ENVIRONMENTAL: 'EN',
  CE: 'CE', CIVIL: 'CE',
  CH: 'CH', CHE: 'CH', CHEMICAL: 'CH',
  BT: 'BT', BIOTECH: 'BT', BIOTECHNOLOGY: 'BT',
};
const BTECH_WORDS = new Set(['BTECH', 'BE', 'UG']);
const OTHER_PROGRAMMES = new Set(['MTECH', 'MSC', 'MBA', 'BBA', 'MA', 'BA', 'MDES', 'BDES', 'BCA', 'PHD', 'MS', 'PG', 'BAE', 'MAE', 'MASTERS']);
const ALL_WORDS = new Set(['ALL', 'ANY']);
const VAGUE_WORDS = new Set(['MULTIPLE', 'VARIOUS', 'VARIES', 'VARY']);

// Words that carry no branch information; anything else is reported by
// eligibilityWords() so new spellings get noticed in tests.
export const FILLER_WORDS = new Set([
  'BRANCHES', 'BRANCH', 'OPEN', 'FOR', 'AND', 'OR', 'EXCEPT', 'BY', 'ROLE', 'RELATED', 'PROGRAMS', 'PROGRAMMES',
  'GRADUATE', 'ONLY', 'THE', 'ECO', 'HONS', 'DA', 'DS', 'AI', 'AFI', 'DSC', 'ISY', 'MATHEMATICS', 'DES', 'CIRCUITAL',
]);

// The eligibility clause of a posting's comments ("... Eligible: BTech (CoE, IT)").
export function eligibilityClause(comments) {
  const s = String(comments || '');
  // Prefer "Eligible:" over prose such as "Eligible for FTE based on performance".
  const m = s.match(/eligib[a-z]*(?:\s+branch(?:es)?)?\s*[:\-–]\s*/i) || s.match(/eligib[a-z]*(?:\s+branch(?:es)?)?\s*/i);
  if (!m) return '';
  // Stop at the end of the sentence ("B.tech (All). 56 LPA quoted ...").
  return s.slice(m.index + m[0].length).split(/\.\s+(?=[A-Z0-9])/)[0].trim();
}

function words(clause) {
  return (
    clause
      .replace(/\bM\s*&\s*C\b/gi, ' MC ')
      // "B.Tech", "B. Tech", "M.Sc.", "M.Des", "B.E." -> one word each.
      .replace(/\b([BM])\s*\.?\s*(tech|sc|des)\b\.?/gi, (_, a, b) => ` ${a}${b} `)
      .replace(/\bB\.\s*E\b\.?/g, ' BE ')
      .split(/[^A-Za-z]+/)
      .filter(Boolean)
      // Short branch codes count only in capitals, so English words ("it", "me") don't.
      .filter((w) => !(w.toUpperCase() in BRANCH_WORDS && w.length <= 3 && w === w.toLowerCase()))
      .map((w) => w.toUpperCase())
  );
}

// Words the parser did not recognise (for tests).
export function eligibilityWords(clause) {
  return words(clause).filter(
    (w) => !(w in BRANCH_WORDS) && !BTECH_WORDS.has(w) && !OTHER_PROGRAMMES.has(w) && !ALL_WORDS.has(w) && !VAGUE_WORDS.has(w) && !FILLER_WORDS.has(w),
  );
}

// -> { kind: 'all' | 'list' | 'none' | 'unknown', branches: [codes], except: [codes], text }
//   all      every B.Tech branch
//   list     only `branches` (with `except` set when written as "All except ...")
//   none     open to other programmes only
//   unknown  nothing listed, or "multiple" / "varies by role"
export function parseEligibility(comments) {
  const text = eligibilityClause(comments);
  const out = { kind: 'unknown', branches: [], except: [], text };
  if (!text) return out;

  let programme = null; // null until a programme is named; 'B' for B.Tech, 'O' for others
  let all = false;
  let vague = false;
  let excepting = false;
  let sawBTech = false;
  let sawOther = false;
  const listed = new Set();
  const excluded = new Set();
  for (const w of words(text)) {
    if (BTECH_WORDS.has(w)) {
      programme = 'B';
      sawBTech = true;
      excepting = false;
    } else if (OTHER_PROGRAMMES.has(w)) {
      programme = 'O';
      sawOther = true;
    } else if (VAGUE_WORDS.has(w)) {
      vague = true;
    } else if (programme === 'O') {
      continue;
    } else if (ALL_WORDS.has(w)) {
      all = true;
    } else if (w === 'EXCEPT') {
      excepting = true;
    } else if (w === 'CIRCUITAL') {
      for (const b of CIRCUITAL) (excepting ? excluded : listed).add(b);
    } else if (w in BRANCH_WORDS) {
      (excepting ? excluded : listed).add(BRANCH_WORDS[w]);
    }
  }

  if (all) {
    if (!excluded.size) return { ...out, kind: 'all' };
    return { ...out, kind: 'list', branches: BTECH_BRANCHES.filter((b) => !excluded.has(b)), except: [...excluded] };
  }
  if (listed.size) return { ...out, kind: 'list', branches: BTECH_BRANCHES.filter((b) => listed.has(b)) };
  if (vague) return out;
  if (sawBTech) return { ...out, kind: 'all' };
  if (sawOther) return { ...out, kind: 'none' };
  return out;
}

// Restrictions beyond CGPA and branch, worth a tag.
export function eligibilityNotes(comments) {
  const s = String(comments || '');
  const notes = [];
  if (/\b(female|women|girls?)\s+only\b|\bonly\s+(for\s+)?(female|women|girls)\b|\bfor\s+women\b/i.test(s)) notes.push('Women only');
  if (/\bpwds?\s+only\b|\bonly\s+for\s+pwds?\b/i.test(s)) notes.push('PwD only');
  if (/placed students\s+(aren'?t|are not|not|ineligible|cannot|can'?t|strictly refrain)|\bunplaced\b/i.test(s)) notes.push('Unplaced only');
  // Backlog rules, school-marks cut-offs (a non-zero %), age limits.
  if (/backlog|\b(10|12)th\b[^.;]*?\b[1-9]\d\s*%|\b[1-9]\d\s*%\s*(or|&|and)\s*above|\b[1-9]\d\s*%\s*throughout|\b[1-9]\d\s*%\s*in\s*(10|12)th\b|\bborn on\b/i.test(s)) notes.push('Other criteria');
  return notes;
}

export function describeEligibility(e) {
  if (e.kind === 'all') return 'All branches';
  if (e.kind === 'none') return 'Not open to B.Tech';
  if (e.kind === 'list') return e.except.length ? `All except ${e.except.join(', ')}` : e.branches.join(', ');
  return 'Not listed';
}

const EPS = 1e-9;

// Pre-placement offers to returning interns are conversions, not drives.
export const isConversion = (role) => role.offer === 'PPO';

// Union of what a company's postings say about branches (for last-season hints).
export function companyBranchListing(company) {
  const parsed = company.roles.filter((r) => !isConversion(r)).map((r) => parseEligibility(r.comments));
  if (parsed.some((e) => e.kind === 'all')) return { kind: 'all', branches: [...BTECH_BRANCHES] };
  const listed = parsed.filter((e) => e.kind === 'list');
  if (listed.length) return { kind: 'list', branches: [...new Set(listed.flatMap((e) => e.branches))] };
  return { kind: 'unknown', branches: [] };
}

// Status of one company for a student.
//   eligible  meets the listed cut-off, and the branch is listed (or someone from it was selected)
//   likely    meets the cut-off; branches not listed (last season's listing may hint)
//   below     CGPA under the cut-off of every role open to the branch
//   branch    branch not eligible for any role
//   unlisted  no postings on record (offers only)
// prevCompany: the same company in the previous season, if any.
export function checkCompany(company, { cgpa, branch }, prevCompany = null) {
  const b = unifyBranch(branch);
  const fromBranch = Object.entries(company.branches).reduce((a, [code, n]) => a + (unifyBranch(code) === b ? n : 0), 0);
  const prev = prevCompany ? companyBranchListing(prevCompany) : null;
  const prevSays = !prev || prev.kind === 'unknown' ? null : prev.kind === 'all' || prev.branches.includes(b) ? 'yes' : 'no';

  const roles = company.roles.filter((r) => !isConversion(r));
  const result = { company, status: 'unlisted', roles: [], cutoff: null, fromBranch, branchSource: null, listing: null, notes: [] };
  if (!roles.length) {
    if (company.roles.length) result.status = 'conversion';
    return result;
  }

  const evaluated = roles.map((r) => {
    const e = parseEligibility(r.comments);
    const cut = r.cgpa !== null && r.cgpa > 0 ? r.cgpa : null;
    const cgpaOk = cut === null || cgpa + EPS >= cut;
    let branchOk = null; // true / false / null (unknown)
    let source = null;
    if (e.kind === 'all' || e.kind === 'list') {
      branchOk = e.kind === 'all' || e.branches.includes(b);
      source = 'listed';
    } else if (e.kind === 'none') {
      branchOk = false;
      source = 'listed';
    } else if (fromBranch > 0) {
      branchOk = true;
      source = 'selected';
    } else if (prevSays) {
      branchOk = prevSays === 'yes';
      source = 'last-season';
    }
    return { role: r, e, cut, cgpaOk, branchOk, source, notes: eligibilityNotes(r.comments) };
  });

  const open = evaluated.filter((x) => x.branchOk !== false);
  const eligible = evaluated.filter((x) => x.cgpaOk && x.branchOk === true && x.source !== 'last-season');
  const likely = evaluated.filter((x) => x.cgpaOk && (x.branchOk === null || (x.branchOk === true && x.source === 'last-season')));

  let picked;
  if (eligible.length) {
    result.status = 'eligible';
    picked = eligible;
  } else if (likely.length) {
    result.status = 'likely';
    picked = likely;
  } else if (open.length) {
    result.status = 'below';
    picked = open;
  } else {
    result.status = 'branch';
    picked = evaluated;
  }
  result.roles = picked.map((x) => x.role);
  const cuts = picked.map((x) => x.cut).filter((x) => x !== null);
  result.cutoff = picked.some((x) => x.cut === null) ? null : cuts.length ? Math.min(...cuts) : null;
  result.branchSource = picked.find((x) => x.source)?.source || null;
  result.listing = picked.find((x) => x.e.kind !== 'unknown')?.e || null;
  result.notes = [...new Set(picked.flatMap((x) => x.notes))];
  if (result.status === 'below') result.cutoff = Math.min(...picked.map((x) => x.cut).filter((x) => x !== null));
  if (prevSays) result.prevListing = prev.kind === 'all' ? 'All branches' : prev.branches.join(', ');
  if (result.status === 'branch' && prevSays === 'no' && !picked.some((x) => x.source === 'listed')) result.branchSource = 'last-season';
  return result;
}

// Which half-point band a CGPA falls in.
export function bandIndex(bands, cgpa) {
  return bands.findIndex((band) => (band.min === null || cgpa + EPS >= band.min) && (band.max === null || cgpa < band.max - EPS));
}

// Placed students of a branch in a CGPA band, with where they got offers.
export function peers(model, branch, band) {
  const b = unifyBranch(branch);
  const inBand = (g) => g !== null && (band.min === null || g + EPS >= band.min) && (band.max === null || g < band.max - EPS);
  const students = [...model.students.values()].filter((s) => unifyBranch(s.branch) === b && inBand(s.cgpa));
  const offers = students.flatMap((s) => s.offers);
  const byCompany = new Map();
  for (const o of offers) byCompany.set(o.companyKey, (byCompany.get(o.companyKey) || 0) + 1);
  const companies = [...byCompany]
    .map(([key, n]) => ({ company: model.companyByKey.get(key), n }))
    .sort((x, y) => y.n - x.n || (y.company.maxCtc || 0) - (x.company.maxCtc || 0));
  const ctcs = offers.map((o) => o.ctc).filter((x) => x !== null).sort((x, y) => x - y);
  const median = ctcs.length ? (ctcs.length % 2 ? ctcs[ctcs.length >> 1] : (ctcs[ctcs.length / 2 - 1] + ctcs[ctcs.length / 2]) / 2) : null;
  return { placed: students.length, offers: offers.length, companies, medianCtc: median };
}

// Batch size of a branch in each band (archived seasons only).
export function bandTotals(season, branch) {
  const bc = season.branchCgpa;
  if (!bc) return null;
  const b = unifyBranch(branch);
  const code = Object.keys(bc.counts).find((k) => unifyBranch(k) === b);
  return code ? { bands: bc.bands, counts: bc.counts[code] } : null;
}
