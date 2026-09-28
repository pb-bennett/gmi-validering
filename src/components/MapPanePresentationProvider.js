'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import {
  createMapPanePresentationState,
  didProfileAnalysisOpen,
  getMapToolbarMode,
  isMapLegendCompact,
  MapToolbarMode,
  reduceMapPanePresentation,
} from '@/lib/workspace/mapPanePresentation.mjs';

const MapPanePresentationContext = createContext(null);

export function MapPanePresentationProvider({ children, className, analysisOpen = false }) {
  const paneRef = useRef(null);
  const wasAnalysisOpen = useRef(false);
  const [presentation, dispatch] = useReducer(
    reduceMapPanePresentation,
    undefined,
    createMapPanePresentationState,
  );

  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) return undefined;

    const updateMode = () => {
      const width = pane.getBoundingClientRect().width;
      dispatch({
        type: 'pane-measured',
        mode: getMapToolbarMode(width),
        legendCompact: isMapLegendCompact(width),
      });
    };

    updateMode();
    const observer = new ResizeObserver(updateMode);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (didProfileAnalysisOpen(wasAnalysisOpen.current, analysisOpen)) {
      dispatch({ type: 'profile-opened' });
    }
    wasAnalysisOpen.current = analysisOpen;
  }, [analysisOpen]);

  const toggleLegend = useCallback(() => {
    dispatch({ type: 'legend-toggled' });
  }, []);

  const value = useMemo(() => ({
    mode: presentation.mode ?? MapToolbarMode.NORMAL,
    modeMeasured: presentation.mode !== null,
    legendCompact: presentation.legendCompact ?? false,
    legendCollapsed: presentation.legendCollapsed,
    toggleLegend,
  }), [presentation, toggleLegend]);

  return (
    <MapPanePresentationContext.Provider value={value}>
      <div
        ref={paneRef}
        data-map-pane="true"
        data-map-pane-mode={presentation.mode ?? 'unmeasured'}
        data-map-legend-compact={presentation.legendCompact ?? 'unmeasured'}
        className={className}
      >
        {children}
      </div>
    </MapPanePresentationContext.Provider>
  );
}

export function useMapPanePresentation() {
  const context = useContext(MapPanePresentationContext);
  if (!context) {
    throw new Error('useMapPanePresentation must be used within MapPanePresentationProvider');
  }
  return context;
}
