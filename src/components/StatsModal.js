'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { retainKommuneOptions } from '@/lib/stats/kommuneFilterState.mjs';
import {
  ANALYTICS_START_DATE,
  formatAnalyticsStartDate,
  UNRESOLVED_SERIES_KEY,
} from '@/lib/stats/legacyStats.mjs';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const StatsMap = dynamic(() => import('./stats/StatsMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-gray-50">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
    </div>
  ),
});

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
const RESOLUTIONS = [
  { value: 'daily', label: 'Dag' },
  { value: 'weekly', label: 'Uke' },
  { value: 'monthly', label: 'Måned' },
];
const VALUE_MODES = [
  { value: 'count', label: 'Antall' },
  { value: 'cumulative', label: 'Kumulativt' },
];
const LINE_COLORS = [
  '#2563eb',
  '#db2777',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#4f46e5',
  '#be123c',
  '#15803d',
  '#9333ea',
  '#0369a1',
  '#b45309',
  '#c026d3',
  '#0f766e',
  '#4338ca',
];

const periodField = (resolution) =>
  resolution === 'daily'
    ? 'date'
    : resolution === 'weekly'
      ? 'week'
      : 'month';

const isoWeekLabel = (weekStart) => {
  const date = new Date(`${weekStart}T12:00:00Z`);
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      (thursday.getTime() - firstThursday.getTime()) / 604800000,
    );
  return `Uke ${String(week).padStart(2, '0')} ${thursday.getUTCFullYear()}`;
};

const formatPeriod = (value, resolution, short = false) => {
  if (!value) return '';
  if (resolution === 'monthly') {
    const [year, month] = value.split('-').map(Number);
    return `${NO_MONTHS[month - 1]}${short ? '' : ` ${year}`}`;
  }
  if (resolution === 'weekly') return isoWeekLabel(value);

  const date = new Date(`${value}T12:00:00Z`);
  return short
    ? `${date.getUTCDate()}.${date.getUTCMonth() + 1}.`
    : `${date.getUTCDate()}. ${NO_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />
);

const UploadStatIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 16V4m0 0L8 8m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </svg>
);

const MunicipalityStatIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 21h18M5 21V5l7-3 7 3v16M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1" />
  </svg>
);

const CompactMetric = ({ icon, value, label }) => (
  <div className="flex items-center gap-1.5 text-xs text-gray-500">
    <span className="text-blue-600">{icon}</span>
    <strong className="text-sm tabular-nums text-gray-900">{value}</strong>
    <span>{label}</span>
  </div>
);

const TimeTooltip = ({ active, payload, label, resolution }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-gray-900">
        {formatPeriod(label, resolution)}
      </p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value} registrerte opplastinger
        </p>
      ))}
    </div>
  );
};

const getSeriesFor = (stats, resolution, valueMode) => {
  if (!stats) return [];
  if (valueMode === 'cumulative') {
    return stats.cumulativeByResolution?.[resolution] || [];
  }
  return stats[resolution] || [];
};

const buildChartData = ({
  stats,
  selectedIds,
  resolution,
  valueMode,
  chartMode,
  includeUnknown,
}) => {
  const field = periodField(resolution);
  if (chartMode === 'total') {
    return getSeriesFor(stats, resolution, valueMode).map((point) => ({
      period: point[field],
      total: valueMode === 'cumulative' ? point.cumulative : point.count,
    }));
  }

  const comparisonIds = [
    ...selectedIds,
    ...(includeUnknown ? [UNRESOLVED_SERIES_KEY] : []),
  ];
  const domain = getSeriesFor(stats, resolution, 'count');
  const bySeries = new Map();
  for (const id of comparisonIds) {
    const series = getSeriesFor(
      stats?.byKommuneSeries?.[id],
      resolution,
      valueMode,
    );
    bySeries.set(
      id,
      new Map(series.map((point) => [
        point[field],
        valueMode === 'cumulative' ? point.cumulative : point.count,
      ])),
    );
  }

  const previous = new Map(comparisonIds.map((id) => [id, 0]));
  return domain.map((point) => {
    const row = { period: point[field] };
    for (const id of comparisonIds) {
      const value = bySeries.get(id)?.get(point[field]);
      if (value !== undefined) previous.set(id, value);
      row[id] =
        value !== undefined
          ? value
          : valueMode === 'cumulative'
            ? previous.get(id)
            : 0;
    }
    return row;
  });
};

export default function StatsModal({ isOpen, onClose }) {
  const [stats, setStats] = useState(null);
  const [analyticsStartDate, setAnalyticsStartDate] = useState(
    ANALYTICS_START_DATE,
  );
  const [availableKommuner, setAvailableKommuner] = useState([]);
  const [unresolvedAvailable, setUnresolvedAvailable] = useState(false);
  const [selectedKommuneIds, setSelectedKommuneIds] = useState([]);
  const [includeUnknown, setIncludeUnknown] = useState(true);
  const [selectionSearch, setSelectionSearch] = useState('');
  const [timeResolution, setTimeResolution] = useState('daily');
  const [valueMode, setValueMode] = useState('count');
  const [chartMode, setChartMode] = useState('total');
  const [expandedChart, setExpandedChart] = useState(false);
  const [expandedMap, setExpandedMap] = useState(false);
  const [kommuneSelectorOpen, setKommuneSelectorOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const initializedSelection = useRef(false);
  const hasLoaded = useRef(false);
  const skipNextSelectionRequest = useRef(false);
  const kommuneSelectorRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    if (skipNextSelectionRequest.current) {
      skipNextSelectionRequest.current = false;
      return undefined;
    }

    const controller = new AbortController();
    const initialRequest = !hasLoaded.current;
    const query = new URLSearchParams();
    if (!initialRequest) {
      query.set('kommuneIds', selectedKommuneIds.join(','));
      query.set('includeUnknown', includeUnknown ? '1' : '0');
      query.set('includeComparison', chartMode === 'per' ? '1' : '0');
    }

    Promise.resolve().then(() => {
      setLoading(true);
      setError(null);
    });

    fetch(`/api/stats${query.toString() ? `?${query}` : ''}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || 'Statistikken er midlertidig utilgjengelig.');
          return;
        }
        setStats(data);
        setAnalyticsStartDate(data.analyticsStartDate || ANALYTICS_START_DATE);
        setAvailableKommuner((current) =>
          retainKommuneOptions(current, data.kommuneOptions),
        );
        setUnresolvedAvailable((current) =>
          current || data.unresolvedUploadsAvailable === true,
        );
        if (!initializedSelection.current) {
          skipNextSelectionRequest.current = true;
          setSelectedKommuneIds(
            (data.kommuneOptions || []).map(
              (kommune) => kommune.kommuneNumber,
            ),
          );
          initializedSelection.current = true;
        }
        hasLoaded.current = true;
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError('Statistikken er midlertidig utilgjengelig.');
        }
      })
      .finally(() => setLoading(false));

    return () => {
      controller.abort();
    };
  }, [
    isOpen,
    selectedKommuneIds,
    includeUnknown,
    chartMode,
  ]);

  useEffect(() => {
    if (!isOpen) {
      setKommuneSelectorOpen(false);
      return undefined;
    }
    const handler = (event) => {
      if (!kommuneSelectorRef.current?.contains(event.target)) {
        setKommuneSelectorOpen(false);
      }
    };
    if (kommuneSelectorOpen) {
      document.addEventListener('pointerdown', handler);
    }
    return () => document.removeEventListener('pointerdown', handler);
  }, [isOpen, kommuneSelectorOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (event) => {
      if (event.key !== 'Escape') return;
      if (kommuneSelectorOpen) {
        setKommuneSelectorOpen(false);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, kommuneSelectorOpen, onClose]);

  const filteredKommuner = useMemo(() => {
    const needle = selectionSearch.trim().toLocaleLowerCase('nb-NO');
    if (!needle) return availableKommuner;
    return availableKommuner.filter((kommune) =>
      `${kommune.areaName} ${kommune.kommuneNumber}`
        .toLocaleLowerCase('nb-NO')
        .includes(needle),
    );
  }, [availableKommuner, selectionSearch]);

  const selectedSet = useMemo(
    () => new Set(selectedKommuneIds),
    [selectedKommuneIds],
  );
  const allKnownSelected =
    availableKommuner.length > 0 &&
    selectedKommuneIds.length === availableKommuner.length;
  const hasSelectedAll = allKnownSelected &&
    availableKommuner.every((kommune) => selectedSet.has(kommune.kommuneNumber));
  const displayedStats = stats;
  const summary = displayedStats?.summary;
  const ranking = displayedStats?.ranking || displayedStats?.byKommune || [];
  const hasData = Boolean(summary && summary.totalUploads > 0);
  const chartData = useMemo(
    () =>
      buildChartData({
        stats: displayedStats,
        selectedIds: selectedKommuneIds,
        resolution: timeResolution,
        valueMode,
        chartMode,
        includeUnknown,
      }),
    [
      displayedStats,
      selectedKommuneIds,
      timeResolution,
      valueMode,
      chartMode,
      availableKommuner,
      includeUnknown,
    ],
  );
  const comparisonLineIds = [
    ...selectedKommuneIds,
    ...(chartMode === 'per' &&
    includeUnknown &&
    displayedStats?.byKommuneSeries?.[UNRESOLVED_SERIES_KEY]
      ? [UNRESOLVED_SERIES_KEY]
      : []),
  ];

  const clearDisplayedStats = () => {
    setStats(null);
    setError(null);
    setLoading(false);
  };

  const updateSelectedKommuner = (nextIds) => {
    clearDisplayedStats();
    setSelectedKommuneIds([...new Set(nextIds)].sort());
  };

  const toggleKommune = (kommuneNumber) => {
    const next = selectedSet.has(kommuneNumber)
      ? selectedKommuneIds.filter((id) => id !== kommuneNumber)
      : [...selectedKommuneIds, kommuneNumber];
    updateSelectedKommuner(next);
  };

  const selectAll = () =>
    updateSelectedKommuner(
      availableKommuner.map((kommune) => kommune.kommuneNumber),
    );

  const clearAll = () => updateSelectedKommuner([]);

  const toggleUnknown = () => {
    clearDisplayedStats();
    setIncludeUnknown((current) => !current);
  };

  const changeChartMode = (mode) => {
    if (mode !== chartMode) clearDisplayedStats();
    setChartMode(mode);
  };

  const toggleChartExpansion = () => {
    setExpandedMap(false);
    setExpandedChart((current) => !current);
  };

  const toggleMapExpansion = () => {
    setExpandedChart(false);
    setExpandedMap((current) => !current);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10003] flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[94vh] w-[96vw] max-w-[1480px] flex-col overflow-hidden rounded-xl bg-gray-50 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-200 bg-white px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="text-base font-bold text-gray-900">Bruksstatistikk</h2>
              <p className="text-[11px] text-gray-400">
                Statistikk fra {formatAnalyticsStartDate(analyticsStartDate)}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <CompactMetric
                icon={<UploadStatIcon />}
                value={summary?.totalUploads ?? '...'}
                label="Registrerte filopplastinger"
              />
              <CompactMetric
                icon={<MunicipalityStatIcon />}
                value={summary?.uniqueKommuner ?? '...'}
                label="Kommuner med registrert aktivitet"
              />
            </div>
          </div>

          <div ref={kommuneSelectorRef} className="relative">
            <button
              type="button"
              aria-expanded={kommuneSelectorOpen}
              aria-haspopup="dialog"
              onClick={() => setKommuneSelectorOpen((current) => !current)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50"
            >
              <MunicipalityStatIcon />
              <span>Kommuner</span>
              <span className="tabular-nums text-gray-500">
                {selectedKommuneIds.length}/{availableKommuner.length}
              </span>
              <span aria-hidden="true" className="text-[10px]">{kommuneSelectorOpen ? '▲' : '▼'}</span>
            </button>

            {kommuneSelectorOpen && (
              <div
                role="dialog"
                aria-label="Velg kommuner"
                className="absolute right-0 top-full z-[1100] mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">Kommuner</h3>
                    <p className="text-[10px] text-gray-400">Avkryssede inngår</p>
                  </div>
                  <span className="text-[10px] tabular-nums text-gray-400">
                    {selectedKommuneIds.length} av {availableKommuner.length} valgt
                  </span>
                </div>
                <input
                  type="search"
                  value={selectionSearch}
                  onChange={(event) => setSelectionSearch(event.target.value)}
                  placeholder="Søk kommune"
                  aria-label="Søk kommune"
                  className="mb-2 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-500"
                />
                <div className="mb-2 flex gap-1">
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={hasSelectedAll}
                    className="flex-1 rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 disabled:opacity-40"
                  >
                    Velg alle
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={selectedKommuneIds.length === 0}
                    className="flex-1 rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 disabled:opacity-40"
                  >
                    Fjern alle
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto rounded border border-gray-100">
                  {filteredKommuner.map((kommune) => (
                    <label
                      key={kommune.kommuneNumber}
                      className="flex cursor-pointer items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-xs last:border-b-0 hover:bg-blue-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSet.has(kommune.kommuneNumber)}
                        onChange={() => toggleKommune(kommune.kommuneNumber)}
                        className="accent-blue-600"
                      />
                      <span className="truncate text-gray-700">{kommune.areaName}</span>
                    </label>
                  ))}
                  {filteredKommuner.length === 0 && (
                    <p className="px-2 py-3 text-center text-[11px] text-gray-400">
                      Ingen kommuner å vise
                    </p>
                  )}
                </div>
                {unresolvedAvailable && (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 rounded bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600">
                    <input
                      type="checkbox"
                      checked={includeUnknown}
                      onChange={toggleUnknown}
                      className="mt-0.5 accent-gray-600"
                    />
                    <span>
                      <span className="block font-medium">Uten registrert kommune</span>
                      <span className="block text-[10px] text-gray-400">Tas med i totaltall, ikke kart eller kommune-linjer</span>
                    </span>
                  </label>
                )}
                <p className="mt-2 text-[10px] leading-4 text-gray-400">
                  Opplastinger uten registrert kommune inngår i totaltallene når de er valgt, men kan ikke vises i kommuneoversikten eller på kartet.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Lukk"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <main className={expandedChart || expandedMap ? 'min-w-0' : 'min-w-0 space-y-3'}>
            {loading && (
              <div className="flex h-8 items-center gap-2">
                <Skeleton className="h-2 w-24" />
                <span className="text-[11px] text-gray-400">Henter statistikk ...</span>
              </div>
            )}

            {!loading && error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-8 text-center text-sm text-red-700">
                {error}
              </div>
            )}

            {!loading && !error && displayedStats && (
              <>
                {!expandedChart && !expandedMap && summary.unresolvedUploads > 0 && (
                  <p className="text-[11px] text-gray-500">
                    {summary.unresolvedUploads} opplasting{summary.unresolvedUploads === 1 ? '' : 'er'} uten registrert kommune er med i totaltallet.
                  </p>
                )}

                {hasData && !expandedMap && (
                  <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-800">Utvikling over tid</h3>
                        <p className="text-[10px] text-gray-400">Registrerte filopplastinger</p>
                      </div>
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        <div className="flex rounded border border-gray-200 bg-gray-50 p-0.5">
                          {RESOLUTIONS.map((resolution) => (
                            <button
                              key={resolution.value}
                              type="button"
                              onClick={() => setTimeResolution(resolution.value)}
                              className={`rounded px-2 py-1 ${timeResolution === resolution.value ? 'bg-white font-semibold text-blue-700 shadow-sm' : 'text-gray-500'}`}
                            >
                              {resolution.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex rounded border border-gray-200 bg-gray-50 p-0.5">
                          {VALUE_MODES.map((mode) => (
                            <button
                              key={mode.value}
                              type="button"
                              onClick={() => setValueMode(mode.value)}
                              className={`rounded px-2 py-1 ${valueMode === mode.value ? 'bg-white font-semibold text-blue-700 shadow-sm' : 'text-gray-500'}`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex rounded border border-gray-200 bg-gray-50 p-0.5">
                          <button
                            type="button"
                            onClick={() => changeChartMode('total')}
                            className={`rounded px-2 py-1 ${chartMode === 'total' ? 'bg-white font-semibold text-blue-700 shadow-sm' : 'text-gray-500'}`}
                          >
                            Totalt
                          </button>
                          <button
                            type="button"
                            onClick={() => changeChartMode('per')}
                            className={`rounded px-2 py-1 ${chartMode === 'per' ? 'bg-white font-semibold text-blue-700 shadow-sm' : 'text-gray-500'}`}
                          >
                            Per kommune
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={toggleChartExpansion}
                          className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700"
                          aria-label={expandedChart ? 'Lukk utvidet visning' : 'Utvid diagram'}
                        >
                          {expandedChart ? 'Lukk utvidet visning' : 'Utvid diagram'}
                        </button>
                      </div>
                    </div>

                    {chartMode === 'per' && comparisonLineIds.length === 0 ? (
                      <div className="flex h-56 items-center justify-center rounded border border-dashed border-gray-200 px-4 text-center text-sm text-gray-500">
                        Velg minst én kommune eller inkluder uten registrert kommune for å sammenligne utviklingen.
                      </div>
                    ) : (
                      <div className={expandedChart ? 'h-[calc(94vh-8rem)] min-h-[28rem] w-full' : 'h-64 w-full'}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 4 }}>
                            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                              dataKey="period"
                              tickFormatter={(value) => formatPeriod(value, timeResolution, true)}
                              tick={{ fontSize: 10, fill: '#94a3b8' }}
                              axisLine={false}
                              tickLine={false}
                              minTickGap={24}
                            />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={34} />
                            <Tooltip content={<TimeTooltip resolution={timeResolution} />} />
                            {chartMode === 'total' ? (
                              <Line type="monotone" dataKey="total" name="Registrerte opplastinger" stroke="#2563eb" strokeWidth={2.5} dot={chartData.length <= 31} activeDot={{ r: 4 }} />
                            ) : (
                              comparisonLineIds.map((id, index) => (
                                <Line
                                  key={id}
                                  type="monotone"
                                  dataKey={id}
                                  name={id === UNRESOLVED_SERIES_KEY
                                    ? 'Uten registrert kommune'
                                    : availableKommuner.find((kommune) => kommune.kommuneNumber === id)?.areaName || id}
                                  stroke={LINE_COLORS[index % LINE_COLORS.length]}
                                  strokeWidth={2}
                                  dot={false}
                                  activeDot={{ r: 4 }}
                                />
                              ))
                            )}
                            {chartMode === 'per' && (
                              <Legend wrapperStyle={{ fontSize: 11, maxHeight: 64, overflowY: 'auto' }} />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </section>
                )}

                {!hasData && !expandedMap && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-10 text-center">
                    <h3 className="text-sm font-semibold text-gray-700">Ingen registrerte opplastinger i utvalget</h3>
                    <p className="mt-1 text-xs text-gray-500">Velg kommuner eller inkluder opplastinger uten registrert kommune.</p>
                  </div>
                )}

                {hasData && !expandedChart && (
                  <section className={expandedMap ? 'space-y-2' : ''}>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-800">Kommuner</h3>
                      <div className="flex items-center gap-2">
                        {!expandedMap && (
                          <span className="text-[10px] text-gray-400">Ranking og kart følger samme utvalg</span>
                        )}
                        <button
                          type="button"
                          onClick={toggleMapExpansion}
                          className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700"
                          aria-label={expandedMap ? 'Lukk utvidet visning' : 'Utvid kart'}
                        >
                          {expandedMap ? 'Lukk utvidet visning' : 'Utvid kart'}
                        </button>
                      </div>
                    </div>
                    <div className={expandedMap
                      ? 'h-[calc(94vh-9rem)] min-h-[30rem] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm'
                      : 'grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(15rem,1fr)]'}>
                      <div className={expandedMap
                        ? 'h-full w-full'
                        : 'h-[clamp(20rem,38vw,30rem)] min-h-[20rem] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm'}>
                        <StatsMap
                          byKommune={displayedStats.byKommune}
                          timeline={displayedStats.timeline}
                          expanded={expandedMap}
                        />
                      </div>
                      {!expandedMap && <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                        <h4 className="mb-2 text-xs font-semibold text-gray-700">Fordeling</h4>
                        {ranking.length === 0 ? (
                          <p className="py-12 text-center text-xs text-gray-400">Ingen kommunedata i utvalget</p>
                        ) : (
                          <div className="space-y-1.5">
                            {ranking.slice(0, 10).map((kommune) => (
                              <div key={kommune.isUnresolved ? UNRESOLVED_SERIES_KEY : kommune.kommuneNumber} className="flex items-center gap-2 text-xs">
                                <span className="w-28 truncate text-gray-600">{kommune.areaName}</span>
                                <div className="h-2 min-w-0 flex-1 rounded bg-gray-100">
                                  <div
                                    className="h-2 rounded bg-blue-500"
                                    style={{ width: `${Math.max(4, (kommune.count / ranking[0].count) * 100)}%` }}
                                  />
                                </div>
                                <span className="w-10 text-right tabular-nums text-gray-500">{kommune.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>}
                    </div>
                  </section>
                )}
              </>
            )}

            {!loading && !error && !displayedStats && (
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
                Henter statistikk …
              </div>
            )}

          </main>
        </div>
      </div>
    </div>
  );
}
