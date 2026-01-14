'use client';

import useStore from '@/lib/store';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

// Get a human-readable label for point objects based on S_FCODE
function getPointTypeLabel(fcode) {
  if (!fcode) return 'Punkt';

  const code = fcode.toUpperCase();

  // Common point type mappings
  if (code.includes('KUM')) return 'Kum';
  if (code.includes('SLU') || code === 'SLU') return 'Sluk';
  if (code.includes('SLS') || code === 'SLS') return 'Slukkum';
  if (code.includes('LOK')) return 'Kumlokk';
  if (code.includes('VF') || code.includes('VANNF'))
    return 'Vannforsyning';
  if (code.includes('VL')) return 'Vannpunkt';
  if (code.includes('SP')) return 'Spillvannspunkt';
  if (code.includes('OV')) return 'Overvannspunkt';
  if (code.includes('DR')) return 'Drenpunkt';
  if (code.includes('KRN')) return 'Kran';
  if (code.includes('GRN')) return 'Grenpunkt';
  if (code.includes('ANB')) return 'Anboring';
  if (code.includes('SAN')) return 'Sandfang';
  if (code.includes('PUMPE') || code.includes('PUMP'))
    return 'Pumpestasjon';
  if (code.includes('BEND') || code.includes('BEN')) return 'Bend';
  if (code.includes('RED')) return 'Reduksjon';
  if (code.includes('T-RØR') || code.includes('TEE'))
    return 'T-rør';
  if (code.includes('DIV')) return 'Diverse';

  return 'Punkt';
}

export default function Tooltip3D({ object, position, onClose }) {
  const viewObjectInMap = useStore((state) => state.viewObjectInMap);
  const toggleAnalysisModal = useStore(
    (state) => state.toggleAnalysisModal
  );
  const selectAnalysisPipe = useStore(
    (state) => state.selectAnalysisPipe
  );

  const tooltipRef = useRef(null);
  const [clampedPos, setClampedPos] = useState(position);
  const margin = 12;

  const clamp = useMemo(
    () => (value, min, max) => {
      if (!Number.isFinite(value)) return min;
      if (!Number.isFinite(min) || !Number.isFinite(max))
        return value;
      return Math.min(Math.max(value, min), max);
    },
    []
  );

  if (!object) return null;

  useLayoutEffect(() => {
    setClampedPos(position);

    const compute = () => {
      const el = tooltipRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const width = rect.width || 0;
      const height = rect.height || 0;

      const minX = margin + width / 2;
      const maxX = window.innerWidth - margin - width / 2;

      // Tooltip is rendered above the anchor via translate(-50%, -120%).
      // Ensure its top edge doesn't go off-screen.
      const minY = margin + height * 1.2;
      const maxY = window.innerHeight - margin;

      setClampedPos((prev) => {
        const nextX = clamp(position.x, minX, maxX);
        const nextY = clamp(position.y, minY, maxY);
        if (prev?.x === nextX && prev?.y === nextY) return prev;
        return { x: nextX, y: nextY };
      });
    };

    // Compute after layout/paint so we have correct dimensions.
    const raf = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', compute);
    };
  }, [position, clamp]);

  const handleViewInMap = () => {
    // Get coordinates from object
    const coords = object.coordinates;
    const featureId = object.featureId;

    if (coords && featureId) {
      // Pass object type and line index for profilanalyse integration
      viewObjectInMap(featureId, coords, 20, {
        objectType: object.type,
        lineIndex: object.lineIndex,
      });
    }
    onClose();
  };

  return (
    <div
      ref={tooltipRef}
      className="fixed z-10002 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-200/50 p-4 min-w-75 max-w-100"
      style={{
        left: `${clampedPos?.x ?? position.x}px`,
        top: `${clampedPos?.y ?? position.y}px`,
        transform: 'translate(-50%, -120%)',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
        title="Lukk"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Object type header */}
      <div className="mb-3 pb-2 border-b border-gray-100">
        <h3 className="font-semibold text-base text-gray-800">
          {object.type === 'pipe'
            ? 'Ledning'
            : getPointTypeLabel(object.fcode)}
        </h3>
        <p className="text-sm text-gray-500 font-medium">
          {object.fcode}
        </p>
      </div>

      {/* Attributes */}
      <div className="space-y-1.5 mb-4">
        {object.attributes &&
          Object.entries(object.attributes)
            .filter(([key]) => !key.startsWith('_'))
            .slice(0, 8)
            .map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between text-sm gap-4"
              >
                <span className="font-medium text-gray-500">
                  {key}:
                </span>
                <span className="text-gray-800 font-medium">
                  {String(value)}
                </span>
              </div>
            ))}
      </div>

      {/* Button container */}
      <div className="space-y-2">
        {/* Åpne Profilanalyse button - only for pipes */}
        {object.type === 'pipe' && object.lineIndex !== undefined && (
          <button
            onClick={() => {
              toggleAnalysisModal(true);
              selectAnalysisPipe(object.lineIndex);
              onClose();
            }}
            className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            Åpne Profilanalyse
          </button>
        )}

        {/* View in Map button */}
        <button
          onClick={handleViewInMap}
          className="w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          Vis i kart
        </button>
      </div>
    </div>
  );
}
