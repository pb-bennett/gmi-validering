import { getLayerType } from '@/lib/layerPresentation.mjs';

export default function LayerTypeBadge({ layer }) {
  const type = getLayerType(layer);
  if (!type) return null;
  return <span className={`layer-type-badge ${type === 'FOTO' ? 'layer-type-badge-photo' : ''}`} aria-label={`Lagtype ${type}`}>{type}</span>;
}
