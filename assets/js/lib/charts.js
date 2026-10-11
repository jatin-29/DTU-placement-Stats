// Thin wrappers around Chart.js (loaded globally from assets/vendor).
// Colours come from the CSS tokens so charts follow the light/dark theme.

const active = new Set();

export function destroyCharts() {
  for (const c of active) c.destroy();
  active.clear();
}

// For views that redraw one chart without a full re-render.
export function destroyChart(chart) {
  if (!chart || !active.has(chart)) return;
  chart.destroy();
  active.delete(chart);
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function palette() {
  return {
    tech: css('--tech'),
    nontech: css('--nontech'),
    core: css('--core'),
    unknown: css('--unknown'),
    measure: css('--measure'),
    prev: css('--prev'),
    surface: css('--surface'),
    ink: css('--ink'),
    ink2: css('--ink-2'),
    muted: css('--muted'),
    grid: css('--grid'),
    axis: css('--axis'),
    font: css('--font') || 'system-ui',
  };
}

export function catColor(p, cat) {
  return { Tech: p.tech, 'Non Tech': p.nontech, Core: p.core }[cat] || p.unknown;
}

// Value labels at the tip of each bar (or of each stack).
const tipLabels = {
  id: 'tipLabels',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts || !opts.format) return;
    const { ctx } = chart;
    const horizontal = chart.options.indexAxis === 'y';
    const metas = chart.data.datasets.map((_, i) => chart.getDatasetMeta(i)).filter((m) => !m.hidden);
    if (!metas.length) return;
    const n = chart.data.labels.length;
    ctx.save();
    ctx.fillStyle = opts.color;
    ctx.font = `600 11.5px ${opts.font}`;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const total = chart.data.datasets.reduce((a, d, di) => a + (chart.getDatasetMeta(di).hidden ? 0 : Number(d.data[i]) || 0), 0);
      const value = opts.stacked ? total : Number(chart.data.datasets[0].data[i]);
      if (!value) continue;
      // The outermost visible element of this bar/stack.
      let el = null;
      for (const m of metas) {
        const e = m.data[i];
        if (!e) continue;
        if (!el || (horizontal ? e.x > el.x : e.y < el.y)) el = e;
      }
      if (!el) continue;
      const label = opts.format(value, i);
      if (horizontal) {
        ctx.textAlign = 'left';
        ctx.fillText(label, el.x + 6, el.y);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(label, el.x, el.y - 9);
      }
    }
    ctx.restore();
  },
};

function baseOptions(p, o) {
  const horizontal = !!o.horizontal;
  const narrow = window.innerWidth < 560;
  const valueAxis = {
    stacked: !!o.stacked,
    beginAtZero: true,
    grid: { color: p.grid, drawTicks: false },
    border: { display: false },
    ticks: {
      color: p.muted,
      padding: 6,
      font: { size: 11.5 },
      callback: o.tickFormat ? (v) => o.tickFormat(v) : undefined,
      maxTicksLimit: 6,
    },
    max: o.max,
    grace: o.tipLabels ? '8%' : 0,
  };
  const catAxis = {
    stacked: !!o.stacked,
    grid: { display: false },
    border: { color: p.axis },
    ticks: {
      color: p.ink2,
      autoSkip: false,
      // On phones, let x-axis labels tilt instead of overlapping.
      font: { size: !horizontal && narrow ? 10.5 : 12 },
      maxRotation: !horizontal && narrow ? 50 : 0,
    },
  };
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    animation: { duration: 350 },
    layout: { padding: { right: horizontal && o.tipLabels ? 34 : 4, top: !horizontal && o.tipLabels ? 18 : 4 } },
    interaction: { mode: o.stacked ? 'index' : 'nearest', intersect: !o.stacked, axis: horizontal ? 'y' : 'x' },
    onHover: (e, els) => {
      if (o.onClick) e.native.target.style.cursor = els.length ? 'pointer' : 'default';
    },
    onClick: (e, els) => {
      if (o.onClick && els.length) o.onClick(els[0].index);
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: p.surface,
        titleColor: p.ink2,
        bodyColor: p.ink,
        borderColor: p.axis,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        titleFont: { weight: '600', size: 12 },
        bodyFont: { size: 13 },
        boxWidth: 12,
        boxHeight: 2,
        boxPadding: 6,
        usePointStyle: false,
        filter: (item) => Number(item.raw) !== 0,
        callbacks: {
          title: (items) => (o.tooltipTitle ? o.tooltipTitle(items[0].dataIndex) : items[0].label),
          label: (item) => {
            const v = o.valueFormat ? o.valueFormat(item.raw, item.dataIndex, item.datasetIndex) : item.formattedValue;
            return item.chart.data.datasets.length > 1 ? ` ${v}  ${item.dataset.label}` : ` ${v}`;
          },
          afterBody: o.tooltipFooter ? (items) => o.tooltipFooter(items[0].dataIndex) : undefined,
        },
      },
      tipLabels: o.tipLabels ? { format: o.tipLabels, stacked: o.stacked, color: p.ink2, font: p.font } : false,
    },
    scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
  };
}

function mount(canvas, config) {
  const Chart = window.Chart;
  if (!Chart) return null;
  Chart.defaults.font.family = palette().font;
  const chart = new Chart(canvas, { ...config, plugins: [tipLabels] });
  active.add(chart);
  return chart;
}

// datasets: [{ label, data, color }] — color may be an array (one per bar)
export function barChart(canvas, { labels, datasets, ...o }) {
  const p = palette();
  const stacked = !!o.stacked;
  const horizontal = !!o.horizontal;
  const gap = horizontal ? { top: 0, bottom: 0, left: 0, right: 2 } : { top: 2, bottom: 0, left: 0, right: 0 };
  return mount(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((d) => ({
        label: d.label,
        data: d.data,
        backgroundColor: d.color,
        hoverBackgroundColor: d.color,
        borderColor: p.surface,
        borderWidth: stacked ? gap : 0,
        borderRadius: 4,
        borderSkipped: 'start',
        maxBarThickness: 22,
        categoryPercentage: datasets.length > 1 && !stacked ? 0.8 : 0.82,
        barPercentage: datasets.length > 1 && !stacked ? 0.92 : 0.9,
      })),
    },
    options: baseOptions(p, { ...o, stacked }),
  });
}

export function doughnutChart(canvas, { labels, data, colors, valueFormat, onClick }) {
  const p = palette();
  return mount(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: p.surface, borderWidth: 2, hoverOffset: 6 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '64%',
      animation: { duration: 350 },
      onClick: (e, els) => {
        if (onClick && els.length) onClick(els[0].index);
      },
      plugins: {
        legend: { display: false },
        tipLabels: false,
        tooltip: {
          backgroundColor: p.surface,
          titleColor: p.ink2,
          bodyColor: p.ink,
          borderColor: p.axis,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          boxWidth: 12,
          boxHeight: 2,
          boxPadding: 6,
          callbacks: { label: (item) => ` ${valueFormat ? valueFormat(item.raw, item.dataIndex) : item.formattedValue}` },
        },
      },
    },
  });
}
