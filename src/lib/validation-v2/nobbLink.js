const NOBB_FIELDS = new Set(['nobbVavvsNumber', 'nobbVavvsFrameNumber']);

export function getNobbItemHref(canonicalFieldId, deliveredValue) {
  if (!NOBB_FIELDS.has(canonicalFieldId)) return null;
  const value = String(deliveredValue ?? '');
  if (!/^[+-]?[0-9]+$/.test(value)) return null;
  return `https://nobb.no/item/${encodeURIComponent(value)}`;
}
