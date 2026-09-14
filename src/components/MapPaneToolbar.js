'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  ArrowClockwiseIcon,
  DotsThreeIcon,
  ShareNetworkIcon,
} from '@phosphor-icons/react';
import { isTestModeEnabled } from '@/lib/telemetry/uploadTelemetry.mjs';
import { getMapToolbarMode, MapToolbarMode } from '@/lib/workspace/mapPanePresentation.mjs';
import useStore from '@/lib/store';
import TabSwitcher from './TabSwitcher';
import TestModeControl from './TestModeControl';

const ToolbarButton = forwardRef(function ToolbarButton({ children, className = '', ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 ${className}`}
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
  const [paneMode, setPaneMode] = useState('normal');
  const [overflowOpen, setOverflowOpen] = useState(false);
  const settings = useStore((state) => state.settings);
  const hydrated = useStore((state) => state.hydrated === true);
  const showTestModeControls = hydrated && isTestModeEnabled(settings);
  const hasOverflow = paneMode !== MapToolbarMode.NORMAL &&
    (paneMode === MapToolbarMode.NARROW || showTestModeControls);
  const compact = paneMode === MapToolbarMode.NARROW;

  useEffect(() => {
    const pane = toolbarRef.current?.closest('[data-map-pane]');
    if (!pane) return undefined;
    const updateMode = () => setPaneMode(getMapToolbarMode(pane.getBoundingClientRect().width));
    updateMode();
    const observer = new ResizeObserver(updateMode);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

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
              <DotsThreeIcon aria-hidden="true" size={20} weight="bold" />
              <span className={compact ? 'sr-only' : ''}>Mer</span>
            </ToolbarButton>
          )}
        </div>
      </div>
      {hasOverflow && overflowOpen && (
        <div
          className="pointer-events-auto absolute left-0 top-full z-[1300] mt-2 flex w-max min-w-[min(15rem,100%)] max-w-full flex-col gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
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
