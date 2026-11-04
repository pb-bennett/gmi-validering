import { getLayerType } from '@/lib/layerPresentation.mjs';

const VARIANTS = { FOTO: 'layer-type-badge-photo', WFS: 'layer-type-badge-wfs' };

// One badge system for every layer card. `type` names a source that is not a survey/photo layer (e.g. WFS).
export default function LayerTypeBadge({ layer, type: explicitType }) {
  const type = explicitType || getLayerType(layer);
  if (!type) return null;
  return <span className={`layer-type-badge ${VARIANTS[type] || ''}`} aria-label={`Lagtype ${type}`}>{type}</span>;
}
