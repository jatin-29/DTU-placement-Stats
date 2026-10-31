// An internship season (2028 batch): summer internship selections per
// company. Student names are not published, so there is one page.

import { BRANCHES } from '../config.js';
import { barChart, catColor, palette } from '../lib/charts.js';
import { fmt, html, raw } from '../lib/dom.js';
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

export function renderInternships(root, m) {
  const t = m.totals;
  const p = palette();
  const branches = Object.entries(t.branches);
  const top = m.companies[0];

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

    <div class="section-title"><h2>Companies</h2><p>Every company, by selections</p></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Company</th><th>Role</th><th class="r">Selected</th><th class="r">Stipend</th><th>Offer</th><th class="r">CGPA cut-off</th><th>Branches</th></tr></thead>
        <tbody>${m.companies.map(
          (c) => html`<tr>
            <td><span class="company-link">${raw(logoHtml(c, 'sm'))}${c.name}</span></td>
            <td class="wrap-cell"><span class="cat-dot" style="--c:var(--${{ Tech: 'tech', 'Non Tech': 'nontech', Core: 'core' }[c.cat] || 'unknown'})">${c.roles.join(', ') || '—'}</span></td>
            <td class="r"><b>${fmt.int(c.count)}</b></td>
            <td class="r">${c.stipend !== null ? `${fmt.n1(c.stipend)}K/mo` : '—'}</td>
            <td>${c.offer || '—'}${c.ppoCtc ? html`<span class="sub">PPO: ${c.ppoCtc}</span>` : ''}</td>
            <td class="r">${cutoff(c.cgpa)}</td>
            <td class="wrap-cell">${Object.entries(c.branches).map(([b, n]) => `${b === 'MISC' ? 'Other' : b} ${n}`).join(' · ') || '—'}</td>
          </tr>`,
        )}</tbody>
      </table>
    </div>
    <p class="yoy-foot">Selections are counted per company; student names are not published for this batch. “Other” covers branches outside CS, IT and SE. CGPA cut-off: “None” means no cut-off, “—” means it was not recorded.</p>
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
}
