'use client';

import React from 'react';

/**
 * Contains a rendering failure in one analysis presentation, so the map, layer manager, Rettinger and FOTO survive.
 * Nothing is reset silently: `renderFallback(retry)` states the failure and offers an explicit way on. `onRetry` should
 * recalculate, so a retry never shows results from before the failure. A new `resetKey` (another layer, selection or a
 * closed analysis) is a new presentation and starts clean.
 */
export default class AnalysisErrorBoundary extends React.Component {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error) {
    console.error('Analysis presentation failed', error);
  }

  retry = () => {
    this.props.onRetry?.();
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.renderFallback?.(this.retry) ?? null;
  }
}

export function AnalysisErrorMessage({ kind, title, closeLabel, onRetry, onClose, compact = false }) {
  const size = compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs';
  return (
    <div data-analysis-error={kind} className={`flex flex-col gap-2 ${compact ? 'p-2' : 'p-4'}`}>
      <div role="alert" data-validation-tone="error" className={`gmi-validation-panel rounded-lg border ${compact ? 'p-2 text-[10px]' : 'p-3 text-sm'}`}>
        <p className="font-semibold">{title}</p>
        <p>Kartet, lagene, rettingene og bildene er ikke endret.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onRetry} className={`gmi-compact-button gmi-focus-ring border border-gmi-border-strong bg-gmi-surface ${size}`}>
          Prøv igjen
        </button>
        <button type="button" onClick={onClose} className={`gmi-compact-button gmi-focus-ring border border-gmi-border-strong bg-gmi-surface ${size}`}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
