'use client';

import { Fragment, useEffect, useMemo } from 'react';
import { Pane, useMap } from 'react-leaflet';
import GeminiInspectionSide from './GeminiInspectionSide';
import { createGeminiSourceLookup } from '@/lib/gemini-wfs/geminiPopupContent.mjs';
import useGeminiSession from './useGeminiSession';
import useGeminiPresentation from './useGeminiPresentation';
import { geminiPresentation, getGeminiReferenceBounds, GEMINI_REFERENCE_PANE,
  GEMINI_REFERENCE_Z_INDEX } from '@/lib/gemini-wfs/geminiReferencePresentation.mjs';

const paneStyle = { zIndex: GEMINI_REFERENCE_Z_INDEX, pointerEvents: 'none' };

export default function GeminiReferenceLayer({ inspectionEnabled = true }) {
  const { result } = useGeminiSession();
  const { linesVisible, pointsVisible, resultVersion, zoomRequest, marking } = useGeminiPresentation();
  const map = useMap();
  const bounds = useMemo(() => getGeminiReferenceBounds(result), [result]);
  const lookup = useMemo(() => createGeminiSourceLookup(result), [result]);
  useEffect(() => {
    if (!zoomRequest || zoomRequest.resultVersion !== resultVersion) return;
    const fit = () => {
      if (bounds) {
        map.stop();
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 20 });
      }
      geminiPresentation.acknowledgeZoom(zoomRequest.id);
    };
    // Leaflet ignores fit requests during an animated zoom. Keep this intent
    // pending until that zoom ends; replacement/clear cleans up the listener.
    if (bounds && map.getContainer().querySelector('.leaflet-zoom-anim')) {
      map.once('zoomend', fit);
      return () => map.off('zoomend', fit);
    }
    fit();
  }, [map, bounds, zoomRequest, resultVersion]);

  return (
    <Pane name={GEMINI_REFERENCE_PANE} style={paneStyle}>
      {result && <Fragment key={resultVersion}>
        {linesVisible && <GeminiInspectionSide data={result.lines.display} marking={marking}
          lookup={lookup} enabled={inspectionEnabled} />}
        {pointsVisible && <GeminiInspectionSide data={result.points.display} marking={marking}
          lookup={lookup} enabled={inspectionEnabled} />}
      </Fragment>}
    </Pane>
  );
}
