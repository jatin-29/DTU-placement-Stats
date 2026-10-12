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

// Branch codes written without "Eligible:" in front.
// In the comments: comma-separated codes in capitals ("Gurugram, ENE, CE"), but
// not a lone two-letter one ("Delhi, IT" may be the IT function) and not inside
// another programme's brackets ("MTech (CSE, SWE)"). Full words ("Software")
// don't count there, since comments use them for job areas.
function commentCodes(comments) {
  const s = String(comments || '').replace(/\b(M\.?\s*Tech|M\.?\s*Sc|MBA|PhD|M\.?\s*Des)\s*\([^)]*\)/gi, ' ');
  const segs = s.split(/[;,()]/).map((p) => p.trim()).filter((p) => codeWords(p, true));
  const ws = segs.flatMap((p) => codeWords(p, true));
  return ws.length > 1 || (ws.length === 1 && ws[0].length >= 3) ? segs.join(', ') : '';
}
// In a role name: the part after " - " or in brackets ("Graduate Engineering
// Trainee - ME, CH", "GET (Electronics / Mechanical / IT)"). Two branches at
// least, or one code after "Core -" ("Field Application Engineer (Core - ECE)").
function roleCodes(role) {
  const r = String(role || '');
  const core = /\bcore\s*[-–]/i.test(r);
  for (const part of r.replace(/&?\s*\brelated\b/gi, ' ').split(/\s[-–]\s?|[-–]\s|[()]/)) {
    const ws = codeWords(part, false);
    if (ws && (ws.length > 1 || (core && ws[0].length >= 3))) return part.trim();
  }
  return '';
}
// The words of `part` if every one names a branch, else null.
function codeWords(part, abbreviationsOnly) {
  const ws = part.split(/[\s,/&]+/).filter(Boolean);
  const ok = (w) => w.toUpperCase() in BRANCH_WORDS && (w.length <= 3 ? w === w.toUpperCase() : !abbreviationsOnly);
  return ws.length && ws.every(ok) ? ws : null;
}

// -> { kind: 'all' | 'list' | 'none' | 'unknown', branches: [codes], except: [codes], text }
//   all      every B.Tech branch
//   list     only `branches` (with `except` set when written as "All except ...")
//   none     open to other programmes only
//   unknown  nothing listed, or "multiple" / "varies by role"
export function parseEligibility(comments, role = '') {
  const text = eligibilityClause(comments) || commentCodes(comments) || roleCodes(role);
  const out = { kind: 'unknown', branches: [], except: [], text };
  if (!text) return out;
  // "Btech/BCA/BE + MBA": a degree plus an MBA, so not open to B.Tech students
  // (but "BTech (CSE, IT), MTech + MBA" still lists B.Tech branches).
  const beforeMba = text.split(/\+\s*MBA\b/i)[0];
  if (beforeMba !== text && !words(beforeMba).some((w) => w in BRANCH_WORDS || ALL_WORDS.has(w))) return { ...out, kind: 'none' };

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
  if (/placed students\s+(aren'?t|are not|not|do not|don'?t|ineligible|cannot|can'?t|strictly refrain)|\bnot\s+open\s+(to|for)\s+(already\s+)?placed\b|\bunplaced\b/i.test(s)) notes.push('Unplaced only');
  // Backlog rules, school-marks cut-offs (a non-zero %), age limits.
  if (
    /backlog|\bborn on\b/i.test(s) ||
    /\b(10|12)th\b[^.;]*?\b[1-9]\d\s*%|\bclass\s*(10|12)(th)?\b[^.;]*?\b[1-9]\d\s*%|\b(10|12)th\s*[:\-–]\s*[1-9]\d\b|\b(10|12)%\s*:\s*[1-9]\d\b/i.test(s) ||
    /\b[1-9]\d\s*%\s*((or|&|and)\s*above|throughout|in\s*(10|12)th\b)/i.test(s)
  ) notes.push('Other criteria');
  return notes;
}

export function describeEligibility(e) {
  if (e.kind === 'all') return 'All branches';
  if (e.kind === 'none') return 'Not open to B.Tech';
  if (e.kind === 'list') return e.except.length ? `All except ${e.except.join(', ')}` : e.branches.join(', ');
  return 'Not listed';
}

const EPS = 1e-9;

// Pre-placement offers to returning interns, and hires through off-campus
// challenges ("via HackWithInfy", "Hackathon Convert"), are not campus drives.
const NOT_A_DRIVE = /\b(intern|hackathon)\s+convert|^\s*via\s+|hackwithinfy/i;
export const isConversion = (role) => role.offer === 'PPO' || NOT_A_DRIVE.test(role.comments || '');

// Which of a company's offers came that way: PPOs, and offers for a role that
// the company filled only through a conversion or an off-campus route.
export function conversionOffers(company) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const offRoute = new Set(company.roles.filter(isConversion).map((r) => norm(r.role)));
  const onRoute = new Set(company.roles.filter((r) => !isConversion(r)).map((r) => norm(r.role)));
  return (o) => o.offer === 'PPO' || (offRoute.has(norm(o.role)) && !onRoute.has(norm(o.role)));
}

// What a company's postings (and selections) said about a branch, for hints
// from the previous season: 'yes', 'no' or null, plus the list as text.
export function companyBranchListing(company, branch) {
  const b = unifyBranch(branch);
  const parsed = company.roles.filter((r) => !isConversion(r)).map((r) => parseEligibility(r.comments, r.role));
  const listed = parsed.filter((e) => e.kind === 'all' || e.kind === 'list');
  const text = !listed.length ? null : listed.some((e) => e.kind === 'all') ? 'All branches' : [...new Set(listed.flatMap((e) => e.branches))].join(', ');
  const isConv = conversionOffers(company);
  const selected = company.offers.some((o) => !isConv(o) && unifyBranch(o.branch) === b);
  const listedYes = listed.some((e) => e.kind === 'all' || e.branches.includes(b));
  if (selected || listedYes) return { says: 'yes', text, listedYes };
  // "no" only when every drive listed its branches.
  if (listed.length && listed.length === parsed.length) return { says: 'no', text, listedYes };
  return { says: null, text, listedYes };
}

// Status of one company for a student.
//   eligible    the cut-off is met (listed, or someone was selected at or below this CGPA)
//               and the branch is open (listed, or someone from it was selected)
//   likely      nothing rules it out, but the branch or the cut-off is not confirmed
//   below       CGPA under the cut-off of every role the branch could take
//   branch      every drive listed its branches and this one is not among them
//   unlisted    no postings on record and no one from the branch selected
//   conversion  only intern conversions or off-campus hires
// prevCompany: the same company in the previous season, if any (hints only).
export function checkCompany(company, { cgpa, branch }, prevCompany = null) {
  const b = unifyBranch(branch);
  const isConv = conversionOffers(company);
  const drives = company.offers.filter((o) => !isConv(o));
  const fromBranch = drives.filter((o) => unifyBranch(o.branch) === b).length;
  const selectedAt = drives.map((o) => o.cgpa).filter((x) => x !== null);
  const lowestSelected = selectedAt.length ? Math.min(...selectedAt) : null;
  const cgpaShown = lowestSelected !== null && cgpa + EPS >= lowestSelected;
  const prev = prevCompany ? companyBranchListing(prevCompany, b) : null;

  const result = {
    company, status: 'unlisted', roles: [], cutoff: null, fromBranch, lowestSelected, cutoffSource: null,
    branchSource: null, listing: null, notes: [], prevSays: prev?.says || null, prevListing: prev?.text || null,
    prevListedYes: !!prev?.listedYes,
  };
  const roles = company.roles.filter((r) => !isConversion(r));
  if (!roles.length) {
    if (company.roles.length || (company.offers.length && !drives.length)) result.status = 'conversion';
    // No postings on record: selections stand in for both criteria.
    else if (fromBranch > 0) {
      Object.assign(result, { status: cgpaShown ? 'eligible' : 'likely', branchSource: 'selected', cutoffSource: cgpaShown ? 'selected' : 'none-on-record' });
    }
    return result;
  }

  const evaluated = roles.map((r) => {
    const e = parseEligibility(r.comments, r.role);
    const own = r.cgpaByBranch ? Object.entries(r.cgpaByBranch).find(([k]) => unifyBranch(k) === b)?.[1] : undefined;
    const cut = own ?? (r.cgpa === undefined ? null : r.cgpa); // null: not on record; 0: none
    let cg = 'unknown';
    if (cut !== null) cg = cut <= 0 || cgpa + EPS >= cut ? 'ok' : 'below';
    else if (cgpaShown) cg = 'ok';
    let br = 'unknown';
    let source = null;
    if (e.kind === 'all' || e.kind === 'list') {
      br = e.kind === 'all' || e.branches.includes(b) ? 'yes' : 'no';
      source = 'listed';
    } else if (e.kind === 'none') {
      br = 'no';
      source = 'listed';
    } else if (fromBranch > 0) {
      br = 'yes';
      source = 'selected';
    }
    return { role: r, e, cut, cg, br, source, notes: eligibilityNotes(r.comments) };
  });

  const pick = (status, list) => {
    result.status = status;
    result.roles = list.map((x) => x.role);
    const cuts = list.map((x) => x.cut);
    const known = cuts.filter((c) => c !== null && c > 0);
    result.cutoff = status !== 'below' && cuts.includes(0) ? 0 : known.length ? Math.min(...known) : null;
    if (result.cutoff === null) result.cutoffSource = list.some((x) => x.cg === 'ok') ? 'selected' : 'none-on-record';
    result.branchSource = list.find((x) => x.source)?.source || null;
    result.listing = list.find((x) => x.e.kind !== 'unknown')?.e || null;
    result.notes = [...new Set(list.flatMap((x) => x.notes))];
  };
  const eligible = evaluated.filter((x) => x.cg === 'ok' && x.br === 'yes');
  const likely = evaluated.filter((x) => x.cg !== 'below' && x.br !== 'no');
  const below = evaluated.filter((x) => x.cg === 'below' && x.br !== 'no');
  if (eligible.length) pick('eligible', eligible);
  else if (likely.length) pick('likely', likely);
  else if (below.length) pick('below', below);
  else if (fromBranch > 0) {
    // Every listed drive leaves the branch out, yet someone from it was selected:
    // the list was incomplete, or another drive ran whose cut-off isn't known.
    const reach = evaluated.filter((x) => x.cg !== 'below');
    if (reach.length) {
      pick('likely', reach);
      result.cutoff = null;
      result.cutoffSource = cgpaShown ? 'selected' : 'none-on-record';
    } else pick('below', evaluated);
    result.branchSource = 'selected-despite-list';
  } else pick('branch', evaluated);
  return result;
}

// Which band a CGPA falls in.
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

// Batch size of a branch in each CGPA band (archived seasons only). Bands are
// half a point wide, merged where needed so that each holds at least 5 students.
export function bandTotals(season, branch) {
  const bc = season.branchCgpa;
  if (!bc) return null;
  const b = unifyBranch(branch);
  const code = Object.keys(bc).find((k) => unifyBranch(k) === b);
  if (!code) return null;
  return { bands: bc[code].map(({ min, max }) => ({ min, max })), counts: bc[code].map((x) => x.total) };
}
