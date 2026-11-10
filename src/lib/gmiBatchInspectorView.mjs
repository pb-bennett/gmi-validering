// R4 orchestration. M5B/M2 remain the only owners of eligibility and patches.
import { getGmiDocumentDataset, gmiSourceIntact } from './gmi-edit/index.mjs';
import { sameGmiSelectionBinding } from './gmiEditSelection.mjs';
import { buildGmiBatchSelection } from './gmiEditBatchView.mjs';

export function gmiSelectionTargets(view, selection) {
  const binding = { layerId: view.session.layerId, sessionId: view.handle.sessionId, fingerprint: view.document.fingerprint };
  if (!sameGmiSelectionBinding(binding, selection?.binding) || view.handle.fingerprint !== binding.fingerprint
    || view.session.document !== view.document || !gmiSourceIntact(view.document)) return { ok: false, code: 'stale-session' };
  if (selection.scope !== 'line') return { ok: false, code: 'line-only' };
  const dataset = getGmiDocumentDataset(view.document);
  const targets = [];
  for (const key of selection.keys) {
    const match = /^line:(0|[1-9]\d*)$/.exec(key);
    const sourceIndex = match ? Number(match[1]) : -1;
    const object = dataset.lines[sourceIndex];
    if (!object) return { ok: false, code: 'invalid-targets' };
    targets.push({ scope: 'line', sourceIndex, objectId: object.id, guid: object.guid ?? null });
  }
  return targets.length && new Set(selection.keys).size === targets.length
    ? { ok: true, targets } : { ok: false, code: 'invalid-targets' };
}

export function gmiBatchScopeState(view, selection, review) {
  const targets = gmiSelectionTargets(view, selection);
  if (!targets.ok) return targets.code;
  if (review.preview.session !== view.session || !sameGmiSelectionBinding(review.binding, selection.binding)) return 'stale-session';
  if (selection.keys.some((key) => !review.keys.includes(key))) return 'expanded';
  return null;
}

export function planGmiInspectorBatch(view, selection, review, manual = new Set(), replace = false, advanced = false) {
  const stale = gmiBatchScopeState(view, selection, review);
  if (stale) return { ok: false, code: stale };
  const scope = new Set(selection.keys);
  const rows = [...review.preview.rows, ...review.preview.skippedRows].filter((row) => scope.has(`${row.scope}:${row.sourceIndex}`));
  const included = new Set(rows.filter((row) => !row.reason || (advanced && manual.has(row.key))).map((row) => row.key));
  const result = buildGmiBatchSelection(view.session, review.preview, included, replace, undefined, advanced);
  const changeSet = result.ok ? result.changeSet : null;
  const changed = new Set(changeSet?.cells.map((cell) => cell.key));
  const unchanged = new Set(changeSet?.unchanged.map((cell) => cell.key));
  const skipped = new Map(changeSet?.skipped.map((cell) => [cell.key, cell.reason]));
  const displayRows = rows.map((row) => ({ ...row, manual: advanced && manual.has(row.key),
    status: changed.has(row.key) ? 'Endres' : unchanged.has(row.key) ? 'Uendret' : 'Hoppes over',
    skipReason: skipped.get(row.key) || row.reason,
    proposed: review.preview.lexeme }));
  return { ...result, rows: displayRows, included, counts: { selected: rows.length,
    eligible: rows.filter((row) => !row.reason).length,
    manual: changeSet?.eligibility.manualOverrides.length || 0,
    changed: changeSet?.cells.length || 0, unchanged: changeSet?.unchanged.length || 0,
    skipped: displayRows.filter((row) => row.status === 'Hoppes over').length,
    newErrors: displayRows.filter((row) => changed.has(row.key) && row.findings.some((finding) => finding.batchIntroduced && finding.state === 'FAIL')).length,
  } };
}
