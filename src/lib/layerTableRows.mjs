import { filterTableSearchRows, normalizeTableSearchQuery } from './tableSearch.js';

// These normalisations intentionally match the table's historical predicates,
// including layer-wide Tema/Type and geometry-specific Felt hiding.
export function isLayerTableItemHidden(item, tab, { hiddenCodes = [], hiddenTypes = [], feltHiddenValues = [] } = {}) {
  const attrs = item.attributes || {};
  const rawFcode = attrs.S_FCODE;
  const fcode = rawFcode === null || rawFcode === undefined || String(rawFcode).trim() === ''
    ? '(Ingen verdi)' : String(rawFcode);
  const type = attrs.Type || '(Mangler Type)';
  if (hiddenCodes.includes(fcode)) return true;
  if (hiddenTypes.some((hidden) => hidden.type === type && (hidden.code === null || hidden.code === fcode))) return true;
  return feltHiddenValues.some((hidden) => {
    if (hidden.objectType !== (tab === 'punkter' ? 'points' : 'lines')) return false;
    const value = attrs[hidden.fieldName];
    return (value === null || value === undefined || value === '' ? '(Mangler)' : String(value)) === hidden.value;
  });
}

/**
 * Pure preparation in source order. dataset is the displayed, already verified
 * Original/Foreslått dataset. inspectionRows are already resolved/revision-checked
 * exact/contextual rows, or null for the ordinary table. Their indices and metadata
 * are preserved and sidebar/view constraints are bypassed, but search still applies.
 *
 * items supplies column discovery and pre-search counts. searchedItems is the only
 * input to TanStack. R3 must use table.getRowModel().rows.map(row => row.original)
 * for the final searched/sorted set (not virtual rows), retaining TanStack's sorting
 * and tie-breaking rather than maintaining another sorting/filtering implementation.
 */
export function deriveLayerTableRows({ dataset, tab, filters = {}, view = 'original', changedByObject, inspectionRows = null, searchQuery = '', selectionKeys = null }) {
  const scope = tab === 'punkter' ? 'point' : 'line';
  const rawItems = inspectionRows ?? (tab === 'punkter' ? dataset?.points : dataset?.lines) ?? [];
  const indexed = inspectionRows !== null ? rawItems : rawItems.map((item, __index) => ({ ...item, __index }));
  const allItemsWithIndex = inspectionRows !== null || view !== 'changed'
    ? indexed : indexed.filter((item) => changedByObject?.has(`${scope}:${item.__index}`));
  const hasActiveFilters = (filters.hiddenCodes?.length || filters.hiddenTypes?.length || filters.feltHiddenValues?.length || 0) > 0;
  const items = inspectionRows !== null || !hasActiveFilters ? allItemsWithIndex
    : allItemsWithIndex.filter((item) => !isLayerTableItemHidden(item, tab, filters));
  const searchedItems = filterTableSearchRows(items, normalizeTableSearchQuery(searchQuery));
  // Explicit selection display override: inspect the complete selection without
  // rewriting filters/search or restricting it to effectively changed objects.
  const selected = selectionKeys === null ? null : new Set(selectionKeys);
  const displayItems = selected && inspectionRows === null
    ? indexed.filter((item) => selected.has(`${scope}:${item.__index}`)) : searchedItems;
  return { allItemsWithIndex, items, searchedItems, displayItems };
}
