export const LAYER_HIGHLIGHT_PALETTE = [
  '#D946EF',
  '#F59E0B',
  '#00BFD8',
  '#8B5CF6',
  '#14B8A6',
  '#64748B',
];

export const DEFAULT_HIGHLIGHT_OPACITY = 0.55;
export const DEFAULT_HIGHLIGHT_SPREAD = 4;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function getNextLayerHighlightColor(layers, layerOrder) {
  const used = new Set(
    layerOrder.map((id) =>
      (layers[id]?.defaultHighlightColor ?? layers[id]?.highlightStyle?.color)?.toUpperCase(),
    ),
  );
  return LAYER_HIGHLIGHT_PALETTE.find((color) => !used.has(color)) ??
    LAYER_HIGHLIGHT_PALETTE[layerOrder.length % LAYER_HIGHLIGHT_PALETTE.length];
}

export function getFallbackLayerHighlightColor(layerId = '') {
  // A stable ID-based fallback also supports layers created before this shape existed.
  let hash = 0;
  for (const char of String(layerId)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return LAYER_HIGHLIGHT_PALETTE[hash % LAYER_HIGHLIGHT_PALETTE.length];
}

export function getLayerHighlightStyle(layer, layerId = '') {
  const fallbackColor = getFallbackLayerHighlightColor(layerId);
  const style = layer?.highlightStyle;
  return {
    color: /^#[0-9a-f]{6}$/i.test(style?.color ?? '') ? style.color : fallbackColor,
    opacity: Number.isFinite(style?.opacity)
      ? clamp(style.opacity, 0.2, 0.8)
      : DEFAULT_HIGHLIGHT_OPACITY,
    spread: Number.isFinite(style?.spread)
      ? clamp(style.spread, 2, 8)
      : DEFAULT_HIGHLIGHT_SPREAD,
  };
}

export function getLineCasingStyle(semanticStyle, highlightStyle) {
  if (!semanticStyle || !highlightStyle ||
      semanticStyle.weight <= 0 || semanticStyle.opacity <= 0) return null;

  return {
    color: highlightStyle.color,
    weight: semanticStyle.weight + highlightStyle.spread,
    opacity: clamp(highlightStyle.opacity *
      Math.min(1, semanticStyle.opacity / 0.9), 0, 1),
    dashArray: semanticStyle.dashArray ?? null,
    lineCap: semanticStyle.dashArray ? 'butt' : 'round',
    interactive: false,
    fill: false,
  };
}

export function getPointHaloSpread(spread) {
  return clamp(spread / 2, 1, 2);
}

export function getPointHaloSvg(category, size, strokeWidth, highlightStyle) {
  const half = size / 2;
  const edge = getPointHaloSpread(highlightStyle.spread);
  const haloStroke = strokeWidth + 2 * edge;
  const common = `fill="none" stroke="${highlightStyle.color}" stroke-opacity="${highlightStyle.opacity}" stroke-width="${haloStroke}" stroke-linejoin="round"`;

  if (category === 'water' || category === 'other' || category === 'div' ||
      category === 'anboring' || category === 'grn' || category === 'lok') {
    return `<circle cx="${half}" cy="${half}" r="${half - strokeWidth}" ${common}/>`;
  }
  if (category === 'wastewater' || category === 'sls_slu' ||
      category === 'san' || category === 'krn') {
    return `<rect x="${strokeWidth}" y="${strokeWidth}" width="${size - 2 * strokeWidth}" height="${size - 2 * strokeWidth}" ${common}/>`;
  }
  if (category === 'stormwater') {
    return `<polygon points="${half},${strokeWidth} ${size - strokeWidth},${size - strokeWidth} ${strokeWidth},${size - strokeWidth}" ${common}/>`;
  }
  if (category === 'drainage') {
    return `<polygon points="${half},${strokeWidth} ${size - strokeWidth},${half} ${half},${size - strokeWidth} ${strokeWidth},${half}" ${common}/>`;
  }
  if (category === 'manhole') {
    const h = size / 4;
    return `<polygon points="${half},${strokeWidth} ${size - strokeWidth},${h + strokeWidth} ${size - strokeWidth},${size - h - strokeWidth} ${half},${size - strokeWidth} ${strokeWidth},${size - h - strokeWidth} ${strokeWidth},${h + strokeWidth}" ${common}/>`;
  }
  if (category === 'grokonstr') {
    const width = strokeWidth === 3 ? 28 : 22;
    const height = strokeWidth === 3 ? 18 : 14;
    return `<rect x="${(size - width) / 2}" y="${(size - height) / 2}" width="${width}" height="${height}" ${common}/>`;
  }
  if (category === 'gas' || category === 'electric') {
    const count = category === 'gas' ? 5 : 10;
    const radius = half - strokeWidth;
    const points = Array.from({ length: count }, (_, i) => {
      const r = category === 'electric' && i % 2 ? radius * 0.4 : radius;
      const angle = ((i * 360 / count - 90) * Math.PI) / 180;
      return `${half + r * Math.cos(angle)},${half + r * Math.sin(angle)}`;
    }).join(' ');
    return `<polygon points="${points}" ${common}/>`;
  }
  if (category === 'telecom') {
    const cw = size * 0.3;
    const co = (size - cw) / 2;
    return `<path d="M${co},${strokeWidth} h${cw} v${co - strokeWidth} h${co - strokeWidth} v${cw} h-${co - strokeWidth} v${co - strokeWidth} h-${cw} v-${co - strokeWidth} h-${co - strokeWidth} v-${cw} h${co - strokeWidth} z" ${common}/>`;
  }
  if (category === 'heating') {
    return `<path d="M${half},${strokeWidth} C${size - strokeWidth},${half} ${size - strokeWidth},${size - strokeWidth} ${half},${size - strokeWidth} C${strokeWidth},${size - strokeWidth} ${strokeWidth},${half} ${half},${strokeWidth} Z" ${common}/>`;
  }
  return `<rect x="${strokeWidth}" y="${strokeWidth}" width="${size - 2 * strokeWidth}" height="${size - 2 * strokeWidth}" ${common}/>`;
}
