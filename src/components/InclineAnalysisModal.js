'use client';

import useStore from '@/lib/store';
import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useLayoutEffect,
} from 'react';
import StandardsInfoModal from './StandardsInfoModal';

const formatNumber = (num, decimals = 2) => {
  if (num === null || num === undefined) return '-';
  return num.toFixed(decimals).replace('.', ',');
};

export default function InclineAnalysisModal() {
  const isOpen = useStore((state) => state.analysis.isOpen);
  const toggleModal = useStore((state) => state.toggleAnalysisModal);
  const results = useStore((state) => state.analysis.results);
  const selectedPipeIndex = useStore(
    (state) => state.analysis.selectedPipeIndex,
  );
  const analysisLayerId = useStore((state) => state.analysis.layerId);
  const selectPipe = useStore((state) => state.selectAnalysisPipe);
  const openDataInspector = useStore(
    (state) => state.openDataInspector,
  );
  const forceTerrainFetch = useStore(
    (state) => state.forceTerrainFetch,
  );
  const forceLayerTerrainFetch = useStore(
    (state) => state.forceLayerTerrainFetch,
  );
  const selectedTerrainStatus = useStore((state) => {
    if (selectedPipeIndex === null) return 'idle';
    if (analysisLayerId) {
      return (
        state.layers[analysisLayerId]?.terrain?.data?.[
          selectedPipeIndex
        ]?.status || 'idle'
      );
    }
    return (
      state.terrain.data[selectedPipeIndex]?.status || 'idle'
    );
  });
  const minOvercover = useStore(
    (state) => state.settings.minOvercover,
  );
  const updateSettings = useStore((state) => state.updateSettings);

  // DON'T subscribe to terrain.data or layers here - let child components do it
  // This prevents re-rendering the entire list on every terrain update

  // Filters
  const [selectedType, setSelectedType] = useState('ALL');
  const [showWarning, setShowWarning] = useState(true);
  const [showOk, setShowOk] = useState(true);
  const [showStandardsModal, setShowStandardsModal] = useState(false);

  const handleOvercoverChange = (value) => {
    updateSettings({ minOvercover: value });
  };

  // Extract available types
  const availableTypes = useMemo(() => {
    const types = new Set();
    results.forEach((r) => {
      const type = (
        r.attributes.Tema ||
        r.attributes.S_FCODE ||
        'UKJENT'
      ).toUpperCase();
      // Simplify types (e.g. SP_TRYKK -> SP) if needed, but user asked for tabs for OV, SP, AF
      if (type.includes('SP')) types.add('SP');
      else if (type.includes('OV')) types.add('OV');
      else if (type.includes('AF')) types.add('AF');
      else if (type.includes('VL')) types.add('VL');
      else types.add('ANNET');
    });
    return Array.from(types).sort();
  }, [results]);

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      // Type Filter
      if (selectedType !== 'ALL') {
        const type = (
          r.attributes.Tema ||
          r.attributes.S_FCODE ||
          'UKJENT'
        ).toUpperCase();
        let match = false;
        if (selectedType === 'SP' && type.includes('SP'))
          match = true;
        else if (selectedType === 'OV' && type.includes('OV'))
          match = true;
        else if (selectedType === 'AF' && type.includes('AF'))
          match = true;
        else if (selectedType === 'VL' && type.includes('VL'))
          match = true;
        else if (
          selectedType === 'ANNET' &&
          !type.includes('SP') &&
          !type.includes('OV') &&
          !type.includes('AF') &&
          !type.includes('VL')
        )
          match = true;

        if (!match) return false;
      }

      // Status Filter
      if (r.status === 'warning' && !showWarning) return false;
      if (r.status === 'ok' && !showOk) return false;

      return true;
    });
  }, [results, selectedType, showWarning, showOk]);

  const selectedResult = useMemo(() => {
    if (selectedPipeIndex === null) return null;
    return results.find((r) => r.lineIndex === selectedPipeIndex);
  }, [results, selectedPipeIndex]);

  // Auto-select first warning if nothing selected
  useEffect(() => {
    if (isOpen && selectedPipeIndex === null && results.length > 0) {
      const firstWarning = results.find(
        (r) => r.status === 'warning',
      );
      if (firstWarning) {
        selectPipe(firstWarning.lineIndex, analysisLayerId || null);
      } else {
        selectPipe(results[0].lineIndex, analysisLayerId || null);
      }
    }
  }, [
    isOpen,
    results,
    selectedPipeIndex,
    selectPipe,
    analysisLayerId,
  ]);

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[2000] h-[45vh] bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex flex-col border-t border-gray-200">
      {/* Header */}
      <div className="flex-none p-3 border-b flex justify-between items-center bg-gray-50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            Profilanalyse
            <span className="text-xs font-normal text-gray-500">
              ({filteredResults.length} av {results.length} ledninger)
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (selectedPipeIndex === null) return;
              if (analysisLayerId) {
                forceLayerTerrainFetch(
                  analysisLayerId,
                  selectedPipeIndex,
                );
              } else {
                forceTerrainFetch(selectedPipeIndex);
              }
            }}
            disabled={selectedPipeIndex === null}
            className="text-xs bg-white text-gray-700 px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Hent terrengdata på nytt for valgt ledning"
          >
            {selectedTerrainStatus === 'loading' ? (
              <span className="inline-flex items-center gap-1">
                <svg
                  className="animate-spin h-3 w-3"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Henter terreng…
              </span>
            ) : (
              'Oppdater terreng'
            )}
          </button>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <span className="font-medium">Overdekning (m)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={minOvercover ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = parseFloat(
                  String(raw).replace(',', '.'),
                );
                if (!Number.isFinite(parsed)) return;
                handleOvercoverChange(parsed);
              }}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:ring-blue-400"
              aria-label="Minstekrav til overdekning"
              title="Minstekrav til overdekning (m)"
            />
          </label>
          <button
            onClick={() => setShowStandardsModal(true)}
            className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 border border-blue-200 flex items-center gap-1"
            title="Innstillinger"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Innstillinger
          </button>
          <button
            onClick={() => toggleModal(false)}
            className="text-gray-500 hover:text-gray-700 p-1.5 hover:bg-gray-200 rounded"
            title="Lukk analyse"
          >
            <svg
              className="w-5 h-5"
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
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar List */}
        <div className="w-80 border-r flex flex-col bg-gray-50 flex-none">
          {/* Type Tabs */}
          <div className="flex border-b overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setSelectedType('ALL')}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 ${
                selectedType === 'ALL'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Alle
            </button>
            {availableTypes.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 ${
                  selectedType === type
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Status Checkboxes */}
          <div className="p-2 border-b flex space-x-3 bg-gray-50">
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showWarning}
                onChange={(e) => setShowWarning(e.target.checked)}
                className="rounded text-yellow-600 focus:ring-yellow-500 h-3 w-3"
              />
              <span className="text-xs text-gray-700">Advarsel</span>
            </label>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showOk}
                onChange={(e) => setShowOk(e.target.checked)}
                className="rounded text-green-600 focus:ring-green-500 h-3 w-3"
              />
              <span className="text-xs text-gray-700">OK</span>
            </label>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredResults.map((res) => {
              const fcode =
                res.attributes.Tema ||
                res.attributes.S_FCODE ||
                'Ukjent';
              const color = getColorByFCode(fcode);
              // Use getState() to avoid subscribing to terrain updates at parent level
              const state = useStore.getState();
              const terrainSource = analysisLayerId
                ? state.layers[analysisLayerId]?.terrain?.data
                : state.terrain.data;
              const terrain = terrainSource?.[res.lineIndex];
              const terrainStatus = terrain?.status || 'idle';
              const hasOvercoverWarning =
                terrain?.overcover?.warnings?.length > 0;

              return (
                <div
                  key={res.lineIndex}
                  onClick={() =>
                    selectPipe(res.lineIndex, analysisLayerId || null)
                  }
                  className={`p-3 border-b cursor-pointer hover:bg-gray-100 ${
                    selectedPipeIndex === res.lineIndex
                      ? 'bg-blue-50 border-l-4 border-l-blue-500'
                      : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span
                        className="font-bold text-sm"
                        style={{ color }}
                      >
                        {fcode}
                      </span>
                      <span className="text-xs text-gray-700">
                        {res.attributes.Nett_type
                          ? `${res.attributes.Nett_type} - `
                          : ''}
                        {res.attributes.Dimensjon ||
                          res.attributes.Dim ||
                          '?'}
                        mm
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Terrain loading spinner */}
                      {terrainStatus === 'loading' && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded"
                          title="Henter terrengdata..."
                        >
                          <svg
                            className="animate-spin h-3 w-3"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        </span>
                      )}
                      {/* Terrain done indicator */}
                      {terrainStatus === 'done' &&
                        !hasOvercoverWarning && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 text-[10px] bg-green-50 text-green-700 rounded"
                            title="Terrengdata OK"
                          >
                            ⛰️
                          </span>
                        )}
                      {/* Overcover warning badge */}
                      {hasOvercoverWarning && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-red-50 text-red-700 rounded font-medium"
                          title={`${terrain.overcover.warnings.length} punkt med lav overdekning`}
                        >
                          ⛰️ {terrain.overcover.warnings.length}⚠
                        </span>
                      )}
                      <StatusBadge status={res.status} />
                    </div>
                  </div>
                  {res.message !== 'OK' && (
                    <div className="text-xs text-gray-500 mt-1">
                      {res.message}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    ID: {res.lineIndex}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content - Visualization */}
        <div className="flex-1 p-4 overflow-y-auto bg-white flex flex-col">
          {selectedResult ? (
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="flex items-center justify-between flex-none bg-gray-50 border rounded px-2 py-1 text-xs">
                <div className="flex items-center gap-2 flex-nowrap overflow-x-auto whitespace-nowrap">
                  <span className="font-semibold">
                    Ledning #{selectedResult.lineIndex}
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-700">
                    {selectedResult.attributes.Nett_type || 'Ukjent'}
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-700">
                    {selectedResult.attributes.Dimensjon ||
                      selectedResult.attributes.Dim ||
                      '?'}
                    mm
                  </span>
                  <span className="text-gray-500">•</span>
                  <span
                    className="text-gray-700 truncate max-w-[180px]"
                    title={
                      selectedResult.attributes.Materiale ||
                      selectedResult.attributes.Mat ||
                      selectedResult.attributes.MATERIALE ||
                      selectedResult.attributes.Rørmateriale ||
                      selectedResult.attributes.Material ||
                      selectedResult.attributes.MAT
                    }
                  >
                    {selectedResult.attributes.Materiale ||
                      selectedResult.attributes.Mat ||
                      selectedResult.attributes.MATERIALE ||
                      selectedResult.attributes.Rørmateriale ||
                      selectedResult.attributes.Material ||
                      selectedResult.attributes.MAT ||
                      '-'}
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-700">
                    Fall:{' '}
                    {formatNumber(selectedResult.details.incline, 2)}‰
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-700">
                    L:{' '}
                    {formatNumber(selectedResult.details.length, 2)} m
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-700">
                    ΔZ:{' '}
                    {formatNumber(selectedResult.details.deltaZ, 3)} m
                  </span>
                  {(() => {
                    const state = useStore.getState();
                    const terrainSource = analysisLayerId
                      ? state.layers[analysisLayerId]?.terrain?.data
                      : state.terrain.data;
                    const terrain =
                      terrainSource?.[selectedResult.lineIndex];
                    if (!terrain) return null;

                    if (terrain.status === 'loading') {
                      return (
                        <span className="text-gray-500 flex items-center gap-1">
                          <svg
                            className="animate-spin h-3 w-3"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Overdekning: henter...
                        </span>
                      );
                    }

                    if (
                      terrain.status === 'done' &&
                      terrain.overcover?.hasData
                    ) {
                      const oc = terrain.overcover;
                      const hasWarning = oc.warnings?.length > 0;
                      return (
                        <span
                          className={`font-semibold ${hasWarning ? 'text-red-700' : 'text-green-700'}`}
                        >
                          Overdekning:{' '}
                          {formatNumber(oc.minOvercover, 2)} m
                          {hasWarning && ' ⚠'}
                        </span>
                      );
                    }

                    return null;
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      openDataInspector({
                        type: 'line',
                        index: selectedResult.lineIndex,
                        layerId: analysisLayerId || null,
                      })
                    }
                    className="px-2 py-1 text-[11px] rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    Inspiser data
                  </button>
                  <StatusBadge status={selectedResult.status} />
                </div>
              </div>

              {/* Cross Section Visualization */}
              <div className="border rounded-lg p-2 bg-white shadow-sm flex-1 flex flex-col min-h-0">
                <div className="flex-1 min-h-0 w-full">
                  <PipeProfileVisualization result={selectedResult} />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              Velg en ledning fra listen for å se detaljer
            </div>
          )}
        </div>
      </div>

      <StandardsInfoModal
        isOpen={showStandardsModal}
        onClose={() => setShowStandardsModal(false)}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'error')
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 uppercase">
        Feil
      </span>
    );
  if (status === 'warning')
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800 uppercase">
        Advarsel
      </span>
    );
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800 uppercase">
      OK
    </span>
  );
}

function getStatusColor(status) {
  if (status === 'error') return 'text-red-600';
  if (status === 'warning') return 'text-yellow-600';
  return 'text-green-600';
}

const getColorByFCode = (fcode) => {
  if (!fcode) return '#808080';
  const code = fcode.toUpperCase();
  if (code.includes('VL') || code.includes('VANN')) return '#0101FF';
  if (code.includes('SP') || code.includes('SPILLVANN'))
    return '#02D902';
  if (code.includes('OV') || code.includes('OVERVANN'))
    return '#2a2a2a';
  if (code.includes('AF') || code.includes('FELLES'))
    return '#ff0000';
  return '#808080';
};

function PipeProfileVisualization({ result }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const transformStartRef = useRef({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState(null);
  const tooltipRef = useRef(null);
  const [tooltipSize, setTooltipSize] = useState({
    width: 0,
    height: 0,
  });

  const setHoveredAnalysisPoint = useStore(
    (state) => state.setHoveredAnalysisPoint,
  );
  const hoveredPointIndex = useStore(
    (state) => state.analysis.hoveredPointIndex,
  );
  const setHoveredAnalysisSegment = useStore(
    (state) => state.setHoveredAnalysisSegment,
  );
  const setHoveredTerrainPoint = useStore(
    (state) => state.setHoveredTerrainPoint,
  );
  const hoveredSegment = useStore(
    (state) => state.analysis.hoveredSegment,
  );

  // Get terrain data for this line
  const terrainData = useStore(
    (state) => state.terrain.data[result.lineIndex],
  );
  const minOvercover = useStore(
    (state) => state.settings.minOvercover,
  );
  const terrainPoints = terrainData?.points || [];
  const terrainStatus = terrainData?.status || 'idle';
  const overcoverWarnings = terrainData?.overcover?.warnings || [];

  const {
    startZ,
    endZ,
    length,
    profilePoints,
    isDigitizedBackwards,
  } = result.details;

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Reset zoom when result changes
  useEffect(() => {
    setTransform({ x: 0, y: 0, k: 1 });
  }, [result.lineIndex]);

  useLayoutEffect(() => {
    if (!tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    setTooltipSize({ width: rect.width, height: rect.height });
  }, [tooltip]);

  // Prepare points for visualization (Always Flow Left -> Right)
  let plotPoints = [];
  if (profilePoints && profilePoints.length > 0) {
    if (isDigitizedBackwards) {
      plotPoints = profilePoints
        .map((p, i) => ({
          ...p,
          originalIndex: i,
          isVertex: p.isVertex ?? false,
          dist: length - p.dist,
        }))
        .sort((a, b) => a.dist - b.dist);
    } else {
      plotPoints = profilePoints.map((p, i) => ({
        ...p,
        originalIndex: i,
        isVertex: p.isVertex ?? false,
      }));
    }
  } else {
    plotPoints = [
      {
        dist: 0,
        z: isDigitizedBackwards ? endZ : startZ,
        isVertex: true,
        originalIndex: isDigitizedBackwards ? 1 : 0,
      },
      {
        dist: length,
        z: isDigitizedBackwards ? startZ : endZ,
        isVertex: true,
        originalIndex: isDigitizedBackwards ? 0 : 1,
      },
    ];
  }

  // Prepare terrain plot points (aligned with pipe distance axis)
  const terrainPlotPoints = useMemo(() => {
    if (!terrainPoints || terrainPoints.length === 0) return [];
    const normalized = terrainPoints.map((tp) => ({
      ...tp,
      z: tp.terrainZ ?? tp.z ?? null,
    }));
    // If digitized backwards, flip the distances
    if (isDigitizedBackwards) {
      return normalized
        .map((tp) => ({
          ...tp,
          dist: length - tp.dist,
        }))
        .sort((a, b) => a.dist - b.dist);
    }
    return normalized;
  }, [terrainPoints, isDigitizedBackwards, length]);

  const terrainLinePoints = terrainPlotPoints.filter(
    (p) => p.z !== null && p.z !== undefined,
  );

  // Calculate min/max Z including terrain if available
  const pipeZValues = plotPoints.map((p) => p.z);
  const terrainZValues = terrainLinePoints.map((p) => p.z);
  const allZValues = [...pipeZValues, ...terrainZValues];

  const minZ = Math.min(...allZValues);
  const maxZ = Math.max(...allZValues);
  const zRange = maxZ - minZ || 1;
  const zBuffer = zRange * 0.3;
  const plotMinZ = minZ - zBuffer;
  const plotMaxZ = maxZ + zBuffer;
  const plotZRange = plotMaxZ - plotMinZ;

  // Calculate overcover at each pipe point
  const overcoverData = useMemo(() => {
    if (terrainPlotPoints.length === 0) return [];

    return plotPoints.map((pp) => {
      // Find closest terrain point
      let closestTerrain = null;
      let minDistDiff = Infinity;

      for (const tp of terrainPlotPoints) {
        const diff = Math.abs(tp.dist - pp.dist);
        if (diff < minDistDiff) {
          minDistDiff = diff;
          closestTerrain = tp;
        }
      }

      if (!closestTerrain || closestTerrain.z === null) {
        return { overcover: null, terrainZ: null, warning: false };
      }

      const overcover = closestTerrain.z - pp.z;
      return {
        overcover,
        terrainZ: closestTerrain.z,
        warning: overcover < minOvercover && overcover >= 0,
      };
    });
  }, [plotPoints, terrainPlotPoints, minOvercover]);

  if (startZ === null || endZ === null) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 rounded text-gray-500">
        Kan ikke vise profil: Mangler Z-koordinater
      </div>
    );
  }

  // Use actual container dimensions
  const { width, height } = dimensions;

  const padding = 40;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const getX = (dist) => padding + (dist / length) * plotWidth;
  const getY = (z) =>
    height - padding - ((z - plotMinZ) / plotZRange) * plotHeight;

  const getPipeZAtDist = (dist) => {
    if (!plotPoints || plotPoints.length === 0) return null;
    if (dist <= plotPoints[0].dist) return plotPoints[0].z;
    for (let i = 0; i < plotPoints.length - 1; i++) {
      const p1 = plotPoints[i];
      const p2 = plotPoints[i + 1];
      if (dist >= p1.dist && dist <= p2.dist) {
        const span = p2.dist - p1.dist || 1;
        const t = (dist - p1.dist) / span;
        return p1.z + (p2.z - p1.z) * t;
      }
    }
    return plotPoints[plotPoints.length - 1].z;
  };

  const getNearestTerrainPoint = (dist) => {
    if (!terrainLinePoints || terrainLinePoints.length === 0)
      return null;
    let closest = terrainLinePoints[0];
    let minDiff = Math.abs(closest.dist - dist);
    for (let i = 1; i < terrainLinePoints.length; i++) {
      const tp = terrainLinePoints[i];
      const diff = Math.abs(tp.dist - dist);
      if (diff < minDiff) {
        minDiff = diff;
        closest = tp;
      }
    }
    return closest;
  };

  const vertexOvercoverWarnings = useMemo(() => {
    if (!terrainLinePoints.length) return [];
    return plotPoints
      .filter((p) => p.isVertex)
      .map((p) => {
        const tp = getNearestTerrainPoint(p.dist);
        if (!tp || tp.z === null || tp.z === undefined) return null;
        const overcover = tp.z - p.z;
        return {
          dist: p.dist,
          pipeZ: p.z,
          terrainZ: tp.z,
          overcover,
          warning: overcover < minOvercover && overcover >= 0,
        };
      })
      .filter((w) => w && w.warning);
  }, [plotPoints, terrainLinePoints, minOvercover]);

  const terrainJumpMarkers = useMemo(() => {
    if (!terrainLinePoints.length) return [];
    const markers = [];
    for (let i = 1; i < terrainLinePoints.length; i++) {
      const prev = terrainLinePoints[i - 1];
      const curr = terrainLinePoints[i];
      const dz = curr.z - prev.z;
      if (Math.abs(dz) >= 2) {
        markers.push({
          dist: curr.dist,
          z: curr.z,
          dz,
        });
      }
    }
    return markers;
  }, [terrainLinePoints]);

  if (width === 0 || height === 0)
    return <div ref={containerRef} className="w-full h-full" />;

  let pathData = `M ${getX(plotPoints[0].dist)} ${getY(
    plotPoints[0].z,
  )}`;
  for (let i = 1; i < plotPoints.length; i++) {
    pathData += ` L ${getX(plotPoints[i].dist)} ${getY(
      plotPoints[i].z,
    )}`;
  }

  const pipeColor = getColorByFCode(
    result.attributes.Tema || result.attributes.S_FCODE,
  );

  // Zoom/Pan Handlers
  const handleWheel = (e) => {
    e.preventDefault();
    const scaleFactor = 1.1;
    const direction = e.deltaY > 0 ? 1 / scaleFactor : scaleFactor;

    let newK = transform.k * direction;
    // Limit zoom
    newK = Math.max(0.5, Math.min(newK, 10));

    // Zoom towards mouse pointer
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate new offset to keep mouse point stable
    // (mouseX - x) / k = (mouseX - newX) / newK
    // mouseX - x = (mouseX - newX) * (k / newK)
    // newX = mouseX - (mouseX - x) * (newK / k)

    const newX =
      mouseX - (mouseX - transform.x) * (newK / transform.k);
    const newY =
      mouseY - (mouseY - transform.y) * (newK / transform.k);

    setTransform({ x: newX, y: newY, k: newK });
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    transformStartRef.current = { x: transform.x, y: transform.y };
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setTransform({
        ...transform,
        x: transformStartRef.current.x + dx,
        y: transformStartRef.current.y + dy,
      });
      return;
    }

    if (hoveredSegment || hoveredPointIndex !== null) {
      setHoveredTerrainPoint(null);
      return;
    }
    if (!terrainLinePoints.length) {
      setHoveredTerrainPoint(null);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const plotMouseX = (mouseX - transform.x) / transform.k;
    const clampedX = Math.min(
      Math.max(plotMouseX, padding),
      width - padding,
    );
    const dist = ((clampedX - padding) / plotWidth) * length;
    const tp = getNearestTerrainPoint(dist);
    if (!tp || tp.z === null || tp.z === undefined) {
      setHoveredTerrainPoint(null);
      return;
    }

    const pipeZ = getPipeZAtDist(tp.dist);
    const overcover = pipeZ !== null ? tp.z - pipeZ : null;

    setTooltip({
      x: mouseX,
      y: mouseY,
      type: 'terrain',
      data: {
        dist: tp.dist,
        terrainZ: tp.z,
        pipeZ,
        overcover,
        isVertex: tp.isVertex === true,
        terreng: tp.terreng || null,
      },
    });
    const lineDist = isDigitizedBackwards
      ? length - tp.dist
      : tp.dist;

    setHoveredTerrainPoint({
      dist: tp.dist,
      lineDist,
      terrainZ: tp.z,
      pipeZ,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredAnalysisPoint(null);
    setHoveredAnalysisSegment(null);
    setHoveredTerrainPoint(null);
    setTooltip(null);
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
          className="bg-white border rounded px-2 py-1 text-xs shadow hover:bg-gray-50"
          title="Nullstill visning"
        >
          Reset
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-2 left-2 z-10 bg-white/90 border rounded px-2 py-1.5 text-xs shadow flex gap-3 items-center">
        <div className="flex items-center gap-1">
          <div
            className="w-4 h-1 rounded"
            style={{ backgroundColor: pipeColor }}
          ></div>
          <span className="text-gray-600">Ledning</span>
        </div>
        {terrainLinePoints.length > 0 && (
          <div className="flex items-center gap-1">
            <div
              className="w-4 h-0.5 rounded"
              style={{ backgroundColor: '#8B4513', opacity: 0.8 }}
            ></div>
            <span className="text-gray-600">Terreng</span>
          </div>
        )}
        {(overcoverData.some((oc) => oc.warning) ||
          vertexOvercoverWarnings.length > 0) && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-100 border border-red-500 flex items-center justify-center">
              <span className="text-red-500 text-[8px] font-bold">
                !
              </span>
            </div>
            <span className="text-red-600">Lav overdekning</span>
          </div>
        )}
        {terrainJumpMarkers.length > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-500 flex items-center justify-center">
              <span className="text-yellow-600 text-[8px] font-bold">
                !
              </span>
            </div>
            <span className="text-yellow-700">Mulig terrengfeil</span>
          </div>
        )}
        {terrainStatus === 'loading' && (
          <div className="flex items-center gap-1 text-gray-500">
            <svg
              className="animate-spin h-3 w-3"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Henter...</span>
          </div>
        )}
      </div>

      <svg
        width={width}
        height={height}
        className="border bg-gray-50 rounded cursor-move"
      >
        <g
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
        >
          {/* Grid lines */}
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="#ddd"
            strokeDasharray="4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="#ddd"
            strokeDasharray="4"
            vectorEffect="non-scaling-stroke"
          />

          {/* Pipe Line */}
          <path
            d={pathData}
            fill="none"
            stroke={pipeColor}
            strokeWidth="6"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Terrain Line */}
          {terrainLinePoints.length > 0 && (
            <>
              {/* Terrain fill area (between terrain and pipe) */}
              {terrainLinePoints.map((tp, i) => {
                if (i === terrainLinePoints.length - 1) return null;
                const next = terrainLinePoints[i + 1];
                if (
                  tp.z === null ||
                  tp.z === undefined ||
                  next.z === null ||
                  next.z === undefined
                ) {
                  return null;
                }

                const pipeZ1 = getPipeZAtDist(tp.dist);
                const pipeZ2 = getPipeZAtDist(next.dist);
                if (pipeZ1 === null || pipeZ2 === null) return null;

                const midOvercover =
                  (tp.z - pipeZ1 + (next.z - pipeZ2)) / 2;
                const isOk = midOvercover >= minOvercover;
                const fill = isOk
                  ? 'rgba(34, 197, 94, 0.18)'
                  : 'rgba(239, 68, 68, 0.18)';

                const x1 = getX(tp.dist);
                const x2 = getX(next.dist);
                const yT1 = getY(tp.z);
                const yT2 = getY(next.z);
                const yP1 = getY(pipeZ1);
                const yP2 = getY(pipeZ2);

                return (
                  <path
                    key={`terrain-fill-${i}`}
                    d={`M ${x1} ${yT1} L ${x2} ${yT2} L ${x2} ${yP2} L ${x1} ${yP1} Z`}
                    fill={fill}
                  />
                );
              })}
              {/* Terrain surface line */}
              <path
                d={(() => {
                  let terrainPath = `M ${getX(terrainLinePoints[0].dist)} ${getY(terrainLinePoints[0].z)}`;
                  for (let i = 1; i < terrainLinePoints.length; i++) {
                    terrainPath += ` L ${getX(terrainLinePoints[i].dist)} ${getY(terrainLinePoints[i].z)}`;
                  }
                  return terrainPath;
                })()}
                fill="none"
                stroke="#8B4513"
                strokeWidth="2"
                strokeDasharray="6,3"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity="0.8"
              />
            </>
          )}

          {/* Overcover Warning Zones (from analysis) */}
          {vertexOvercoverWarnings.map((w, i) => {
            if (w.pipeZ === null || w.terrainZ === null) return null;
            const x = getX(w.dist);
            const y1 = getY(w.pipeZ);
            const y2 = getY(w.terrainZ);

            return (
              <g key={`overcover-warning-vertex-${w.dist}-${i}`}>
                <line
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2}
                  stroke="#ef4444"
                  strokeWidth={2 / transform.k}
                  strokeDasharray="3,2"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.8"
                />
                <circle
                  cx={x}
                  cy={y2}
                  r={5 / transform.k}
                  fill="#fef2f2"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={x}
                  y={y2 + 3 / transform.k}
                  textAnchor="middle"
                  fill="#ef4444"
                  style={{
                    fontSize: `${8 / transform.k}px`,
                    fontWeight: 'bold',
                  }}
                >
                  !
                </text>
              </g>
            );
          })}

          {/* Terrain jump markers (probable errors) */}
          {terrainJumpMarkers.map((m, i) => {
            const x = getX(m.dist);
            const y = getY(m.z);
            return (
              <g key={`terrain-jump-${m.dist}-${i}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={6 / transform.k}
                  fill="#fef3c7"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={x}
                  y={y + 3 / transform.k}
                  textAnchor="middle"
                  fill="#b45309"
                  style={{
                    fontSize: `${8 / transform.k}px`,
                    fontWeight: 'bold',
                  }}
                >
                  !
                </text>
              </g>
            );
          })}

          {/* Terrain Loading Indicator */}
          {terrainStatus === 'loading' && (
            <g>
              <rect
                x={width - padding - 120}
                y={padding + 5}
                width={115}
                height={24}
                rx="4"
                fill="white"
                fillOpacity="0.9"
                stroke="#e5e7eb"
              />
              <text
                x={width - padding - 60}
                y={padding + 21}
                textAnchor="middle"
                fill="#6b7280"
                style={{ fontSize: '11px' }}
              >
                Henter terreng...
              </text>
            </g>
          )}

          {/* Terrain snap indicator */}
          {tooltip?.type === 'terrain' &&
            tooltip.data?.terrainZ !== null &&
            tooltip.data?.terrainZ !== undefined &&
            tooltip.data?.pipeZ !== null &&
            tooltip.data?.pipeZ !== undefined && (
              <g>
                <line
                  x1={getX(tooltip.data.dist)}
                  y1={getY(tooltip.data.pipeZ)}
                  x2={getX(tooltip.data.dist)}
                  y2={getY(tooltip.data.terrainZ)}
                  stroke="#3b82f6"
                  strokeWidth={2 / transform.k}
                  strokeDasharray="4,2"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.8"
                />
                <circle
                  cx={getX(tooltip.data.dist)}
                  cy={getY(tooltip.data.terrainZ)}
                  r={4 / transform.k}
                  fill="#dbeafe"
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={getX(tooltip.data.dist)}
                  cy={getY(tooltip.data.pipeZ)}
                  r={4 / transform.k}
                  fill="#dbeafe"
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}

          {/* Segment Hit Areas and Tooltips */}
          {plotPoints.map((p, i) => {
            if (i === plotPoints.length - 1) return null;
            const pNext = plotPoints[i + 1];
            const x1 = getX(p.dist);
            const x2 = getX(pNext.dist);
            const y1 = getY(p.z);
            const y2 = getY(pNext.z);

            const segDrop = p.z - pNext.z;
            const segLen = pNext.dist - p.dist;
            const segInclinePermille =
              segLen > 0 ? (segDrop / segLen) * 1000 : 0;

            const isHovered =
              hoveredSegment &&
              ((hoveredSegment.p1 === p.originalIndex &&
                hoveredSegment.p2 === pNext.originalIndex) ||
                (hoveredSegment.p1 === pNext.originalIndex &&
                  hoveredSegment.p2 === p.originalIndex));

            return (
              <g key={`seg-hit-${i}`}>
                {/* Highlight if hovered */}
                {isHovered && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="yellow"
                    strokeWidth={12 / transform.k}
                    strokeOpacity={0.5}
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Invisible Hit Line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={20 / transform.k}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer"
                  onMouseEnter={() => {
                    setHoveredAnalysisSegment({
                      p1: p.originalIndex,
                      p2: pNext.originalIndex,
                    });
                  }}
                  onMouseMove={(e) => {
                    const rect =
                      containerRef.current.getBoundingClientRect();
                    setTooltip({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                      type: 'segment',
                      data: {
                        incline: segInclinePermille,
                        length: segLen,
                        drop: segDrop,
                      },
                    });
                  }}
                  onMouseLeave={() => {
                    setHoveredAnalysisSegment(null);
                    setTooltip(null);
                  }}
                />
              </g>
            );
          })}

          {/* Points and Labels */}
          {plotPoints.map((p, i) => {
            const x = getX(p.dist);
            const y = getY(p.z);
            const isHovered = hoveredPointIndex === p.originalIndex;
            const oc = overcoverData[i] || {};

            return (
              <g
                key={i}
                onMouseEnter={() =>
                  setHoveredAnalysisPoint(p.originalIndex)
                }
                onMouseMove={(e) => {
                  if (
                    oc.terrainZ !== null &&
                    oc.terrainZ !== undefined
                  ) {
                    const rect =
                      containerRef.current.getBoundingClientRect();
                    setTooltip({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                      type: 'point',
                      data: {
                        pipeZ: p.z,
                        terrainZ: oc.terrainZ,
                        overcover: oc.overcover,
                        warning: oc.warning,
                        dist: p.dist,
                      },
                    });
                  }
                }}
                onMouseLeave={() => {
                  setHoveredAnalysisPoint(null);
                  setTooltip(null);
                }}
                className="cursor-pointer"
              >
                {/* Invisible larger target for easier hovering */}
                <circle
                  cx={x}
                  cy={y}
                  r={15 / transform.k}
                  fill="transparent"
                  vectorEffect="non-scaling-stroke"
                />

                <circle
                  cx={x}
                  cy={y}
                  r={(isHovered ? 8 : 5) / transform.k}
                  fill={
                    isHovered
                      ? '#ff0000'
                      : oc.warning
                        ? '#fef2f2'
                        : 'white'
                  }
                  stroke={oc.warning ? '#ef4444' : pipeColor}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={x}
                  y={y + 14 / transform.k}
                  textAnchor="middle"
                  className={`text-[12px] font-bold ${
                    isHovered ? 'fill-red-600' : 'fill-gray-700'
                  }`}
                  style={{ fontSize: `${12 / transform.k}px` }}
                >
                  {formatNumber(p.z, 2)}
                </text>
                <text
                  x={x}
                  y={height - padding + 20 / transform.k}
                  textAnchor="middle"
                  className="text-[10px] text-gray-400"
                  style={{ fontSize: `${10 / transform.k}px` }}
                >
                  {formatNumber(p.dist, 1)}m
                </text>
              </g>
            );
          })}

          {/* Segment Analysis (Incline %) */}
          {plotPoints.map((p, i) => {
            if (i === plotPoints.length - 1) return null;
            const pNext = plotPoints[i + 1];
            const x1 = getX(p.dist);
            const x2 = getX(pNext.dist);
            const y1 = getY(p.z);
            const y2 = getY(pNext.z);

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            const segDrop = p.z - pNext.z;
            const segLen = pNext.dist - p.dist;
            const segInclinePermille =
              segLen > 0 ? (segDrop / segLen) * 1000 : 0;

            let textColor = '#6B7280'; // Default gray

            // Only color code for gravity pipes
            if (result.pipeType !== 'pressure') {
              const minIncline =
                result.details?.minInclineRule?.min ?? 2;
              if (segInclinePermille < 0)
                textColor = '#dc2626'; // Red
              else if (segInclinePermille < minIncline)
                textColor = '#d97706'; // Orange (under krav)
            }

            return (
              <g key={`seg-${i}`}>
                <text
                  x={midX}
                  y={midY + 12 / transform.k}
                  textAnchor="middle"
                  className="text-[11px] font-medium"
                  fill={textColor}
                  style={{ fontSize: `${11 / transform.k}px` }}
                >
                  {formatNumber(segInclinePermille, 1)}‰
                </text>
              </g>
            );
          })}

          {/* Axis Labels */}
          <text
            x={padding}
            y={height - 10 / transform.k}
            textAnchor="middle"
            className="text-[10px] font-bold text-gray-500"
            style={{ fontSize: `${10 / transform.k}px` }}
          >
            START (Høy)
          </text>
          <text
            x={width - padding}
            y={height - 10 / transform.k}
            textAnchor="middle"
            className="text-[10px] font-bold text-gray-500"
            style={{ fontSize: `${10 / transform.k}px` }}
          >
            SLUTT (Lav)
          </text>
        </g>
      </svg>

      {tooltip && (
        <div
          ref={tooltipRef}
          className="absolute z-50 bg-white text-gray-900 text-xs p-2 rounded shadow-lg pointer-events-none whitespace-nowrap border border-gray-200"
          style={(() => {
            if (tooltip.type === 'terrain') {
              const anchorX =
                getX(tooltip.data.dist) * transform.k + transform.x;
              const anchorY =
                getY(tooltip.data.terrainZ) * transform.k +
                transform.y;
              const gap = 10;

              const fitsRight =
                anchorX + gap + tooltipSize.width <= width - 8;
              const left = fitsRight
                ? anchorX + gap
                : Math.max(8, anchorX - gap - tooltipSize.width);

              const top = Math.min(
                Math.max(8, anchorY - tooltipSize.height / 2),
                Math.max(8, height - tooltipSize.height - 8),
              );

              return { left, top };
            }

            const left = Math.min(
              Math.max(8, tooltip.x + 15),
              Math.max(8, width - tooltipSize.width - 8),
            );
            const top = Math.min(
              Math.max(8, tooltip.y + 15),
              Math.max(8, height - tooltipSize.height - 8),
            );
            return { left, top };
          })()}
        >
          {tooltip.type === 'point' ? (
            <>
              <div className="font-bold mb-1 border-b border-gray-700 pb-1">
                Punkt
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="text-gray-400">Avstand:</span>
                <span className="font-mono">
                  {formatNumber(tooltip.data.dist, 1)}m
                </span>

                <span className="text-gray-400">Ledning Z:</span>
                <span className="font-mono">
                  {formatNumber(tooltip.data.pipeZ, 2)}m
                </span>

                <span className="text-gray-400">Terreng Z:</span>
                <span className="font-mono">
                  {formatNumber(tooltip.data.terrainZ, 2)}m
                </span>

                <span className="text-gray-400">Overdekning:</span>
                <span
                  className={`font-mono font-bold ${
                    tooltip.data.warning
                      ? 'text-red-400'
                      : 'text-green-400'
                  }`}
                >
                  {formatNumber(tooltip.data.overcover, 2)}m
                  {tooltip.data.warning && ' ⚠'}
                </span>
              </div>
              {tooltip.data.warning && (
                <div className="mt-1 pt-1 border-t border-gray-700 text-red-400 text-[10px]">
                  Under minstekrav ({formatNumber(minOvercover, 1)}m)
                </div>
              )}
            </>
          ) : tooltip.type === 'terrain' ? (
            <>
              <div className="font-bold mb-1 border-b border-gray-700 pb-1">
                Terrengpunkt
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="text-gray-400">Avstand:</span>
                <span className="font-mono">
                  {formatNumber(tooltip.data.dist, 1)}m
                </span>

                <span className="text-gray-400">Terreng Z:</span>
                <span className="font-mono">
                  {formatNumber(tooltip.data.terrainZ, 2)}m
                </span>

                <span className="text-gray-400">
                  Ledning Z (interp):
                </span>
                <span className="font-mono">
                  {formatNumber(tooltip.data.pipeZ, 2)}m
                </span>

                <span className="text-gray-400">Overdekning:</span>
                <span
                  className={`font-mono font-bold ${
                    tooltip.data.overcover !== null &&
                    tooltip.data.overcover < minOvercover
                      ? 'text-red-400'
                      : 'text-green-400'
                  }`}
                >
                  {formatNumber(tooltip.data.overcover, 2)}m
                  {tooltip.data.overcover !== null &&
                    tooltip.data.overcover < minOvercover &&
                    ' ⚠'}
                </span>

                <span className="text-gray-400">Punkt:</span>
                <span className="font-mono">
                  {tooltip.data.isVertex ? 'Målt' : 'Interpolert'}
                </span>
              </div>
              {tooltip.data.terreng && (
                <div className="mt-1 pt-1 border-t border-gray-700 text-[10px] text-gray-300">
                  Terrengtype: {tooltip.data.terreng}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="font-bold mb-1 border-b border-gray-700 pb-1">
                Seksjon
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="text-gray-400">Fall:</span>
                <span
                  className={`font-mono font-bold ${
                    tooltip.data.incline < 0 &&
                    result.pipeType !== 'pressure'
                      ? 'text-red-400'
                      : 'text-green-400'
                  }`}
                >
                  {formatNumber(tooltip.data.incline, 2)}‰
                </span>

                <span className="text-gray-400">Lengde:</span>
                <span className="font-mono">
                  {formatNumber(tooltip.data.length, 2)}m
                </span>

                <span className="text-gray-400">Høydeforskjell:</span>
                <span className="font-mono">
                  {formatNumber(tooltip.data.drop, 3)}m
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
