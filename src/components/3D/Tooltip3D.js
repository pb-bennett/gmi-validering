'use client';

import useStore from '@/lib/store';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

// Get a human-readable label for point objects based on S_FCODE
function getPointTypeLabel(fcode) {
  if (!fcode) return '⚫ Punkt';

  const code = fcode.toUpperCase();

  // Common point type mappings
  if (code.includes('KUM')) return '🟤 Kum';
  if (code.includes('SLU') || code === 'SLU') return '🟤 Sluk';
  if (code.includes('SLS') || code === 'SLS') return '🟤 Slukkum';
  if (code.includes('LOK')) return '⚫ Kumlokk';
  if (code.includes('VF') || code.includes('VANNF'))
    return '🔵 Vannforsyning';
  if (code.includes('VL')) return '🔵 Vannpunkt';
  if (code.includes('SP')) return '🟢 Spillvannspunkt';
  if (code.includes('OV')) return '⚪ Overvannspunkt';
  if (code.includes('DR')) return '🟠 Drenpunkt';
  if (code.includes('KRN')) return '🔵 Kran';
  if (code.includes('GRN')) return '🟢 Grenpunkt';
  if (code.includes('ANB')) return '🔵 Anboring';
  if (code.includes('SAN')) return '⚫ Sandfang';
  if (code.includes('PUMPE') || code.includes('PUMP'))
    return '⚙️ Pumpestasjon';
  if (code.includes('BEND') || code.includes('BEN')) return '📐 Bend';
  if (code.includes('RED')) return '📐 Reduksjon';
  if (code.includes('T-RØR') || code.includes('TEE'))
    return '📐 T-rør';
  if (code.includes('DIV')) return '⚫ Diverse';

  return '⚫ Punkt';
}

export default function Tooltip3D({ object, position, onClose }) {
  const viewObjectInMap = useStore((state) => state.viewObjectInMap);
  const openDataInspector = useStore(
    (state) => state.openDataInspector,
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

  const handleInspectData = () => {
    if (object.type === 'pipe' && object.lineIndex !== undefined) {
      openDataInspector({ type: 'line', index: object.lineIndex });
    }

    if (object.type === 'point' && object.pointIndex !== undefined) {
      openDataInspector({ type: 'point', index: object.pointIndex });
    }

    onClose();
  };

  return (
    <div
      ref={tooltipRef}
      className="fixed z-10002 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-200/50 p-2.5 min-w-60 max-w-80 text-[11px] leading-tight"
      style={{
        left: `${clampedPos?.x ?? position.x}px`,
        top: `${clampedPos?.y ?? position.y}px`,
        transform: 'translate(-50%, -120%)',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
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
      <div className="mb-1.5 pb-1 border-b border-gray-100 flex items-center gap-1 whitespace-nowrap">
        <span className="font-semibold text-gray-800">
          {object.type === 'pipe'
            ? '🔵 Ledning'
            : getPointTypeLabel(object.fcode)}
        </span>
        {object.fcode && (
          <>
            <span className="text-gray-400">•</span>
            <span className="text-gray-500 font-semibold">
              {object.fcode}
            </span>
          </>
        )}
      </div>

      {/* Attributes */}
      <div className="space-y-1 mb-2 max-h-40 overflow-auto">
        {object.attributes &&
          Object.entries(object.attributes)
            .filter(([key]) => !key.startsWith('_'))
            .slice(0, 12)
            .map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between gap-2"
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

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleViewInMap}
          className="px-2 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded-md transition-colors font-medium flex items-center justify-center gap-1"
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
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          Vis i kart
        </button>

        <button
          onClick={handleInspectData}
          className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium flex items-center justify-center gap-1"
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
              d="M8 6h8M8 10h8M8 14h4m-6 6h8a2 2 0 002-2V6a2 2 0 00-2-2H8a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          Inspiser data
        </button>
      </div>
    </div>
  );
}
