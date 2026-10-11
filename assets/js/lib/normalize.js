// Turns loosely formatted sheet rows into clean records.
//
// Offer record:   { roll, name, cgpa, company, companyKey, role, offer, stipend,
//                   stipendText, ctc, ctcText, base, cat, branch, studentKey }
// Company row:    { company, companyKey, role, offer, cgpa, count, ctc, base,
//                   stipend, cat, comments, domain }

const FIELD_PATTERNS = [
  ['roll', /^roll/],
  ['name', /^(student)?name/],
  ['cgpa', /^(cgpa|cg|gpa)/],
  ['company', /^(company|organi[sz]ation|recruiter)/],
  ['role', /^(role|profile|position|designation)/],
  ['offer', /^(offertype|offer|duration|typeofoffer|internshipfte)/],
  ['stipend', /^stipend/],
  ['ctc', /^(ctc|package|salary)/],
  ['base', /^base/],
  ['cat', /^(category|type|profiletype)/],
  ['branch', /^(branch|dept|department)/],
  ['count', /^(count|selected|selections|noof)/],
  ['comments', /^(comment|remark|note)/],
  ['domain', /^(website|logo|url|site|domain)/],
];

const headerCache = new Map();
function fieldFor(header) {
  if (headerCache.has(header)) return headerCache.get(header);
  const key = String(header).toLowerCase().replace(/[^a-z]/g, '');
  const hit = FIELD_PATTERNS.find(([, re]) => re.test(key));
  const field = hit ? hit[0] : null;
  headerCache.set(header, field);
  return field;
}

export function mapRow(raw) {
  const out = {};
  for (const [header, value] of Object.entries(raw)) {
    const f = fieldFor(header);
    if (f && !(f in out)) out[f] = value;
  }
  return out;
}

export function text(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

const round2 = (v) => (v === null ? null : Math.round(v * 100) / 100);

// ---------- categories, offer types, branches ----------

export function normCategory(v, role = '') {
  const s = text(v).toLowerCase().replace(/[^a-z]/g, '');
  if (s === 'tech' || s === 'it' || s === 'software') return 'Tech';
  if (s === 'nontech' || s === 'nontechnical' || s === 'business') return 'Non Tech';
  if (s === 'core') return 'Core';
  return inferCategory(role);
}

export function inferCategory(role) {
  const r = text(role).toLowerCase();
  if (!r) return 'Unknown';
  if (/\bcore\b|hardware|analog|embedded|vlsi|\bget\b|graduate engineer|mechanical|electrical|civil|chemical|manufactur|production|quality/.test(r)) return 'Core';
  if (/analyst|consult|business|product manager|management|marketing|sales|finance|banking|operations|founder|relationship/.test(r)) return 'Non Tech';
  if (/sde|software|developer|engineer|data scien|\bml\b|\bai\b|full ?stack|backend|frontend|devops|sdet|programmer/.test(r)) return 'Tech';
  return 'Unknown';
}

export function normOffer(v) {
  // "6M Intern + PPO" -> "6M + PPO", but a bare "Intern + PPO" keeps its INTERN.
  const s = text(v).toUpperCase().replace(/\s+/g, '').replace(/(\d+M)INTERN(SHIP)?/g, '$1');
  if (!s || /LPA|#/.test(s)) return '';
  return s.split('+').filter(Boolean).join(' + ');
}

export function normBranch(branch, roll) {
  let b = text(branch).toUpperCase().replace(/[^A-Z]/g, '');
  if (!b) {
    const m = text(roll).toUpperCase().match(/\/([A-Z]{2,4})\//);
    b = m ? m[1] : '';
  }
  if (b === 'CSE') return 'CS';
  if (b === 'COE') return 'CO';
  return b || 'MISC';
}

export function studentKey(roll, name) {
  const r = text(roll).toUpperCase().replace(/\s+/g, '');
  const m = r.match(/^(?:2K)?(\d{2})\/([A-Z&]+)\/0*(\d+)$/);
  if (m) return `${m[1]}/${m[2]}/${parseInt(m[3], 10)}`;
  return `name:${text(name).toLowerCase()}`;
}

function cleanRoll(v) {
  const r = text(v).toUpperCase().replace(/\s+/g, '');
  return r === 'NONE' || r === '#N/A' ? '' : r;
}

// Names typed in ALL CAPS read better in title case.
export function niceName(v) {
  const s = text(v);
  if (!s || s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

// ---------- companies ----------

// Separate drives of the same company (e.g. "Amazon(JAN-JUNE)") roll up into one card.
const CYCLE_RE = /\s*\(\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[-–]\s*[a-z]+\s*\)\s*/gi;

const COMPANY_ALIASES = {
  texasinstrumetns: 'Texas Instruments',
  msilmarutisuzuki: 'Maruti Suzuki',
  zsassociatesjaipur: 'ZS Associates',
  hclhackfte: 'HCL',
  hcltech: 'HCL',
  schneider: 'Schneider Electric',
};

export function baseCompanyName(v) {
  return text(v).replace(CYCLE_RE, ' ').trim();
}

export function companyKey(v) {
  const k = baseCompanyName(v).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const alias = COMPANY_ALIASES[k];
  return alias ? companyKey(alias) : k;
}

export function canonicalCompany(v) {
  const k = baseCompanyName(v).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  return COMPANY_ALIASES[k] || baseCompanyName(v);
}

// Display name for a group of spellings: prefer the most common one that is
// not shouting; otherwise title-case long all-caps words ("TOWER RESEARCH CAPITAL").
export function pickDisplayName(variants) {
  const counts = new Map();
  for (const v of variants) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const calm = sorted.find(([v]) => v !== v.toUpperCase() || v.replace(/[^A-Za-z]/g, '').length <= 4);
  if (calm) return calm[0];
  const top = sorted.length ? sorted[0][0] : '';
  return top.replace(/[A-Za-z]+/g, (w) => (w.length <= 4 ? w : w[0] + w.slice(1).toLowerCase()));
}

// ---------- money ----------

export function parseCtc(v) {
  if (typeof v === 'number') return v > 0 ? round2(v >= 100000 ? v / 100000 : v) : null;
  const s = text(v).toLowerCase().replace(/,/g, '');
  const m = s.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (n >= 100000) n /= 100000;
  return n > 0 ? round2(n) : null;
}

export function parseStipendK(v) {
  if (typeof v === 'number') return v > 0 ? (v >= 1000 ? v / 1000 : v) : null;
  const s = text(v).toLowerCase().replace(/[,₹]/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(k|lakh|l\b)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (m[2] === 'lakh' || m[2] === 'l') return n * 100;
  if (m[2] === 'k') return n;
  return n >= 1000 ? n / 1000 : n || null;
}

// ---------- records ----------

export function finalizeOffer(o) {
  const company = canonicalCompany(o.company);
  const cgpa = num(o.cgpa);
  const ctc = typeof o.ctc === 'number' ? o.ctc : parseCtc(o.ctc);
  const base = typeof o.base === 'number' ? o.base : num(o.base);
  const stipend = typeof o.stipend === 'number' ? o.stipend : parseStipendK(o.stipend);
  return {
    roll: cleanRoll(o.roll),
    name: niceName(o.name),
    cgpa: cgpa !== null && cgpa > 0 && cgpa <= 10 ? round2(cgpa) : null,
    company,
    companyKey: companyKey(company),
    role: text(o.role),
    offer: normOffer(o.offer),
    stipend: stipend !== null ? round2(stipend) : null,
    stipendText: o.stipendText !== undefined ? text(o.stipendText) : (typeof o.stipend === 'string' ? text(o.stipend) : ''),
    ctc: ctc !== null && ctc > 0 ? round2(ctc) : null,
    ctcText: o.ctcText !== undefined ? text(o.ctcText) : (typeof o.ctc === 'string' && num(o.ctc) === null ? text(o.ctc) : ''),
    base: base !== null && base > 0 ? round2(base) : null,
    cat: normCategory(o.cat, o.role),
    branch: normBranch(o.branch, o.roll),
    studentKey: studentKey(o.roll, o.name),
  };
}

// Archived company postings (already structured) -> company rows.
export function archiveCompanyRows(rows = []) {
  return rows
    .filter((r) => text(r.company))
    .map((r) => ({
      company: canonicalCompany(r.company),
      drive: text(r.company),
      companyKey: companyKey(r.company),
      role: text(r.role),
      offer: normOffer(r.offer),
      cgpa: num(r.cgpa) || null,
      count: null,
      ctc: parseCtc(r.ctc),
      base: num(r.base),
      stipend: parseStipendK(r.stipend),
      cat: normCategory(r.cat, r.role),
      comments: text(r.comments),
      domain: '',
      date: text(r.date),
    }));
}

// Season-level manual corrections: [{ roll, set: { field: value } }].
export function applyOverrides(offers, overrides = []) {
  if (!overrides.length) return offers;
  const byStudent = new Map(overrides.map((o) => [studentKey(o.roll, o.name || ''), o.set]));
  return offers.map((o) => (byStudent.has(o.studentKey) ? finalizeOffer({ ...o, ...byStudent.get(o.studentKey) }) : o));
}

// Students tab -> offers
export function offersFromRows(rows) {
  return rows
    .map(mapRow)
    .filter((r) => text(r.company) && text(r.name))
    .map(finalizeOffer);
}

// Companies tab -> company/role rows
export function companyRowsFromRows(rows) {
  return rows
    .map(mapRow)
    .filter((r) => text(r.company))
    .map((r) => {
      const countRaw = text(r.count);
      return {
        company: canonicalCompany(r.company),
        drive: text(r.company),
        companyKey: companyKey(r.company),
        role: text(r.role),
        offer: normOffer(r.offer),
        cgpa: num(r.cgpa),
        count: countRaw === '' ? null : num(countRaw),
        ctc: parseCtc(r.ctc),
        base: num(r.base),
        stipend: parseStipendK(r.stipend),
        cat: normCategory(r.cat, r.role),
        comments: text(r.comments),
        domain: text(r.domain).replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      };
    });
}
