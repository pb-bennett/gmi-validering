'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { createGeminiPopupContent } from '@/lib/gemini-wfs/geminiPopupContent.mjs';
import { getGeminiPresentationInput } from '@/lib/gemini-wfs/geminiPresentationAdapter.mjs';
import { getSemanticLineStyle, getSemanticPointSymbol } from '@/lib/map/semanticPresentation.mjs';
import { getLayerHighlightStyle, getLineCasingStyle } from '@/lib/map/layerHighlight.mjs';
import { getLayerMarkerZIndexOffset } from '@/lib/map/layerOrder.mjs';
import { getFeatureHoverLabel } from '@/lib/map/featureHoverLabel.mjs';
import { GEMINI_REFERENCE_PANE } from '@/lib/gemini-wfs/geminiReferencePresentation.mjs';
import './geminiPopup.css';

const interactiveOptions = { interactive: true, bubblingMouseEvents: false, pane: GEMINI_REFERENCE_PANE };

export default function GeminiInspectionSide({ data, lookup, enabled, marking, hoverControllerRef }) {
  const map = useMap();
  const markingRef = useRef(marking);
  const repaint = useRef(null);
  useEffect(() => {
    markingRef.current = marking;
    repaint.current?.();
  }, [marking]);
  useEffect(() => {
    const hoverController = hoverControllerRef?.current;
    let popup, selected = null, hovered = null;
    const input = (feature) => getGeminiPresentationInput(lookup(feature.properties.sourceKey, feature.properties.typeName));
    const highlight = () => markingRef.current.highlightAll
      ? getLayerHighlightStyle(markingRef.current, markingRef.current.id) : null;
    const casing = L.geoJSON(data, {
      ...interactiveOptions, filter: (feature) => feature.geometry.type === 'LineString',
      style: (feature) => ({ ...getLineCasingStyle(getSemanticLineStyle(input(feature)), highlight()),
        opacity: highlight() ? highlight().opacity : 0, className: 'gmi-gemini-line-halo' }),
    }).addTo(map);
    const primary = L.geoJSON(data, {
      ...interactiveOptions,
      style: (feature) => ({ ...getSemanticLineStyle(input(feature)), className: 'gmi-gemini-reference-line' }),
      pointToLayer: (feature, latlng) => L.marker(latlng, {
        ...interactiveOptions, className: 'gmi-gemini-reference-point',
        icon: L.divIcon({ ...getSemanticPointSymbol(input(feature), false, highlight()),
          className: 'custom-div-icon gmi-gemini-reference-point' }),
      }),
    }).addTo(map);
    const halos = new Map(casing.getLayers().map((layer) => [layer.feature, layer]));
    const layers = primary.getLayers();
    const byFeature = new Map(layers.map((layer) => [layer.feature, layer]));
    const paintFeature = (feature) => { if (feature) paint(byFeature.get(feature)); };
    const paint = (layer) => {
      const feature = layer.feature;
      const active = selected === feature || hovered === feature;
      if (feature.geometry.type === 'Point') {
        layer.setZIndexOffset(getLayerMarkerZIndexOffset([markingRef.current.id], markingRef.current.id, active));
        layer.setIcon(L.divIcon({ ...getSemanticPointSymbol(input(feature), active, highlight()),
          className: 'custom-div-icon gmi-gemini-reference-point' }));
      } else {
        const style = getSemanticLineStyle(input(feature), active);
        layer.setStyle(style);
        const halo = halos.get(feature);
        halo.setStyle(highlight() ? getLineCasingStyle(style, highlight()) : { opacity: 0 });
        halo.getElement().style.pointerEvents = enabled && highlight() ? 'auto' : 'none';
      }
      const element = layer.getElement();
      if (element) {
        element.style.pointerEvents = enabled ? 'auto' : 'none';
        element.classList.toggle('gmi-gemini-selected', selected === feature);
      }
    };
    const paintAll = () => layers.forEach(paint);
    repaint.current = paintAll;
    const clearSelection = () => { const previous = selected; selected = null; paintFeature(previous); };
    const inspect = (event) => {
      if (!enabled) return;
      const feature = event.target.feature;
      const record = lookup(feature.properties.sourceKey, feature.properties.typeName);
      if (!record) return;
      const position = feature.geometry.type === 'Point' ? event.target.getLatLng() : event.latlng;
      if (!position) return;
      hoverController?.cancel();
      popup?.remove();
      selected = feature;
      paintFeature(feature);
      popup = L.popup({ className: 'gmi-gemini-popup', minWidth: 0, maxWidth: 400,
        autoPanPaddingTopLeft: [24, 64], autoPanPaddingBottomRight: [24, 48] })
        .setLatLng(position).setContent(createGeminiPopupContent(record)).on('remove', clearSelection).openOn(map);
    };
    for (const layer of [...casing.getLayers(), ...layers]) {
      layer.options.bubblingMouseEvents = !enabled;
      layer.on('click', inspect);
      layer.on('mouseover', (event) => {
        if (!enabled) return;
        const previous = hovered;
        hovered = layer.feature;
        paintFeature(previous); paintFeature(hovered);
        const feature = { geometry: layer.feature.geometry, properties: input(layer.feature) };
        const label = getFeatureHoverLabel(feature);
        const latlng = feature.geometry.type === 'Point' ? layer.getLatLng() : event.latlng;
        if (label && latlng) hoverController?.enter(layer, {
          feature, latlng, label, getSource: () => markingRef.current,
        });
      });
      layer.on('mouseout', () => {
        hoverController?.leave(layer);
        const previous = hovered; hovered = null; paintFeature(previous);
      });
    }
    paintAll();
    return () => {
      repaint.current = null;
      for (const layer of [...casing.getLayers(), ...layers]) hoverController?.leave(layer);
      popup?.remove();
      primary.remove();
      casing.remove();
    };
  }, [map, data, lookup, enabled, hoverControllerRef]);
  return null;
}
