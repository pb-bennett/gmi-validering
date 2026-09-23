'use client';

import React, { useMemo, useRef, useState } from 'react';
import useStore from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import LayerPanel from './LayerPanel';
import fieldsData from '@/data/fields.json';
import { CaretDownIcon, PlusIcon } from '@phosphor-icons/react';

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
        <p className="mb-3 text-sm text-gmi-text-muted">
          Ingen filer lastet opp ennå.
        </p>
        <button
          onClick={onAddFile}
          className="gmi-primary-control gmi-focus-ring px-4 py-2 text-sm font-medium"
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
        className="flex items-center justify-between border-b border-gmi-border bg-gmi-surface px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold text-gmi-navy"
          >
            Lag
          </span>
          <span className="text-[10px] text-gmi-text-subtle">
            ({visibleCount}/{totalCount} synlige)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={showAllLayers}
            className="gmi-focus-ring rounded-lg px-2 py-1 text-[10px] font-medium text-gmi-interactive transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy"
            title="Vis alle lag"
          >
            Vis alle
          </button>
          <button
            onClick={hideAllLayers}
            className="gmi-focus-ring rounded-lg px-2 py-1 text-[10px] font-medium text-gmi-interactive transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy"
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
            <div className="border-b-2 border-gmi-border">
              <div className="flex items-center gap-2 p-2 hover:bg-gmi-surface-soft">
                <input
                  type="checkbox"
                  checked={mapOverlayVisibility?.geminiWms !== false}
                  onChange={() =>
                    setMapOverlayVisibility(
                      'geminiWms',
                      mapOverlayVisibility?.geminiWms === false,
                    )
                  }
                  className="h-3.5 w-3.5 rounded border-gmi-border-strong accent-gmi-interactive text-gmi-interactive focus:ring-gmi-interactive"
                  title="Vis/skjul Gemini WMS"
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate text-xs font-medium text-gmi-text"
                  >
                    Gemini WMS
                  </div>
                  <div className="text-[10px] text-gmi-text-subtle">
                    Eksternt WMS-lag
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWmsExpanded((prev) => !prev)}
                  className="gmi-focus-ring rounded-lg p-1 text-gmi-text-subtle hover:bg-gmi-surface-soft hover:text-gmi-navy"
                  title={
                    isWmsExpanded
                      ? 'Skjul innstillinger'
                      : 'Vis innstillinger'
                  }
                  aria-label={
                    isWmsExpanded
                      ? 'Skjul innstillinger'
                      : 'Vis innstillinger'
                  }
                >
                  <CaretDownIcon
                    size={12}
                    weight="regular"
                    aria-hidden="true"
                    className={`inline-block transition-transform ${isWmsExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              {isWmsExpanded && (
                <div className="px-2 pb-2">
                  <div className="ml-5 border-l border-gmi-border pl-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gmi-text-muted">
                        Opasitet
                      </span>
                      <span className="font-mono text-[10px] text-gmi-text-subtle">
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
                      className="h-1.5 w-full accent-gmi-interactive"
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
        className="border-t border-gmi-border bg-gmi-surface px-3 py-2"
      >
        <button
          onClick={onAddFile}
          className="gmi-compact-button gmi-focus-ring flex w-full items-center justify-center gap-2 border border-gmi-border-strong bg-gmi-surface px-3 py-2 text-xs font-medium"
        >
          <PlusIcon size={16} weight="regular" aria-hidden="true" />
          Legg til fil
        </button>
      </div>
    </div>
  );
}
