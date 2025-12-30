'use client';

import useStore from '@/lib/store';
import { useState, useMemo, useEffect, useRef } from 'react';
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
    (state) => state.analysis.selectedPipeIndex
  );
  const selectPipe = useStore((state) => state.selectAnalysisPipe);

  // Filters
  const [selectedType, setSelectedType] = useState('ALL');
  const [showWarning, setShowWarning] = useState(true);
  const [showOk, setShowOk] = useState(true);
  const [showStandardsModal, setShowStandardsModal] = useState(false);

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
        (r) => r.status === 'warning'
      );
      if (firstWarning) {
        selectPipe(firstWarning.lineIndex);
      } else {
        selectPipe(results[0].lineIndex);
      }
    }
  }, [isOpen, results, selectedPipeIndex, selectPipe]);

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[2000] h-[45vh] bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex flex-col border-t border-gray-200">
      {/* Header */}
      <div className="flex-none p-3 border-b flex justify-between items-center bg-gray-50">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            Fallanalyse (Selvfall)
            <span className="text-xs font-normal text-gray-500">
              ({filteredResults.length} av {results.length} ledninger)
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStandardsModal(true)}
            className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 border border-blue-200 flex items-center gap-1"
            title="Se krav til fall"
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
            Krav til fall
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
            {filteredResults.map((res) => (
              <div
                key={res.lineIndex}
                onClick={() => selectPipe(res.lineIndex)}
                className={`p-3 border-b cursor-pointer hover:bg-gray-100 ${
                  selectedPipeIndex === res.lineIndex
                    ? 'bg-blue-50 border-l-4 border-l-blue-500'
                    : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="font-medium text-sm">
                    {res.attributes.Nett_type || 'Ukjent'} -{' '}
                    {res.attributes.Dimensjon ||
                      res.attributes.Dim ||
                      '?'}
                    mm
                  </span>
                  <StatusBadge status={res.status} />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {res.message}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  ID: {res.lineIndex}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content - Visualization */}
        <div className="flex-1 p-4 overflow-y-auto bg-white flex flex-col">
          {selectedResult ? (
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="flex justify-between items-start flex-none">
                <h3 className="text-base font-bold">
                  Ledning #{selectedResult.lineIndex}
                </h3>
                <div className="text-xs text-gray-500">
                  {selectedResult.attributes.Nett_type || 'Ukjent'} -{' '}
                  {selectedResult.attributes.Dimensjon ||
                    selectedResult.attributes.Dim ||
                    '?'}
                  mm
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 text-xs flex-none">
                <div className="p-2 bg-gray-50 rounded">
                  <span className="block text-gray-500 uppercase text-[10px]">
                    Status
                  </span>
                  <span
                    className={`font-bold ${getStatusColor(
                      selectedResult.status
                    )}`}
                  >
                    {selectedResult.message}
                  </span>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <span className="block text-gray-500 uppercase text-[10px]">
                    Fall (‰)
                  </span>
                  <span className="font-bold text-sm">
                    {formatNumber(selectedResult.details.incline, 2)}‰
                  </span>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <span className="block text-gray-500 uppercase text-[10px]">
                    Lengde
                  </span>
                  <span className="font-mono">
                    {formatNumber(selectedResult.details.length, 2)} m
                  </span>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <span className="block text-gray-500 uppercase text-[10px]">
                    Høydeforskjell
                  </span>
                  <span className="font-mono">
                    {formatNumber(selectedResult.details.deltaZ, 3)} m
                  </span>
                </div>
              </div>

              {/* Cross Section Visualization */}
              <div className="border rounded-lg p-3 bg-white shadow-sm flex-1 flex flex-col min-h-0">
                <h4 className="text-xs font-semibold mb-2 text-gray-500 uppercase tracking-wider flex-none">
                  Profilvisning
                </h4>
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
  if (code.includes('VL') || code.includes('VANN')) return '#0066cc';
  if (code.includes('SP') || code.includes('SPILLVANN'))
    return '#228B22';
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

  const setHoveredAnalysisPoint = useStore(
    (state) => state.setHoveredAnalysisPoint
  );
  const hoveredPointIndex = useStore(
    (state) => state.analysis.hoveredPointIndex
  );

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

  if (startZ === null || endZ === null) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 rounded text-gray-500">
        Kan ikke vise profil: Mangler Z-koordinater
      </div>
    );
  }

  // Prepare points for visualization (Always Flow Left -> Right)
  let plotPoints = [];
  if (profilePoints && profilePoints.length > 0) {
    if (isDigitizedBackwards) {
      plotPoints = profilePoints
        .map((p, i) => ({
          ...p,
          originalIndex: i,
          dist: length - p.dist,
        }))
        .sort((a, b) => a.dist - b.dist);
    } else {
      plotPoints = profilePoints.map((p, i) => ({
        ...p,
        originalIndex: i,
      }));
    }
  } else {
    plotPoints = [
      {
        dist: 0,
        z: isDigitizedBackwards ? endZ : startZ,
        originalIndex: isDigitizedBackwards ? 1 : 0,
      },
      {
        dist: length,
        z: isDigitizedBackwards ? startZ : endZ,
        originalIndex: isDigitizedBackwards ? 0 : 1,
      },
    ];
  }

  // Use actual container dimensions
  const { width, height } = dimensions;
  if (width === 0 || height === 0)
    return <div ref={containerRef} className="w-full h-full" />;

  const padding = 40;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const minZ = Math.min(...plotPoints.map((p) => p.z));
  const maxZ = Math.max(...plotPoints.map((p) => p.z));
  const zRange = maxZ - minZ || 1;
  const zBuffer = zRange * 0.3;
  const plotMinZ = minZ - zBuffer;
  const plotMaxZ = maxZ + zBuffer;
  const plotZRange = plotMaxZ - plotMinZ;

  const getX = (dist) => padding + (dist / length) * plotWidth;
  const getY = (z) =>
    height - padding - ((z - plotMinZ) / plotZRange) * plotHeight;

  let pathData = `M ${getX(plotPoints[0].dist)} ${getY(
    plotPoints[0].z
  )}`;
  for (let i = 1; i < plotPoints.length; i++) {
    pathData += ` L ${getX(plotPoints[i].dist)} ${getY(
      plotPoints[i].z
    )}`;
  }

  const pipeColor = getColorByFCode(
    result.attributes.Tema || result.attributes.S_FCODE
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
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setTransform({
      ...transform,
      x: transformStartRef.current.x + dx,
      y: transformStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
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

          {/* Points and Labels */}
          {plotPoints.map((p, i) => {
            const x = getX(p.dist);
            const y = getY(p.z);
            const isHovered = hoveredPointIndex === p.originalIndex;

            return (
              <g
                key={i}
                onMouseEnter={() =>
                  setHoveredAnalysisPoint(p.originalIndex)
                }
                onMouseLeave={() => setHoveredAnalysisPoint(null)}
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
                  fill={isHovered ? '#ff0000' : 'white'}
                  stroke={pipeColor}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={x}
                  y={y - 15 / transform.k}
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
            if (segInclinePermille < 0) textColor = '#dc2626'; // Red
            else if (segInclinePermille < 2) textColor = '#d97706'; // Orange (< 2‰)

            return (
              <g key={`seg-${i}`}>
                <text
                  x={midX}
                  y={midY - 10 / transform.k}
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
    </div>
  );
}
