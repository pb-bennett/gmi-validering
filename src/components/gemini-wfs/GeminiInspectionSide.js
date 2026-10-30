'use client';

import { useEffect, useRef } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createGeminiPopupContent } from '@/lib/gemini-wfs/geminiPopupContent.mjs';
import { GEMINI_REFERENCE_PANE, getGeminiFeatureStyle, getGeminiHaloStyle } from '@/lib/gemini-wfs/geminiReferencePresentation.mjs';
import './geminiPopup.css';

const interactiveOptions = { interactive: true, bubblingMouseEvents: false };
const pointToLayer = (_feature, latlng) => L.circleMarker(latlng, {
  ...getGeminiFeatureStyle(true), ...interactiveOptions, pane: GEMINI_REFERENCE_PANE,
});
const haloPointToLayer = (_feature, latlng) => L.circleMarker(latlng, {
  ...getGeminiHaloStyle(true), ...interactiveOptions, pane: GEMINI_REFERENCE_PANE,
});
const haloStyle = (feature) => ({ ...getGeminiHaloStyle(feature.geometry.type === 'Point'), ...interactiveOptions });

export default function GeminiInspectionSide({ data, style, lookup, enabled }) {
  const group = useRef(null);
  const casing = useRef(null);
  const map = useMap();
  useEffect(() => {
    const primary = group.current.getLayers();
    const halos = casing.current.getLayers();
    const layers = [...halos, ...primary];
    const pairs = new Map(primary.map((layer, index) => [layer.feature, [layer, halos[index]]]));
    let popup;
    let selected = null, hovered = null;
    const paint = (feature) => {
      if (!feature) return;
      const point = feature.geometry.type === 'Point';
      const state = { selected: selected === feature, hovered: hovered === feature };
      const [layer, halo] = pairs.get(feature);
      layer.setStyle({ ...getGeminiFeatureStyle(point, state), ...interactiveOptions });
      halo.setStyle({ ...getGeminiHaloStyle(point, state), ...interactiveOptions });
      if (point) {
        layer.setRadius(getGeminiFeatureStyle(true, state).radius);
        halo.setRadius(getGeminiHaloStyle(true, state).radius);
      }
      layer.getElement()?.classList.toggle('gmi-gemini-selected', state.selected);
    };
    const clearSelection = () => {
      const previous = selected;
      selected = null;
      paint(previous);
    };
    const enter = (event) => { if (enabled) { hovered = event.target.feature; paint(hovered); } };
    const leave = (event) => { hovered = null; paint(event.target.feature); };
    const inspect = (event) => {
      if (!enabled) return;
      const feature = event.target.feature;
      const record = lookup(feature.properties?.sourceKey, feature.properties?.typeName);
      if (!record) return;
      // Lines use the actual inspection location. Circle points use their centre.
      const position = record.geometry.type === 'Point' ? event.target.getLatLng() : event.latlng;
      if (!position) return;
      popup?.remove();
      selected = feature;
      paint(feature);
      popup = L.popup({ className: 'gmi-gemini-popup', minWidth: 0, maxWidth: 400,
        autoPanPaddingTopLeft: [24, 64], autoPanPaddingBottomRight: [24, 48] })
        .setLatLng(position).setContent(createGeminiPopupContent(record)).on('remove', clearSelection).openOn(map);
    };
    for (const layer of layers) {
      // Only vector paths receive pointer events. The reference pane stays transparent.
      layer.getElement().style.pointerEvents = enabled ? 'auto' : 'none';
      layer.options.bubblingMouseEvents = !enabled;
      layer.on('click', inspect);
      layer.on('mouseover', enter);
      layer.on('mouseout', leave);
    }
    return () => {
      popup?.remove();
      for (const layer of layers) {
        layer.off('click', inspect);
        layer.off('mouseover', enter);
        layer.off('mouseout', leave);
      }
      hovered = null;
      for (const layer of primary) paint(layer.feature);
    };
  }, [map, data, lookup, enabled]);

  return <>
    <GeoJSON ref={casing} data={data} pane={GEMINI_REFERENCE_PANE}
      style={haloStyle} pointToLayer={haloPointToLayer} {...interactiveOptions} />
    <GeoJSON ref={group} data={data} pane={GEMINI_REFERENCE_PANE}
      style={{ ...style, ...interactiveOptions }} pointToLayer={pointToLayer} {...interactiveOptions} />
  </>;
}
