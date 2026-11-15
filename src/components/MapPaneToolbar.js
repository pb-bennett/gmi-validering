'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  ArrowClockwiseIcon,
  DotsThreeIcon,
  ImagesIcon,
  ShareNetworkIcon,
} from '@phosphor-icons/react';
import { isTestModeEnabled } from '@/lib/telemetry/uploadTelemetry.mjs';
import { MapToolbarMode } from '@/lib/workspace/mapPanePresentation.mjs';
import useStore from '@/lib/store';
import { useMapPanePresentation } from './MapPanePresentationProvider';
import PhotoIconButton, { usePhotoIconTooltip } from './photos/PhotoIconButton';
import TabSwitcher from './TabSwitcher';
import TestModeControl from './TestModeControl';

const ToolbarButton = forwardRef(function ToolbarButton({ children, className = '', title, ...props }, ref) {
  const ownRef = useRef(null);
  const label = props['aria-label'];
  usePhotoIconTooltip(ownRef, title || label, label);
  return (
    <button
      ref={(node) => { ownRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
      type="button"
      className={`gmi-elevated-surface gmi-compact-button gmi-focus-ring inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 bg-gmi-surface/95 px-2.5 py-1.5 text-xs font-medium backdrop-blur-sm ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

// photoToggle: Rettinger's temporary «Vis bilder» override ({ shown, onToggle }), or null when not offered.
export default function MapPaneToolbar({ onReset, onShare, showShare, photoToggle = null }) {
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
      <div className="relative min-h-9">
        {photoToggle && (
          // Left of the centred switcher, just right of Leaflet's zoom control (10px + 34px): the right cluster is already
          // full at laptop widths in Rettinger, so this map-display control sits with the other map controls instead.
          <div className="pointer-events-auto absolute left-11 top-0">
            <PhotoIconButton icon={ImagesIcon} label="Vis bilder" pressed={photoToggle.shown}
              tooltip={photoToggle.shown ? 'Skjul bilder' : 'Vis bilder'} onClick={photoToggle.onToggle}
              data-rettinger-photo-toggle={photoToggle.shown ? 'shown' : 'hidden'}
              className="gmi-map-toolbar-icon-button gmi-elevated-surface" />
          </div>
        )}
        <div className="pointer-events-auto absolute left-1/2 top-0 min-w-0 -translate-x-1/2">
          <TabSwitcher compact={compact} />
        </div>
        <div className="pointer-events-auto absolute right-0 top-0 flex min-w-0 flex-none flex-nowrap items-center justify-end gap-1.5">
          {paneMode === MapToolbarMode.NORMAL && <TestModeControl />}
          {paneMode !== MapToolbarMode.NARROW && (
            <>
              {showShare && (
                <ToolbarButton onClick={share} aria-label="Del app" title="Del app">
                  <ShareNetworkIcon aria-hidden="true" size={16} />
                  {paneMode === MapToolbarMode.CONSTRAINED ? null : 'Del'}
                </ToolbarButton>
              )}
              <ToolbarButton ref={resetButtonRef} onClick={reset} aria-label="Nullstill og åpne ny fil">
                <ArrowClockwiseIcon aria-hidden="true" size={16} />
                <span>Nullstill og åpne ny fil</span>
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
            <ToolbarButton onClick={reset} className="w-full justify-start" aria-label="Nullstill og åpne ny fil">
              <ArrowClockwiseIcon aria-hidden="true" size={16} />
              <span>Nullstill og åpne ny fil</span>
            </ToolbarButton>
          )}
          {showTestModeControls && <TestModeControl />}
        </div>
      )}
    </div>
  );
}
