'use client';

import React, { useMemo, useRef, useState } from 'react';
import useStore from '@/lib/store';
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
  const layerOrder = useStore((state) => state.layerOrder);
  const showAllLayers = useStore((state) => state.showAllLayers);
  const hideAllLayers = useStore((state) => state.hideAllLayers);

  // Build code lookups for tema labels
  const codeLookups = useMemo(() => {
    const punktField = fieldsData.find((f) => f.fieldKey === 'Tema_punkt');
    const ledField = fieldsData.find((f) => f.fieldKey === 'Tema_led');

    const punktMap = new Map(
      punktField?.acceptableValues?.map((v) => [v.value, v.label]) || [],
    );
    const ledMap = new Map(
      ledField?.acceptableValues?.map((v) => [v.value, v.label]) || [],
    );

    return { punktMap, ledMap };
  }, []);

  // Calculate visibility stats
  const visibleCount = layerOrder.filter((id) => layers[id]?.visible).length;
  const totalCount = layerOrder.length;

  if (totalCount === 0) {
    return (
      <div className="p-3 text-center">
        <p className="text-sm text-gray-500 mb-3">Ingen filer lastet opp ennå.</p>
        <button
          onClick={onAddFile}
          className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'white',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
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
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-sidebar-bg)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
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
      <div className="flex-1 overflow-y-auto pb-6">
        {layerOrder.map((layerId) => (
          <LayerPanel
            key={layerId}
            layerId={layerId}
            codeLookups={codeLookups}
          />
        ))}
      </div>

      {/* Add file button */}
      <div
        className="px-3 py-2 border-t"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-sidebar-bg)' }}
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
            e.currentTarget.style.backgroundColor = 'var(--color-primary)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-card)';
            e.currentTarget.style.color = 'var(--color-primary)';
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Legg til fil
        </button>
      </div>
    </div>
  );
}
