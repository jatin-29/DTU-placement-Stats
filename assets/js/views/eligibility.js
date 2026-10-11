// "Where could I get in?" — enter a CGPA and branch, see which companies were
// open to you and how students like you did.

import { BRANCHES, CATEGORIES, SEASON_IDS } from '../config.js';
import { barChart, palette } from '../lib/charts.js';
import { catClass, debounce, fmt, html, raw } from '../lib/dom.js';
import { logoHtml } from '../lib/logos.js';
import { bandIndex, bandTotals, checkCompany, describeEligibility, peers, unifyBranch } from '../lib/eligibility.js';

const STORE = 'eligibility';
const state = { cgpa: '', branch: '', cat: 'all', expanded: {}, loaded: false };
const LIMIT = 12;

function remember() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ cgpa: state.cgpa, branch: state.branch }));
  } catch (e) {
    /* storage unavailable */
  }
}

function recall() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (typeof v.cgpa === 'string') state.cgpa = v.cgpa;
    if (typeof v.branch === 'string') state.branch = v.branch;
  } catch (e) {
    /* storage unavailable */
  }
}

function seasonBranches(season) {
  const codes = Object.keys(season.branchStrength || {});
  return Object.keys(BRANCHES).filter((c) => codes.includes(c));
}

function readCgpa() {
  const v = parseFloat(state.cgpa);
  return Number.isFinite(v) && v > 0 && v <= 10 ? v : null;
}

// The archived season with per-branch CGPA counts: this one, or the one before it.
function referenceModel(m, ctx) {
  if (m.season.branchCgpa) return m;
  const prevId = SEASON_IDS[SEASON_IDS.indexOf(m.season.id) + 1];
  return prevId ? ctx.models[prevId] || null : null;
}

function previousModel(m, ctx) {
  const prevId = SEASON_IDS[SEASON_IDS.indexOf(m.season.id) + 1];
  return prevId ? ctx.models[prevId] || null : null;
}

export function renderEligibility(root, m, ctx) {
  const q = ctx.route.query;
  if (!state.loaded) {
    recall();
    state.loaded = true;
  }
  if (ctx.fresh && (q.cgpa || q.branch)) {
    if (q.cgpa) state.cgpa = q.cgpa;
    if (q.branch) state.branch = unifyBranch(q.branch.toUpperCase());
  }

  const codes = seasonBranches(m.season);
  const branchCode = codes.find((c) => unifyBranch(c) === state.branch) || '';

  root.innerHTML = html`
    <section class="panel elig-form">
      <div class="elig-intro">
        <h2>Where could I get in?</h2>
        <p>Enter your CGPA and branch to see which companies you'd be eligible for, and how students like you did.</p>
      </div>
      <div class="elig-fields">
        <label class="field">
          <span>Your CGPA</span>
          <input class="input" type="number" inputmode="decimal" min="0" max="10" step="0.01" placeholder="e.g. 8.25" value="${state.cgpa}" data-f="cgpa" aria-describedby="elig-hint">
        </label>
        <label class="field">
          <span>Branch</span>
          <select class="select" data-f="branch">
            <option value="">Choose your branch</option>
            ${codes.map((c) => html`<option value="${c}" ${c === branchCode ? 'selected' : ''}>${c} — ${BRANCHES[c].name}</option>`)}
          </select>
        </label>
      </div>
      <p class="elig-hint" id="elig-hint" data-hint></p>
    </section>
    <div data-results></div>
  `;

  const results = root.querySelector('[data-results]');
  const hint = root.querySelector('[data-hint]');

  const paint = () => {
    const cgpa = readCgpa();
    const branch = codes.find((c) => unifyBranch(c) === state.branch);
    hint.textContent = state.cgpa !== '' && cgpa === null ? 'Enter a CGPA between 0 and 10.' : '';
    if (cgpa === null || !branch) {
      results.innerHTML = html`<div class="elig-empty">
        <p>Your results show up here. Nothing you type leaves this page.</p>
      </div>`.toString();
      return;
    }
    renderResults(results, m, ctx, { cgpa, branch });
  };
  paint();

  const sync = () => {
    remember();
    const branch = codes.find((c) => unifyBranch(c) === state.branch);
    const query = readCgpa() !== null && branch ? { cgpa: state.cgpa, branch } : null;
    // Keep the URL shareable without re-rendering (that would steal focus from the input).
    history.replaceState(null, '', ctx.hrefFor(m.season.id, 'eligibility', null, query));
  };

  root.querySelector('[data-f="cgpa"]').addEventListener(
    'input',
    debounce((e) => {
      state.cgpa = e.target.value.trim();
      sync();
      paint();
    }, 250),
  );
  root.querySelector('[data-f="branch"]').addEventListener('change', (e) => {
    state.branch = unifyBranch(e.target.value);
    sync();
    paint();
  });
}

function renderResults(root, m, ctx, { cgpa, branch }) {
  const sId = m.season.id;
  const prev = previousModel(m, ctx);
  const ref = referenceModel(m, ctx);
  const live = !!m.season.live;

  // ----- companies -----
  const checks = m.companies.map((c) => checkCompany(c, { cgpa, branch }, prev?.companyByKey.get(c.key) || null));
  // Companies with no criteria on record count only when someone from the branch got in.
  for (const r of checks) {
    if (r.status === 'unlisted' && r.fromBranch > 0) Object.assign(r, { status: 'likely', branchSource: 'selected' });
  }
  const groups = {
    eligible: checks.filter((r) => r.status === 'eligible'),
    likely: checks.filter((r) => r.status === 'likely'),
    out: checks.filter((r) => r.status === 'below' || r.status === 'branch'),
  };
  const hidden = checks.filter((r) => r.status === 'unlisted').length;
  const conversions = checks.filter((r) => r.status === 'conversion').length;

  // Next cut-off above this CGPA, and how many companies it would open up.
  const below = groups.out.filter((r) => r.status === 'below');
  const nextCut = below.length ? Math.min(...below.map((r) => r.cutoff)) : null;
  const unlockNext = nextCut !== null ? below.filter((r) => r.cutoff <= nextCut + 1e-9).length : 0;

  // ----- students like you -----
  const bandsRef = ref ? bandTotals(ref.season, branch) : null;
  const bandI = bandsRef ? bandIndex(bandsRef.bands, cgpa) : -1;
  const band = bandI >= 0 ? bandsRef.bands[bandI] : null;
  const refPeers = band ? peers(ref, branch, band) : null;
  const refTotal = band ? bandsRef.counts[bandI] : 0;
  const nowPeers = band && ref !== m ? peers(m, branch, band) : null;
  const refCode = ref ? Object.keys(ref.season.branchStrength || {}).find((c) => unifyBranch(c) === unifyBranch(branch)) || branch : branch;
  const bandText = band ? bandLabel(band) : '';

  const rate = refPeers && refTotal ? (refPeers.placed / refTotal) * 100 : null;

  root.innerHTML = html`
    <div class="compare-tiles elig-tiles">
      ${tile('Eligible', fmt.int(groups.eligible.length), 'companies', `Cut-off met and ${branch} listed or selected`)}
      ${tile('Probably eligible', fmt.int(groups.likely.length), 'companies', 'Cut-off met; branches not listed')}
      ${ref
        ? tile(
            ref === m ? 'Students like you' : `Students like you · ${ref.season.id}`,
            rate !== null ? fmt.pct(rate) : '—',
            'placed',
            refTotal ? `${fmt.int(refPeers.placed)} of ${fmt.int(refTotal)} ${refCode} students with CGPA ${bandText}` : `No ${refCode} students with CGPA ${bandText}`,
          )
        : tile('Students like you', '…', '', 'Loading last season')}
      ${nowPeers
        ? tile(live ? `Placed so far · ${sId}` : `Placed · ${sId}`, fmt.int(nowPeers.placed), 'students', `${branch} students with CGPA ${bandText}`)
        : tile('Not eligible', fmt.int(groups.out.length), 'companies', nextCut !== null ? `${unlockNext} more at CGPA ${fmt.n2(nextCut)}` : 'Below a cut-off or branch not open')}
    </div>
    ${refTotal && refTotal < 10 ? html`<p class="elig-note">Only ${refTotal} ${refCode} students had a CGPA of ${bandText} in ${ref.season.id}, so read that rate with care.</p>` : ''}

    <div class="section-title"><h2>Students like you</h2><p>${refCode} · CGPA ${bandText}${ref && ref !== m ? ` · ${ref.season.id} season` : ''}</p></div>
    ${ref ? peersSection(ref, refPeers, { branch: refCode, bandText, refTotal, ctx, nowPeers, m }) : html`<div class="skeleton" style="height:320px"></div>`}

    <div class="section-title"><h2>Companies</h2><p>${live ? `${sId} season so far` : `${sId} season`} · for CGPA ${fmt.n2(cgpa)}, ${branch}</p></div>
    <div class="toolbar elig-toolbar">
      <div class="chips" role="group" aria-label="Profile">
        ${['all', ...CATEGORIES].map(
          (k) => html`<button class="chip" type="button" data-cat="${k}" aria-pressed="${state.cat === k}">${k !== 'all' ? html`<i class="key ${catClass(k)}"></i>` : ''}${k === 'all' ? 'All profiles' : k}</button>`,
        )}
      </div>
    </div>
    ${nextCut !== null
      ? html`<div class="notice elig-unlock">A CGPA of <b>${fmt.n2(nextCut)}</b> (${fmt.n2(nextCut - cgpa)} more) would open up <b>${unlockNext}</b> more ${unlockNext === 1 ? 'company' : 'companies'}.</div>`
      : ''}
    <div data-tables></div>
    <p class="elig-foot">
      Based on the CGPA cut-off and branches listed for each drive and on who was selected. Where a drive lists no branches,
      ${prev ? `last season's list or ` : ''}selections from your branch fill the gap. Criteria change between drives, so always check the official notice.
      ${conversions ? `${conversions} ${conversions === 1 ? 'company that only converted its interns is' : 'companies that only converted their interns are'} left out.` : ''}
      ${hidden ? `${hidden} more ${hidden === 1 ? 'company has' : 'companies have'} no criteria on record and selected no one from ${branch}.` : ''}
    </p>
  `;

  const tables = root.querySelector('[data-tables]');
  const paintTables = () => {
    const keep = (r) => state.cat === 'all' || rowCats(r).includes(state.cat);
    const opts = { m, ctx, branch, cgpa, band, prev };
    const openOut = tables.querySelector('details.elig-group')?.open;
    tables.innerHTML = html`
      ${groupTable('eligible', 'Eligible', groups.eligible.filter(keep), opts)}
      ${groupTable('likely', 'Probably eligible', groups.likely.filter(keep), opts)}
      ${groupTable('out', 'Not eligible', groups.out.filter(keep), opts)}
    `.toString();
    if (openOut) tables.querySelector('details.elig-group').open = true;
  };
  paintTables();
  tables.addEventListener('click', (e) => {
    const b = e.target.closest('[data-expand]');
    if (!b) return;
    state.expanded[b.dataset.expand] = !state.expanded[b.dataset.expand];
    paintTables();
  });
  for (const chip of root.querySelectorAll('[data-cat]')) {
    chip.addEventListener('click', () => {
      state.cat = chip.dataset.cat;
      for (const c of root.querySelectorAll('[data-cat]')) c.setAttribute('aria-pressed', String(c === chip));
      paintTables();
    });
  }

  if (ref && bandsRef) drawPeerChart(root.querySelector('#elig-chart'), ref, bandsRef, branch, bandI);
}

function bandLabel(band) {
  if (band.min === null) return `below ${fmt.n1(band.max)}`;
  if (band.max === null) return `${fmt.n1(band.min)} and above`;
  return `${band.min.toFixed(1)}–${band.max.toFixed(1)}`;
}

function tile(label, value, unit, note) {
  return html`<div class="panel tile elig-tile">
    <div class="tile-label">${label}</div>
    <div class="tile-value">${value}${unit ? html`<small>${unit}</small>` : ''}</div>
    ${note ? html`<div class="tile-note" title="${note}">${note}</div>` : ''}
  </div>`;
}

function peersSection(ref, refPeers, { branch, bandText, refTotal, ctx, nowPeers, m }) {
  const sId = ref.season.id;
  const where = (list, seasonId) =>
    list.length
      ? html`<div class="mini-logos">${list.slice(0, 14).map(
          ({ company, n }) => html`<a href="${ctx.hrefFor(seasonId, 'companies', company.slug)}" title="${company.name}: ${n} ${n === 1 ? 'offer' : 'offers'}">${raw(logoHtml(company, 'sm'))}${company.name.length > 18 ? `${company.name.slice(0, 17)}…` : company.name} · ${n}</a>`,
        )}${list.length > 14 ? html`<span class="muted elig-more">+${list.length - 14} more</span>` : ''}</div>`
      : html`<p class="muted">No offers yet.</p>`;
  return html`<div class="grid-2 elig-peers">
    <section class="panel chart-card">
      <header><div><h3>Placement rate by CGPA · ${branch}</h3><p>Share of ${branch} students in each CGPA band with an offer, ${sId} season · your band highlighted</p></div></header>
      <div class="chart-box"><canvas id="elig-chart" role="img" aria-label="Placement rate by CGPA band for ${branch}, ${sId} season"></canvas></div>
      <details class="elig-table-toggle"><summary>See the numbers</summary><div data-band-table></div></details>
    </section>
    <section class="panel chart-card elig-where">
      <header><div><h3>Where they got offers</h3><p>${branch} students with CGPA ${bandText}, ${sId} season${refPeers.medianCtc !== null ? ` · median CTC ${fmt.n2(refPeers.medianCtc)} LPA` : ''}</p></div></header>
      <p class="elig-stat"><b>${fmt.int(refPeers.placed)}</b> of ${fmt.int(refTotal)} placed, with ${fmt.int(refPeers.offers)} ${refPeers.offers === 1 ? 'offer' : 'offers'} between them</p>
      ${where(refPeers.companies, sId)}
      ${nowPeers
        ? html`<h4 class="elig-sub">${m.season.live ? `${m.season.id} season so far` : `${m.season.id} season`}</h4>
          <p class="elig-stat"><b>${fmt.int(nowPeers.placed)}</b> placed, ${fmt.int(nowPeers.offers)} ${nowPeers.offers === 1 ? 'offer' : 'offers'}${nowPeers.medianCtc !== null ? ` · median CTC ${fmt.n2(nowPeers.medianCtc)} LPA` : ''}</p>
          ${where(nowPeers.companies, m.season.id)}`
        : ''}
    </section>
  </div>`;
}

function drawPeerChart(canvas, ref, bandsRef, branch, mine) {
  if (!canvas) return;
  const p = palette();
  const rows = bandsRef.bands.map((band, i) => {
    const total = bandsRef.counts[i];
    const placed = peers(ref, branch, band).placed;
    return { band, total, placed, pct: total ? (placed / total) * 100 : 0 };
  });
  barChart(canvas, {
    labels: rows.map((r) => (r.band.min === null ? `<${fmt.n1(r.band.max)}` : r.band.max === null ? `${fmt.n1(r.band.min)}+` : r.band.min.toFixed(1))),
    datasets: [{ label: '% placed', data: rows.map((r) => +r.pct.toFixed(1)), color: rows.map((_, i) => (i === mine ? p.measure : p.prev)) }],
    max: 100,
    tickFormat: (v) => `${v}%`,
    tipLabels: (v, i) => (i === mine ? `${Math.round(v)}%` : ''),
    tooltipTitle: (i) => `CGPA ${bandLabel(rows[i].band)}${i === mine ? ' · your band' : ''}`,
    valueFormat: (v, i) => `${fmt.n1(v)}% — ${rows[i].placed} of ${rows[i].total} placed${rows[i].total < 10 ? ' (small group)' : ''}`,
  });
  const table = canvas.closest('.chart-card').querySelector('[data-band-table]');
  table.innerHTML = html`<table class="elig-band-table">
    <thead><tr><th>CGPA</th><th class="r">Students</th><th class="r">Placed</th><th class="r">Rate</th></tr></thead>
    <tbody>${rows.map(
      (r, i) => html`<tr class="${i === mine ? 'is-mine' : ''}"><td>${bandLabel(r.band)}</td><td class="r">${fmt.int(r.total)}</td><td class="r">${fmt.int(r.placed)}</td><td class="r">${r.total ? fmt.pct(r.pct) : '—'}</td></tr>`,
    )}</tbody>
  </table>`.toString();
}

function rowCats(r) {
  const cats = r.roles.length ? r.roles.map((x) => x.cat) : r.company.catsPresent;
  return [...new Set(cats)];
}

const SORT = (a, b) => b.fromBranch - a.fromBranch || b.company.count - a.company.count || (b.company.maxCtc || 0) - (a.company.maxCtc || 0) || a.company.name.localeCompare(b.company.name);

function groupTable(key, title, rows, { m, ctx, branch, cgpa, band, prev }) {
  const sorted = [...rows].sort(SORT);
  const shown = state.expanded[key] ? sorted : sorted.slice(0, LIMIT);
  const more = sorted.length > LIMIT
    ? html`<button class="btn btn-sm elig-expand" type="button" data-expand="${key}">${state.expanded[key] ? 'Show fewer' : `Show all ${sorted.length}`}</button>`
    : '';
  const body = sorted.length
    ? html`<div class="table-wrap">
        <table class="elig-table">
          <thead><tr>
            <th>Company</th>
            <th class="r">CGPA cut-off</th>
            <th>Branches</th>
            <th class="r">Highest CTC</th>
            <th class="r">From ${branch}</th>
            <th class="r">Lowest ${branch} CGPA</th>
          </tr></thead>
          <tbody>${shown.map((r) => companyRow(r, { m, ctx, branch, cgpa, band, prev }))}</tbody>
        </table>
      </div>${more}`
    : html`<div class="panel empty">${key === 'out' ? 'Nothing out of reach.' : 'No companies here.'}</div>`;
  const head = html`<span class="elig-group-title"><span class="elig-dot is-${key}"></span>${title}</span> <span class="elig-count">${fmt.int(rows.length)}</span>`;
  if (key === 'out') {
    return html`<details class="elig-group is-${key}"><summary>${head}<span class="muted elig-group-sub">CGPA below the cut-off or branch not open</span></summary>${body}</details>`;
  }
  return html`<section class="elig-group is-${key}"><h3>${head}<span class="muted elig-group-sub">${key === 'eligible' ? 'Cut-off met and your branch listed, or someone from it selected' : 'Cut-off met, but branches not listed (or no criteria on record)'}</span></h3>${body}</section>`;
}

function companyRow(r, { m, ctx, branch, cgpa, band, prev }) {
  const c = r.company;
  const b = unifyBranch(branch);
  const mine = c.offers.filter((o) => unifyBranch(o.branch) === b);
  const cgpas = mine.map((o) => o.cgpa).filter((x) => x !== null);
  const lowest = cgpas.length ? Math.min(...cgpas) : null;
  const near = band ? mine.filter((o) => o.cgpa !== null && (band.min === null || o.cgpa >= band.min - 1e-9) && (band.max === null || o.cgpa < band.max - 1e-9)).length : 0;
  const prevC = prev?.companyByKey.get(c.key);
  const prevFrom = prevC ? prevC.offers.filter((o) => unifyBranch(o.branch) === b).length : null;
  const roleNames = r.roles.length ? [...new Set(r.roles.map((x) => x.role).filter(Boolean))] : c.roleNames;
  const roles = roleNames.slice(0, 2).join(' · ') + (roleNames.length > 2 ? ` +${roleNames.length - 2}` : '');

  let cutCell;
  if (r.status === 'below') cutCell = html`<b class="elig-short">${fmt.n2(r.cutoff)}</b><span class="sub">${fmt.n2(r.cutoff - cgpa)} short</span>`;
  else if (r.roles.length) cutCell = r.cutoff !== null ? fmt.n2(r.cutoff) : html`<span class="muted">None listed</span>`;
  else cutCell = html`<span class="muted">Not on record</span>`;

  // This season's list if the drive gave one; otherwise what filled the gap.
  const prevNote = r.prevListing && prev ? html`<span class="sub">${prev.season.id}: ${r.prevListing}</span>` : '';
  let branchCell;
  if (r.status === 'branch') {
    branchCell = html`<span class="elig-short">Not open to ${branch}</span>${r.listing ? html`<span class="sub">${describeEligibility(r.listing)}</span>` : prevNote}`;
  } else if (r.listing) {
    branchCell = html`${describeEligibility(r.listing)}`;
  } else if (r.branchSource === 'selected') {
    branchCell = html`<span class="muted">${branch} students selected</span>${prevNote}`;
  } else {
    branchCell = html`<span class="muted">Not listed</span>${prevNote}`;
  }

  return html`<tr>
    <td>
      <a class="company-link" href="${ctx.hrefFor(m.season.id, 'companies', c.slug)}">${raw(logoHtml(c, 'sm'))}${c.name}</a>
      <span class="sub elig-roles" title="${roleNames.join(', ')}">${roles || '—'}</span>${r.notes.length ? html`<span class="sub">${r.notes.map((n) => html`<span class="tag elig-tag">${n}</span>`)}</span>` : ''}
    </td>
    <td class="r">${cutCell}</td>
    <td class="wrap-cell">${branchCell}</td>
    <td class="r">${c.maxCtc !== null ? fmt.n2(c.maxCtc) : '—'}</td>
    <td class="r">${fmt.int(mine.length)}${near ? html`<span class="sub">${near} near your CGPA</span>` : ''}${prevFrom ? html`<span class="sub">${prevFrom} in ${prev.season.id}</span>` : ''}</td>
    <td class="r">${fmt.cgpa(lowest)}</td>
  </tr>`;
}
