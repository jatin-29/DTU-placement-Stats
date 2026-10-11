import { BRANCHES, CATEGORIES } from '../config.js';
import { ICONS, catVar, debounce, fmt, html, raw } from '../lib/dom.js';
import { logoHtml } from '../lib/logos.js';

const PAGE = 50;
const state = { q: '', branch: 'all', cat: 'all', company: 'all', offer: 'all', min: '', max: '', sort: 'cgpa', dir: -1, page: 0, season: null };

const SORTS = {
  name: (o) => o.name.toLowerCase(),
  cgpa: (o) => o.cgpa ?? -1,
  company: (o) => o.company.toLowerCase(),
  branch: (o) => o.branch,
  ctc: (o) => o.ctc ?? -1,
};

function apply(m) {
  const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const min = parseFloat(state.min);
  const max = parseFloat(state.max);
  const rows = m.offers.filter((o) => {
    if (state.branch !== 'all' && o.branch !== state.branch) return false;
    if (state.cat !== 'all' && o.cat !== state.cat) return false;
    if (state.company !== 'all' && o.companyKey !== state.company) return false;
    if (state.offer !== 'all' && o.offer !== state.offer) return false;
    if (!Number.isNaN(min) && (o.cgpa === null || o.cgpa < min)) return false;
    if (!Number.isNaN(max) && (o.cgpa === null || o.cgpa > max)) return false;
    if (words.length) {
      const hay = `${o.name} ${o.roll} ${o.company} ${o.role}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const key = SORTS[state.sort];
  return rows.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * state.dir || a.name.localeCompare(b.name);
  });
}

function csv(rows) {
  const cols = ['roll', 'name', 'branch', 'cgpa', 'company', 'role', 'cat', 'offer', 'ctc', 'base', 'stipend'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export function renderStudents(root, m, ctx) {
  const q = ctx.route.query;
  if (state.season !== m.season.id) {
    Object.assign(state, { branch: 'all', company: 'all', offer: 'all', page: 0, season: m.season.id });
  }
  if (ctx.fresh && (q.branch || q.company)) {
    Object.assign(state, { branch: q.branch || 'all', company: q.company || 'all', cat: 'all', offer: 'all', q: '', min: '', max: '', page: 0 });
  }

  const branches = m.branches.filter((b) => b.offers > 0).map((b) => b.code);
  const companies = [...m.companies].filter((c) => c.offers.length).sort((a, b) => a.name.localeCompare(b.name));
  const offerTypes = m.offerTypes.map(([k]) => k);

  root.innerHTML = html`
    <div class="toolbar">
      <div class="grow"><input class="input input-search" type="search" placeholder="Search name, roll no, company or role…" aria-label="Search students" value="${state.q}" data-f="q"></div>
      <select class="select" data-f="branch" aria-label="Branch">
        <option value="all">All branches</option>
        ${branches.map((b) => html`<option value="${b}">${b} — ${BRANCHES[b]?.short || b}</option>`)}
      </select>
      <select class="select" data-f="cat" aria-label="Profile">
        <option value="all">All profiles</option>
        ${CATEGORIES.map((k) => html`<option value="${k}">${k}</option>`)}
      </select>
      <select class="select" data-f="company" aria-label="Company" style="max-width:200px">
        <option value="all">All companies</option>
        ${companies.map((c) => html`<option value="${c.key}">${c.name}</option>`)}
      </select>
      <select class="select" data-f="offer" aria-label="Offer type">
        <option value="all">All offer types</option>
        ${offerTypes.map((k) => html`<option value="${k}">${k}</option>`)}
      </select>
      <span class="muted" style="font-size:13px">CGPA</span>
      <input class="input input-cgpa" type="number" min="0" max="10" step="0.1" placeholder="min" aria-label="Minimum CGPA" value="${state.min}" data-f="min">
      <input class="input input-cgpa" type="number" min="0" max="10" step="0.1" placeholder="max" aria-label="Maximum CGPA" value="${state.max}" data-f="max">
      <button class="btn" type="button" data-reset>Reset</button>
      <button class="btn" type="button" data-csv>${raw(ICONS.download)}CSV</button>
    </div>
    <p class="result-count" data-count></p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th aria-sort="none" data-sort="name"><button class="sort" type="button">Student</button></th>
          <th data-sort="branch"><button class="sort" type="button">Branch</button></th>
          <th class="r" data-sort="cgpa"><button class="sort" type="button">CGPA</button></th>
          <th data-sort="company"><button class="sort" type="button">Company</button></th>
          <th>Role</th>
          <th>Offer</th>
          <th class="r" data-sort="ctc"><button class="sort" type="button">CTC (LPA)</button></th>
          <th class="r">Stipend</th>
        </tr></thead>
        <tbody data-body></tbody>
      </table>
    </div>
    <div class="pager" data-pager></div>
  `;

  for (const el of root.querySelectorAll('select[data-f]')) {
    el.value = state[el.dataset.f];
    if (el.value !== state[el.dataset.f]) {
      el.value = 'all';
      state[el.dataset.f] = 'all';
    }
  }

  const body = root.querySelector('[data-body]');
  const count = root.querySelector('[data-count]');
  const pager = root.querySelector('[data-pager]');
  let rows = [];

  const paint = () => {
    rows = apply(m);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    state.page = Math.min(state.page, pages - 1);
    const slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
    const students = new Set(rows.map((o) => o.studentKey)).size;
    count.textContent = `${rows.length} offers · ${students} students${rows.length !== m.offers.length ? ` (of ${m.offers.length} offers)` : ''}`;
    body.innerHTML = slice.length
      ? slice
          .map((o) => {
            const c = m.companyByKey.get(o.companyKey);
            return html`<tr>
              <td>${o.name}<span class="sub">${o.roll || '—'}</span></td>
              <td title="${BRANCHES[o.branch]?.name || o.branch}">${o.branch}</td>
              <td class="r">${fmt.cgpa(o.cgpa)}</td>
              <td><a class="company-link" href="${ctx.hrefFor(m.season.id, 'companies', c.slug)}">${raw(logoHtml(c, 'sm'))}${c.name}</a></td>
              <td class="wrap-cell"><span class="cat-dot" style="--c:${raw(catVar(o.cat))}">${o.role || '—'}</span></td>
              <td>${o.offer || '—'}</td>
              <td class="r">${o.ctc !== null ? fmt.n2(o.ctc) : o.ctcText || '—'}</td>
              <td class="r">${o.stipend !== null ? `${fmt.n1(o.stipend)}K` : '—'}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="8" class="empty">No offers match these filters.</td></tr>';
    pager.innerHTML =
      pages > 1
        ? `<span>Page ${state.page + 1} of ${pages}</span><button class="btn" type="button" data-page="-1" ${state.page === 0 ? 'disabled' : ''}>← Prev</button><button class="btn" type="button" data-page="1" ${state.page >= pages - 1 ? 'disabled' : ''}>Next →</button>`
        : '';
    for (const th of root.querySelectorAll('th[data-sort]')) {
      if (th.dataset.sort === state.sort) th.setAttribute('aria-sort', state.dir > 0 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    }
  };
  paint();

  const update = (k, v) => {
    state[k] = v;
    state.page = 0;
    paint();
  };
  root.querySelector('[data-f="q"]').addEventListener('input', debounce((e) => update('q', e.target.value.trim()), 120));
  for (const el of root.querySelectorAll('select[data-f]')) el.addEventListener('change', () => update(el.dataset.f, el.value));
  for (const el of root.querySelectorAll('input[type="number"][data-f]')) el.addEventListener('input', debounce(() => update(el.dataset.f, el.value), 200));
  for (const th of root.querySelectorAll('th[data-sort]')) {
    th.querySelector('button').addEventListener('click', () => {
      const k = th.dataset.sort;
      state.dir = state.sort === k ? -state.dir : k === 'name' || k === 'company' || k === 'branch' ? 1 : -1;
      state.sort = k;
      paint();
    });
  }
  pager.addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    state.page += Number(b.dataset.page);
    paint();
    root.querySelector('.table-wrap').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  root.querySelector('[data-reset]').addEventListener('click', () => {
    Object.assign(state, { q: '', branch: 'all', cat: 'all', company: 'all', offer: 'all', min: '', max: '', page: 0 });
    if (Object.keys(q).length) ctx.navigate(ctx.hrefFor(m.season.id, 'students'));
    else renderStudents(root, m, ctx);
  });
  root.querySelector('[data-csv]').addEventListener('click', () => {
    const blob = new Blob([csv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dtu-placements-${m.season.id}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
