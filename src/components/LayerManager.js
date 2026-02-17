'use client';

import React, { useMemo, useRef, useState } from 'react';
import useStore from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import LayerPanel from './LayerPanel';
import fieldsData from '@/data/fields.json';

/**
 * LayerManager - Manages multiple file layers
 *
 * Shows a list of layers with:
 * - Show/Hide all buttons
 * - Add file button
 * - Expandable LayerPanel for each layer
 */
export default function LayerManager({ onAddFile }) {
  const layers = useStore((state) => state.layers);
  const layerOrder = useStore(
    useShallow((state) => state.layerOrder),
  );
  const showAllLayers = useStore((state) => state.showAllLayers);
  const hideAllLayers = useStore((state) => state.hideAllLayers);
  const mapOverlayVisibility = useStore(
    (state) => state.ui.mapOverlayVisibility,
  );
  const setMapOverlayVisibility = useStore(
    (state) => state.setMapOverlayVisibility,
  );
  const setCustomWmsConfig = useStore(
    (state) => state.setCustomWmsConfig,
  );
  const customWmsConfig = useStore((state) => state.customWmsConfig);
  const [isWmsExpanded, setIsWmsExpanded] = useState(false);

  // Build code lookups for tema labels
  const codeLookups = useMemo(() => {
    const punktField = fieldsData.find(
      (f) => f.fieldKey === 'Tema_punkt',
    );
    const ledField = fieldsData.find(
      (f) => f.fieldKey === 'Tema_led',
    );

    const punktMap = new Map(
      punktField?.acceptableValues?.map((v) => [v.value, v.label]) ||
        [],
    );
    const ledMap = new Map(
      ledField?.acceptableValues?.map((v) => [v.value, v.label]) ||
        [],
    );

    return { punktMap, ledMap };
  }, []);

  // Calculate visibility stats
  const visibleCount = layerOrder.filter(
    (id) => layers[id]?.visible,
  ).length;
  const totalCount = layerOrder.length;

  if (totalCount === 0) {
    return (
      <div className="p-3 text-center">
        <p className="text-sm text-gray-500 mb-3">
          Ingen filer lastet opp ennå.
        </p>
        <button
          onClick={onAddFile}
          className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'white',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor =
              'var(--color-primary-dark)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor =
              'var(--color-primary)')
          }
        >
          Last opp fil
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Layer controls header */}
      <div
        className="px-3 py-2 border-b flex items-center justify-between"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-sidebar-bg)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            Lag
          </span>
          <span className="text-[10px] text-gray-500">
            ({visibleCount}/{totalCount} synlige)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={showAllLayers}
            className="px-2 py-1 text-[10px] text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Vis alle lag"
          >
            Vis alle
          </button>
          <button
            onClick={hideAllLayers}
            className="px-2 py-1 text-[10px] text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Skjul alle lag"
          >
            Skjul alle
          </button>
        </div>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto overflow-x-visible pb-6">
        {layerOrder.map((layerId) => (
          <LayerPanel
            key={layerId}
            layerId={layerId}
            codeLookups={codeLookups}
          />
        ))}

        {customWmsConfig?.url && (
          <div className="py-1">
            <div
              className="border-b-2"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center gap-2 p-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={mapOverlayVisibility?.geminiWms !== false}
                  onChange={() =>
                    setMapOverlayVisibility(
                      'geminiWms',
                      mapOverlayVisibility?.geminiWms === false,
                    )
                  }
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  title="Vis/skjul Gemini WMS"
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-xs font-medium truncate"
                    style={{ color: 'var(--color-text)' }}
                  >
                    Gemini WMS
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Eksternt WMS-lag
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWmsExpanded((prev) => !prev)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500"
                  title={
                    isWmsExpanded
                      ? 'Skjul innstillinger'
                      : 'Vis innstillinger'
                  }
                >
                  <span
                    className={`text-xs inline-block transition-transform ${isWmsExpanded ? 'rotate-180' : ''}`}
                  >
                    ▼
                  </span>
                </button>
              </div>

              {isWmsExpanded && (
                <div className="px-2 pb-2">
                  <div className="ml-5 pl-2 border-l border-gray-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-600">
                        Opasitet
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {Math.round(
                          (customWmsConfig?.opacity ?? 1) * 100,
                        )}
                        %
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={Math.round(
                        (customWmsConfig?.opacity ?? 1) * 100,
                      )}
                      onChange={(e) => {
                        const nextOpacity =
                          Number(e.target.value) / 100;
                        setCustomWmsConfig({
                          ...customWmsConfig,
                          opacity: nextOpacity,
                        });
                      }}
                      className="w-full h-1.5 accent-blue-600"
                      title="Juster opasitet for Gemini WMS"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add file button */}
      <div
        className="px-3 py-2 border-t"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-sidebar-bg)',
        }}
      >
        <button
          onClick={onAddFile}
          className="w-full px-3 py-2 text-xs font-medium rounded transition-colors border flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-primary)',
            borderColor: 'var(--color-primary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              'var(--color-primary)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor =
              'var(--color-card)';
            e.currentTarget.style.color = 'var(--color-primary)';
          }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Legg til fil
        </button>
      </div>
    </div>
  );
}
