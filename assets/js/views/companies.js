import { BRANCHES, CATEGORIES } from '../config.js';
import { catClass, debounce, fmt, html, raw } from '../lib/dom.js';
import { logoHtml } from '../lib/logos.js';

// Filters survive live refreshes and season switches.
const state = { q: '', cat: 'all', status: 'all', branch: 'all', sort: 'offers' };

const STATUS_LABEL = { hired: 'Selections out', ongoing: 'Ongoing', none: 'No selections' };
const ARCHIVE_LABEL = { ...STATUS_LABEL, none: 'No offers recorded' };

function matches(c, q) {
  if (!q) return true;
  const hay = `${c.name} ${c.roleNames.join(' ')} ${c.offerTypes.join(' ')}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

function filtered(m) {
  let list = m.companies.filter((c) => matches(c, state.q));
  if (state.cat !== 'all') list = list.filter((c) => c.catsPresent.includes(state.cat));
  if (state.status !== 'all') list = list.filter((c) => c.status === state.status);
  if (state.branch !== 'all') list = list.filter((c) => c.branches[state.branch]);
  const by = {
    offers: (a, b) => b.count - a.count || (b.maxCtc || 0) - (a.maxCtc || 0),
    ctc: (a, b) => (b.maxCtc || 0) - (a.maxCtc || 0) || b.count - a.count,
    name: (a, b) => a.name.localeCompare(b.name),
  }[state.sort];
  return list.sort(by);
}

// Profile tags first, then CGPA cut-off and offer types; at most three, then "+N".
function cardTags(c) {
  const tags = [
    ...c.catsPresent.map((k) => ({ html: html`<span class="tag"><i class="key ${catClass(k)}"></i>${k}</span>`, text: k })),
    ...(c.cgpaCutoff ? [{ html: html`<span class="tag">CGPA ${fmt.n1(c.cgpaCutoff)}+</span>`, text: `CGPA ${fmt.n1(c.cgpaCutoff)}+` }] : []),
    ...c.offerTypes.map((t) => ({ html: html`<span class="tag">${t}</span>`, text: t })),
  ];
  const shown = tags.slice(0, 2);
  const rest = tags.slice(shown.length);
  return html`${shown.map((t) => t.html)}${rest.length ? html`<span class="tag is-more" title="${rest.map((t) => t.text).join(', ')}">+${rest.length}</span>` : ''}`;
}

export function companyCard(c, href, { branch = null, live = true } = {}) {
  const roles = c.roleNames.slice(0, 2).join(' · ') + (c.roleNames.length > 2 ? ` +${c.roleNames.length - 2}` : '');
  const offerLabel = branch ? `from ${branch}` : c.count === 1 ? 'offer' : 'offers';
  const offerCount = branch ? c.branches[branch] || 0 : c.count;
  return html`<a class="panel company-card" href="${href}" data-slug="${c.slug}">
    ${c.status !== 'hired' ? html`<span class="status-badge ${c.status === 'ongoing' ? 'is-ongoing' : ''}">${(live ? STATUS_LABEL : ARCHIVE_LABEL)[c.status]}</span>` : ''}
    <div class="cc-top">
      ${raw(logoHtml(c, 'md'))}
      <div class="cc-name">
        <h3 title="${c.name}">${c.name}</h3>
        <p title="${c.roleNames.join(', ')}">${roles || '—'}</p>
      </div>
    </div>
    <div class="cc-stats">
      <div class="cc-stat"><div class="v">${fmt.int(offerCount)}</div><div class="l">${offerLabel}</div></div>
      <div class="cc-stat"><div class="v">${c.maxCtc !== null ? html`${fmt.n2(c.maxCtc)}<small> LPA</small>` : '—'}</div><div class="l">highest CTC</div></div>
    </div>
    <div class="cc-tags">${cardTags(c)}</div>
  </a>`;
}

export function renderCompanies(root, m, ctx) {
  const sId = m.season.id;
  const branchCodes = m.branches.filter((b) => b.offers > 0).map((b) => b.code);
  if (state.branch !== 'all' && !branchCodes.includes(state.branch)) state.branch = 'all';
  if (!m.season.live && state.status === 'ongoing') state.status = 'all';
  const counts = { hired: 0, ongoing: 0, none: 0 };
  for (const c of m.companies) counts[c.status]++;

  root.innerHTML = html`
    <div class="toolbar">
      <div class="grow"><input class="input input-search" type="search" placeholder="Search company or role…" aria-label="Search companies" value="${state.q}" data-f="q"></div>
      <div class="chips" role="group" aria-label="Profile">
        ${['all', ...CATEGORIES].map(
          (k) => html`<button class="chip" type="button" data-cat="${k}" aria-pressed="${state.cat === k}">${k !== 'all' ? html`<i class="key ${catClass(k)}"></i>` : ''}${k === 'all' ? 'All' : k}</button>`,
        )}
      </div>
      ${m.season.live
        ? html`<select class="select" data-f="status" aria-label="Status">
            <option value="all">All companies (${m.companies.length})</option>
            <option value="hired">Selections out (${counts.hired})</option>
            <option value="ongoing">Ongoing / yet to start (${counts.ongoing})</option>
            <option value="none">No selections (${counts.none})</option>
          </select>`
        : counts.none
          ? html`<select class="select" data-f="status" aria-label="Status">
            <option value="all">All companies (${m.companies.length})</option>
            <option value="hired">With offers (${counts.hired})</option>
            <option value="none">No offers recorded (${counts.none})</option>
          </select>`
          : ''}
      <select class="select" data-f="branch" aria-label="Branch">
        <option value="all">All branches</option>
        ${branchCodes.map((b) => html`<option value="${b}">${b} — ${BRANCHES[b]?.short || b}</option>`)}
      </select>
      <select class="select" data-f="sort" aria-label="Sort">
        <option value="offers">Most offers</option>
        <option value="ctc">Highest CTC</option>
        <option value="name">A–Z</option>
      </select>
    </div>
    <p class="result-count" data-count></p>
    <div class="company-grid" data-grid></div>
  `;

  for (const sel of root.querySelectorAll('select[data-f]')) sel.value = state[sel.dataset.f];

  const grid = root.querySelector('[data-grid]');
  const count = root.querySelector('[data-count]');
  const paint = () => {
    const list = filtered(m);
    const offers = list.reduce((a, c) => a + (state.branch !== 'all' ? c.branches[state.branch] || 0 : c.count), 0);
    count.textContent = `${list.length} ${list.length === 1 ? 'company' : 'companies'} · ${offers} offers${state.branch !== 'all' ? ` for ${state.branch}` : ''}`;
    grid.innerHTML = list.length
      ? list
          .map((c) => companyCard(c, ctx.hrefFor(sId, 'companies', c.slug), { branch: state.branch !== 'all' ? state.branch : null, live: m.season.live }))
          .join('')
      : '<div class="empty">No companies match these filters.</div>';
  };
  paint();

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
  for (const chip of root.querySelectorAll('[data-cat]')) {
    chip.addEventListener('click', () => {
      state.cat = chip.dataset.cat;
      for (const c of root.querySelectorAll('[data-cat]')) c.setAttribute('aria-pressed', String(c === chip));
      paint();
    });
  }
}
