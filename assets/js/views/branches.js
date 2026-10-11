import { BRANCHES, CATEGORIES } from '../config.js';
import { barChart, catColor, palette } from '../lib/charts.js';
import { catClass, fmt, html, raw } from '../lib/dom.js';
import { logoHtml } from '../lib/logos.js';
import { branchMatrix, catLegend } from './dashboard.js';

function branchCard(b, m, ctx) {
  const sId = m.season.id;
  const info = BRANCHES[b.code] || { name: b.code, short: b.code };
  const total = CATEGORIES.reduce((a, k) => a + b.byCat[k].count, 0) || 1;
  return html`<section class="panel branch-card" id="branch-${b.code}">
    <div class="branch-head">
      <div>
        <div class="branch-code">${b.code} <span class="muted" style="font-size:13px;font-weight:600">${info.short !== b.code ? info.short : ''}</span></div>
        <div class="branch-name">${info.name}</div>
      </div>
      <div class="branch-pct">
        <div class="v">${b.pct !== null ? fmt.pct(b.pct) : fmt.int(b.offers)}</div>
        <div class="l">${b.pct !== null ? `${fmt.int(b.placed)} of ${fmt.int(b.strength)} placed` : 'offers'}</div>
      </div>
    </div>
    ${b.pct !== null ? html`<div class="meter" style="margin-top:0"><span style="width:${Math.min(100, b.pct).toFixed(1)}%"></span></div>` : ''}
    <div class="catbar" style="margin-top:0" role="img" aria-label="${CATEGORIES.map((k) => `${k} ${b.byCat[k].count}`).join(', ')}">
      ${CATEGORIES.map((k) => (b.byCat[k].count ? html`<span style="flex:${b.byCat[k].count};background:var(--${{ Tech: 'tech', 'Non Tech': 'nontech', Core: 'core' }[k]})"></span>` : ''))}
    </div>
    <div class="split-rows">
      <div class="split-row muted" style="font-size:12px"><span>Profile</span><span class="r">Offers</span><span class="r">Avg CTC</span></div>
      ${CATEGORIES.map(
        (k) => html`<div class="split-row">
          <span><i class="key ${catClass(k)}"></i>${k}</span>
          <span class="r">${fmt.int(b.byCat[k].count)} <span class="muted">(${fmt.int((b.byCat[k].count / total) * 100)}%)</span></span>
          <span class="r">${b.byCat[k].count ? fmt.n2(b.byCat[k].avg) : '—'}</span>
        </div>`,
      )}
    </div>
    ${b.top.length
      ? html`<div class="mini-logos">${b.top.map(
          ({ company, n }) => html`<a href="${ctx.hrefFor(sId, 'companies', company.slug)}" title="${company.name}: ${n} from ${b.code}">${raw(logoHtml(company, 'sm'))}${company.name.length > 16 ? `${company.name.slice(0, 15)}…` : company.name} · ${n}</a>`,
        )}</div>`
      : ''}
    <div class="branch-foot">
      <span>${fmt.int(b.offers)} offers · avg ${fmt.n1(b.avg)} · max ${fmt.n1(b.max)} LPA</span>
      <a href="${ctx.hrefFor(sId, 'students', null, { branch: b.code })}">Students →</a>
    </div>
  </section>`;
}

export function renderBranches(root, m, ctx) {
  const list = m.branches.filter((b) => b.offers > 0 || b.strength);
  const ordered = [...list].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.offers - a.offers);
  root.innerHTML = html`
    <div class="grid-2">
      <section class="panel chart-card span-2">
        <header><div><h3>Profile mix by branch</h3><p>Share of each branch's offers that are tech, non-tech or core</p></div></header>
        ${raw(catLegend())}
        <div class="chart-box is-tall"><canvas id="ch-mix" role="img" aria-label="Profile mix by branch"></canvas></div>
      </section>
    </div>
    <div class="section-title"><h2>All branches</h2><p>Sorted by placement rate · ${m.season.batch} B.Tech batch</p></div>
    <div class="branch-grid">${ordered.map((b) => branchCard(b, m, ctx))}</div>
    <div class="section-title"><h2>Branch × profile table</h2><p>Offer counts with average CTC (LPA)</p></div>
    ${branchMatrix(m, ctx)}
  `;

  const p = palette();
  const rows = list.filter((b) => b.offers > 0).sort((a, b) => b.byCat.Tech.count / b.offers - a.byCat.Tech.count / a.offers);
  barChart(root.querySelector('#ch-mix'), {
    labels: rows.map((b) => b.code),
    datasets: CATEGORIES.map((k) => ({
      label: k,
      data: rows.map((b) => +((b.byCat[k].count / b.offers) * 100).toFixed(1)),
      color: catColor(p, k),
    })),
    horizontal: true,
    stacked: true,
    max: 100,
    tickFormat: (v) => `${v}%`,
    tooltipTitle: (i) => `${rows[i].code} · ${BRANCHES[rows[i].code]?.name || ''} (${rows[i].offers} offers)`,
    valueFormat: (v, i, di) => `${fmt.n1(v)}% (${rows[i].byCat[CATEGORIES[di]].count})`,
    onClick: (i) => document.getElementById(`branch-${rows[i].code}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
  });
}
