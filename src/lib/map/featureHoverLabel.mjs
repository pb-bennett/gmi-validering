const value = (input) => {
  if (typeof input === 'number') return Number.isFinite(input) ? String(input) : null;
  if (typeof input !== 'string') return null;
  const text = input.trim();
  return text && !/^(?:null|undefined|nan|n\/a|-)$/i.test(text) ? text : null;
};

export function getFeatureHoverParts(feature) {
  const props = feature?.properties ?? feature ?? {};
  const point = feature?.geometry?.type === 'Point' || props.featureType === 'Point';
  const identity = value(props.S_FCODE);
  const type = value(props.Type);
  // Generic annotations and symbols have no physical object identity.
  if (point && (/^(?:SYM|VASYMBOL)$/i.test(identity ?? '') ||
      /^(?:VAPåskrift|VASymbol|VADriftsdata)$/i.test(props.objekttypenavn ?? ''))) return [];
  if (!identity && !point) return [];

  if (!point) {
    const dimension = value(props.Dimensjon);
    const material = value(props.Material);
    const year = value(props['Anleggsår']);
    return [`${identity}${dimension === null ? '' : ` ${dimension}`}`, material, year].filter(Boolean);
  }

  const pointIdentity = identity ?? type;
  if (!pointIdentity) return [];
  const usefulType = identity && type && type.toLocaleLowerCase() !== identity.toLocaleLowerCase() ? type : null;
  return [pointIdentity, usefulType, value(props.Bredde), value(props.Material), value(props['Anleggsår'])].filter(Boolean);
}

export function getFeatureHoverLabel(feature) {
  const parts = getFeatureHoverParts(feature);
  return parts.length ? parts.join(' · ') : null;
}

export function getFeatureHoverColor(feature, layers) {
  const layerId = feature?.properties?._layerId;
  const layer = layerId && layers?.[layerId];
  const color = layer?.highlightStyle?.color;
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}
