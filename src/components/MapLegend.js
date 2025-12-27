'use client';

import { useState } from 'react';
import { LEGEND_ITEMS, getLegendSvg } from './MapInner';

/**
 * MapLegend — Floating legend overlay for the map
 * 
 * Displays infrastructure type symbols with their meanings.
 * Can be collapsed/expanded by the user.
 */
export default function MapLegend() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg z-1000 border border-gray-200 overflow-hidden"
      style={{ maxWidth: '200px' }}
    >
      {/* Header with collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200"
      >
        <span className="text-sm font-semibold text-gray-700">Tegnforklaring</span>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className={`h-4 w-4 text-gray-500 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {/* Legend items */}
      {!isCollapsed && (
        <div className="p-2 max-h-80 overflow-y-auto">
          <div className="text-xs text-gray-500 mb-2 px-1">Punktsymboler</div>
          <div className="space-y-1">
            {LEGEND_ITEMS.map((item) => (
              <div key={item.category} className="flex items-center gap-2 px-1 py-0.5">
                <div 
                  className="shrink-0"
                  dangerouslySetInnerHTML={{ __html: getLegendSvg(item.category, item.color, 18) }}
                />
                <span className="text-xs text-gray-700 truncate">{item.label}</span>
              </div>
            ))}
          </div>
          
          {/* Line legend */}
          <div className="text-xs text-gray-500 mt-3 mb-2 px-1 border-t pt-2">Linjer</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div className="w-5 h-0.5 bg-[#ff0000] shrink-0"></div>
              <span className="text-xs text-gray-700">AF (asfalt)</span>
            </div>
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div className="w-5 h-0.5 bg-[#0066cc] shrink-0"></div>
              <span className="text-xs text-gray-700">Vannledning</span>
            </div>
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div className="w-5 h-0.5 bg-[#228B22] shrink-0"></div>
              <span className="text-xs text-gray-700">Spillvann</span>
            </div>
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div className="w-5 h-0.5 bg-[#2a2a2a] shrink-0"></div>
              <span className="text-xs text-gray-700">Overvann</span>
            </div>
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div 
                className="w-5 h-0.5 shrink-0"
                style={{ 
                  backgroundImage: 'repeating-linear-gradient(90deg, #8B4513, #8B4513 3px, transparent 3px, transparent 6px)',
                  height: '2px'
                }}
              ></div>
              <span className="text-xs text-gray-700">Drenering</span>
            </div>
          </div>
          
          {/* Highlight indicator */}
          <div className="text-xs text-gray-500 mt-3 mb-2 px-1 border-t pt-2">Markering</div>
          <div className="flex items-center gap-2 px-1 py-0.5">
            <div className="w-4 h-4 border-2 border-[#00FFFF] rounded-full bg-white shrink-0"></div>
            <span className="text-xs text-gray-700">Markert objekt</span>
          </div>
        </div>
      )}
    </div>
  );
}
