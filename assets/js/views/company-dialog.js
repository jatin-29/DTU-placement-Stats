import { BRANCHES } from '../config.js';
import { ICONS, catVar, debounce, fmt, html, raw } from '../lib/dom.js';
import { domainFor, logoHtml } from '../lib/logos.js';

const dialog = document.getElementById('company-dialog');
let current = null;
let closeHref = null;

dialog.addEventListener('close', () => {
  const was = current;
  current = null;
  if (was && closeHref && location.hash.includes(`/companies/${encodeURIComponent(was)}`)) {
    history.replaceState(null, '', closeHref);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
  if (e.target.closest('[data-close]')) dialog.close();
});

// Roles: the live Companies tab when the season has one, otherwise grouped from offers.
function roleRows(c, live) {
  if (live && c.roles.length) {
    return c.roles.map((r) => ({
      role: r.role,
      drive: r.drive !== c.name && r.drive !== r.company ? r.drive : '',
      offer: r.offer,
      cat: r.cat,
      ctc: r.ctc,
      base: r.base,
      stipend: r.stipend,
      cgpa: r.cgpa,
      count: r.count,
      notes: r.comments,
    }));
  }
  const groups = new Map();
  for (const o of c.offers) {
    const k = `${o.role}|${o.offer}|${o.ctc}`;
    if (!groups.has(k)) groups.set(k, { role: o.role, offer: o.offer, cat: o.cat, ctc: o.ctc, base: o.base, stipend: o.stipend, cgpa: null, count: 0, notes: o.ctcText || o.stipendText });
    groups.get(k).count++;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function studentRows(c, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return c.offers
    .filter((o) => {
      if (!words.length) return true;
      const hay = `${o.name} ${o.roll} ${o.branch} ${o.role}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => (b.ctc || 0) - (a.ctc || 0) || (b.cgpa || 0) - (a.cgpa || 0) || a.name.localeCompare(b.name));
}

function studentsTable(rows) {
  if (!rows.length) return '<div class="empty">No students listed yet.</div>';
  return html`<table>
    <thead><tr><th class="r">#</th><th>Student</th><th>Branch</th><th class="r">CGPA</th><th>Role</th><th>Offer</th><th class="r">CTC</th><th class="r">Stipend</th></tr></thead>
    <tbody>${rows.map(
      (o, i) => html`<tr>
        <td class="r muted">${i + 1}</td>
        <td>${o.name}<span class="sub">${o.roll || '—'}</span></td>
        <td title="${BRANCHES[o.branch]?.name || o.branch}">${o.branch}</td>
        <td class="r">${fmt.cgpa(o.cgpa)}</td>
        <td class="wrap-cell"><span class="cat-dot" style="--c:${raw(catVar(o.cat))}">${o.role || '—'}</span></td>
        <td>${o.offer || '—'}</td>
        <td class="r">${o.ctc !== null ? fmt.n2(o.ctc) : o.ctcText || '—'}</td>
        <td class="r">${o.stipend !== null ? `${fmt.n1(o.stipend)}K` : '—'}</td>
      </tr>`,
    )}</tbody>
  </table>`.toString();
}

export function openCompany(c, m, ctx) {
  closeHref = ctx.hrefFor(m.season.id, 'companies', null, ctx.route.query);
  if (current === c.slug && dialog.open) return;
  current = c.slug;
  const live = m.season.live;
  const roles = roleRows(c, live);
  const postings = live ? [] : [...c.roles].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const domain = domainFor(c);
  const statusText = {
    hired: '',
    ongoing: 'Process ongoing / yet to start',
    none: live ? 'No selections reported' : 'No offers recorded for this company',
  }[c.status];
  const branchEntries = Object.entries(c.branches);

  dialog.innerHTML = html`
    <div class="modal-head">
      ${raw(logoHtml(c, 'lg'))}
      <div style="min-width:0">
        <h2 id="company-dialog-title">${c.name}</h2>
        <p>${m.season.label}${c.catsPresent.length ? ` · ${c.catsPresent.join(', ')}` : ''}${domain ? html` · <a href="https://${domain}" target="_blank" rel="noopener">${domain}</a>` : ''}</p>
      </div>
      <button class="icon-btn" type="button" data-close aria-label="Close">${raw(ICONS.close)}</button>
    </div>
    <div class="modal-body">
      ${statusText ? html`<div class="notice">${statusText}</div>` : ''}
      <div class="modal-stats">
        <div class="tile"><div class="tile-label">Offers</div><div class="tile-value">${fmt.int(c.count)}</div></div>
        <div class="tile"><div class="tile-label">Students listed</div><div class="tile-value">${fmt.int(c.students)}</div></div>
        <div class="tile"><div class="tile-label">Highest CTC</div><div class="tile-value">${c.maxCtc !== null ? html`${fmt.n2(c.maxCtc)}<small>LPA</small>` : '—'}</div></div>
        <div class="tile"><div class="tile-label">Average CTC</div><div class="tile-value">${c.avgCtc !== null ? html`${fmt.n2(c.avgCtc)}<small>LPA</small>` : '—'}</div></div>
        <div class="tile"><div class="tile-label">Stipend</div><div class="tile-value">${c.maxStipend !== null ? html`${fmt.n1(c.maxStipend)}<small>K/mo</small>` : '—'}</div></div>
        ${live || c.cgpaCutoff ? html`<div class="tile"><div class="tile-label">CGPA cut-off</div><div class="tile-value">${c.cgpaCutoff ? fmt.n1(c.cgpaCutoff) : 'None'}</div></div>` : ''}
      </div>

      ${branchEntries.length
        ? html`<div><h3>Selections by branch</h3><div class="branch-chips">${branchEntries.map(
            ([b, n]) => html`<span title="${BRANCHES[b]?.name || b}">${b}<b>${n}</b></span>`,
          )}</div></div>`
        : ''}

      ${roles.length ? html`<div>
        <h3>Roles & packages</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Role</th><th>Offer</th><th>Profile</th><th class="r">CTC</th><th class="r">Base</th><th class="r">Stipend</th>${live ? html`<th class="r">CGPA</th>` : ''}<th class="r">Selected</th><th>Notes</th></tr></thead>
            <tbody>${roles.map(
              (r) => html`<tr>
                <td class="wrap-cell">${r.role || '—'}${r.drive ? html`<span class="sub">${r.drive}</span>` : ''}</td>
                <td>${r.offer || '—'}</td>
                <td><span class="cat-dot" style="--c:${raw(catVar(r.cat))}">${r.cat}</span></td>
                <td class="r">${fmt.n2(r.ctc)}</td>
                <td class="r">${fmt.n2(r.base)}</td>
                <td class="r">${r.stipend !== null ? `${fmt.n1(r.stipend)}K` : '—'}</td>
                ${live ? html`<td class="r">${r.cgpa ? fmt.n1(r.cgpa) : '—'}</td>` : ''}
                <td class="r">${r.count === null ? html`<span class="muted">ongoing</span>` : fmt.int(r.count)}</td>
                <td class="wrap-cell muted">${r.notes || ''}</td>
              </tr>`,
            )}</tbody>
          </table>
        </div>
      </div>` : ''}

      ${postings.length
        ? html`<div>
        <h3>Campus postings</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Posted</th><th>Role</th><th>Offer</th><th>Profile</th><th class="r">CTC</th><th class="r">Base</th><th class="r">Stipend</th><th class="r">CGPA</th><th>Notes</th></tr></thead>
            <tbody>${postings.map(
              (r) => html`<tr>
                <td>${r.date ? fmtDate(r.date) : '—'}</td>
                <td class="wrap-cell">${r.role || '—'}</td>
                <td>${r.offer || '—'}</td>
                <td><span class="cat-dot" style="--c:${raw(catVar(r.cat))}">${r.cat}</span></td>
                <td class="r">${fmt.n2(r.ctc)}</td>
                <td class="r">${fmt.n2(r.base)}</td>
                <td class="r">${r.stipend !== null ? `${fmt.n1(r.stipend)}K` : '—'}</td>
                <td class="r">${r.cgpa ? fmt.n1(r.cgpa) : '—'}</td>
                <td class="wrap-cell muted">${r.comments || ''}</td>
              </tr>`,
            )}</tbody>
          </table>
        </div>
      </div>`
        : ''}

      <div>
        <div class="toolbar" style="margin-bottom:8px">
          <h3 style="margin:0;margin-right:auto">Selected students (${c.offers.length})</h3>
          ${c.offers.length > 8 ? html`<input class="input input-search" style="max-width:260px" type="search" placeholder="Filter students…" aria-label="Filter students" data-student-q>` : ''}
        </div>
        <div class="table-wrap" data-students>${raw(studentsTable(studentRows(c, '')))}</div>
      </div>
    </div>
  `;

  const q = dialog.querySelector('[data-student-q]');
  if (q) {
    q.addEventListener(
      'input',
      debounce(() => {
        dialog.querySelector('[data-students]').innerHTML = studentsTable(studentRows(c, q.value));
      }, 100),
    );
  }
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.modal-head .icon-btn').focus({ preventScroll: true });
  dialog.scrollTop = 0;
}

export function closeCompany() {
  if (dialog.open) {
    current = null;
    dialog.close();
  }
}
