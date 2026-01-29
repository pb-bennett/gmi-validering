'use client';

import { useState, useMemo } from 'react';
import { FCODE_COLORS, LEGEND_ITEMS, getLegendSvg } from './MapInner';
import useStore from '@/lib/store';

/**
 * MapLegend — Floating legend overlay for the map
 *
 * Displays infrastructure type symbols with their meanings.
 * Can be collapsed/expanded by the user.
 * Only shows symbols that are present in the current data.
 * In multi-layer mode, merges categories from all visible layers.
 */
export default function MapLegend() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const data = useStore((state) => state.data);
  const layers = useStore((state) => state.layers);
  const layerOrder = useStore((state) => state.layerOrder);
  const isMultiLayerMode = layerOrder && layerOrder.length > 0;

  // Get categories that are actually present in the data (merged from all visible layers)
  const presentCategories = useMemo(() => {
    const categories = new Set();
    
    if (isMultiLayerMode) {
      // Collect categories from all visible layers
      for (const layerId of layerOrder) {
        const layer = layers[layerId];
        if (!layer || !layer.visible || !layer.data) continue;
        
        // Check points in this layer
        if (layer.data.points) {
          layer.data.points.forEach((point) => {
            const fcode = point.attributes?.S_FCODE;
            if (fcode) {
              categories.add(fcode);
            }
          });
        }
        
        // Check lines in this layer
        if (layer.data.lines) {
          layer.data.lines.forEach((line) => {
            const fcode = line.attributes?.S_FCODE;
            if (fcode) {
              categories.add(fcode);
            }
          });
        }
      }
    } else {
      // Legacy single-data mode
      if (!data) return categories;
      
      // Check points
      if (data.points) {
        data.points.forEach((point) => {
          const fcode = point.attributes?.S_FCODE;
          if (fcode) {
            categories.add(fcode);
          }
        });
      }
      
      // Check lines
      if (data.lines) {
        data.lines.forEach((line) => {
          const fcode = line.attributes?.S_FCODE;
          if (fcode) {
            categories.add(fcode);
          }
        });
      }
    }

    return categories;
  }, [data, isMultiLayerMode, layers, layerOrder]);

  // Filter legend items to only show those present in data
  const visibleLegendItems = useMemo(() => {
    if (presentCategories.size === 0) return [];

    return LEGEND_ITEMS.filter((item) => {
      // Check if any S_FCODE in the data matches this category
      for (const fcode of presentCategories) {
        const fcodeStr = String(fcode).toUpperCase();

        // Check category matches
        if (
          item.category === 'water' &&
          (fcodeStr.includes('VL') || fcodeStr.includes('VANN'))
        )
          return true;
        if (
          item.category === 'wastewater' &&
          (fcodeStr.includes('SP') || fcodeStr.includes('SPILLVANN'))
        )
          return true;
        if (
          item.category === 'stormwater' &&
          (fcodeStr.includes('OV') || fcodeStr.includes('OVERVANN'))
        )
          return true;
        if (
          item.category === 'drainage' &&
          (fcodeStr.includes('DR') || fcodeStr.includes('DREN'))
        )
          return true;
        if (item.category === 'manhole' && fcodeStr.includes('KUM'))
          return true;
        if (
          item.category === 'sls_slu' &&
          (fcodeStr === 'SLS' || fcodeStr === 'SLU')
        )
          return true;
        if (
          item.category === 'san' &&
          (fcodeStr === 'SAN' || fcodeStr.includes('SAN'))
        )
          return true;
        if (item.category === 'div' && fcodeStr === 'DIV')
          return true;
        if (
          item.category === 'anboring' &&
          (fcodeStr === 'ANB' || fcodeStr.includes('ANBORING'))
        )
          return true;
        if (item.category === 'grokonstr' && fcodeStr === 'GRØKONSTR')
          return true;
        if (item.category === 'krn' && fcodeStr === 'KRN')
          return true;
        if (item.category === 'grn' && fcodeStr === 'GRN')
          return true;
        if (item.category === 'lok' && fcodeStr === 'LOK')
          return true;
      }
      return false;
    });
  }, [presentCategories]);

  // Don't show legend if no data or no visible items
  const hasData = isMultiLayerMode ? layerOrder.some(id => layers[id]?.visible && layers[id]?.data) : !!data;
  if (!hasData || visibleLegendItems.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute bottom-20 right-4 rounded-lg shadow-lg z-1000 border overflow-hidden"
      style={{
        maxWidth: '200px',
        backgroundColor: 'var(--color-card)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Header with collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-3 py-2 transition-colors border-b"
        style={{
          backgroundColor: 'var(--color-page-bg)',
          borderColor: 'var(--color-border)',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-sidebar-hover)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-page-bg)')
        }
      >
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Tegnforklaring
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 transition-transform ${
            isCollapsed ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Legend items */}
      {!isCollapsed && (
        <div className="p-2 max-h-80 overflow-y-auto">
          <div className="text-xs text-gray-500 mb-2 px-1">
            Punktsymboler
          </div>
          <div className="space-y-1">
            {visibleLegendItems.map((item) => (
              <div
                key={item.category}
                className="flex items-center gap-2 px-1 py-0.5"
              >
                <div
                  className="shrink-0"
                  dangerouslySetInnerHTML={{
                    __html: getLegendSvg(
                      item.category,
                      item.color,
                      18
                    ),
                  }}
                />
                <span className="text-xs text-gray-700 truncate">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* Line legend */}
          <div className="text-xs text-gray-500 mt-3 mb-2 px-1 border-t pt-2">
            Linjer
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div
                className="w-5 h-0.5 shrink-0"
                style={{ backgroundColor: FCODE_COLORS.AF }}
              ></div>
              <span className="text-xs text-gray-700">
                Avløp Felles (AF)
              </span>
            </div>
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div
                className="w-5 h-0.5 shrink-0"
                style={{ backgroundColor: FCODE_COLORS.VL }}
              ></div>
              <span className="text-xs text-gray-700">
                Vannledning
              </span>
            </div>
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div
                className="w-5 h-0.5 shrink-0"
                style={{ backgroundColor: FCODE_COLORS.SP }}
              ></div>
              <span className="text-xs text-gray-700">Spillvann</span>
            </div>
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div
                className="w-5 h-0.5 shrink-0"
                style={{ backgroundColor: FCODE_COLORS.OV }}
              ></div>
              <span className="text-xs text-gray-700">Overvann</span>
            </div>
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div
                className="w-5 h-0.5 shrink-0"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, ${FCODE_COLORS.DR}, ${FCODE_COLORS.DR} 3px, transparent 3px, transparent 6px)`,
                  height: '2px',
                }}
              ></div>
              <span className="text-xs text-gray-700">Drenering</span>
            </div>
          </div>

          {/* Highlight indicator */}
          <div className="text-xs text-gray-500 mt-3 mb-2 px-1 border-t pt-2">
            Markering
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5">
            <div className="w-4 h-4 border-2 border-[#00FFFF] rounded-full bg-white shrink-0"></div>
            <span className="text-xs text-gray-700">
              Markert objekt
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
