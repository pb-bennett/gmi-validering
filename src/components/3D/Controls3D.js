'use client';

import { useState } from 'react';
import Legend3D from './Legend3D';

export default function Controls3D() {
  const [showLegend, setShowLegend] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true); // Minimized by default
  const [gridOn, setGridOn] = useState(true);

  return (
    <>
      {/* Top-left controls panel */}
      <div className="absolute top-4 left-4 z-50 bg-white/95 backdrop-blur-sm text-gray-800 rounded-xl shadow-lg border border-gray-200/50 overflow-hidden min-w-[160px]">
        {/* Header with minimize toggle */}
        <div
          className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <h3 className="text-sm font-semibold text-gray-700">
            Kontroller
          </h3>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
              isMinimized ? '' : 'rotate-180'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>

        {/* Collapsible content */}
        {!isMinimized && (
          <div className="p-3 space-y-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(
                  new CustomEvent('reset3DCamera')
                );
              }}
              className="w-full px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              🎯 Nullstill kamera
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setGridOn(!gridOn);
                window.dispatchEvent(new CustomEvent('toggle3DGrid'));
              }}
              className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                gridOn
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-600'
              }`}
            >
              ⊞ Gitter {gridOn ? '(På)' : '(Av)'}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowLegend(!showLegend);
              }}
              className="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              📋 {showLegend ? 'Skjul' : 'Vis'} tegnforklaring
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      {showLegend && <Legend3D />}

      {/* Instructions - more subtle */}
      <div className="absolute bottom-4 right-4 z-50 bg-white/90 backdrop-blur-sm text-gray-700 rounded-xl shadow-lg border border-gray-200/50 p-3 text-xs max-w-xs">
        <p className="font-semibold mb-1.5 text-gray-800">
          Navigasjon:
        </p>
        <ul className="space-y-1 text-gray-600">
          <li>🖱️ Venstre: Roter</li>
          <li>🖱️ Høyre: Panorér</li>
          <li>🖱️ Rull: Zoom</li>
          <li>🎯 Klikk: Sentrer på objekt</li>
        </ul>
      </div>
    </>
  );
}
