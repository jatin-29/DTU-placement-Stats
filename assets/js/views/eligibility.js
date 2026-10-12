// "Where could I get in?" — enter a CGPA and branch, see which companies were
// open to you and how students like you did.

import { BRANCHES, CATEGORIES, SEASON_IDS } from '../config.js';
import { barChart, destroyChart, palette } from '../lib/charts.js';
import { catClass, debounce, fmt, html, raw } from '../lib/dom.js';
import { logoHtml } from '../lib/logos.js';
import { bandIndex, bandTotals, checkCompany, conversionOffers, describeEligibility, isConversion, peers, unifyBranch } from '../lib/eligibility.js';

const STORE = 'eligibility';
const LIMIT = 12;
const state = { cgpa: '', branch: '', cat: 'all', expanded: {}, loaded: false };
let peerChart = null;

function remember() {
  try {
    if (state.cgpa || state.branch) localStorage.setItem(STORE, JSON.stringify({ cgpa: state.cgpa, branch: state.branch }));
    else localStorage.removeItem(STORE);
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

function previousId(m) {
  return SEASON_IDS[SEASON_IDS.indexOf(m.season.id) + 1] || null;
}

// The archived season with per-branch CGPA counts: this one, or the one before it.
function referenceModel(m, ctx) {
  if (m.season.branchCgpa) return m;
  const id = previousId(m);
  return id ? ctx.models[id] || null : null;
}

export function renderEligibility(root, m, ctx) {
  if (!state.loaded) {
    recall();
    state.loaded = true;
  }
  // The live URL, not ctx.route: the page rewrites its own query as you type.
  const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
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
        <button class="btn elig-clear" type="button" data-clear ${state.cgpa || state.branch ? '' : 'hidden'}>Clear</button>
      </div>
      <p class="elig-hint" id="elig-hint" role="alert" data-hint></p>
    </section>
    <p class="sr-only" role="status" aria-live="polite" data-live></p>
    <div data-results></div>
  `;

  const results = root.querySelector('[data-results]');
  const hint = root.querySelector('[data-hint]');
  const live = root.querySelector('[data-live]');
  const input = root.querySelector('[data-f="cgpa"]');
  const select = root.querySelector('[data-f="branch"]');
  const clear = root.querySelector('[data-clear]');

  const paint = () => {
    const cgpa = readCgpa();
    const branch = codes.find((c) => unifyBranch(c) === state.branch);
    const invalid = state.cgpa !== '' && cgpa === null;
    hint.textContent = invalid ? 'Enter a CGPA above 0, up to 10.' : '';
    input.setAttribute('aria-invalid', String(invalid));
    clear.hidden = !(state.cgpa || state.branch);
    if (cgpa === null || !branch) {
      destroyChart(peerChart);
      peerChart = null;
      results.innerHTML = html`<div class="elig-empty">
        <p>Your results show up here. Nothing you type is sent anywhere: it stays in this browser and in the page link, so you can share it.</p>
      </div>`.toString();
      live.textContent = '';
      return;
    }
    live.textContent = renderResults(results, m, ctx, { cgpa, branch });
  };
  paint();

  const sync = () => {
    remember();
    const branch = codes.find((c) => unifyBranch(c) === state.branch);
    const query = readCgpa() !== null && branch ? { cgpa: state.cgpa, branch } : null;
    // Keep the URL shareable without re-rendering (that would steal focus from the input).
    history.replaceState(null, '', ctx.hrefFor(m.season.id, 'eligibility', null, query));
  };
  // State and URL follow every keystroke; the results catch up after a pause,
  // and only if this render is still on the page.
  const later = debounce(() => {
    if (results.isConnected) paint();
  }, 250);

  input.addEventListener('input', () => {
    state.cgpa = input.value.trim();
    sync();
    later();
  });
  select.addEventListener('change', () => {
    state.branch = unifyBranch(select.value);
    sync();
    paint();
  });
  clear.addEventListener('click', () => {
    Object.assign(state, { cgpa: '', branch: '', expanded: {} });
    input.value = '';
    select.value = '';
    sync();
    paint();
    input.focus();
  });
}

function bandLabel(band) {
  if (band.min === null && band.max === null) return 'any';
  if (band.min === null) return `below ${band.max.toFixed(1)}`;
  if (band.max === null) return `${band.min.toFixed(1)} and above`;
  return `${band.min.toFixed(1)}–${band.max.toFixed(1)}`;
}

function shortBand(band) {
  if (band.min === null && band.max === null) return 'All';
  if (band.min === null) return `<${band.max.toFixed(1)}`;
  if (band.max === null) return `${band.min.toFixed(1)}+`;
  return `${band.min.toFixed(1)}–${band.max.toFixed(1)}`;
}

function tile(label, value, unit, note) {
  return html`<div class="panel tile elig-tile">
    <div class="tile-label">${label}</div>
    <div class="tile-value">${value}${unit ? html`<small>${unit}</small>` : ''}</div>
    ${note ? html`<div class="tile-note" title="${note}">${note}</div>` : ''}
  </div>`;
}

// Draws the results; returns a one-line summary for screen readers.
function renderResults(root, m, ctx, { cgpa, branch }) {
  const sId = m.season.id;
  const prevId = previousId(m);
  const prev = prevId ? ctx.models[prevId] || null : null;
  const prevFailed = prevId && !prev && ctx.errors?.[prevId];
  const ref = referenceModel(m, ctx);
  const live = !!m.season.live;
  const would = live ? 'would clear' : 'would have cleared';

  // ----- companies -----
  const check = (c, g) => checkCompany(c, { cgpa: g, branch }, prev?.companyByKey.get(c.key) || null);
  const checks = m.companies.map((c) => check(c, cgpa));
  const groups = {
    eligible: checks.filter((r) => r.status === 'eligible'),
    likely: checks.filter((r) => r.status === 'likely'),
    out: checks.filter((r) => r.status === 'below' || r.status === 'branch'),
  };
  const hidden = checks.filter((r) => r.status === 'unlisted').length;
  const conversions = checks.filter((r) => r.status === 'conversion').length;

  // The next cut-off above this CGPA, and what reaching it would change.
  const below = groups.out.filter((r) => r.status === 'below');
  const nextCut = below.length ? Math.min(...below.map((r) => r.cutoff)) : null;
  let unlock = null;
  if (nextCut !== null) {
    const after = below.filter((r) => r.cutoff <= nextCut + 1e-9).map((r) => check(r.company, nextCut).status);
    const eligible = after.filter((s) => s === 'eligible').length;
    unlock = { eligible, total: eligible + after.filter((s) => s === 'likely').length };
  }

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

  let likeYouTile;
  if (ref && band) {
    likeYouTile = tile(
      ref === m ? 'Students like you' : `Students like you · ${ref.season.id}`,
      rate !== null ? fmt.pct(rate) : '—',
      'placed',
      `${fmt.int(refPeers.placed)} of ${fmt.int(refTotal)} ${refCode} students with CGPA ${bandText}`,
    );
  } else if (prevFailed) {
    likeYouTile = tile('Students like you', '—', '', `Couldn't load the ${prevId} season`);
  } else {
    likeYouTile = tile('Students like you', '…', '', `Loading the ${prevId} season`);
  }

  root.innerHTML = html`
    <div class="compare-tiles elig-tiles">
      ${tile('Eligible', fmt.int(groups.eligible.length), 'companies', `Cut-off met and ${branch} open`)}
      ${tile('Probably eligible', fmt.int(groups.likely.length), 'companies', 'Branch or cut-off not confirmed')}
      ${likeYouTile}
      ${nowPeers
        ? tile(live ? `Placed so far · ${sId}` : `Placed · ${sId}`, fmt.int(nowPeers.placed), 'students', `${branch} students with CGPA ${bandText}`)
        : tile('Not eligible', fmt.int(groups.out.length), 'companies', 'Below the cut-off, or other branches only')}
    </div>
    ${live
      ? html`<p class="elig-note">This season's drive notes rarely list branches, so a company moves to Eligible once someone from your branch is selected there. Until then, last season's list is shown as a hint.</p>`
      : ''}

    <div class="section-title"><h2>Students like you</h2><p>${refCode} · CGPA ${bandText || '—'}${ref && ref !== m ? ` · ${ref.season.id} season` : ''}</p></div>
    ${ref && band
      ? peersSection(ref, refPeers, { branch: refCode, bandText, refTotal, ctx, nowPeers, m })
      : prevFailed
        ? html`<div class="notice">Couldn't load the ${prevId} season, so there is nothing to compare with. Reload the page to try again.</div>`
        : html`<div class="skeleton" style="height:320px"></div>`}

    <div class="section-title"><h2>Companies</h2><p>${live ? `${sId} season so far` : `${sId} season`} · CGPA ${fmt.n2(cgpa)}, ${branch}</p></div>
    <div class="toolbar elig-toolbar">
      <div class="chips" role="group" aria-label="Profile">
        ${['all', ...CATEGORIES].map(
          (k) => html`<button class="chip" type="button" data-cat="${k}" aria-pressed="${String(state.cat === k)}">${k !== 'all' ? html`<i class="key ${catClass(k)}"></i>` : ''}${k === 'all' ? 'All profiles' : k}</button>`,
        )}
      </div>
    </div>
    ${unlock && unlock.total
      ? html`<div class="notice elig-unlock">A CGPA of <b>${fmt.n2(nextCut)}</b> (${fmt.n2(nextCut - cgpa)} more) ${would} the cut-off at <b>${unlock.total}</b> more ${unlock.total === 1 ? 'company' : 'companies'}${unlock.eligible ? `, ${unlock.eligible} of them confirmed open to ${branch}` : ''}.</div>`
      : ''}
    <div data-tables></div>
    <p class="elig-foot">
      Eligible means the drive's CGPA cut-off is met (or, where none is on record, someone was selected at or below your CGPA) and your branch is open: listed for the drive, or someone from it was selected.
      ${prev ? `Last season's list for the same company is shown as a hint but never decides. ` : ''}Criteria change between drives, so always check the official notice.
      ${conversions ? `${conversions} ${conversions === 1 ? 'company that hired only through intern conversions or off-campus challenges is' : 'companies that hired only through intern conversions or off-campus challenges are'} left out.` : ''}
      ${hidden ? `${hidden} more ${hidden === 1 ? 'company has' : 'companies have'} no criteria on record and selected no one from ${branch}.` : ''}
    </p>
  `;

  const tables = root.querySelector('[data-tables]');
  const opts = { m, ctx, branch, cgpa, band, prev };
  const paintTables = () => {
    const keep = (r) => state.cat === 'all' || rowCats(r).includes(state.cat);
    const outOpen = tables.querySelector('details.elig-group')?.open;
    tables.innerHTML = html`
      ${groupTable('eligible', 'Eligible', groups.eligible.filter(keep), opts)}
      ${groupTable('likely', 'Probably eligible', groups.likely.filter(keep), opts)}
      ${groupTable('out', 'Not eligible', groups.out.filter(keep), opts)}
    `.toString();
    if (outOpen) tables.querySelector('details.elig-group').open = true;
  };
  paintTables();
  tables.addEventListener('click', (e) => {
    const b = e.target.closest('[data-expand]');
    if (!b) return;
    const key = b.dataset.expand;
    state.expanded[key] = !state.expanded[key];
    paintTables();
    tables.querySelector(`[data-expand="${key}"]`)?.focus();
  });
  for (const chip of root.querySelectorAll('[data-cat]')) {
    chip.addEventListener('click', () => {
      state.cat = chip.dataset.cat;
      for (const c of root.querySelectorAll('[data-cat]')) c.setAttribute('aria-pressed', String(c === chip));
      paintTables();
    });
  }

  destroyChart(peerChart);
  peerChart = ref && bandsRef && band ? drawPeerChart(root.querySelector('#elig-chart'), ref, bandsRef, refCode, bandI) : null;

  return `${groups.eligible.length} eligible, ${groups.likely.length} probably eligible, ${groups.out.length} not eligible.`;
}

function peersSection(ref, refPeers, { branch, bandText, refTotal, ctx, nowPeers, m }) {
  const sId = ref.season.id;
  const where = (list, seasonId) =>
    list.length
      ? html`<div class="mini-logos">${list.slice(0, 14).map(
          ({ company, n }) => html`<a href="${ctx.hrefFor(seasonId, 'companies', company.slug)}" title="${company.name}: ${n} ${n === 1 ? 'offer' : 'offers'}">${raw(logoHtml(company, 'sm'))}${company.name.length > 18 ? `${company.name.slice(0, 17)}…` : company.name} · ${n}</a>`,
        )}${list.length > 14 ? html`<span class="muted elig-more">+${list.length - 14} more</span>` : ''}</div>`
      : html`<p class="muted">No offers yet.</p>`;
  const pct = refTotal ? Math.round((refPeers.placed / refTotal) * 100) : 0;
  return html`<div class="grid-2 elig-peers">
    <section class="panel chart-card">
      <header><div><h3>Placement rate by CGPA · ${branch}</h3><p>Share of ${branch} students in each CGPA band with an offer, ${sId} season · your band highlighted</p></div></header>
      <div class="chart-box"><canvas id="elig-chart" role="img" aria-label="Placement rate by CGPA band for ${branch}, ${sId} season. Your band, ${bandText}: ${pct}% (${refPeers.placed} of ${refTotal}). The numbers are in the table below."></canvas></div>
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
  if (!canvas) return null;
  const p = palette();
  const rows = bandsRef.bands.map((band, i) => {
    const total = bandsRef.counts[i];
    const placed = peers(ref, branch, band).placed;
    return { band, total, placed, pct: total ? (placed / total) * 100 : 0 };
  });
  const chart = barChart(canvas, {
    labels: rows.map((r) => shortBand(r.band)),
    datasets: [{ label: '% placed', data: rows.map((r) => +r.pct.toFixed(1)), color: rows.map((_, i) => (i === mine ? p.measure : p.prev)) }],
    max: 100,
    tickFormat: (v) => `${v}%`,
    tipLabels: (v, i) => (i === mine ? `${Math.round(v)}%` : ''),
    tooltipTitle: (i) => `CGPA ${bandLabel(rows[i].band)}${i === mine ? ' · your band' : ''}`,
    valueFormat: (v, i) => `${fmt.n1(v)}% — ${rows[i].placed} of ${rows[i].total} placed`,
  });
  const table = canvas.closest('.chart-card').querySelector('[data-band-table]');
  table.innerHTML = html`<table class="elig-band-table">
    <thead><tr><th>CGPA</th><th class="r">Students</th><th class="r">Placed</th><th class="r">Rate</th></tr></thead>
    <tbody>${rows.map(
      (r, i) => html`<tr class="${i === mine ? 'is-mine' : ''}"><td>${bandLabel(r.band)}${i === mine ? ' (your band)' : ''}</td><td class="r">${fmt.int(r.total)}</td><td class="r">${fmt.int(r.placed)}</td><td class="r">${r.total ? fmt.pct(r.pct) : '—'}</td></tr>`,
    )}</tbody>
  </table>`.toString();
  return chart;
}

function rowCats(r) {
  const cats = r.roles.length ? r.roles.map((x) => x.cat) : r.company.catsPresent;
  return [...new Set(cats)];
}

const SORT = (a, b) => b.fromBranch - a.fromBranch || b.company.count - a.company.count || (b.company.maxCtc || 0) - (a.company.maxCtc || 0) || a.company.name.localeCompare(b.company.name);

const GROUP_NOTES = {
  eligible: 'Cut-off met, and your branch is listed for the drive or someone from it was selected',
  likely: 'Nothing rules you out, but the branches or the cut-off are not on record',
  out: 'Below the cut-off, or the drive listed other branches',
};

function groupTable(key, title, rows, opts) {
  const sorted = [...rows].sort(SORT);
  const open = !!state.expanded[key];
  const shown = open ? sorted : sorted.slice(0, LIMIT);
  const more =
    sorted.length > LIMIT
      ? html`<button class="btn btn-sm elig-expand" type="button" data-expand="${key}" aria-expanded="${String(open)}">${open ? 'Show fewer' : `Show all ${sorted.length}`}</button>`
      : '';
  const body = sorted.length
    ? html`<div class="table-wrap">
        <table class="elig-table">
          <thead><tr>
            <th>Company</th>
            <th class="r">CGPA cut-off</th>
            <th>Branches</th>
            <th class="r">Highest CTC</th>
            <th class="r">From ${opts.branch}</th>
            <th class="r">Lowest ${opts.branch} CGPA</th>
          </tr></thead>
          <tbody>${shown.map((r) => companyRow(r, opts))}</tbody>
        </table>
      </div>${more}`
    : html`<div class="panel empty">${key === 'out' ? 'Nothing out of reach.' : 'No companies here.'}</div>`;
  const head = html`<span class="elig-group-title"><span class="elig-dot is-${key}" aria-hidden="true"></span>${title}</span> <span class="elig-count">${fmt.int(rows.length)}</span>`;
  if (key === 'out') {
    return html`<details class="elig-group is-${key}"><summary><h3 class="elig-group-head">${head}</h3><span class="muted elig-group-sub">${GROUP_NOTES[key]}</span><span class="elig-toggle" aria-hidden="true"></span></summary>${body}</details>`;
  }
  return html`<section class="elig-group is-${key}"><h3>${head}<span class="muted elig-group-sub">${GROUP_NOTES[key]}</span></h3>${body}</section>`;
}

function companyRow(r, { m, ctx, branch, cgpa, band, prev }) {
  const c = r.company;
  const b = unifyBranch(branch);
  // Selections through campus drives (not conversions or off-campus routes).
  const isConv = conversionOffers(c);
  const mine = c.offers.filter((o) => !isConv(o) && unifyBranch(o.branch) === b);
  const cgpas = mine.map((o) => o.cgpa).filter((x) => x !== null);
  const lowest = cgpas.length ? Math.min(...cgpas) : null;
  const inBand = (g) => g !== null && (band.min === null || g >= band.min - 1e-9) && (band.max === null || g < band.max - 1e-9);
  const near = band ? mine.filter((o) => inBand(o.cgpa)).length : 0;
  const prevC = prev?.companyByKey.get(c.key);
  const prevConv = prevC ? conversionOffers(prevC) : null;
  const prevFrom = prevC ? prevC.offers.filter((o) => !prevConv(o) && unifyBranch(o.branch) === b).length : 0;
  const drives = r.roles.filter((x) => !isConversion(x));
  const roleNames = drives.length ? [...new Set(drives.map((x) => x.role).filter(Boolean))] : c.roleNames;
  const roles = roleNames.join(' · ');

  let cutCell;
  if (r.status === 'below') cutCell = html`<b class="elig-short">${fmt.n2(r.cutoff)}</b><span class="sub">${fmt.n2(r.cutoff - cgpa)} short</span>`;
  else if (r.cutoff === 0) cutCell = 'None';
  else if (r.cutoff !== null) cutCell = fmt.n2(r.cutoff);
  else if (r.cutoffSource === 'selected') cutCell = html`<span class="muted">Not on record</span><span class="sub">selected at ${fmt.cgpa(r.lowestSelected)}</span>`;
  else cutCell = html`<span class="muted">Not on record</span>`;

  // Last season's list, as a hint only (in that season's branch codes).
  let hint = '';
  if (prev && r.prevSays && (r.prevListing || r.branchSource !== 'selected')) {
    const prevCode = Object.keys(prev.season.branchStrength || {}).find((k) => unifyBranch(k) === b) || branch;
    let text = r.prevListing || `${prevCode} students selected`;
    if (r.prevSays === 'no') text += ` (not ${prevCode})`;
    else if (r.prevListing && !r.prevListedYes) text += `; ${prevCode} students selected`;
    hint = html`<span class="sub">${prev.season.id}: ${text}</span>`;
  }
  let branchCell;
  if (r.status === 'branch') {
    branchCell = html`<span class="elig-short">Not open to ${branch}</span>${r.listing ? html`<span class="sub">${describeEligibility(r.listing)}</span>` : ''}`;
  } else if (r.branchSource === 'selected-despite-list') {
    branchCell = html`${r.listing ? describeEligibility(r.listing) : 'Other branches'}<span class="sub">yet ${branch} students were selected</span>`;
  } else if (r.listing) {
    branchCell = html`${describeEligibility(r.listing)}`;
  } else if (r.branchSource === 'selected') {
    branchCell = html`<span class="muted">${branch} students selected</span>${hint}`;
  } else {
    branchCell = html`<span class="muted">Not listed</span>${hint}`;
  }

  return html`<tr>
    <td>
      <a class="company-link" href="${ctx.hrefFor(m.season.id, 'companies', c.slug)}">${raw(logoHtml(c, 'sm'))}${c.name}</a>
      <span class="sub elig-roles">${roles || '—'}</span>${r.notes.length ? html`<span class="sub">${r.notes.map((n) => html`<span class="tag elig-tag">${n}</span>`)}</span>` : ''}
    </td>
    <td class="r">${cutCell}</td>
    <td class="wrap-cell">${branchCell}</td>
    <td class="r">${c.maxCtc !== null ? fmt.n2(c.maxCtc) : '—'}</td>
    <td class="r">${fmt.int(mine.length)}${near ? html`<span class="sub">${near} in your CGPA band</span>` : ''}${prevFrom ? html`<span class="sub">${prevFrom} in ${prev.season.id}</span>` : ''}</td>
    <td class="r">${fmt.cgpa(lowest)}</td>
  </tr>`;
}
