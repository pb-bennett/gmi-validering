'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  ArrowClockwiseIcon,
  DotsThreeIcon,
  ShareNetworkIcon,
} from '@phosphor-icons/react';
import { isTestModeEnabled } from '@/lib/telemetry/uploadTelemetry.mjs';
import { MapToolbarMode } from '@/lib/workspace/mapPanePresentation.mjs';
import useStore from '@/lib/store';
import { useMapPanePresentation } from './MapPanePresentationProvider';
import TabSwitcher from './TabSwitcher';
import TestModeControl from './TestModeControl';

const ToolbarButton = forwardRef(function ToolbarButton({ children, className = '', ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`gmi-elevated-surface gmi-compact-button gmi-focus-ring inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 bg-gmi-surface/95 px-2.5 py-1.5 text-xs font-medium backdrop-blur-sm ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

export default function MapPaneToolbar({ onReset, onShare, showShare }) {
  const toolbarRef = useRef(null);
  const overflowTriggerRef = useRef(null);
  const resetButtonRef = useRef(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const { mode: paneMode } = useMapPanePresentation();
  const settings = useStore((state) => state.settings);
  const hydrated = useStore((state) => state.hydrated === true);
  const showTestModeControls = hydrated && isTestModeEnabled(settings);
  const hasOverflow = paneMode !== MapToolbarMode.NORMAL &&
    (paneMode === MapToolbarMode.NARROW || showTestModeControls);
  const compact = paneMode === MapToolbarMode.NARROW;

  useEffect(() => {
    if (!overflowOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOverflowOpen(false);
      overflowTriggerRef.current?.focus();
    };
    const closeOnOutsidePointer = (event) => {
      if (!toolbarRef.current?.contains(event.target)) setOverflowOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
    };
  }, [overflowOpen]);

  useEffect(() => {
    if (hasOverflow || !overflowOpen) return;
    setOverflowOpen(false);
    requestAnimationFrame(() => resetButtonRef.current?.focus());
  }, [hasOverflow, overflowOpen]);

  const reset = () => {
    setOverflowOpen(false);
    onReset();
  };
  const share = () => {
    setOverflowOpen(false);
    onShare();
  };

  return (
    <div
      ref={toolbarRef}
      className="absolute inset-x-2 top-2 z-[1200] pointer-events-none"
      data-map-toolbar-mode={paneMode}
      role="toolbar"
      aria-label="Kartverktøy"
    >
      <div className="flex min-w-0 flex-nowrap items-start justify-between gap-2">
        <div className="pointer-events-auto min-w-0">
          <TabSwitcher compact={compact} />
        </div>
        <div className="pointer-events-auto flex min-w-0 flex-none flex-nowrap items-center justify-end gap-1.5">
          {paneMode === MapToolbarMode.NORMAL && <TestModeControl />}
          {paneMode !== MapToolbarMode.NARROW && (
            <>
              {showShare && (
                <ToolbarButton onClick={share} aria-label="Del app" title="Del app">
                  <ShareNetworkIcon aria-hidden="true" size={16} />
                  {paneMode === MapToolbarMode.CONSTRAINED ? null : 'Del'}
                </ToolbarButton>
              )}
              <ToolbarButton ref={resetButtonRef} onClick={reset} aria-label="Nullstill og last opp ny">
                <ArrowClockwiseIcon aria-hidden="true" size={16} />
                <span>Nullstill og last opp ny</span>
              </ToolbarButton>
            </>
          )}
          {hasOverflow && (paneMode === MapToolbarMode.NARROW || showTestModeControls) && (
            <ToolbarButton
              ref={overflowTriggerRef}
              onClick={() => setOverflowOpen((open) => !open)}
              aria-label="Flere kartverktøy"
              aria-haspopup="true"
              aria-expanded={overflowOpen}
              title="Flere kartverktøy"
            >
              <DotsThreeIcon aria-hidden="true" size={20} weight="regular" />
              <span className={compact ? 'sr-only' : ''}>Mer</span>
            </ToolbarButton>
          )}
        </div>
      </div>
      {hasOverflow && overflowOpen && (
        <div
          className="gmi-elevated-surface pointer-events-auto absolute left-0 top-full z-[1300] mt-2 flex w-max min-w-[min(15rem,100%)] max-w-full flex-col gap-2 overflow-y-auto rounded-lg p-2"
          role="group"
          aria-label="Flere kartverktøy"
        >
          {paneMode === MapToolbarMode.NARROW && showShare && (
            <ToolbarButton onClick={share} className="w-full justify-start" aria-label="Del app">
              <ShareNetworkIcon aria-hidden="true" size={16} />
              <span>Del app</span>
            </ToolbarButton>
          )}
          {paneMode === MapToolbarMode.NARROW && (
            <ToolbarButton onClick={reset} className="w-full justify-start" aria-label="Nullstill og last opp ny">
              <ArrowClockwiseIcon aria-hidden="true" size={16} />
              <span>Nullstill og last opp ny</span>
            </ToolbarButton>
          )}
          {showTestModeControls && <TestModeControl />}
        </div>
      )}
    </div>
  );
}
