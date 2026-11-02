// An internship season (2028 batch): summer internship selections per
// company. Student names are not published, so there is one page.

import { BRANCHES } from '../config.js';
import { barChart, catColor, palette } from '../lib/charts.js';
import { debounce, fmt, html, raw } from '../lib/dom.js';
import { logoHtml } from '../lib/logos.js';

function tile(label, value, unit, note) {
  return html`<div class="tile">
    <div class="tile-label">${label}</div>
    <div class="tile-value">${value}${unit ? html`<small>${unit}</small>` : ''}</div>
    ${note ? html`<div class="tile-note" title="${note}">${note}</div>` : ''}
  </div>`;
}

const branchName = (b) => (b === 'MISC' ? 'Other branches' : BRANCHES[b]?.name || b);
const cutoff = (v) => (v === null ? '—' : v === 0 ? 'None' : fmt.n1(v));

// Filters survive data refreshes.
const state = { q: '', kind: 'all', branch: 'all', sort: 'count' };
const KINDS = { all: 'All', ppo: 'With PPO route', intern: 'Internship only' };
const SORTS = { count: 'Most selected', stipend: 'Highest stipend', name: 'A–Z' };
const BRANCH_ORDER = ['CS', 'IT', 'SE', 'MISC'];
const branchColor = { CS: 'var(--measure)', IT: 'var(--tech)', SE: 'var(--core)', MISC: 'var(--prev)' };

// What each company had at the reader's last visit, for "new" badges.
const SEEN_KEY = 'seen-2028';
let seenBefore = null;
function previousCounts(m) {
  if (seenBefore === null) {
    try {
      seenBefore = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null');
    } catch {
      seenBefore = null;
    }
    seenBefore = seenBefore && typeof seenBefore === 'object' ? seenBefore : false;
  }
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(m.companies.map((c) => [c.key, c.count]))));
  } catch {
    /* private mode */
  }
  return seenBefore;
}

function branchBar(c) {
  const parts = BRANCH_ORDER.filter((b) => c.branches[b]).map((b) => [b, c.branches[b]]);
  const known = parts.reduce((a, [, n]) => a + n, 0);
  return html`<div class="ic-branches">
    <div class="ic-bar" role="img" aria-label="${parts.map(([b, n]) => `${b === 'MISC' ? 'Other' : b} ${n}`).join(', ')}">
      ${parts.map(([b, n]) => html`<span style="flex:${n};background:${raw(branchColor[b])}" title="${branchName(b)}: ${n}"></span>`)}
      ${known < c.count ? html`<span style="flex:${c.count - known};background:var(--surface-3)" title="Branch not recorded: ${c.count - known}"></span>` : ''}
    </div>
    <div class="ic-legend">${parts.map(([b, n]) => html`<span><i style="background:${raw(branchColor[b])}"></i>${b === 'MISC' ? 'Other' : b} ${n}</span>`)}</div>
  </div>`;
}

function card(c, before) {
  const was = before ? before[c.key] : undefined;
  const fresh = before && was === undefined ? 'New' : before && c.count > was ? `+${c.count - was} new` : '';
  return html`<article class="panel intern-card">
    ${fresh ? html`<span class="ic-new">${fresh}</span>` : ''}
    <div class="cc-top">
      ${raw(logoHtml(c, 'md'))}
      <div class="cc-name">
        <h3 title="${c.name}">${c.name}</h3>
        <p title="${c.roles.join(', ')}"><i class="key ${'key-' + c.cat.replace(/\s+/g, '')}"></i> ${c.roles.join(', ') || '—'}</p>
      </div>
    </div>
    <div class="cc-stats">
      <div class="cc-stat"><div class="v">${fmt.int(c.count)}</div><div class="l">selected</div></div>
      <div class="cc-stat"><div class="v">${c.stipend !== null ? html`${fmt.n1(c.stipend)}<small>K/mo</small>` : '—'}</div><div class="l">stipend</div></div>
      <div class="cc-stat"><div class="v">${cutoff(c.cgpa)}</div><div class="l">CGPA min</div></div>
    </div>
    ${branchBar(c)}
    <div class="ic-tags">
      <span class="tag ${c.ppo ? 'is-ppo' : ''}">${c.offer || (c.ppo ? 'Intern + PPO' : 'Internship')}</span>
      ${c.ppoCtc ? html`<span class="tag">PPO ${c.ppoCtc}</span>` : ''}
    </div>
  </article>`;
}

export function renderInternships(root, m) {
  const t = m.totals;
  const p = palette();
  const branches = Object.entries(t.branches);
  const top = m.companies[0];
  const before = previousCounts(m);
  const byStipend = m.companies.filter((c) => c.stipend !== null).sort((a, b) => b.stipend - a.stipend || b.count - a.count);
  const counts = { all: m.companies.length, ppo: m.companies.filter((c) => c.ppo).length, intern: m.companies.filter((c) => !c.ppo).length };
  if (state.branch !== 'all' && !t.branches[state.branch]) state.branch = 'all';

  root.innerHTML = html`
    <section class="hero">
      <div class="panel hero-main">
        <div class="hero-label">Internship selections</div>
        <div class="hero-value">${fmt.int(t.selections)}</div>
        <div class="hero-sub">across ${fmt.int(t.companies)} companies · summer internships for batch ${m.season.batch}</div>
      </div>
      <div class="tiles">
        ${tile('Companies', fmt.int(t.companies), '', top ? `Most: ${top.name} (${top.count})` : '')}
        ${tile('Average stipend', t.avgStipend !== null ? fmt.n1(t.avgStipend) : '—', t.avgStipend !== null ? 'K/mo' : '', 'per selected intern')}
        ${tile('Highest stipend', t.maxStipend !== null ? fmt.n1(t.maxStipend) : '—', t.maxStipend !== null ? 'K/mo' : '', '')}
        ${tile('With a PPO route', fmt.int(t.withPpo), '', `${fmt.int(t.selections - t.withPpo)} intern only`)}
        ${tile('₹1 lakh+ a month', fmt.int(m.companies.filter((c) => c.stipend >= 100).reduce((a, c) => a + c.count, 0)), '', `selections at ${fmt.int(m.companies.filter((c) => c.stipend >= 100).length)} companies`)}
        ${tile('Top branch', branches.length ? fmt.int(branches[0][1]) : '—', '', branches.length ? `from ${branchName(branches[0][0])} (${fmt.pct((branches[0][1] / t.selections) * 100)})` : '')}
      </div>
    </section>

    <div class="section-title"><h2>By branch</h2><p>Selections from each branch</p></div>
    <div class="grid-2">
      <section class="panel chart-card">
        <header><div><h3>Selections by branch</h3><p>Where the interns come from</p></div></header>
        <div class="chart-box"><canvas id="in-branch" role="img" aria-label="${branches.map(([b, n]) => `${b} ${n}`).join(', ')}"></canvas></div>
      </section>
      <section class="panel chart-card">
        <header><div><h3>Top recruiters</h3><p>Selections per company</p></div></header>
        <div class="chart-box"><canvas id="in-top" role="img" aria-label="${m.companies.map((c) => `${c.name} ${c.count}`).join(', ')}"></canvas></div>
      </section>
    </div>

    <div class="section-title"><h2>Stipends</h2><p>Monthly stipend by company (₹ thousand)</p></div>
    <section class="panel chart-card">
      <header><div><h3>Who pays what</h3><p>Highest stipend first · colour shows the PPO route</p></div></header>
      <div class="legend"><span><i class="key" style="background:${raw(p.measure)}"></i>Intern + PPO route</span><span><i class="key" style="background:${raw(p.prev)}"></i>Internship only</span></div>
      <div class="chart-box is-tall"><canvas id="in-stipend" role="img" aria-label="${byStipend.map((c) => `${c.name} ${c.stipend}K`).join(', ')}"></canvas></div>
    </section>

    <div class="section-title"><h2>Companies</h2><p>${fmt.int(t.companies)} companies · tap filters to narrow down</p></div>
    <div class="toolbar">
      <div class="grow"><input class="input input-search" type="search" placeholder="Search company or role…" aria-label="Search companies" value="${state.q}" data-f="q"></div>
      <div class="chips" role="group" aria-label="Offer">
        ${Object.entries(KINDS).map(([k, label]) => html`<button class="chip" type="button" data-kind="${k}" aria-pressed="${String(state.kind === k)}">${label} <span class="chip-n">${counts[k]}</span></button>`)}
      </div>
      <select class="select" data-f="branch" aria-label="Branch">
        <option value="all">All branches</option>
        ${branches.map(([b]) => html`<option value="${b}">${b === 'MISC' ? 'Other branches' : b}</option>`)}
      </select>
      <select class="select" data-f="sort" aria-label="Sort">
        ${Object.entries(SORTS).map(([k, label]) => html`<option value="${k}">${label}</option>`)}
      </select>
    </div>
    <p class="result-count" data-count></p>
    <div class="intern-grid" data-grid></div>
    <p class="yoy-foot">Student names are not published for this batch, so selections are counted per company. “Other” covers branches outside CS, IT and SE. CGPA cut-off: “None” means no cut-off, “—” means it was not recorded. New selections appear here automatically.</p>
  `;

  barChart(root.querySelector('#in-branch'), {
    labels: branches.map(([b]) => (b === 'MISC' ? 'Other' : b)),
    datasets: [{ label: 'Selections', data: branches.map(([, n]) => n), color: p.measure }],
    horizontal: true,
    tooltipTitle: (i) => branchName(branches[i][0]),
    valueFormat: (v) => `${fmt.int(v)} selections`,
  });
  barChart(root.querySelector('#in-top'), {
    labels: m.companies.map((c) => c.name),
    datasets: [{ label: 'Selections', data: m.companies.map((c) => c.count), color: m.companies.map((c) => catColor(p, c.cat)) }],
    horizontal: true,
    valueFormat: (v) => `${fmt.int(v)} selections`,
  });
  barChart(root.querySelector('#in-stipend'), {
    labels: byStipend.map((c) => c.name),
    datasets: [{ label: 'Stipend', data: byStipend.map((c) => c.stipend), color: byStipend.map((c) => (c.ppo ? p.measure : p.prev)) }],
    horizontal: true,
    valueFormat: (v) => `₹${fmt.n1(v)}K / month`,
  });

  for (const sel of root.querySelectorAll('select[data-f]')) sel.value = state[sel.dataset.f];
  const grid = root.querySelector('[data-grid]');
  const count = root.querySelector('[data-count]');
  const paint = () => {
    const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = m.companies
      .filter((c) => state.kind === 'all' || (state.kind === 'ppo') === c.ppo)
      .filter((c) => state.branch === 'all' || c.branches[state.branch])
      .filter((c) => words.every((w) => `${c.name} ${c.roles.join(' ')}`.toLowerCase().includes(w)))
      .sort(
        {
          count: (a, b) => b.count - a.count || (b.stipend || 0) - (a.stipend || 0),
          stipend: (a, b) => (b.stipend ?? -1) - (a.stipend ?? -1) || b.count - a.count,
          name: (a, b) => a.name.localeCompare(b.name),
        }[state.sort],
      );
    const n = list.reduce((a, c) => a + (state.branch === 'all' ? c.count : c.branches[state.branch]), 0);
    count.textContent = `${list.length} ${list.length === 1 ? 'company' : 'companies'} · ${n} selections${state.branch !== 'all' ? ` from ${state.branch === 'MISC' ? 'other branches' : state.branch}` : ''}`;
    grid.innerHTML = list.length ? list.map((c) => card(c, before)).join('') : '<div class="empty">No companies match these filters.</div>';
  };
  paint();

  root.querySelector('[data-f="q"]').addEventListener(
    'input',
    debounce((e) => {
      if (!e.target.isConnected) return;
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
  for (const chip of root.querySelectorAll('[data-kind]')) {
    chip.addEventListener('click', () => {
      state.kind = chip.dataset.kind;
      for (const c of root.querySelectorAll('[data-kind]')) c.setAttribute('aria-pressed', String(c === chip));
      paint();
    });
  }
}
