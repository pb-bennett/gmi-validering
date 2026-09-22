const CHARACTER_WIDTH = 8;
const HORIZONTAL_PADDING = 24;
const COMPACT_MISSING_FIELD_WIDTH = 104;
const COMPACT_ORDINARY_COLUMN_WIDTH = 64;

function renderedValue(value) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

export function hasRealSuppliedValue(values = []) {
  return values.some((value) => value !== null && value !== undefined && value !== '');
}

/**
 * Contextual pinned columns are deliberately sized from the immutable complete
 * scope, rather than the currently selected focus view.
 */
export function getContextualColumnWidth({ label, values, kind }) {
  if (kind === 'field' && !hasRealSuppliedValue(values)) return COMPACT_MISSING_FIELD_WIDTH;
  const longest = Math.max(String(label || '').length, ...(values || []).map((value) => renderedValue(value).length), 0);
  const minimum = kind === 'field' ? 112 : 80;
  const maximum = kind === 'field' ? 320 : 160;
  return Math.min(maximum, Math.max(minimum, longest * CHARACTER_WIDTH + HORIZONTAL_PADDING));
}

/** Ordinary contextual attributes favour complete-scope cell content over headers. */
export function getContextualOrdinaryColumnWidth({ values }) {
  const longest = Math.max(...(values || []).map((value) => renderedValue(value).length), 0);
  return Math.min(220, Math.max(COMPACT_ORDINARY_COLUMN_WIDTH, longest * CHARACTER_WIDTH + HORIZONTAL_PADDING));
}

export function getContextualStickyOffsets({ temaWidth, fieldWidth, fieldIsTema = false }) {
  return Object.freeze({ zoom: 0, tema: 36, field: fieldIsTema ? 36 : 36 + temaWidth, result: 36 + temaWidth + (fieldIsTema ? 0 : fieldWidth) });
}
