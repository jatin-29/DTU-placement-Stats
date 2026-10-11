import { BRANCHES, CATEGORIES } from '../config.js';
import { barChart, catColor, palette } from '../lib/charts.js';
import { catClass, catVar, fmt, html, raw } from '../lib/dom.js';
import { logoHtml } from '../lib/logos.js';

function tile(label, value, unit, note) {
  return html`<div class="tile">
    <div class="tile-label">${label}</div>
    <div class="tile-value">${value}${unit ? html`<small>${unit}</small>` : ''}</div>
    ${note ? html`<div class="tile-note" title="${note}">${note}</div>` : ''}
  </div>`;
}

export function categoryBar(cats) {
  const total = CATEGORIES.reduce((a, k) => a + cats[k], 0) + (cats.Unknown || 0);
  const keys = [...CATEGORIES, ...(cats.Unknown ? ['Unknown'] : [])];
  return html`
    <div class="catbar" role="img" aria-label="${keys.map((k) => `${k} ${cats[k]}`).join(', ')}">
      ${keys.map((k) => (cats[k] ? html`<span style="flex:${cats[k]};background:${raw(catVar(k))}"></span>` : ''))}
    </div>
    <div class="catlegend">
      ${keys.map(
        (k) => html`<span><i class="key ${catClass(k)}"></i>${k === 'Unknown' ? 'Unclassified' : k} <b>${fmt.int(cats[k])}</b> · ${fmt.pct(total ? (cats[k] / total) * 100 : 0)}</span>`,
      )}
    </div>`;
}

function chartCard(id, title, sub, { size = '', legend = '', span = false } = {}) {
  return html`<section class="panel chart-card ${span ? 'span-2' : ''}">
    <header><div><h3>${title}</h3>${sub ? html`<p>${sub}</p>` : ''}</div></header>
    ${legend ? raw(legend) : ''}
    <div class="chart-box ${size}"><canvas id="${id}" role="img" aria-label="${title}"></canvas></div>
  </section>`;
}

export function catLegend(keys = CATEGORIES) {
  return `<div class="legend">${keys.map((k) => `<span><i class="key ${catClass(k)}"></i>${k}</span>`).join('')}</div>`;
}

export function branchMatrix(m, ctx) {
  const rows = m.branches.filter((b) => b.offers > 0 || b.strength);
  const sorted = [...rows].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.offers - a.offers);
  const t = m.totals;
  const sId = m.season.id;
  const catCell = (b, k) => {
    const c = b.byCat[k];
    return html`<td class="r">${c.count ? html`${fmt.int(c.count)}<span class="sub">${fmt.n1(c.avg)} avg</span>` : '—'}</td>`;
  };
  return html`<div class="table-wrap">
    <table>
      <thead><tr>
        <th>Branch</th><th class="r">Students</th><th class="r">Placed</th><th class="r">% placed</th><th class="r">Offers</th>
        <th class="r"><span class="cat-dot" style="--c:var(--tech)">Tech</span></th>
        <th class="r"><span class="cat-dot" style="--c:var(--nontech)">Non-tech</span></th>
        <th class="r"><span class="cat-dot" style="--c:var(--core)">Core</span></th>
        <th class="r">Avg CTC</th><th class="r">Median</th><th class="r">Highest</th>
      </tr></thead>
      <tbody>
        ${sorted.map(
          (b) => html`<tr>
            <td><a class="company-link" href="${ctx.hrefFor(sId, 'students', null, { branch: b.code })}" title="${BRANCHES[b.code]?.name || b.code}">${b.code}</a><span class="sub">${BRANCHES[b.code]?.short || ''}</span></td>
            <td class="r">${fmt.int(b.strength)}</td>
            <td class="r">${fmt.int(b.placed)}</td>
            <td class="r"><b>${fmt.pct(b.pct)}</b></td>
            <td class="r">${fmt.int(b.offers)}</td>
            ${catCell(b, 'Tech')}${catCell(b, 'Non Tech')}${catCell(b, 'Core')}
            <td class="r">${fmt.n2(b.avg)}</td>
            <td class="r">${fmt.n2(b.median)}</td>
            <td class="r">${fmt.n2(b.max)}</td>
          </tr>`,
        )}
      </tbody>
      <tfoot><tr>
        <td>Total</td>
        <td class="r">${fmt.int(t.batchTotal)}</td>
        <td class="r">${fmt.int(t.placed)}</td>
        <td class="r">${fmt.pct(t.pct)}</td>
        <td class="r">${fmt.int(t.offers)}</td>
        <td class="r">${fmt.int(t.cats.Tech)}</td>
        <td class="r">${fmt.int(t.cats['Non Tech'])}</td>
        <td class="r">${fmt.int(t.cats.Core)}</td>
        <td class="r">${fmt.n2(t.avgCtc)}</td>
        <td class="r">${fmt.n2(t.medianCtc)}</td>
        <td class="r">${fmt.n2(t.maxCtc)}</td>
      </tr></tfoot>
    </table>
  </div>`;
}

function categorySummary(m) {
  const rows = CATEGORIES.map((k) => {
    const offers = m.offers.filter((o) => o.cat === k);
    const v = offers.map((o) => o.ctc).filter((x) => x !== null).sort((a, b) => a - b);
    const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    const med = v.length ? (v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
    const companies = new Set(offers.map((o) => o.companyKey)).size;
    return { k, n: offers.length, avg, med, max: v.length ? v[v.length - 1] : null, companies };
  });
  return html`<div class="table-wrap" style="box-shadow:none">
    <table>
      <thead><tr><th>Category</th><th class="r">Offers</th><th class="r">Companies</th><th class="r">Avg</th><th class="r">Median</th><th class="r">Highest</th></tr></thead>
      <tbody>${rows.map(
        (r) => html`<tr>
          <td><span class="cat-dot" style="--c:${raw(catVar(r.k))}">${r.k}</span></td>
          <td class="r">${fmt.int(r.n)}</td><td class="r">${fmt.int(r.companies)}</td>
          <td class="r">${fmt.n2(r.avg)}</td><td class="r">${fmt.n2(r.med)}</td><td class="r">${fmt.n2(r.max)}</td>
        </tr>`,
      )}</tbody>
    </table>
  </div>`;
}

export function renderDashboard(root, m, ctx) {
  const t = m.totals;
  const s = m.season;
  const live = s.live;
  const outside = t.placed - t.placedInBatch;
  const topCompanies = m.companies.filter((c) => c.count > 0).slice(0, 15);

  root.innerHTML = html`
    <section class="hero">
      <div class="panel hero-main">
        <div class="hero-label">Students placed</div>
        <div class="hero-value">${fmt.int(t.placedInBatch)}</div>
        <div class="hero-sub">${fmt.pct(t.pct)} of ${fmt.int(t.batchTotal)} B.Tech students · ${fmt.int(t.offers)} offers${outside > 0 ? html` · +${fmt.int(outside)} from other programmes` : ''}</div>
        <div class="meter" role="img" aria-label="${fmt.pct(t.pct)} placed"><span style="width:${Math.min(100, t.pct || 0).toFixed(1)}%"></span></div>
        ${categoryBar(t.cats)}
      </div>
      <div class="tiles">
        ${tile('Total offers', fmt.int(t.offers), '', `${fmt.int(t.multiOffer)} students hold 2+ offers`)}
        ${tile(live ? 'Companies visited' : 'Recruiting companies', fmt.int(t.companiesVisited), '', live ? `${fmt.int(t.companiesWithOffers)} with selections · ${fmt.int(t.companiesOngoing)} ongoing` : 'with recorded offers')}
        ${tile('Highest CTC', fmt.n2(t.maxCtc), 'LPA', t.maxCtcCompany || '')}
        ${tile('Average CTC', fmt.n2(t.avgCtc), 'LPA', 'per offer')}
        ${tile('Median CTC', fmt.n2(t.medianCtc), 'LPA', 'per offer')}
        ${tile('Average stipend', t.avgStipend ? fmt.n1(t.avgStipend) : '—', t.avgStipend ? 'K/mo' : '', 'internship offers')}
      </div>
    </section>

    <div class="section-title"><h2>Branch-wise placements</h2><p>Tech, non-tech and core offers per branch</p></div>
    <div class="grid-2">
      ${chartCard('ch-branch-cat', 'Offers by branch', 'Stacked by category · click a bar to see students', { size: 'is-tall', legend: catLegend() })}
      ${chartCard('ch-branch-pct', 'Placement rate by branch', 'Share of each branch with at least one offer', { size: 'is-tall' })}
    </div>
    <div style="margin-top:14px">${branchMatrix(m, ctx)}</div>

    <div class="section-title"><h2>Recruiters</h2><p>${live ? 'Updates automatically' : 'Final numbers for the season'}</p></div>
    <div class="grid-2">
      ${chartCard('ch-top', 'Top recruiters by intake', 'Offers per company · colour shows the main profile · click to open', { size: 'is-tall', legend: catLegend() })}
      <section class="panel chart-card">
        <header><div><h3>Highest packages</h3><p>Top CTC offers this season</p></div></header>
        ${topPackages(m, ctx)}
      </section>
    </div>

    <div class="section-title"><h2>Packages & profiles</h2><p>CTC in lakhs per annum (LPA)</p></div>
    <div class="grid-2">
      ${chartCard('ch-ctc', 'CTC distribution', 'Number of offers in each CTC range (LPA)', { legend: catLegend() })}
      <section class="panel chart-card">
        <header><div><h3>Tech vs non-tech vs core</h3><p>Offers and CTC (LPA) by profile</p></div></header>
        ${categorySummary(m)}
      </section>
      ${chartCard('ch-cgpa', 'Placement rate by CGPA', 'Share of students in each CGPA band with an offer')}
      ${chartCard('ch-offer', 'Offer types', 'FTE, internship + PPO, internship + FTE…')}
      ${chartCard('ch-branch-ctc', 'Average CTC by branch', 'Mean CTC per offer (LPA)', { size: 'is-tall', span: true })}
    </div>
  `;

  const p = palette();
  const branchRows = m.branches.filter((b) => b.offers > 0).sort((a, b) => b.offers - a.offers);
  const toStudents = (code) => ctx.navigate(ctx.hrefFor(s.id, 'students', null, { branch: code }));

  barChart(root.querySelector('#ch-branch-cat'), {
    labels: branchRows.map((b) => b.code),
    datasets: CATEGORIES.map((k) => ({ label: k, data: branchRows.map((b) => b.byCat[k].count), color: catColor(p, k) })),
    horizontal: true,
    stacked: true,
    tipLabels: (v) => fmt.int(v),
    tooltipTitle: (i) => `${branchRows[i].code} · ${BRANCHES[branchRows[i].code]?.name || ''}`,
    valueFormat: (v) => `${fmt.int(v)} offers`,
    onClick: (i) => toStudents(branchRows[i].code),
  });

  const pctRows = m.branches.filter((b) => b.pct !== null).sort((a, b) => b.pct - a.pct);
  barChart(root.querySelector('#ch-branch-pct'), {
    labels: pctRows.map((b) => b.code),
    datasets: [{ label: '% placed', data: pctRows.map((b) => +b.pct.toFixed(1)), color: p.measure }],
    horizontal: true,
    max: 100,
    tickFormat: (v) => `${v}%`,
    tipLabels: (v) => `${fmt.n1(v)}%`,
    tooltipTitle: (i) => `${pctRows[i].code} · ${BRANCHES[pctRows[i].code]?.name || ''}`,
    valueFormat: (v, i) => `${fmt.n1(v)}% — ${pctRows[i].placed} of ${pctRows[i].strength} placed`,
    onClick: (i) => toStudents(pctRows[i].code),
  });

  barChart(root.querySelector('#ch-top'), {
    labels: topCompanies.map((c) => c.name),
    datasets: [{ label: 'Offers', data: topCompanies.map((c) => c.count), color: topCompanies.map((c) => catColor(p, c.mainCat)) }],
    horizontal: true,
    tipLabels: (v) => fmt.int(v),
    valueFormat: (v, i) => `${fmt.int(v)} offers · ${topCompanies[i].mainCat}${topCompanies[i].maxCtc ? ` · up to ${fmt.n2(topCompanies[i].maxCtc)} LPA` : ''}`,
    onClick: (i) => ctx.navigate(ctx.hrefFor(s.id, 'companies', topCompanies[i].slug)),
  });

  barChart(root.querySelector('#ch-ctc'), {
    labels: m.ctcBuckets.map((b) => b.label),
    datasets: CATEGORIES.map((k) => ({ label: k, data: m.ctcBuckets.map((b) => b.cats[k]), color: catColor(p, k) })),
    stacked: true,
    tipLabels: (v) => fmt.int(v),
    tooltipTitle: (i) => `${m.ctcBuckets[i].label} LPA`,
    valueFormat: (v) => `${fmt.int(v)} offers`,
  });

  const bands = m.cgpaBands.filter((b) => b.total);
  if (bands.length) {
    barChart(root.querySelector('#ch-cgpa'), {
      labels: bands.map((b) => b.label),
      datasets: [{ label: '% placed', data: bands.map((b) => +(b.pct || 0).toFixed(1)), color: p.measure }],
      max: 100,
      tickFormat: (v) => `${v}%`,
      tipLabels: (v) => `${Math.round(v)}%`,
      tooltipTitle: (i) => `CGPA ${bands[i].label}`,
      valueFormat: (v, i) => `${fmt.n1(v)}% — ${bands[i].placed} of ${bands[i].total} students`,
    });
  }

  const ot = m.offerTypes.slice(0, 8);
  barChart(root.querySelector('#ch-offer'), {
    labels: ot.map(([k]) => k),
    datasets: [{ label: 'Offers', data: ot.map(([, n]) => n), color: p.measure }],
    horizontal: true,
    tipLabels: (v) => fmt.int(v),
    valueFormat: (v) => `${fmt.int(v)} offers (${fmt.pct((v / t.offers) * 100)})`,
  });

  const ctcRows = m.branches.filter((b) => b.avg !== null && b.offers >= 3).sort((a, b) => b.avg - a.avg);
  barChart(root.querySelector('#ch-branch-ctc'), {
    labels: ctcRows.map((b) => b.code),
    datasets: [{ label: 'Average CTC', data: ctcRows.map((b) => +b.avg.toFixed(2)), color: p.measure }],
    horizontal: true,
    tipLabels: (v) => fmt.n1(v),
    tooltipTitle: (i) => `${ctcRows[i].code} · ${BRANCHES[ctcRows[i].code]?.name || ''}`,
    valueFormat: (v, i) => `${fmt.n2(v)} LPA avg · median ${fmt.n2(ctcRows[i].median)} · max ${fmt.n2(ctcRows[i].max)}`,
    onClick: (i) => toStudents(ctcRows[i].code),
  });
}

function topPackages(m, ctx) {
  const seen = new Set();
  const top = [...m.offers]
    .filter((o) => o.ctc !== null)
    .sort((a, b) => b.ctc - a.ctc)
    .filter((o) => {
      const k = `${o.companyKey}|${o.role}|${o.ctc}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 10);
  return html`<div class="table-wrap" style="box-shadow:none">
    <table>
      <thead><tr><th>Company</th><th>Role</th><th class="r">CTC</th><th class="r">Selected</th></tr></thead>
      <tbody>${top.map((o) => {
        const c = m.companyByKey.get(o.companyKey);
        const n = m.offers.filter((x) => x.companyKey === o.companyKey && x.ctc === o.ctc && x.role === o.role).length;
        return html`<tr>
          <td><a class="company-link" href="${ctx.hrefFor(m.season.id, 'companies', c.slug)}">${raw(logoHtml(c, 'sm'))}${c.name}</a></td>
          <td class="wrap-cell">${o.role || '—'}<span class="sub">${o.offer}</span></td>
          <td class="r"><b>${fmt.n2(o.ctc)}</b></td>
          <td class="r">${fmt.int(n)}</td>
        </tr>`;
      })}</tbody>
    </table>
  </div>`;
}
