'use client';

import { useState } from 'react';
import { CaretDownIcon, MouseIcon, CrosshairIcon } from '@phosphor-icons/react';
import Legend3D from './Legend3D';

export default function Controls3D() {
  const [showLegend, setShowLegend] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true); // Minimized by default
  const [gridOn, setGridOn] = useState(true);

  return (
    <>
      {/* Top-left controls panel */}
      <div className="gmi-elevated-surface absolute top-14 left-4 z-50 min-w-[160px] overflow-hidden rounded-xl bg-gmi-surface/95 text-gmi-text backdrop-blur-sm">
        {/* Header with minimize toggle */}
        <div
          className="flex items-center justify-between border-b border-gmi-border px-4 py-2.5 cursor-pointer transition-colors hover:bg-gmi-surface-soft"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <h3 className="text-sm font-semibold text-gmi-navy">
            Kontroller
          </h3>
          <CaretDownIcon
            size={16}
            weight="regular"
            aria-hidden="true"
            className={`text-gmi-text-muted transition-transform duration-200 ${isMinimized ? '' : 'rotate-180'}`}
          />
        </div>

        {/* Collapsible content */}
        {!isMinimized && (
          <div className="p-3 space-y-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(
                  new CustomEvent('reset3DCamera'),
                );
              }}
              className="gmi-primary-control gmi-focus-ring w-full px-3 py-2 text-sm font-medium"
            >
              Nullstill kamera
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setGridOn(!gridOn);
                window.dispatchEvent(new CustomEvent('toggle3DGrid'));
              }}
              className={`gmi-focus-ring w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                gridOn
                  ? 'gmi-selected-control'
                  : 'bg-gmi-surface-soft text-gmi-text-muted hover:bg-gmi-border'
              }`}
            >
              Gitter {gridOn ? '(På)' : '(Av)'}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowLegend(!showLegend);
              }}
              className="gmi-compact-button gmi-focus-ring w-full bg-gmi-surface-soft px-3 py-2 text-sm font-medium"
            >
              {showLegend ? 'Skjul' : 'Vis'} tegnforklaring
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      {showLegend && <Legend3D />}

      {/* Instructions - more subtle */}
      <div className="gmi-elevated-surface absolute bottom-20 right-4 z-50 max-w-xs rounded-xl bg-gmi-surface/90 p-3 text-xs text-gmi-text-muted backdrop-blur-sm">
        <p className="font-semibold mb-1.5 text-gmi-navy">
          Navigasjon:
        </p>
        <ul className="space-y-1 text-gmi-text-muted">
          <li><MouseIcon size={14} weight="regular" aria-hidden="true" className="inline-block align-text-bottom" /> Venstre: Roter</li>
          <li><MouseIcon size={14} weight="regular" aria-hidden="true" className="inline-block align-text-bottom" /> Høyre: Panorér</li>
          <li><MouseIcon size={14} weight="regular" aria-hidden="true" className="inline-block align-text-bottom" /> Rull: Zoom</li>
          <li><CrosshairIcon size={14} weight="regular" aria-hidden="true" className="inline-block align-text-bottom" /> Klikk: Sentrer på objekt</li>
        </ul>
      </div>
    </>
  );
}
