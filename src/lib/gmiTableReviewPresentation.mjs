export const BATCH_REVIEW_COLUMNS = Object.freeze(['batchStatus', 'batchValue', 'batchFindings']);
const STATUS_RANK = Object.freeze({ change: 0, manual: 0, unchanged: 1, excluded: 2, skipped: 3, stale: 4, added: 4 });

// Actual ChangeSet-derived outcomes only. Equal groups keep TanStack's stable source order.
export function batchReviewSortValue(entry, id) {
  if (!entry) return undefined;
  if (id === 'batchStatus') return STATUS_RANK[entry.outcome];
  if (id === 'batchValue') return entry.change ? 0 : 1;
  const introduced = entry.change ? (entry.findings || []).filter((finding) => finding.introduced) : [];
  if (introduced.some((finding) => finding.tone === 'error')) return 0;
  if (introduced.some((finding) => finding.tone === 'warning')) return 1;
  return 2;
}

export function createBatchReviewColumnAccessors({ rows, scope }) {
  return BATCH_REVIEW_COLUMNS.map((id) => ({
    id,
    accessorFn: (row) => batchReviewSortValue(rows[`${scope}:${row.__index}`], id),
    sortingFn: 'basic',
    sortDescFirst: false,
    sortUndefined: 'last',
  }));
}

export function getBatchReviewColumnWidths(rows) {
  const entries = Object.values(rows);
  const valueLength = entries.reduce((longest, entry) => {
    const change = entry.change || entry.hypothetical?.change;
    return Math.max(longest, change ? `${entry.change ? '' : 'Hvis inkludert: '}${change.from ?? ''} → ${change.to ?? ''}`.length : 0);
  }, 0);
  return {
    // Manual actions need room alongside the badge; long explanations keep their tooltip.
    batchStatus: entries.some((entry) => entry.canManual) ? 320 : 180,
    batchValue: Math.min(200, Math.max(104, valueLength * 6 + 24)),
    batchFindings: entries.some((entry) => (entry.change ? entry.findings : entry.hypothetical?.findings)?.length) ? 224 : 136,
  };
}
