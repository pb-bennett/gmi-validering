'use client';

import { useEffect, useId, useRef } from 'react';
import useStore from '@/lib/store';
import AnalysisErrorBoundary, { AnalysisErrorMessage } from './AnalysisErrorBoundary';
import { XIcon } from '@phosphor-icons/react';

const formatIndices = (indices, max = 20) => {
  if (!Array.isArray(indices) || indices.length === 0) return '-';
  if (indices.length <= max) return indices.join(', ');
  return `${indices.slice(0, max).join(', ')} (+${
    indices.length - max
  })`;
};

/**
 * Docked in the map pane, on less than half its width: never under the sidebar, and the object «Vis i kart» centres stays
 * visible. Not modal, so map and layers keep working; focus moves in on opening and returns to the opener on closing.
 */
function HeightControlPanel({ labelledBy, label, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const panel = ref.current, opener = document.activeElement;
    panel.focus({ preventScroll: true });
    return () => {
      // Focus already moved elsewhere (map, another tool) stays there.
      const lost = document.activeElement === document.body || panel.contains(document.activeElement);
      if (!lost) return;
      // The load prompt that opened it is gone by then; the map is what the control was used with.
      const target = opener?.isConnected && opener !== document.body ? opener : document.querySelector('.leaflet-container');
      target?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={labelledBy}
      aria-label={label}
      tabIndex={-1}
      data-height-control
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
      className="pointer-events-auto flex max-h-full w-[clamp(17rem,calc(50%-2.5rem),26rem)] flex-col overflow-hidden rounded-lg border border-gmi-border-strong bg-gmi-surface text-gmi-text shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gmi-interactive"
    >
      {children}
    </div>
  );
}

export default function ZValidationModal() {
  const isOpen = useStore((state) => state.zValidation.isOpen);
  const layerId = useStore((state) => state.zValidation.layerId);
  const toggleZValidationModal = useStore(
    (state) => state.toggleZValidationModal,
  );
  const openLayerZValidation = useStore(
    (state) => state.openLayerZValidation,
  );
  return (
    <AnalysisErrorBoundary
      resetKey={`${isOpen}:${layerId}`}
      onRetry={() => openLayerZValidation(layerId, { rerun: true })}
      renderFallback={(retry) => isOpen && (
        <HeightControlPanel label="Høydekontroll" onClose={() => toggleZValidationModal(false)}>
          <AnalysisErrorMessage kind="hoyde" title="Høydekontrollen kunne ikke vises."
            closeLabel="Lukk høydekontroll" onRetry={retry} onClose={() => toggleZValidationModal(false)} />
        </HeightControlPanel>
      )}
    >
      <ZValidationPanel />
    </AnalysisErrorBoundary>
  );
}

function ZValidationPanel() {
  // The layer whose control was opened owns both the results and the objects. The global slices are the legacy
  // single-file state and are used only when no layer owns the control.
  const layerId = useStore((state) => state.zValidation.layerId);
  const layerName = useStore((state) => state.layers[layerId]?.name);
  const data = useStore((state) =>
    layerId ? state.layers[layerId]?.data : state.data,
  );
  const results = useStore((state) =>
    layerId
      ? state.layers[layerId]?.zValidation?.results
      : state.zValidation.results,
  );
  const isOpen = useStore((state) => state.zValidation.isOpen);
  const toggleZValidationModal = useStore(
    (state) => state.toggleZValidationModal,
  );
  const viewObjectInMap = useStore((state) => state.viewObjectInMap);
  const titleId = useId();

  if (!isOpen || !data) return null;

  const summary = results?.summary;
  const missingPoints = results?.missingPoints || [];
  const missingLines = results?.missingLines || [];

  const handleFocusPoint = (index) => {
    const coord = data?.points?.[index]?.coordinates?.[0];
    if (!coord) return;
    if (!layerId) {
      viewObjectInMap(`punkter-${index}`, [coord.y, coord.x], 20);
      return;
    }
    viewObjectInMap(`punkter-${layerId}-${index}`, [coord.y, coord.x], 20, {
      layerId,
      objectType: 'point',
      pointIndex: index,
    });
  };

  const handleFocusLine = (index) => {
    const coord = data?.lines?.[index]?.coordinates?.[0];
    if (!coord) return;
    if (!layerId) {
      viewObjectInMap(`ledninger-${index}`, [coord.y, coord.x], 19);
      return;
    }
    viewObjectInMap(`ledninger-${layerId}-${index}`, [coord.y, coord.x], 19, {
      layerId,
      objectType: 'pipe',
      lineIndex: index,
    });
  };

  return (
    <HeightControlPanel key={layerId} labelledBy={titleId} onClose={() => toggleZValidationModal(false)}>
        <div className="flex-none p-3 border-b border-gmi-border flex gap-2 justify-between items-start bg-gmi-surface-soft">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-gmi-navy">
              Høydekontroll (Z)
            </h2>
            {layerName && (
              <p className="break-all text-sm font-medium text-gmi-text">{layerName}</p>
            )}
            <p className="text-xs text-gmi-text-muted">
              Kontrollerer at alle objekter har gyldig Z-verdi.
            </p>
          </div>
          <button
            onClick={() => toggleZValidationModal(false)}
            className="gmi-compact-button gmi-focus-ring shrink-0 p-1.5 text-gmi-text-muted"
            aria-label="Lukk høydekontroll"
          >
            <XIcon size={20} weight="regular" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded border border-gmi-border p-3 bg-gmi-surface-soft">
              <div className="font-medium text-gmi-navy">Punkter</div>
              <div className="text-gmi-text-muted text-xs mt-1">
                <span
                  className={summary?.missingPointObjects
                    ? 'font-semibold text-red-700'
                    : 'font-semibold text-green-700'}
                >
                  {summary?.missingPointObjects || 0}
                </span>{' '}
                av{' '}
                {summary?.totalPoints || 0} punkter mangler Z
              </div>
              <div className="text-gmi-text-subtle text-xs">
                {summary?.missingPointCoords || 0} av{' '}
                {summary?.totalPointCoords || 0} punktkoordinater
              </div>
            </div>
            <div className="rounded border border-gmi-border p-3 bg-gmi-surface-soft">
              <div className="font-medium text-gmi-navy">Linjer</div>
              <div className="text-gmi-text-muted text-xs mt-1">
                <span
                  className={summary?.missingLineObjects
                    ? 'font-semibold text-red-700'
                    : 'font-semibold text-green-700'}
                >
                  {summary?.missingLineObjects || 0}
                </span>{' '}
                av{' '}
                {summary?.totalLines || 0} linjer mangler Z
              </div>
              <div className="text-gmi-text-subtle text-xs">
                {summary?.missingLineCoords || 0} av{' '}
                {summary?.totalLineCoords || 0} linjepunkter
              </div>
            </div>
          </div>

          {missingPoints.length === 0 &&
            missingLines.length === 0 && (
              <div className="text-sm text-green-700">
                Ingen objekter mangler høyde (Z).
              </div>
            )}

          {missingPoints.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gmi-text mb-2">
                Punkter uten Z ({missingPoints.length})
              </h3>
              <div className="border border-gmi-border rounded overflow-auto max-h-64">
                <table className="min-w-full divide-y divide-gmi-border text-xs">
                  <thead className="bg-gmi-surface-soft sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-gmi-text-subtle uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium text-gmi-text-subtle uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium text-gmi-text-subtle uppercase tracking-wider">
                        Manglende indeks
                      </th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="bg-gmi-surface divide-y divide-gmi-border">
                    {missingPoints.map((point) => (
                      <tr key={`z-point-${point.index}`}>
                        <td className="px-2 py-1.5 text-gmi-text-muted">
                          {point.index + 1}
                        </td>
                        <td className="px-2 py-1.5 text-gmi-text">
                          {point.label}
                        </td>
                        <td className="px-2 py-1.5 text-gmi-text-subtle">
                          {formatIndices(point.missingIndices)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            onClick={() =>
                              handleFocusPoint(point.index)
                            }
                            className="gmi-compact-button gmi-focus-ring whitespace-nowrap px-2 py-1 border border-gmi-border bg-gmi-surface"
                          >
                            Vis i kart
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {missingLines.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gmi-text mb-2">
                Linjer uten Z ({missingLines.length})
              </h3>
              <div className="border border-gmi-border rounded overflow-auto max-h-64">
                <table className="min-w-full divide-y divide-gmi-border text-xs">
                  <thead className="bg-gmi-surface-soft sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-gmi-text-subtle uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium text-gmi-text-subtle uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium text-gmi-text-subtle uppercase tracking-wider">
                        Manglende indeks
                      </th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="bg-gmi-surface divide-y divide-gmi-border">
                    {missingLines.map((line) => (
                      <tr key={`z-line-${line.index}`}>
                        <td className="px-2 py-1.5 text-gmi-text-muted">
                          {line.index + 1}
                        </td>
                        <td className="px-2 py-1.5 text-gmi-text">
                          {line.label}
                        </td>
                        <td className="px-2 py-1.5 text-gmi-text-subtle">
                          {formatIndices(line.missingIndices)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            onClick={() =>
                              handleFocusLine(line.index)
                            }
                            className="gmi-compact-button gmi-focus-ring whitespace-nowrap px-2 py-1 border border-gmi-border bg-gmi-surface"
                          >
                            Vis i kart
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
    </HeightControlPanel>
  );
}
