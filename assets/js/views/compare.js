import { BRANCHES, CATEGORIES } from '../config.js';
import { barChart, palette } from '../lib/charts.js';
import { catClass, debounce, fmt, html, raw } from '../lib/dom.js';
import { logoHtml } from '../lib/logos.js';
import { joinSeasons, sideStats } from '../lib/match.js';

// The 2K22 batch was CO (Computer Engineering); 2K23 calls it CS.
const unify = (code) => (code === 'CO' ? 'CS' : code);
const label = (code) => (code === 'CS' ? 'CS / CO' : code);

// kind 'rate' colours the change (higher is better); 'count' stays neutral,
// because 2027 counts are expected to be lower while the season is running.
function tile(name, now, before, f, { diffFmt = f, kind = 'rate' } = {}) {
  const diff = now !== null && before !== null ? now - before : null;
  const tone = kind === 'rate' && diff ? (diff > 0 ? 'is-up' : 'is-down') : '';
  return html`<div class="panel compare-tile">
    <div class="tile-label">${name}</div>
    <div class="pair">
      <div><div class="yr">2027 so far</div><div class="big">${f(now)}</div></div>
      <div style="text-align:right"><div class="yr">2026 final</div><div class="prev">${f(before)}</div></div>
    </div>
    ${diff !== null ? html`<span class="delta ${tone}">${diff >= 0 ? '▲' : '▼'} ${diffFmt(Math.abs(diff))} vs last year</span>` : ''}
  </div>`;
}

function legend(p) {
  return `<div class="legend"><span><i class="key" style="background:${p.measure}"></i>2027</span><span><i class="key" style="background:${p.prev}"></i>2026</span></div>`;
}

export function renderCompare(root, ctx) {
  const now = ctx.models['2027'];
  const before = ctx.models['2026'];
  const a = now.totals;
  const b = before.totals;
  const p = palette();
  const pctPts = (v) => (v === null ? '—' : `${fmt.n1(v)}%`);

  // Branch-level join
  const codes = [...new Set([...now.branches, ...before.branches].filter((x) => x.strength).map((x) => unify(x.code)))];
  const find = (m, code) => m.branches.find((x) => unify(x.code) === code && x.strength);
  const rows = codes
    .map((code) => ({ code, now: find(now, code), before: find(before, code) }))
    .filter((r) => r.now && r.before)
    .sort((x, y) => y.now.pct - x.now.pct);

  root.innerHTML = html`
    <div class="statusbar">
      <h1>2026 vs 2027</h1>
      <span class="sub">Batch 2K22 (final) vs batch 2K23 (season in progress)</span>
    </div>
    <div class="notice">The 2027 season is still running, so its totals will keep growing. Rates are a fair comparison only once the season ends.</div>
    <div class="compare-tiles">
      ${tile('Students placed', a.placedInBatch, b.placedInBatch, fmt.int, { kind: 'count' })}
      ${tile('Placement rate', a.pct, b.pct, pctPts, { diffFmt: (v) => `${fmt.n1(v)} pts` })}
      ${tile('Offers', a.offers, b.offers, fmt.int, { kind: 'count' })}
      ${tile('Recruiting companies', a.companiesWithOffers, b.companiesWithOffers, fmt.int, { kind: 'count' })}
      ${tile('Average CTC (LPA)', a.avgCtc, b.avgCtc, fmt.n2)}
      ${tile('Median CTC (LPA)', a.medianCtc, b.medianCtc, fmt.n2)}
      ${tile('Highest CTC (LPA)', a.maxCtc, b.maxCtc, fmt.n2)}
      ${tile('Average stipend (K/mo)', a.avgStipend, b.avgStipend, fmt.n1)}
    </div>

    <div class="section-title"><h2>Branch by branch</h2><p>CO (2K22) and CS (2K23) are the same programme</p></div>
    <div class="grid-2">
      <section class="panel chart-card">
        <header><div><h3>Placement rate by branch</h3><p>Share of the branch with at least one offer</p></div></header>
        ${raw(legend(p))}
        <div class="chart-box is-tall"><canvas id="cmp-pct"></canvas></div>
      </section>
      <section class="panel chart-card">
        <header><div><h3>Average CTC by branch</h3><p>Mean CTC per offer (LPA)</p></div></header>
        ${raw(legend(p))}
        <div class="chart-box is-tall"><canvas id="cmp-ctc"></canvas></div>
      </section>
      <section class="panel chart-card span-2">
        <header><div><h3>Profile mix</h3><p>Share of all offers that are tech, non-tech and core</p></div></header>
        ${raw(legend(p))}
        <div class="chart-box is-short"><canvas id="cmp-cat"></canvas></div>
      </section>
    </div>

    <div class="section-title"><h2>Company by company</h2><p>Every recruiter, 2026 final → 2027 so far</p></div>
    <div data-yoy></div>
  `;

  const names = (i) => `${label(rows[i].code)} · ${BRANCHES[rows[i].code]?.name || ''}`;
  barChart(root.querySelector('#cmp-pct'), {
    labels: rows.map((r) => label(r.code)),
    datasets: [
      { label: '2027', data: rows.map((r) => +r.now.pct.toFixed(1)), color: p.measure },
      { label: '2026', data: rows.map((r) => +r.before.pct.toFixed(1)), color: p.prev },
    ],
    horizontal: true,
    max: 100,
    tickFormat: (v) => `${v}%`,
    tooltipTitle: names,
    valueFormat: (v) => `${fmt.n1(v)}%`,
  });

  const ctcRows = rows.filter((r) => r.now.avg !== null && r.before.avg !== null);
  barChart(root.querySelector('#cmp-ctc'), {
    labels: ctcRows.map((r) => label(r.code)),
    datasets: [
      { label: '2027', data: ctcRows.map((r) => +r.now.avg.toFixed(2)), color: p.measure },
      { label: '2026', data: ctcRows.map((r) => +r.before.avg.toFixed(2)), color: p.prev },
    ],
    horizontal: true,
    tooltipTitle: (i) => `${label(ctcRows[i].code)} · ${BRANCHES[ctcRows[i].code]?.name || ''}`,
    valueFormat: (v) => `${fmt.n2(v)} LPA`,
  });

  const share = (t, k) => +((t.cats[k] / t.offers) * 100).toFixed(1);
  barChart(root.querySelector('#cmp-cat'), {
    labels: CATEGORIES,
    datasets: [
      { label: '2027', data: CATEGORIES.map((k) => share(a, k)), color: p.measure },
      { label: '2026', data: CATEGORIES.map((k) => share(b, k)), color: p.prev },
    ],
    horizontal: true,
    max: 100,
    tickFormat: (v) => `${v}%`,
    valueFormat: (v) => `${fmt.n1(v)}% of offers`,
  });

  renderCompanies(root.querySelector('[data-yoy]'), now, before, ctx);
}

// ---------- company by company ----------

// Filters and open rows survive live refreshes.
const state = { tab: 'both', q: '', status: 'all', cat: 'all', sort: 'offers', open: new Set() };

const TABS = {
  both: 'In both years',
  onlyNow: 'New in 2027',
  onlyBefore: 'Not back yet',
};

const SORTS = {
  offers: 'Most offers (both years)',
  now: 'Most offers in 2027',
  rise: 'Offers: biggest rise',
  drop: 'Offers: biggest drop',
  ctc: 'Highest CTC in 2027',
  ctcRise: 'Highest CTC: biggest rise',
  ctcDrop: 'Highest CTC: biggest drop',
  name: 'A–Z',
};
const CHANGE_SORTS = new Set(['rise', 'drop', 'ctcRise', 'ctcDrop']);

const byCount = (a, b) => b.count - a.count || a.name.localeCompare(b.name);
const names = (list) => list.map((c) => c.name).join(' / ');

function toRow(g, live) {
  const nowC = [...g.now].sort(byCount);
  const beforeC = [...g.before].sort(byCount);
  const shown = nowC.length ? nowC : beforeC;
  const nowName = names(nowC);
  const beforeName = names(beforeC);
  const s = {
    id: [...nowC.map((c) => `n:${c.key}`), ...beforeC.map((c) => `b:${c.key}`)].join(' '),
    name: names(shown),
    lead: shown[0],
    nowC,
    beforeC,
    now: nowC.length ? sideStats(nowC, { live }) : null,
    before: beforeC.length ? sideStats(beforeC) : null,
    // The 2026 spelling, when it differs from this year's.
    formerly: nowC.length && beforeC.length && nowName.toLowerCase() !== beforeName.toLowerCase() ? beforeName : '',
  };
  s.hay = `${nowName} ${beforeName} ${[...(s.now?.roleNames || []), ...(s.before?.roleNames || [])].join(' ')}`.toLowerCase();
  return s;
}

// Change in offers, only once 2027 results are in.
function offerChange(r) {
  if (!r.now || !r.before || r.now.status === 'ongoing') return null;
  return r.now.count - r.before.count;
}
function ctcChange(r) {
  if (r.now?.maxCtc == null || r.before?.maxCtc == null) return null;
  return r.now.maxCtc - r.before.maxCtc;
}

function sorted(rows) {
  const total = (r) => (r.now?.count || 0) + (r.before?.count || 0);
  const nullsLast = (f, dir) => (a, b) => {
    const x = f(a);
    const y = f(b);
    if (x === null && y === null) return total(b) - total(a);
    if (x === null) return 1;
    if (y === null) return -1;
    return dir * (y - x) || total(b) - total(a);
  };
  const by = {
    offers: (a, b) => total(b) - total(a),
    now: nullsLast((r) => (r.now ? r.now.count : null), 1),
    rise: nullsLast(offerChange, 1),
    drop: nullsLast(offerChange, -1),
    ctc: nullsLast((r) => r.now?.maxCtc ?? null, 1),
    ctcRise: nullsLast(ctcChange, 1),
    ctcDrop: nullsLast(ctcChange, -1),
    name: () => 0,
  }[state.sort];
  return rows.sort((a, b) => by(a, b) || a.name.localeCompare(b.name));
}

function filtered(rows) {
  const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (words.length && !words.every((w) => r.hay.includes(w))) return false;
    if (state.cat !== 'all' && !(r.now?.cats.includes(state.cat) || r.before?.cats.includes(state.cat))) return false;
    if (state.status !== 'all' && state.tab !== 'onlyBefore' && r.now?.status !== state.status) return false;
    return true;
  });
}

const MINUS = '−';
function signed(v, f) {
  if (v === 0) return 'same';
  return `${v > 0 ? '+' : MINUS}${f(Math.abs(v))}`;
}

// One "2026 → 2027" cell. `tone` colours the change: 1 when higher is better.
// A null side means the company did not come that year: the cell shows the
// other year alone.
function metric(label, was, is, { change = null, f = fmt.n2, tone = 1, note = '' } = {}) {
  // Rounded first, so 31.05 vs 31.0499 reads "same", not "+0".
  if (change !== null) change = Math.round(change * 100) / 100;
  if (was === null || is === null) {
    const [year, v] = was === null ? ['2027', is] : ['2026', was];
    return html`<div class="yoy-m"><span class="yoy-l">${label}</span><span class="yoy-v"><b class="is"><span class="sr-only">${year}: </span>${v}</b></span>${note ? html`<span class="yoy-note">${note}</span>` : ''}</div>`;
  }
  if (was === '—' && is === '—') {
    return html`<div class="yoy-m"><span class="yoy-l">${label}</span><span class="yoy-v"><span class="was">—<span class="sr-only"> both years</span></span></span></div>`;
  }
  const cls = change === null || change === 0 || !tone ? '' : change * tone > 0 ? 'is-up' : 'is-down';
  return html`<div class="yoy-m">
    <span class="yoy-l">${label}</span>
    <span class="yoy-v"><span class="was"><span class="sr-only">2026: </span>${was}</span><span class="arr" aria-hidden="true">→</span><b class="is"><span class="sr-only">, 2027: </span>${is}</b></span>
    ${change !== null ? html`<span class="chg ${cls}"><span class="sr-only">change: </span>${signed(change, f)}</span>` : ''}
    ${note ? html`<span class="yoy-note">${note}</span>` : ''}
  </div>`;
}

const posted = (side) => (side.ctcPosted ? html`<sup class="yoy-posted" title="Posted package, not yet an offer">p</sup>` : '');
const money = (side, key, f = fmt.n2) => (side[key] === null ? '—' : html`${f(side[key])}${key === 'maxCtc' ? posted(side) : ''}`);
const cutoffText = (v) => (v === null ? '—' : v === 0 ? 'None' : fmt.n1(v));

function offersCell(r) {
  const was = r.before ? fmt.int(r.before.count) : null;
  if (!r.now) return metric('Offers', was, null);
  const n = r.now;
  const is = n.status === 'ongoing' ? html`<span class="yoy-pill">Ongoing</span>` : fmt.int(n.count);
  // Partial counts are still growing, so their change is not coloured.
  return metric('Offers', was, is, { change: offerChange(r), f: fmt.int, tone: n.partial ? 0 : 1, note: n.partial ? 'more results due' : '' });
}

function summaryRow(r) {
  const b = r.before;
  const n = r.now;
  const was = (key, f) => (b ? money(b, key, f) : null);
  const is = (key, f) => (n ? money(n, key, f) : null);
  const both = n && b;
  const diff = (key) => (both && n[key] !== null && b[key] !== null ? n[key] - b[key] : null);
  const cats = [...new Set([...(n?.cats || []), ...(b?.cats || [])])];
  return html`<summary>
    <div class="yoy-co">
      ${raw(logoHtml(r.lead, 'sm'))}
      <div class="yoy-name">
        <b>${r.name}</b>
        <span class="sub">${cats.map((k) => html`<span class="yoy-cat"><i class="key ${catClass(k)}"></i>${k}</span>`)}${r.formerly ? html`<span>2026: ${r.formerly}</span>` : ''}</span>
      </div>
    </div>
    ${offersCell(r)}
    ${metric('Highest CTC', was('maxCtc'), is('maxCtc'), { change: diff('maxCtc'), tone: both && (n.ctcPosted || b.ctcPosted) ? 0 : 1 })}
    ${metric('Avg CTC', was('avgCtc'), is('avgCtc'), { change: diff('avgCtc') })}
    ${metric('Stipend', was('maxStipend', fmt.n1), is('maxStipend', fmt.n1), { change: diff('maxStipend'), f: fmt.n1 })}
    ${metric('CGPA cut-off', b ? cutoffText(b.cutoff) : null, n ? cutoffText(n.cutoff) : null, {
      change: both && n.cutoff !== null && b.cutoff !== null ? n.cutoff - b.cutoff : null,
      f: fmt.n1,
      tone: 0,
    })}
    <span class="yoy-chev" aria-hidden="true"></span>
  </summary>`;
}

// Role lines: the live Companies tab when there is one, else grouped offers,
// else the postings.
function roleLines(companies, live) {
  const lines = [];
  for (const c of companies) {
    if (live && c.roles.length) {
      for (const r of c.roles) lines.push({ role: r.role, offer: r.offer, ctc: r.ctc, stipend: r.stipend, cgpa: r.cgpa, count: r.count });
      continue;
    }
    if (c.offers.length) {
      // Postings carry the cut-off; borrow it when the role name matches.
      const norm = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
      const posting = new Map(c.roles.map((r) => [norm(r.role), r]));
      const groups = new Map();
      for (const o of c.offers) {
        const k = `${o.role}|${o.offer}|${o.ctc}`;
        const p = posting.get(norm(o.role));
        if (!groups.has(k)) groups.set(k, { role: o.role, offer: o.offer, ctc: o.ctc, stipend: o.stipend ?? p?.stipend ?? null, cgpa: p?.cgpa ?? null, count: 0 });
        groups.get(k).count++;
      }
      lines.push(...[...groups.values()].sort((a, b) => b.count - a.count));
      continue;
    }
    for (const r of c.roles) lines.push({ role: r.role, offer: r.offer, ctc: r.ctc, stipend: r.stipend, cgpa: r.cgpa, count: 0 });
  }
  return lines;
}

function sideDetail(year, label, companies, s, ctx, live) {
  if (!s) {
    return html`<div class="yoy-side is-empty">
      <h4>${year} <span>${label}</span></h4>
      <p class="muted">${year === '2026' ? 'Did not recruit at DTU in 2026.' : 'Not on the 2027 list yet.'}</p>
    </div>`;
  }
  const lines = roleLines(companies, live);
  const branches = Object.entries(s.branches);
  return html`<div class="yoy-side">
    <h4>${year} <span>${label}</span></h4>
    ${lines.length
      ? html`<div class="table-wrap"><table class="yoy-roles">
          <thead><tr><th>Role</th><th>Offer</th><th class="r">CTC</th><th class="r">Stipend</th><th class="r">CGPA</th><th class="r">Selected</th></tr></thead>
          <tbody>${lines.map(
            (l) => html`<tr>
              <td class="wrap-cell">${l.role || '—'}</td>
              <td>${l.offer || '—'}</td>
              <td class="r">${fmt.n2(l.ctc)}</td>
              <td class="r">${l.stipend !== null ? `${fmt.n1(l.stipend)}K` : '—'}</td>
              <td class="r">${l.cgpa === null ? '—' : l.cgpa === 0 ? 'None' : fmt.n1(l.cgpa)}</td>
              <td class="r">${l.count === null ? html`<span class="muted">ongoing</span>` : fmt.int(l.count)}</td>
            </tr>`,
          )}</tbody>
        </table></div>`
      : ''}
    <div class="yoy-branches">
      ${branches.length
        ? html`<span class="yoy-l">Selected by branch</span><div class="branch-chips">${branches.map(
            ([code, n]) => html`<span title="${BRANCHES[code]?.name || code}">${code}<b>${n}</b></span>`,
          )}</div>`
        : html`<span class="muted">${live ? 'No named selections yet.' : 'No named selections recorded.'}</span>`}
    </div>
    <p class="yoy-links">${companies.map(
      (c) => html`<a href="${ctx.hrefFor(year, 'companies', c.slug)}">${companies.length > 1 ? `${c.name} in ${year}` : `Open ${year} page`} →</a>`,
    )}</p>
  </div>`;
}

function rowHtml(r, ctx, live) {
  return html`<details class="yoy-row" data-id="${r.id}" ${state.open.has(r.id) ? raw('open') : ''}>
    ${summaryRow(r)}
    <div class="yoy-body">
      ${sideDetail('2026', 'final', r.beforeC, r.before, ctx, false)}
      ${sideDetail('2027', 'so far', r.nowC, r.now, ctx, live)}
    </div>
  </details>`;
}

// Headline counts over every company in both years (filters ignored).
function scoreboard(both, groups) {
  const out = both.filter((r) => r.now.status !== 'ongoing');
  const settled = out.filter((r) => !r.now.partial);
  const more = settled.filter((r) => r.now.count > r.before.count).length;
  const fewer = settled.filter((r) => r.now.count < r.before.count).length;
  const priced = both.filter((r) => r.now.maxCtc !== null && r.before.maxCtc !== null && !r.now.ctcPosted && !r.before.ctcPosted);
  const higher = priced.filter((r) => r.now.maxCtc > r.before.maxCtc).length;
  const lower = priced.filter((r) => r.now.maxCtc < r.before.maxCtc).length;
  const sum = (list, side) => list.reduce((a, r) => a + r[side].count, 0);
  const cell = (big, label, sub) => html`<div class="yoy-score"><div class="v">${big}</div><div class="l">${label}</div>${sub ? html`<div class="s">${sub}</div>` : ''}</div>`;
  return html`<div class="panel yoy-scores">
    ${cell(fmt.int(both.length), 'companies came back', `of ${fmt.int(groups.visitedBefore)} from 2026 · ${fmt.int(groups.newNow)} new this year`)}
    ${cell(html`${fmt.int(sum(out, 'now'))}<small> vs ${fmt.int(sum(out, 'before'))}</small>`, 'offers so far vs 2026', `from the ${fmt.int(out.length)} with 2027 results out`)}
    ${cell(html`${fmt.int(more)}<small> ▲</small> · ${fmt.int(fewer)}<small> ▼</small>`, 'hiring more · fewer', `${fmt.int(settled.length - more - fewer)} the same; ${fmt.int(both.length - settled.length)} still in progress`)}
    ${cell(html`${fmt.int(higher)}<small> ▲</small> · ${fmt.int(lower)}<small> ▼</small>`, 'paying more · less', `highest CTC offered; ${fmt.int(priced.length - higher - lower)} unchanged`)}
  </div>`;
}

function renderCompanies(root, now, before, ctx) {
  const live = !!now.season.live;
  const joined = joinSeasons(now, before);
  const rows = {
    both: joined.both.map((g) => toRow(g, live)),
    onlyNow: joined.onlyNow.map((g) => toRow(g, live)),
    onlyBefore: joined.onlyBefore.map((g) => toRow(g, live)),
  };
  const groups = { visitedBefore: rows.both.length + rows.onlyBefore.length, newNow: rows.onlyNow.length };

  root.innerHTML = html`
    ${scoreboard(rows.both, groups)}
    <div class="toolbar yoy-toolbar">
      <div class="chips" role="group" aria-label="Which companies">
        ${Object.entries(TABS).map(
          ([k, label]) => html`<button class="chip" type="button" data-tab="${k}" aria-pressed="${String(state.tab === k)}">${label} <span class="chip-n">${rows[k].length}</span></button>`,
        )}
      </div>
    </div>
    <div class="toolbar">
      <div class="grow"><input class="input input-search" type="search" placeholder="Search company or role…" aria-label="Search companies" value="${state.q}" data-f="q"></div>
      <select class="select" data-f="status" aria-label="2027 status">
        <option value="all">Any 2027 status</option>
        <option value="hired">2027 results out</option>
        <option value="ongoing">2027 ongoing</option>
        <option value="none">2027 no selections</option>
      </select>
      <select class="select" data-f="cat" aria-label="Profile">
        <option value="all">All profiles</option>
        ${CATEGORIES.map((k) => html`<option value="${k}">${k}</option>`)}
      </select>
      <select class="select" data-f="sort" aria-label="Sort">
        ${Object.entries(SORTS).map(([k, label]) => html`<option value="${k}">${label}</option>`)}
      </select>
    </div>
    <p class="result-count" data-count></p>
    <div class="yoy-head" aria-hidden="true">
      <span>Company</span><span>Offers</span><span>Highest CTC <small>LPA</small></span><span>Avg CTC <small>LPA</small></span><span>Stipend <small>K/mo</small></span><span>CGPA cut-off</span><span></span>
    </div>
    <div class="yoy-list" data-list></div>
    <p class="yoy-foot">Offers count every selection, including PPOs. Highest CTC is the best package actually offered; <sup class="yoy-posted">p</sup> marks the posted package of a role whose results are still due. CGPA cut-off is the lowest across a company's roles: “None” means no cut-off, “—” means it was not recorded. A company is matched across the two years even when its name changed, for example Zomato → Eternal or OYO → Prism (OYO).</p>
  `;

  const list = root.querySelector('[data-list]');
  const count = root.querySelector('[data-count]');
  const statusSel = root.querySelector('[data-f="status"]');
  const sortSel = root.querySelector('[data-f="sort"]');

  const paint = () => {
    // Change sorts and the 2027 status only make sense for some tabs.
    const off = (k) => (state.tab !== 'both' && CHANGE_SORTS.has(k)) || (state.tab === 'onlyBefore' && (k === 'now' || k === 'ctc'));
    for (const o of sortSel.options) o.hidden = o.disabled = off(o.value);
    sortSel.options[0].textContent = state.tab === 'both' ? SORTS.offers : 'Most offers';
    if (off(state.sort)) state.sort = 'offers';
    if (state.tab === 'onlyBefore') state.status = 'all';
    statusSel.hidden = state.tab === 'onlyBefore';
    for (const sel of root.querySelectorAll('select[data-f]')) sel.value = state[sel.dataset.f];

    const shown = sorted(filtered(rows[state.tab]));
    const total = rows[state.tab].length;
    const what = {
      both: `in both years · each cell reads 2026 → 2027${live ? ' so far' : ''}`,
      onlyNow: `new in 2027 · figures are 2027${live ? ' so far' : ''}`,
      onlyBefore: 'from 2026 not on the 2027 list yet · figures are 2026',
    }[state.tab];
    count.textContent = `${shown.length === total ? `All ${total}` : `${shown.length} of ${total}`} companies ${what} · tap a company for roles and branches`;
    list.innerHTML = shown.length ? shown.map((r) => rowHtml(r, ctx, live)).join('') : '<div class="empty">No companies match these filters.</div>';
  };
  paint();

  list.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.dataset.id) return;
      if (d.open) state.open.add(d.dataset.id);
      else state.open.delete(d.dataset.id);
    },
    true,
  );
  root.querySelector('[data-f="q"]').addEventListener(
    'input',
    debounce((e) => {
      state.q = e.target.value.trim();
      paint();
    }, 120),
  );
  for (const sel of root.querySelectorAll('select[data-f]')) {
    sel.addEventListener('change', () => {
      state[sel.dataset.f] = sel.value;
      paint();
    });
  }
  for (const chip of root.querySelectorAll('[data-tab]')) {
    chip.addEventListener('click', () => {
      state.tab = chip.dataset.tab;
      for (const c of root.querySelectorAll('[data-tab]')) c.setAttribute('aria-pressed', String(c === chip));
      paint();
    });
  }
}
