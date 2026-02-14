'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/* ── Lazy-load the Leaflet map (SSR-unsafe) ───────────────────────────── */
const StatsMap = dynamic(() => import('./stats/StatsMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-50 rounded-lg">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  ),
});

/* ── Norwegian helpers ─────────────────────────────────────────────────── */
const NO_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'mai',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'des',
];
const NO_DAYS = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const NO_DAYS_MON_FIRST = [
  'Man',
  'Tir',
  'Ons',
  'Tor',
  'Fre',
  'Lør',
  'Søn',
];

const fmtDateShort = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()}. ${NO_MONTHS[d.getMonth()]}`;
};

const fmtDateFull = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()}. ${NO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/* ── Skeleton placeholder ──────────────────────────────────────────────── */
const Skeleton = ({ className = '' }) => (
  <div
    className={`animate-pulse bg-gray-200 rounded-lg ${className}`}
  />
);

/* ── Custom recharts tooltip ───────────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white shadow-lg rounded-lg px-3 py-2 border border-gray-200 text-sm">
      <p className="font-medium text-gray-900 mb-0.5">
        {formatter ? formatter(label) : label}
      </p>
      <p className="text-blue-600 font-semibold">
        {payload[0].value} opplasting
        {payload[0].value !== 1 ? 'er' : ''}
      </p>
    </div>
  );
};

/* ── Metric card ───────────────────────────────────────────────────────── */
const MetricCard = ({ icon, label, value, sub }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center text-center shadow-sm hover:shadow-md transition-shadow">
    <div className="text-2xl mb-1">{icon}</div>
    <div className="text-2xl font-bold text-gray-900 tabular-nums">
      {value}
    </div>
    <div className="text-xs text-gray-500 font-medium mt-0.5">
      {label}
    </div>
    {sub && (
      <div className="text-[10px] text-gray-400 mt-1">{sub}</div>
    )}
  </div>
);

/* ── Activity heatmap (day-of-week × hour) ─────────────────────────────── */
const ActivityHeatmap = ({ data = [] }) => {
  // Remap Sunday=0 to Mon-first indexing: Mon=0…Sun=6
  const dowRemap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const { dayOfWeek, hour, count } of data) {
      const row = dowRemap[dayOfWeek] ?? dayOfWeek;
      g[row][hour] = (g[row][hour] || 0) + count;
      max = Math.max(max, g[row][hour]);
    }
    return { g, max };
  }, [data]);

  const colorScale = (val) => {
    if (val === 0) return '#f1f5f9';
    const t = val / (grid.max || 1);
    if (t < 0.2) return '#dbeafe';
    if (t < 0.4) return '#93c5fd';
    if (t < 0.6) return '#60a5fa';
    if (t < 0.8) return '#3b82f6';
    return '#1d4ed8';
  };

  const textColor = (val) => {
    if (val === 0) return 'transparent';
    const t = val / (grid.max || 1);
    return t >= 0.6 ? '#fff' : '#1e40af';
  };

  return (
    <div className="overflow-x-auto">
      <div
        className="inline-grid gap-[3px]"
        style={{
          gridTemplateColumns: `56px repeat(24, minmax(22px, 1fr))`,
        }}
      >
        {/* Hour headers */}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            className="text-[10px] text-gray-400 text-center font-mono"
          >
            {h}
          </div>
        ))}

        {/* Rows */}
        {NO_DAYS_MON_FIRST.map((dayLabel, di) => (
          <div key={di} className="contents">
            <div className="text-xs text-gray-500 font-medium flex items-center pr-2 justify-end">
              {dayLabel}
            </div>
            {grid.g[di].map((val, hi) => (
              <div
                key={hi}
                className="rounded-[3px] flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: colorScale(val),
                  height: '22px',
                  minWidth: '22px',
                  fontSize: '9px',
                  color: textColor(val),
                  fontWeight: 600,
                }}
                title={`${dayLabel} kl ${String(hi).padStart(2, '0')}:00 — ${val} opplasting${val !== 1 ? 'er' : ''}`}
              >
                {val > 0 ? val : ''}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   MAIN MODAL
   ══════════════════════════════════════════════════════════════════════════ */
export default function StatsModal({ isOpen, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setStats(data);
        else setError(data.error || 'Ukjent feil');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen]);

  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  /* Fill missing days in the daily chart for a continuous line */
  const filledDaily = useMemo(() => {
    if (!stats?.daily?.length) return [];
    const map = Object.fromEntries(
      stats.daily.map((d) => [d.date, d.count]),
    );
    const dates = Object.keys(map).sort();
    if (dates.length <= 1) return stats.daily;

    const result = [];
    const start = new Date(dates[0] + 'T12:00:00');
    const end = new Date(dates[dates.length - 1] + 'T12:00:00');
    for (
      let d = new Date(start);
      d <= end;
      d.setDate(d.getDate() + 1)
    ) {
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, count: map[key] || 0 });
    }
    return result;
  }, [stats]);

  if (!isOpen) return null;

  const s = stats?.summary;
  const hasData = s && s.totalUploads > 0;

  return (
    <div
      className="fixed inset-0 z-[10003] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-gray-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '92vw', height: '90vh', maxWidth: '1400px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Bruksstatistikk
              </h2>
              <p className="text-xs text-gray-500">
                Anonym oversikt over filopplastinger
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors group"
            aria-label="Lukk"
          >
            <svg
              className="w-5 h-5 text-gray-400 group-hover:text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* ── Content (scrollable) ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Loading state */}
          {loading && (
            <div className="space-y-6 animate-in">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-28" />
                ))}
              </div>
              <Skeleton className="h-56" />
              <div className="grid md:grid-cols-2 gap-4">
                <Skeleton className="h-72" />
                <Skeleton className="h-72" />
              </div>
              <Skeleton className="h-40" />
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <p className="text-gray-600 font-medium mb-1">
                Kunne ikke hente statistikk
              </p>
              <p className="text-sm text-gray-400">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && stats && !hasData && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-5">
                <svg
                  className="w-10 h-10 text-blue-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                Ingen data ennå
              </h3>
              <p className="text-sm text-gray-400 max-w-md">
                Statistikk fylles automatisk etterhvert som filer
                lastes opp og valideres. Last opp en GMI-, SOSI- eller
                KOF-fil for å komme i gang!
              </p>
            </div>
          )}

          {/* ── Data views ────────────────────────────────────────────  */}
          {!loading && !error && hasData && (
            <>
              {/* Metric cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  icon="📤"
                  label="Totalt opplastet"
                  value={s.totalUploads}
                  sub={
                    s.firstDate === s.lastDate
                      ? fmtDateFull(s.firstDate)
                      : `${fmtDateShort(s.firstDate)} – ${fmtDateShort(s.lastDate)}`
                  }
                />
                <MetricCard
                  icon="🏘️"
                  label="Unike kommuner"
                  value={s.uniqueKommuner}
                />
                <MetricCard
                  icon="📅"
                  label="Aktive dager"
                  value={s.activeDays}
                />
                <MetricCard
                  icon="⏱️"
                  label="Mest aktive time"
                  value={
                    stats.hourly?.length
                      ? (() => {
                          const peak = stats.hourly.reduce((a, b) =>
                            b.count > a.count ? b : a,
                          );
                          return `kl ${String(peak.hour).padStart(2, '0')}`;
                        })()
                      : '—'
                  }
                  sub={
                    stats.hourly?.length
                      ? `${stats.hourly.reduce((a, b) => (b.count > a.count ? b : a)).count} opplastinger`
                      : undefined
                  }
                />
              </div>

              {/* ── Daily chart ─────────────────────────────────────── */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">
                  Opplastinger over tid
                </h3>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={filledDaily}
                      margin={{
                        top: 5,
                        right: 10,
                        left: 0,
                        bottom: 0,
                      }}
                    >
                      <defs>
                        <linearGradient
                          id="statsGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#3b82f6"
                            stopOpacity={0.25}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3b82f6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={fmtDateShort}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <Tooltip
                        content={
                          <ChartTooltip formatter={fmtDateFull} />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#3b82f6"
                        fill="url(#statsGradient)"
                        strokeWidth={2.5}
                        dot={filledDaily.length <= 30}
                        activeDot={{ r: 5, fill: '#3b82f6' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Map + Kommune bar chart ──────────────────────────── */}
              <div className="grid md:grid-cols-5 gap-4">
                {/* Map */}
                <div className="md:col-span-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="px-5 pt-4 pb-2">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Geografisk oversikt
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Bruk tidslinjen for å se utvikling over tid
                    </p>
                  </div>
                  <div className="flex-1 min-h-[340px]">
                    <StatsMap
                      byKommune={stats.byKommune}
                      timeline={stats.timeline}
                    />
                  </div>
                </div>

                {/* Top kommuner */}
                <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">
                    Topp kommuner
                  </h3>
                  {stats.byKommune.filter(
                    (k) => k.areaName && k.areaName !== 'unknown',
                  ).length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-gray-400">
                        Ingen kommunedata registrert ennå
                      </p>
                    </div>
                  ) : (
                    <div
                      className="flex-1"
                      style={{ minHeight: 280 }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={stats.byKommune
                            .filter(
                              (k) =>
                                k.areaName &&
                                k.areaName !== 'unknown',
                            )
                            .slice(0, 10)}
                          margin={{
                            top: 0,
                            right: 20,
                            left: 0,
                            bottom: 0,
                          }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f1f5f9"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="areaName"
                            width={110}
                            tick={{ fontSize: 12, fill: '#475569' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar
                            dataKey="count"
                            fill="#3b82f6"
                            radius={[0, 6, 6, 0]}
                            barSize={20}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Hourly profile ──────────────────────────────────── */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">
                  Aktivitet per time (UTC)
                </h3>
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.hourly}
                      margin={{
                        top: 5,
                        right: 10,
                        left: 0,
                        bottom: 0,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        interval={1}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={25}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar
                        dataKey="count"
                        fill="#60a5fa"
                        radius={[4, 4, 0, 0]}
                        barSize={16}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Heatmap ─────────────────────────────────────────── */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                  Aktivitetskart — ukedag × time
                </h3>
                <p className="text-[11px] text-gray-400 mb-4">
                  Mørke celler = flere opplastinger
                </p>
                <ActivityHeatmap data={stats.heatmap} />
              </div>

              {/* ── Source badge ─────────────────────────────────────── */}
              <div className="text-center text-[10px] text-gray-300 pb-2">
                Datakilde:{' '}
                {stats.source === 'supabase'
                  ? 'Supabase'
                  : 'Lokal fil'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
