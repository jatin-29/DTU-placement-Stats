import { BRANCHES, CATEGORIES } from '../config.js';
import { barChart, palette } from '../lib/charts.js';
import { fmt, html, raw } from '../lib/dom.js';
import { logoHtml } from '../lib/logos.js';

// The 2K22 batch was CO (Computer Engineering); 2K23 calls it CS.
const unify = (code) => (code === 'CO' ? 'CS' : code);
const label = (code) => (code === 'CS' ? 'CS / CO' : code);

function tile(name, now, before, f, diffFmt = f) {
  const diff = now !== null && before !== null ? now - before : null;
  return html`<div class="panel compare-tile">
    <div class="tile-label">${name}</div>
    <div class="pair">
      <div><div class="yr">2027 so far</div><div class="big">${f(now)}</div></div>
      <div style="text-align:right"><div class="yr">2026 final</div><div class="prev">${f(before)}</div></div>
    </div>
    ${diff !== null ? html`<div class="muted" style="font-size:12.5px;margin-top:4px">${diff >= 0 ? '+' : '−'}${diffFmt(Math.abs(diff))} vs last year</div>` : ''}
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

  // Recruiters present in both seasons
  const common = now.companies
    .filter((c) => before.companyByKey.has(c.key))
    .map((c) => ({ now: c, before: before.companyByKey.get(c.key) }))
    .filter((r) => r.now.count + r.before.count > 0)
    .sort((x, y) => y.now.count + y.before.count - (x.now.count + x.before.count))
    .slice(0, 25);

  root.innerHTML = html`
    <div class="statusbar">
      <h1>2026 vs 2027</h1>
      <span class="sub">Batch 2K22 (final) vs batch 2K23 (season in progress)</span>
    </div>
    <div class="notice">The 2027 season is still running, so its totals will keep growing. Rates are a fair comparison only once the season ends.</div>
    <div class="compare-tiles">
      ${tile('Students placed', a.placedInBatch, b.placedInBatch, fmt.int)}
      ${tile('Placement rate', a.pct, b.pct, pctPts, (v) => `${fmt.n1(v)} pts`)}
      ${tile('Offers', a.offers, b.offers, fmt.int)}
      ${tile('Recruiting companies', a.companiesWithOffers, b.companiesWithOffers, fmt.int)}
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

    <div class="section-title"><h2>Recruiters in both seasons</h2><p>${common.length} companies, by combined offers</p></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Company</th><th class="r">2026 offers</th><th class="r">2027 offers</th><th class="r">2026 highest CTC</th><th class="r">2027 highest CTC</th></tr></thead>
        <tbody>${common.map(
          (r) => html`<tr>
            <td><a class="company-link" href="${ctx.hrefFor('2027', 'companies', r.now.slug)}">${raw(logoHtml(r.now, 'sm'))}${r.now.name}</a></td>
            <td class="r"><a href="${ctx.hrefFor('2026', 'companies', r.before.slug)}">${fmt.int(r.before.count)}</a></td>
            <td class="r"><b>${fmt.int(r.now.count)}</b></td>
            <td class="r">${fmt.n2(r.before.maxCtc)}</td>
            <td class="r">${fmt.n2(r.now.maxCtc)}</td>
          </tr>`,
        )}</tbody>
      </table>
    </div>
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

}
