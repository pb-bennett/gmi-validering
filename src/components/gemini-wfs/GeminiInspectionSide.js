'use client';

import { useEffect, useRef } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createGeminiPopupContent } from '@/lib/gemini-wfs/geminiPopupContent.mjs';
import { GEMINI_REFERENCE_PANE, GEMINI_POINT_STYLE } from '@/lib/gemini-wfs/geminiReferencePresentation.mjs';
import './geminiPopup.css';

const interactiveOptions = { interactive: true, bubblingMouseEvents: false };
const pointToLayer = (_feature, latlng) => L.circleMarker(latlng, {
  ...GEMINI_POINT_STYLE, ...interactiveOptions, pane: GEMINI_REFERENCE_PANE,
});

export default function GeminiInspectionSide({ data, style, lookup, enabled }) {
  const group = useRef(null);
  const map = useMap();
  useEffect(() => {
    const layers = group.current.getLayers();
    let popup;
    const inspect = (event) => {
      if (!enabled) return;
      const feature = event.target.feature;
      const record = lookup(feature.properties?.sourceKey, feature.properties?.typeName);
      if (!record) return;
      // Lines use the actual inspection location. Circle points use their centre.
      const position = record.geometry.type === 'Point' ? event.target.getLatLng() : event.latlng;
      if (!position) return;
      popup?.remove();
      popup = L.popup({ className: 'gmi-gemini-popup', minWidth: 0, maxWidth: 400,
        autoPanPaddingTopLeft: [24, 64], autoPanPaddingBottomRight: [24, 48] })
        .setLatLng(position).setContent(createGeminiPopupContent(record)).openOn(map);
    };
    for (const layer of layers) {
      // Only vector paths receive pointer events. The reference pane stays transparent.
      layer.getElement().style.pointerEvents = enabled ? 'auto' : 'none';
      layer.options.bubblingMouseEvents = !enabled;
      layer.on('click', inspect);
    }
    return () => {
      popup?.remove();
      for (const layer of layers) layer.off('click', inspect);
    };
  }, [map, data, lookup, enabled]);

  return <GeoJSON ref={group} data={data} pane={GEMINI_REFERENCE_PANE}
    style={{ ...style, ...interactiveOptions }} pointToLayer={pointToLayer} {...interactiveOptions} />;
}
