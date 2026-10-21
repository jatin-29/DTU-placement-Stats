// Finds the same employer in two seasons. Company names are typed by hand,
// so one recruiter can appear as "ICICI Bank Ltd" one year and "ICICI Bank"
// the next, or under a new brand ("Zomato" -> "Eternal").

import { companyKey } from './normalize.js';

// Different spellings of one employer that the rules below can't link.
// Each group was checked against both seasons' roles and packages.
const SAME_EMPLOYER = [
  ['BCN (Bain)', 'Bain'],
  ['Prism (OYO)', 'OYO'], // OYO's parent renamed itself PRISM in 2025
  ['Eternal', 'Zomato'], // renamed in 2025
  ['GirnarSoft (Cardekho Group)', 'Car Dekho'],
  ['Ethos', 'Ethos Life'],
  ['Futures First', 'Future First'],
  ['Omnipresent Robot Tech', 'OmniPresent'],
  ['NXP', 'NXP Semiconductor'],
  ['Blue Matter', 'Blue Matter consulting'],
  ['Barco', 'Barco Electronics'],
  ['Trusave Fintech (Bachatt)', 'Trusave (Bachatt)'],
  ['SquadStack.ai', 'Squad Stack'],
  ['Alvarez & Marsal', 'Alvarez & Marshal'],
  ['WWT', 'World Wide Technology'],
  ['Patronus Tradetech', 'Patronus'],
  ['Signify', 'Signify Innovations(formerly Philips Lighting)'],
  ['Trilogy', 'Trilogy Innovations'],
  ['Thorogood Associates', 'Thorogood'],
  ['SITG France', 'SITG'],
  ['Fractal.AI', 'Fractal Analysis'],
  ['Siemens Energy India Limited (SEIL)', 'SEIL (Siemens Energy India Limited)'],
  ['EXL Analytics', 'EXL Service'],
  ['Everest', 'Everest Group'],
];

// Names that collide but belong to different employers (or hires that were
// not a campus visit).
const DIFFERENT_EMPLOYERS = [['Myntra', 'Myntra (off-campus)']];

const groupOf = new Map();
for (const names of SAME_EMPLOYER) {
  const keys = names.map(companyKey);
  for (const k of keys) groupOf.set(k, keys);
}
const apart = new Set(DIFFERENT_EMPLOYERS.map(([a, b]) => `${companyKey(a)}|${companyKey(b)}`));
const isApart = (a, b) => apart.has(`${a}|${b}`) || apart.has(`${b}|${a}`);

// Legal-form words at the end of a name carry no identity.
const LEGAL = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'incorporated', 'corp', 'corporation', 'plc', 'co', 'company', 'india', 'technologies', 'technology']);

// "Fluor Daniel India Pvt Ltd" -> "fluordaniel", "Schlumberger(SLB)" -> "schlumberger".
export function looseKey(name) {
  const words = String(name)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  // "KKR & Co, Inc" -> "kkr": an "and" left dangling goes too.
  while (words.length > 1 && (LEGAL.has(words[words.length - 1]) || words[words.length - 1] === 'and')) words.pop();
  return words.join('');
}

// Every spelling a company was entered under.
function spellings(c) {
  return new Set([c.name, ...c.offers.map((o) => o.company), ...c.roles.map((r) => r.drive || r.company)].filter(Boolean));
}

const indexes = new WeakMap();
function indexFor(model) {
  let idx = indexes.get(model);
  if (!idx) {
    idx = new Map();
    for (const c of model.companies) {
      for (const s of spellings(c)) {
        const k = looseKey(s);
        if (!k) continue;
        if (!idx.has(k)) idx.set(k, new Set());
        idx.get(k).add(c);
      }
    }
    indexes.set(model, idx);
  }
  return idx;
}

// All companies in `model` that are the same employer as `company`.
export function sameEmployer(model, company) {
  const found = new Set();
  const exact = model.companyByKey.get(company.key);
  if (exact) found.add(exact);
  for (const k of groupOf.get(company.key) || []) {
    const c = model.companyByKey.get(k);
    if (c) found.add(c);
  }
  const idx = indexFor(model);
  for (const s of spellings(company)) {
    for (const c of idx.get(looseKey(s)) || []) found.add(c);
  }
  return [...found].filter((c) => !isApart(c.key, company.key));
}

// The single best match, for hints: the one with the most offers.
export function previousCompany(model, company) {
  if (!model) return null;
  const all = sameEmployer(model, company);
  return all.sort((a, b) => b.count - a.count || b.roles.length - a.roles.length)[0] || null;
}

// Joins two seasons into employer groups. A group can hold several companies
// per season when the sheets split one employer across spellings or drives.
// Returns { both, onlyNow, onlyBefore }; each entry is { now: [], before: [] }.
export function joinSeasons(now, before) {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => parent.set(find(a), find(b));
  const id = (season, c) => `${season}:${c.key}`;
  for (const c of now.companies) parent.set(id('n', c), id('n', c));
  for (const c of before.companies) parent.set(id('b', c), id('b', c));
  for (const c of now.companies) for (const p of sameEmployer(before, c)) union(id('n', c), id('b', p));

  const groups = new Map();
  const add = (season, c) => {
    const root = find(id(season, c));
    if (!groups.has(root)) groups.set(root, { now: [], before: [] });
    groups.get(root)[season === 'n' ? 'now' : 'before'].push(c);
  };
  for (const c of now.companies) add('n', c);
  for (const c of before.companies) add('b', c);

  const both = [];
  const onlyNow = [];
  const onlyBefore = [];
  for (const g of groups.values()) {
    if (g.now.length && g.before.length) both.push(g);
    else if (g.now.length) onlyNow.push(g);
    else onlyBefore.push(g);
  }
  return { both, onlyNow, onlyBefore };
}

const maxOf = (arr) => (arr.length ? Math.max(...arr) : null);

// What was actually offered, raised to the posted figure of a role whose
// results are still due (`posted`). Postings nobody was selected from don't count.
function highest(offers, roles, field, live) {
  const pick = (list) => maxOf(list.map((x) => x[field]).filter((x) => x !== null));
  let value = pick(offers);
  let posted = false;
  const pending = live ? pick(roles.filter((r) => r.count === null)) : null;
  if (pending !== null && (value === null || pending > value)) [value, posted] = [pending, true];
  return { value, posted };
}

// Archived postings note offers that were reported without student names.
const UNNAMED = /(\d+)\s+offers?\s+reported\s+without\s+names/i;
const unnamedOffers = (roles) => roles.reduce((a, r) => a + Number(UNNAMED.exec(r.comments || '')?.[1] || 0), 0);

// One season's side of an employer group, summed over its companies.
// Highest CTC and stipend follow highest(); `ctcPosted` / `stipendPosted`
// mark a figure that came from a posting rather than an offer.
// Cut-off: the lowest listed (0 = a role with none), null when unknown.
export function sideStats(companies, { live = false } = {}) {
  const offers = companies.flatMap((c) => c.offers);
  const roles = companies.flatMap((c) => c.roles);
  const count = companies.reduce((a, c) => a + c.count, 0) + (live ? 0 : unnamedOffers(roles));
  const offered = offers.map((o) => o.ctc).filter((x) => x !== null);
  const ctc = highest(offers, roles, 'ctc', live);
  const stipend = highest(offers, roles, 'stipend', live);
  const cutoffs = roles.map((r) => r.cgpa).filter((x) => x !== null);
  const ongoing = live && roles.some((r) => r.count === null);
  const branches = {};
  for (const o of offers) branches[o.branch] = (branches[o.branch] || 0) + 1;
  return {
    count,
    status: count > 0 ? 'hired' : ongoing ? 'ongoing' : 'none',
    // Results are out for some roles but others are still running.
    partial: count > 0 && ongoing,
    maxCtc: ctc.value,
    ctcPosted: ctc.posted,
    avgCtc: offered.length ? offered.reduce((a, b) => a + b, 0) / offered.length : null,
    maxStipend: stipend.value,
    stipendPosted: stipend.posted,
    cutoff: maxOf(cutoffs) === null ? null : Math.min(...cutoffs),
    students: new Set(offers.map((o) => o.studentKey)).size,
    branches: Object.fromEntries(Object.entries(branches).sort((a, b) => b[1] - a[1])),
    cats: [...new Set([...offers.map((o) => o.cat), ...roles.map((r) => r.cat)])].filter((k) => k && k !== 'Unknown'),
    offerTypes: [...new Set([...roles.map((r) => r.offer), ...offers.map((o) => o.offer)].filter(Boolean))],
    roleNames: [...new Set([...roles.map((r) => r.role), ...offers.map((o) => o.role)].filter(Boolean))],
  };
}
