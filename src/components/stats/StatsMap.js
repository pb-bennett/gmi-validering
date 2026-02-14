'use client';

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap,
} from 'react-leaflet';

/* ── Fit-bounds helper ──────────────────────────────────────────────────── */
function FitBounds({ markers }) {
  const map = useMap();
  useEffect(() => {
    if (!markers || markers.length === 0) return;
    const bounds = markers.map((m) => [m.lat, m.lng]);
    if (bounds.length === 1) {
      map.setView(bounds[0], 7, { animate: true });
    } else {
      map.fitBounds(bounds, {
        padding: [40, 40],
        maxZoom: 8,
        animate: true,
      });
    }
  }, [markers, map]);
  return null;
}

/* ── Main map component ────────────────────────────────────────────────── */
export default function StatsMap({ byKommune = [], timeline = [] }) {
  const [playing, setPlaying] = useState(false);
  const [dateIdx, setDateIdx] = useState(-1); // -1 = show cumulative (all)
  const intervalRef = useRef(null);

  /* Unique sorted dates from the timeline */
  const uniqueDates = useMemo(() => {
    const s = new Set(
      timeline.filter((t) => t.lat && t.lng).map((t) => t.date),
    );
    return [...s].sort();
  }, [timeline]);

  /* Compute markers for the current dateIdx (clamp out-of-range indices) */
  const markers = useMemo(() => {
    const idx = dateIdx >= uniqueDates.length ? -1 : dateIdx;
    if (idx < 0) {
      // Show cumulative totals
      return byKommune.filter((k) => k.lat && k.lng);
    }

    const currentDate = uniqueDates[idx];
    if (!currentDate) return [];

    const cumMap = {};
    for (const t of timeline) {
      if (t.date > currentDate) continue;
      if (!t.lat || !t.lng) continue;
      const key = t.kommuneNumber || t.areaName;
      if (!cumMap[key]) cumMap[key] = { ...t, count: 0 };
      cumMap[key].count += t.count;
    }
    return Object.values(cumMap);
  }, [dateIdx, uniqueDates, timeline, byKommune]);

  /* Markers that are "new" at the current date (for highlight) */
  const newKommuneKeys = useMemo(() => {
    const idx = dateIdx >= uniqueDates.length ? -1 : dateIdx;
    if (idx < 0) return new Set();
    const currentDate = uniqueDates[idx];
    return new Set(
      timeline
        .filter((t) => t.date === currentDate && t.lat && t.lng)
        .map((t) => t.kommuneNumber || t.areaName),
    );
  }, [dateIdx, uniqueDates, timeline]);

  /* Play / pause */
  const togglePlay = useCallback(() => {
    setPlaying((prev) => {
      if (prev) return false;
      // Start from beginning if at end
      setDateIdx((idx) => {
        if (idx >= uniqueDates.length - 1) return 0;
        if (idx < 0) return 0;
        return idx;
      });
      return true;
    });
  }, [uniqueDates.length]);

  useEffect(() => {
    if (!playing) {
      clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setDateIdx((prev) => {
        if (prev >= uniqueDates.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 900);

    return () => clearInterval(intervalRef.current);
  }, [playing, uniqueDates.length]);

  // Avoid setting state synchronously when `timeline` updates — clamp the
  // visible index instead of forcing a state change here to prevent cascading
  // renders. The UI and memoized computations use `displayDateIdx`.
  const displayDateIdx = dateIdx >= uniqueDates.length ? -1 : dateIdx;

  const maxCount = Math.max(...byKommune.map((k) => k.count), 1);
  const radius = (count) =>
    Math.max(8, Math.min(35, 8 + (count / maxCount) * 27));

  const hasMapData = markers.length > 0;

  /* Norwegian date format */
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
  const fmtDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.getDate()}. ${NO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[64.5, 14]}
        zoom={4}
        className="h-full w-full rounded-lg"
        zoomControl={false}
        attributionControl={false}
        style={{ background: '#e8f0fe' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution=""
        />

        {hasMapData && <FitBounds markers={markers} />}

        {markers.map((m, i) => {
          const key = m.kommuneNumber || m.areaName || i;
          const isNew = newKommuneKeys.has(key);
          return (
            <CircleMarker
              key={key}
              center={[m.lat, m.lng]}
              radius={radius(m.count)}
              pathOptions={{
                color: isNew ? '#f59e0b' : '#3b82f6',
                fillColor: isNew ? '#f59e0b' : '#3b82f6',
                fillOpacity: isNew ? 0.8 : 0.5,
                weight: isNew ? 3 : 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <div className="text-center">
                  <div className="font-semibold">{m.areaName}</div>
                  <div className="text-xs text-gray-600">
                    {m.count} opplasting{m.count !== 1 ? 'er' : ''}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Empty state overlay */}
      {!hasMapData && (
        <div className="absolute inset-0 flex items-center justify-center z-[400] pointer-events-none">
          <div className="bg-white/80 backdrop-blur rounded-lg px-6 py-4 text-center">
            <p className="text-gray-500 text-sm">
              Ingen kommunedata å vise ennå
            </p>
          </div>
        </div>
      )}

      {/* Timeline controls */}
      {uniqueDates.length > 1 && (
        <div className="absolute bottom-3 left-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg px-4 py-2.5 shadow-md border border-gray-200">
          <div className="flex items-center gap-3">
            {/* Play / pause button */}
            <button
              onClick={togglePlay}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
              title={playing ? 'Pause' : 'Spill av'}
            >
              {playing ? (
                <svg
                  className="w-4 h-4 text-gray-700"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4 text-gray-700 ml-0.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Slider */}
            <input
              type="range"
              min={-1}
              max={uniqueDates.length - 1}
              value={displayDateIdx}
              className="flex-1 h-1.5 appearance-none rounded bg-gray-200 accent-blue-500 cursor-pointer"
            />

            {/* Date label */}
            <span className="text-xs text-gray-600 font-medium min-w-[100px] text-right tabular-nums">
              {displayDateIdx < 0
                ? 'Alle dager'
                : fmtDate(uniqueDates[displayDateIdx])}
            </span>
          </div>

          {/* Date range hint */}
          <div className="flex justify-between mt-1 text-[10px] text-gray-400 px-11">
            <span>{fmtDate(uniqueDates[0])}</span>
            <span>
              {fmtDate(uniqueDates[uniqueDates.length - 1])}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
