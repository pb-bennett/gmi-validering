/** Classify against the table's existing models; never duplicate sorting or filtering. */
export function classifyLayerTableReveal({ targets, sortedRows, allRows, filteredRows, searchedRows, showOnly = false }) {
  const indices = new Set(targets.map((target) => target.sourceIndex));
  const matches = (row) => indices.has((row.original || row).__index);
  const index = sortedRows.findIndex(matches);
  if (index >= 0) return { kind: 'visible', index, sourceIndex: sortedRows[index].original?.__index ?? sortedRows[index].__index };
  if (!allRows.some(matches)) return { kind: 'absent' };
  const reasons = [];
  if (!filteredRows.some(matches)) reasons.push('filter');
  else if (!searchedRows.some(matches)) reasons.push('search');
  if (showOnly) reasons.push('selected-only');
  return { kind: 'hidden', reasons };
}
