'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CaretUpIcon,
  PaletteIcon,
  XIcon,
} from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { getLayerHighlightStyle } from '@/lib/map/layerHighlight.mjs';

function useCommittedRange(value, onCommit) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  const commit = useCallback(() => onCommit(draftRef.current), [onCommit]);

  useEffect(() => {
    if (!dragging) return undefined;
    const finish = () => {
      setDragging(false);
      commit();
    };
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
    return () => {
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
    };
  }, [dragging, commit]);

  return {
    draft,
    onChange: (event) => {
      const next = Number(event.currentTarget.value);
      draftRef.current = next;
      setDraft(next);
    },
    onPointerDown: () => setDragging(true),
    onKeyUp: commit,
    onBlur: commit,
  };
}

function LayerHighlightControls({ layerId, layer, index, layerCount }) {
  const setEnabled = useStore((state) => state.setLayerHighlightEnabled);
  const setColor = useStore((state) => state.setLayerHighlightColor);
  const setOpacity = useStore((state) => state.setLayerHighlightOpacity);
  const setSpread = useStore((state) => state.setLayerHighlightSpread);
  const resetStyle = useStore((state) => state.resetLayerHighlightStyle);
  const moveLayerUp = useStore((state) => state.moveLayerUp);
  const moveLayerDown = useStore((state) => state.moveLayerDown);
  const style = getLayerHighlightStyle(layer, layerId);
  const opacity = useCommittedRange(
    Math.round(style.opacity * 100),
    useCallback((percent) => setOpacity(layerId, percent / 100), [layerId, setOpacity]),
  );
  const spread = useCommittedRange(
    style.spread,
    useCallback((pixels) => setSpread(layerId, pixels), [layerId, setSpread]),
  );

  return (
    <section className="layer-highlight-card rounded-lg border border-gmi-border bg-gmi-surface p-3" aria-label={layer.name}>
      <div className="layer-highlight-card-header flex min-w-0 items-start gap-2">
        <span
          className="mt-0.5 h-4 w-4 shrink-0 rounded border border-gmi-border-strong"
          style={{ backgroundColor: style.color }}
          title={style.color}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gmi-text" title={layer.name}>
            {layer.name}
          </div>
          {!layer.visible && <div className="text-xs text-gmi-text-subtle">Skjult i kartet</div>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => moveLayerUp(layerId)}
            disabled={index === 0}
            className="gmi-focus-ring rounded p-1 text-gmi-interactive hover:bg-gmi-surface-soft disabled:cursor-default disabled:opacity-40"
            title="Flytt laget opp"
            aria-label={`Flytt laget opp: ${layer.name}`}
          >
            <CaretUpIcon size={16} weight="regular" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => moveLayerDown(layerId)}
            disabled={index === layerCount - 1}
            className="gmi-focus-ring rounded p-1 text-gmi-interactive hover:bg-gmi-surface-soft disabled:cursor-default disabled:opacity-40"
            title="Flytt laget ned"
            aria-label={`Flytt laget ned: ${layer.name}`}
          >
            <CaretDownIcon size={16} weight="regular" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => resetStyle(layerId)}
            className="gmi-focus-ring rounded p-1 text-gmi-interactive hover:bg-gmi-surface-soft"
            title="Nullstill lagmarkering"
            aria-label={`Nullstill lagmarkering for ${layer.name}`}
          >
            <ArrowCounterClockwiseIcon size={16} weight="regular" aria-hidden="true" />
            <span className="sr-only">Nullstill</span>
          </button>
        </div>
      </div>

      <label className="layer-highlight-setting mt-2 flex items-center justify-between gap-3 text-xs text-gmi-text">
        <span>Lagmarkering</span>
        <input
          type="checkbox"
          checked={layer.highlightAll === true}
          onChange={(event) => setEnabled(layerId, event.currentTarget.checked)}
          className="h-4 w-4 rounded border-gmi-border-strong accent-gmi-interactive"
          aria-label={`Lagmarkering for ${layer.name}`}
        />
      </label>

      <label className="layer-highlight-setting mt-2 flex items-center justify-between gap-3 text-xs text-gmi-text">
        <span>Markeringsfarge</span>
        <input
          type="color"
          value={style.color}
          onChange={(event) => setColor(layerId, event.currentTarget.value)}
          className="gmi-focus-ring h-7 w-10 cursor-pointer rounded border border-gmi-border-strong bg-gmi-surface p-0.5"
          aria-label={`Markeringsfarge for ${layer.name}`}
        />
      </label>

      <label className="layer-highlight-setting mt-2 block text-xs text-gmi-text">
        <span className="flex justify-between gap-2">
          <span>Styrke</span>
          <output>{opacity.draft}%</output>
        </span>
        <input
          type="range"
          min="20"
          max="80"
          step="5"
          value={opacity.draft}
          onChange={opacity.onChange}
          onPointerDown={opacity.onPointerDown}
          onKeyUp={opacity.onKeyUp}
          onBlur={opacity.onBlur}
          className="layer-highlight-range mt-1 w-full accent-gmi-interactive"
          aria-label={`Styrke for ${layer.name}`}
        />
      </label>

      <label className="layer-highlight-setting mt-2 block text-xs text-gmi-text">
        <span className="flex justify-between gap-2">
          <span>Bredde</span>
          <output>{spread.draft} px</output>
        </span>
        <input
          type="range"
          min="2"
          max="8"
          step="1"
          value={spread.draft}
          onChange={spread.onChange}
          onPointerDown={spread.onPointerDown}
          onKeyUp={spread.onKeyUp}
          onBlur={spread.onBlur}
          className="layer-highlight-range mt-1 w-full accent-gmi-interactive"
          aria-label={`Bredde for ${layer.name}`}
        />
      </label>
    </section>
  );
}

export default function LayerHighlightPanel() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const layerOrder = useStore((state) => state.layerOrder);
  const layers = useStore((state) => state.layers);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const stopMapEvent = (event) => event.stopPropagation();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="gmi-elevated-surface gmi-compact-button gmi-focus-ring absolute right-[14rem] top-14 z-[1200] inline-flex items-center gap-1.5 bg-gmi-surface/95 px-2.5 py-1.5 text-xs font-medium text-gmi-text backdrop-blur-sm"
        aria-label="Lagmarkering"
        aria-controls="layer-highlight-panel"
        aria-expanded={open}
        title="Lagmarkering"
      >
        <PaletteIcon size={16} weight="regular" aria-hidden="true" />
        <span>Lagmarkering</span>
      </button>

      {open && (
        <div
          id="layer-highlight-panel"
          role="region"
          aria-label="Lagmarkering"
          className="layer-highlight-panel gmi-elevated-surface absolute right-4 top-26 z-[1250] flex w-[21rem] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-xl border border-gmi-border bg-gmi-surface/95 text-gmi-text shadow-xl backdrop-blur-sm xl:right-[14rem]"
          onClick={stopMapEvent}
          onDoubleClick={stopMapEvent}
          onPointerDown={stopMapEvent}
          onWheel={stopMapEvent}
          onTouchStart={stopMapEvent}
        >
          <div className="layer-highlight-panel-header flex shrink-0 items-center justify-between gap-3 border-b border-gmi-border px-3 py-2">
            <h2 className="text-sm font-semibold text-gmi-navy">Lagmarkering</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="gmi-focus-ring rounded p-1 text-gmi-text-muted hover:bg-gmi-surface-soft"
              aria-label="Lukk lagmarkering"
            >
              <XIcon size={16} weight="regular" aria-hidden="true" />
            </button>
          </div>
          <div className="layer-highlight-panel-list flex min-h-0 flex-col gap-2 overflow-y-auto p-3">
            {layerOrder.length > 1 && (
              <p className="text-xs text-gmi-text-muted">Øverste lag tegnes fremst i kartet.</p>
            )}
            {layerOrder.length === 0 ? (
              <p className="text-sm text-gmi-text-muted">Ingen lag er lastet inn.</p>
            ) : (
              layerOrder.map((layerId, index) => {
                const layer = layers[layerId];
                return layer ? (
                  <LayerHighlightControls
                    key={layerId}
                    layerId={layerId}
                    layer={layer}
                    index={index}
                    layerCount={layerOrder.length}
                  />
                ) : null;
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
