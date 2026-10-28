'use client';

import { Fragment, useEffect, useMemo } from 'react';
import { GeoJSON, Pane, useMap } from 'react-leaflet';
import L from 'leaflet';
import useGeminiSession from './useGeminiSession';
import useGeminiPresentation from './useGeminiPresentation';
import { geminiPresentation, getGeminiReferenceBounds, GEMINI_REFERENCE_PANE,
  GEMINI_REFERENCE_Z_INDEX, GEMINI_LINE_STYLE, GEMINI_POINT_STYLE } from '@/lib/gemini-wfs/geminiReferencePresentation.mjs';

const paneStyle = { zIndex: GEMINI_REFERENCE_Z_INDEX, pointerEvents: 'none' };
const pointToLayer = (_feature, latlng) => L.circleMarker(latlng, { ...GEMINI_POINT_STYLE, pane: GEMINI_REFERENCE_PANE });

export default function GeminiReferenceLayer() {
  const { result } = useGeminiSession();
  const { linesVisible, pointsVisible, resultVersion, zoomRequest } = useGeminiPresentation();
  const map = useMap();
  const bounds = useMemo(() => getGeminiReferenceBounds(result), [result]);
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
        {linesVisible && <GeoJSON data={result.lines.display} pane={GEMINI_REFERENCE_PANE}
          style={GEMINI_LINE_STYLE} interactive={false} />}
        {pointsVisible && <GeoJSON data={result.points.display} pane={GEMINI_REFERENCE_PANE}
          pointToLayer={pointToLayer} interactive={false} />}
      </Fragment>}
    </Pane>
  );
}
