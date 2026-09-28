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
  const zoomColumn = { id: 'zoom', header: '', size: 36, cell: zoomCell };
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
