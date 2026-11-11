const CHARACTER_WIDTH = 8;
const HORIZONTAL_PADDING = 24;
const COMPACT_MISSING_FIELD_WIDTH = 104;
const COMPACT_ORDINARY_COLUMN_WIDTH = 64;

/** Free text (Tekst and other long non-code values) never grows beyond this. */
export const PROSE_COLUMN_MAX_WIDTH = 240;
const PROSE_CHARACTER_WIDTH = 6; // Data cells use 10px text.

/** Selective sizing. Codes, numbers, empties and short values stay compact;
 * free text is sized by its longest value, with the heading as the minimum and
 * a 240 px cap (S4). The full value stays available through the cell tooltip
 * and the table's keyboard full-text region.
 * Read the whole geometry scope so search/selection never makes columns jump.
 */
export function getOrdinaryColumnWidth({ field, label, values = [], format }) {
  const supplied = values.filter((value) => value !== null && value !== undefined && value !== '');
  const longest = supplied.reduce((length, value) => Math.max(length, String(value).length), 0);
  const headerWidth = Math.min(180, Math.max(50, String(label || field).length * 7 + 24));
  if (field === 'S_FCODE') return Math.min(180, Math.max(56, longest * 6 + 20));
  if (!supplied.length) return 72;
  const numeric = supplied.every((value) => /^[-+]?\d+(?:[.,]\d+)?$/.test(String(value).trim()));
  if (format === 'Kode' || numeric || longest <= 8) {
    // Keep some header context without allowing long names to dominate short values.
    return Math.min(180, Math.max(64, longest * 6 + 24, Math.min(headerWidth, 88)));
  }
  return Math.min(PROSE_COLUMN_MAX_WIDTH, Math.max(headerWidth, longest * PROSE_CHARACTER_WIDTH + 24));
}

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
  return Object.freeze({ zoom: 0, tema: 36, field: fieldIsTema ? 36 : 36 + temaWidth });
}

/** Keep technical columns ahead of the inspected field, then nearby context. */
export function getDiagnosticColumnOrder(fields, { temaColumn, fieldColumn }) {
  const validFields = fields.filter((field) => typeof field === 'string' && field.length > 0);
  const priority = ['S_FCODE', temaColumn, fieldColumn, 'Stedfestingsårsak', 'Merknad'];
  return [...new Set([...priority.filter((field) => validFields.includes(field)), ...validFields])];
}

/** Build TanStack attribute columns with explicit ids matching their field keys. */
export function createAttributeColumnAccessors(fields) {
  return [...new Set(fields.filter((field) => typeof field === 'string' && field.length > 0))]
    .map((id) => ({ id, accessorFn: (row) => row.attributes?.[id] }));
}

/** Final column definitions passed to TanStack in either table mode. */
export function createLayerDataTableColumns({ orderedFields, columnWidths, isContextualInspection, inspection, getFieldLabel, zoomCell, dataCell }) {
  const zoomColumn = { id: 'zoom', header: '', size: columnWidths.zoom || 36, cell: zoomCell };
  const dataColumns = createAttributeColumnAccessors(orderedFields).map(({ id, accessorFn }) => ({
    id,
    accessorFn,
    header: getFieldLabel(id),
    size: columnWidths[id] || 80,
    cell: (info) => dataCell(info, id),
    meta: {
      isFixed: id === 'S_FCODE',
      pinned: isContextualInspection && (id === inspection.presentation.temaColumn || id === inspection.presentation.fieldColumn),
      contextualField: isContextualInspection && id === inspection.presentation.fieldColumn,
      contextualOrdinary: isContextualInspection && id !== inspection.presentation.temaColumn && id !== inspection.presentation.fieldColumn,
    },
  }));
  return [zoomColumn, ...dataColumns];
}

/**
 * Temporary review ordering: the edited fields directly after the fixed
 * identity columns, everything else in the user's own saved order. Display
 * only; the saved column order is never rewritten from this.
 */
export function applyColumnFocus(orderedFields, focusFields = [], leadingFields = []) {
  const focus = focusFields.filter((field) => orderedFields.includes(field) && !leadingFields.includes(field));
  if (!focus.length) return orderedFields;
  const leading = leadingFields.filter((field) => orderedFields.includes(field));
  return [...leading, ...focus, ...orderedFields.filter((field) => !focus.includes(field) && !leading.includes(field))];
}
