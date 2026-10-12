// App shell: routing, season loading, live refresh and the status bar.

import { CONFIG, SEASON_IDS } from './config.js';
import { loadArchive, loadLive, loadSnapshot } from './lib/data.js';
import { destroyCharts } from './lib/charts.js';
import { ICONS, escapeHtml, html, timeAgo } from './lib/dom.js';
import { installLogoFallbacks, loadLogoManifest } from './lib/logos.js';
import { renderDashboard } from './views/dashboard.js';
import { renderCompanies } from './views/companies.js';
import { renderBranches } from './views/branches.js';
import { renderStudents } from './views/students.js';
import { renderCompare } from './views/compare.js';
import { renderEligibility } from './views/eligibility.js';
import { closeCompany, openCompany } from './views/company-dialog.js';

const VIEWS = {
  dashboard: { label: 'Dashboard', render: renderDashboard },
  companies: { label: 'Companies', render: renderCompanies },
  branches: { label: 'Branches', render: renderBranches },
  students: { label: 'Students', render: renderStudents },
  eligibility: { label: 'Eligibility', render: renderEligibility },
  compare: { label: '2026 vs 2027', render: renderCompare },
};

const main = document.getElementById('app');
const models = {};
const pending = {};
const errors = {};
let route = parseHash();

// ---------- routing ----------

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(qs));
  if (parts[0] === 'compare') return { season: CONFIG.defaultSeason, view: 'compare', param: null, query };
  const season = SEASON_IDS.includes(parts[0]) ? parts[0] : CONFIG.defaultSeason;
  const view = VIEWS[parts[1]] && parts[1] !== 'compare' ? parts[1] : 'dashboard';
  return { season, view, param: parts[2] || null, query };
}

export function hrefFor(season, view, param, query) {
  if (view === 'compare') return '#/compare';
  let h = `#/${season}/${view}`;
  if (param) h += `/${encodeURIComponent(param)}`;
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString() : '';
  return qs ? `${h}?${qs}` : h;
}

export function navigate(href, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', href);
    onRoute();
  } else if (location.hash === href) {
    onRoute();
  } else {
    location.hash = href;
  }
}

// ---------- data ----------

function ensureSeason(id) {
  if (models[id] || pending[id]) return pending[id];
  const season = CONFIG.seasons[id];
  if (!season.live) {
    pending[id] = loadArchive(id)
      .then((m) => setModel(id, m))
      .catch((e) => {
        errors[id] = e;
        rerender();
      })
      .finally(() => delete pending[id]);
    return pending[id];
  }
  // Live season: paint the deployed snapshot right away, then swap in the sheet.
  const snap = loadSnapshot(id)
    .then((m) => {
      if (!models[id]) setModel(id, m);
    })
    .catch(() => {});
  const live = refreshLive(id);
  pending[id] = Promise.allSettled([snap, live]).finally(() => {
    delete pending[id];
    if (!models[id]) rerender();
  });
  return pending[id];
}

let refreshing = false;
async function refreshLive(id, { manual = false } = {}) {
  if (refreshing) return;
  refreshing = true;
  updateRefreshButton();
  try {
    const m = await loadLive(id);
    errors[id] = null;
    const prev = models[id];
    if (!prev || prev.meta.fingerprint !== m.meta.fingerprint || prev.meta.source !== 'live') {
      setModel(id, m);
    } else {
      prev.meta.fetchedAt = m.meta.fetchedAt;
      updateStatus();
    }
  } catch (e) {
    errors[id] = e;
    if (manual || models[id]) updateStatus();
    console.warn('Live data refresh failed:', e);
  } finally {
    refreshing = false;
    updateRefreshButton();
  }
}

// Bundled logos load alongside the data; the first paint waits for them (briefly)
// so logos don't swap source after the page appears.
const logosReady = loadLogoManifest();

function setModel(id, m) {
  models[id] = m;
  logosReady.then(() => {
    // Eligibility also reads the previous season (last season's results and branch lists).
    if (models[id] === m && (route.season === id || route.view === 'compare' || route.view === 'eligibility')) rerender({ keepScroll: true });
  });
}

// ---------- rendering ----------

function renderChrome() {
  const sw = document.getElementById('season-switch');
  sw.innerHTML = SEASON_IDS.map((id) => {
    const s = CONFIG.seasons[id];
    const view = route.view === 'compare' ? 'dashboard' : route.view;
    const current = route.view !== 'compare' && route.season === id;
    return `<a href="${hrefFor(id, view)}" aria-current="${current}">${id}${s.live ? '<span class="live-dot" title="Live"></span>' : ''}</a>`;
  }).join('');

  const tabs = document.getElementById('tabs');
  tabs.innerHTML = Object.entries(VIEWS)
    .map(([key, v]) => {
      const cur = route.view === key ? ' aria-current="page"' : '';
      return `<a href="${hrefFor(route.season, key)}"${cur}>${v.label}</a>`;
    })
    .join('');

  const season = CONFIG.seasons[route.season];
  document.title = route.view === 'compare' ? 'DTU Placement Stats · 2026 vs 2027' : `DTU Placement Stats · ${season.label} · ${VIEWS[route.view].label}`;
}

function statusHtml(id) {
  const season = CONFIG.seasons[id];
  const m = models[id];
  const err = errors[id];
  let pill = '';
  if (!m) pill = '<span class="pill">Loading…</span>';
  else if (m.meta.source === 'live')
    pill = `<span class="pill" title="Updates automatically"><span class="live-dot"></span>Live · synced <span data-ago>${timeAgo(m.meta.fetchedAt)}</span></span>`;
  else if (m.meta.source === 'snapshot')
    pill = `<span class="pill is-warn" title="${escapeHtml(err ? `Couldn't fetch the latest data: ${err.message}` : 'Fetching the latest data…')}">${err ? 'Offline copy' : 'Connecting…'} · data from <span data-ago>${timeAgo(m.meta.fetchedAt)}</span></span>`;
  else pill = `<span class="pill">Final · updated ${escapeHtml(m.meta.updated || '')}</span>`;

  const actions = [];
  if (season.live) {
    actions.push(`<button class="btn" type="button" data-action="refresh" ${refreshing ? 'disabled' : ''}>${ICONS.refresh}<span>Refresh</span></button>`);
  }

  return `
    <h1>${escapeHtml(season.label)}</h1>
    <span class="sub">Batch ${escapeHtml(season.batch)} · B.Tech</span>
    <span data-status-pill>${pill}</span>
    <span class="spacer"></span>
    ${actions.join('')}`;
}

function updateStatus() {
  const el = document.querySelector('.statusbar[data-season]');
  if (el) el.innerHTML = statusHtml(el.dataset.season);
}

function updateRefreshButton() {
  const b = document.querySelector('[data-action="refresh"]');
  if (!b) return;
  b.disabled = refreshing;
  b.classList.toggle('is-spinning', refreshing);
}

let lastKey = '';
let lastRenderedHash = '';
function rerender({ keepScroll = false } = {}) {
  const key = `${route.season}/${route.view}`;
  const y = window.scrollY;
  const sameView = key === lastKey;
  lastKey = key;
  destroyCharts();
  renderChrome();

  // `fresh` is true the first time a URL is shown with data, so views apply
  // URL filters once and keep the user's own changes across live refreshes.
  const ctx = { route, navigate, hrefFor, models, errors, fresh: false };
  const view = VIEWS[route.view];

  if (route.view === 'compare') {
    SEASON_IDS.forEach(ensureSeason);
    const ready = SEASON_IDS.every((id) => models[id]);
    main.innerHTML = '';
    if (!ready) {
      main.innerHTML = loadingHtml(SEASON_IDS.map((id) => errors[id]).find(Boolean));
      return;
    }
    view.render(main, ctx);
  } else {
    ensureSeason(route.season);
    if (route.view === 'eligibility') {
      const prevId = SEASON_IDS[SEASON_IDS.indexOf(route.season) + 1];
      if (prevId) ensureSeason(prevId);
    }
    const m = models[route.season];
    const head = `<div class="statusbar" data-season="${route.season}">${statusHtml(route.season)}</div>`;
    if (!m) {
      main.innerHTML = head + loadingHtml(errors[route.season]);
      return;
    }
    main.innerHTML = head + '<div data-view></div>';
    ctx.fresh = location.hash !== lastRenderedHash;
    lastRenderedHash = location.hash;
    view.render(main.querySelector('[data-view]'), m, ctx);
  }

  if (route.view === 'companies' && route.param && models[route.season]) {
    const c = models[route.season].companyBySlug.get(route.param);
    if (c) openCompany(c, models[route.season], ctx);
  } else {
    closeCompany();
  }
  if (keepScroll && sameView) window.scrollTo(0, y);
}

function loadingHtml(err) {
  if (err) {
    return html`<div class="notice">Couldn't load the data: ${err.message}. Check your connection and reload.</div>`.toString();
  }
  return '<div class="hero"><div class="skeleton" style="height:210px"></div><div class="skeleton" style="height:210px"></div></div><div class="grid-2" style="margin-top:14px"><div class="skeleton" style="height:340px"></div><div class="skeleton" style="height:340px"></div></div>';
}

function onRoute() {
  const prev = route;
  route = parseHash();
  const onlyDialog =
    prev.season === route.season && prev.view === route.view && route.view === 'companies' && JSON.stringify(prev.query) === JSON.stringify(route.query);
  if (onlyDialog && models[route.season]) {
    renderChrome();
    const c = route.param && models[route.season].companyBySlug.get(route.param);
    if (c) openCompany(c, models[route.season], { route, navigate, hrefFor, models });
    else closeCompany();
    return;
  }
  const changedPage = prev.season !== route.season || prev.view !== route.view;
  rerender();
  if (changedPage) window.scrollTo(0, 0);
}

// ---------- theme ----------

function currentTheme() {
  const set = document.documentElement.getAttribute('data-theme');
  if (set) return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function paintThemeButton() {
  const b = document.getElementById('theme-toggle');
  const dark = currentTheme() === 'dark';
  b.innerHTML = dark ? ICONS.sun : ICONS.moon;
  b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('theme', next);
  } catch (e) {
    /* storage unavailable */
  }
  paintThemeButton();
  rerender({ keepScroll: true });
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!document.documentElement.hasAttribute('data-theme')) {
    paintThemeButton();
    rerender({ keepScroll: true });
  }
});

// ---------- events ----------

main.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="refresh"]');
  if (btn) refreshLive(route.season, { manual: true });
});

window.addEventListener('hashchange', onRoute);

const liveId = SEASON_IDS.find((id) => CONFIG.seasons[id].live);
let lastRefresh = Date.now();
function maybeRefresh() {
  if (!liveId || !models[liveId] || document.hidden) return;
  if (Date.now() - lastRefresh < CONFIG.refreshMinutes * 60000 - 1000) return;
  lastRefresh = Date.now();
  refreshLive(liveId);
}
setInterval(maybeRefresh, 30000);
document.addEventListener('visibilitychange', maybeRefresh);
setInterval(() => {
  for (const el of document.querySelectorAll('[data-ago]')) {
    const m = models[route.season];
    if (m && m.meta.fetchedAt) el.textContent = timeAgo(m.meta.fetchedAt);
  }
}, 30000);

installLogoFallbacks(document);

// Wide tables scroll sideways on small screens; fade the edge that has more columns.
function updateTableFade(wrap) {
  const max = wrap.scrollWidth - wrap.clientWidth;
  wrap.classList.toggle('fade-left', max > 2 && wrap.scrollLeft > 2);
  wrap.classList.toggle('fade-right', max > 2 && wrap.scrollLeft < max - 2);
}
let fadeQueued = false;
function updateTableFades() {
  if (fadeQueued) return;
  fadeQueued = true;
  requestAnimationFrame(() => {
    fadeQueued = false;
    document.querySelectorAll('.table-wrap').forEach(updateTableFade);
  });
}
document.addEventListener(
  'scroll',
  (e) => {
    if (e.target instanceof Element && e.target.classList.contains('table-wrap')) updateTableFade(e.target);
  },
  true,
);
window.addEventListener('resize', updateTableFades);
new MutationObserver(updateTableFades).observe(document.body, { childList: true, subtree: true });
paintThemeButton();
if (!location.hash || location.hash === '#/' || location.hash === '#') {
  history.replaceState(null, '', hrefFor(CONFIG.defaultSeason, 'dashboard'));
  route = parseHash();
}
rerender();
