// R4 orchestration. M5B/M2 remain the only owners of eligibility and patches.
import { getGmiDocumentDataset, gmiSourceIntact } from './gmi-edit/index.mjs';
import { sameGmiSelectionBinding } from './gmiEditSelection.mjs';
import { buildGmiBatchSelection, canManuallySelectGmiBatchRow } from './gmiEditBatchView.mjs';

export function gmiSelectionTargets(view, selection, { lineOnly = false } = {}) {
  const binding = { layerId: view.session.layerId, sessionId: view.handle.sessionId, fingerprint: view.document.fingerprint };
  if (!sameGmiSelectionBinding(binding, selection?.binding) || view.handle.fingerprint !== binding.fingerprint
    || view.session.document !== view.document || !gmiSourceIntact(view.document)) return { ok: false, code: 'stale-session' };
  if (lineOnly && selection.scope !== 'line') return { ok: false, code: 'line-only' };
  if (!['point', 'line'].includes(selection.scope) || !Array.isArray(selection.keys)) return { ok: false, code: 'invalid-targets' };
  const dataset = getGmiDocumentDataset(view.document);
  const targets = [];
  for (const key of selection.keys) {
    const match = /^(point|line):(0|[1-9]\d*)$/.exec(key);
    const sourceIndex = match && match[1] === selection.scope ? Number(match[2]) : -1;
    const object = dataset[selection.scope === 'point' ? 'points' : 'lines'][sourceIndex];
    if (!object) return { ok: false, code: 'invalid-targets' };
    targets.push({ scope: selection.scope, sourceIndex, objectId: object.id, guid: object.guid ?? null });
  }
  return targets.length && new Set(selection.keys).size === targets.length
    ? { ok: true, targets } : { ok: false, code: 'invalid-targets' };
}

export function gmiBatchScopeState(view, selection, review) {
  const targets = gmiSelectionTargets(view, selection, { lineOnly: true });
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
  const introduced = (state) => displayRows.filter((row) => changed.has(row.key)
    && row.findings.some((finding) => finding.batchIntroduced && finding.state === state)).length;
  return { ...result, rows: displayRows, included, counts: { selected: rows.length,
    eligible: rows.filter((row) => !row.reason).length,
    manual: changeSet?.eligibility.manualOverrides.length || 0,
    changed: changeSet?.cells.length || 0, unchanged: changeSet?.unchanged.length || 0,
    skipped: displayRows.filter((row) => row.status === 'Hoppes over').length,
    // Previewed objects the user has since unchecked. They are not in the ChangeSet.
    excluded: review.preview.rows.length + review.preview.skippedRows.length - rows.length,
    // Only cells that actually change can introduce findings.
    newErrors: introduced('FAIL'), newChecks: introduced('CHECK'),
  } };
}

// ------------------------------------------------- table review presentation

const HYDRAULIC = { PRESSURE: 'trykkledninger', GRAVITY: 'selvfallsledninger', SPECIAL: 'spesiell hydraulisk klasse' };

/** One short, specific reason for a skipped object, from M5B/M2 evidence only. */
export function gmiBatchSkipSummary(row, field, reason = row.reason) {
  const facts = row.evidence?.diagnosticFacts;
  const context = (id) => facts?.context?.find((entry) => entry.fieldId === id)?.value;
  const tema = context('tema'), material = context('material');
  if (reason === 'populated') return `Har allerede verdi «${String(row.current ?? row.original).trim()}»`;
  if (reason === 'conflict') return 'Endret av en tidligere retting';
  if (reason === 'object-not-editable') return 'Objektet kan ikke rettes sikkert';
  if (reason === 'out-of-scope') return 'Utenfor utvalget';
  if (reason === 'unresolved') return `Uavklart om ${field} gjelder${tema ? ` (Tema ${tema})` : ''}`;
  if (reason !== 'not-applicable') return 'Hoppes over';
  if (facts?.applicabilityReason === 'HYDRAULIC_CLASS_NOT_RECOMMENDED' && HYDRAULIC[facts.classification]) {
    return `${field} anbefales ikke for ${HYDRAULIC[facts.classification]}${tema ? ` (Tema ${tema})` : ''}`;
  }
  if (facts?.applicabilityReason === 'MATERIAL_FAMILY_NOT_RECOMMENDED') return `${field} anbefales ikke for ${material ? `material ${material}` : 'materialet'}`;
  if (facts?.applicabilityReason === 'SPECIAL_HYDRAULIC_CONTEXT') return `Spesiell hydraulisk klasse${tema ? ` (Tema ${tema})` : ''} – vurder manuelt`;
  return `${field} anbefales ikke for objektet`;
}

/** Findings most-severe first: new FEIL, FEIL, new SJEKK, SJEKK. */
export function gmiBatchFindingList(findings = []) {
  const rank = (finding) => (finding.state === 'FAIL' ? 0 : 2) + (finding.batchIntroduced ? 0 : 1);
  return [...findings].sort((a, b) => rank(a) - rank(b)).map((finding) => ({
    key: finding.key, tone: finding.state === 'FAIL' ? 'error' : 'warning',
    severity: finding.state === 'FAIL' ? 'FEIL' : 'SJEKK', introduced: Boolean(finding.batchIntroduced), reason: finding.reason,
  }));
}

export const GMI_BATCH_OUTCOME_LABELS = Object.freeze({
  change: 'Endres', manual: 'Manuelt inkludert', unchanged: 'Uendret', skipped: 'Hoppes over',
  excluded: 'Utelatt av deg', stale: 'Ugyldig forhåndsvisning', added: 'Ikke forhåndsvist',
});

/**
 * Per-object table records for the current review. The outcome is read from the
 * ChangeSet that would actually be staged; nothing is inferred from the original
 * preview for objects the user removed. A skipped object only carries a
 * hypothetical change/findings when it may be manually included, and those are
 * labelled as such.
 */
export function gmiBatchReviewRows({ review, plan, selection, advanced = false, stale = null }) {
  const out = {};
  if (!review) return out;
  const field = review.preview.eligibility.field, lexeme = review.preview.lexeme;
  const all = [...review.preview.rows, ...review.preview.skippedRows];
  const selected = new Set(selection?.keys || []);
  const objectKey = (row) => `${row.scope}:${row.sourceIndex}`;
  if (stale || !plan) {
    // An invalid preview shows no values for any object: it must be recalculated.
    for (const key of selected) out[key] = { outcome: review.keys.includes(key) ? 'stale' : 'added', detail: '', findings: [] };
    return out;
  }
  // No ChangeSet when nothing was included (every selected object is skipped);
  // any other construction failure invalidates the included objects.
  const changeSet = plan.ok ? plan.changeSet : null;
  const failed = !plan.ok && plan.included?.size > 0;
  const cells = new Map(changeSet?.cells.map((cell) => [cell.key, cell]));
  const unchanged = new Set(changeSet?.unchanged.map((cell) => cell.key));
  const finalSkips = new Map(changeSet?.skipped.map((cell) => [cell.key, cell.reason]));
  const manual = new Set(changeSet?.eligibility.manualOverrides.map((row) => row.key));
  for (const row of all) {
    const key = objectKey(row);
    if (!selected.has(key)) { out[key] = { outcome: 'excluded', detail: '', findings: [] }; continue; }
    if (failed && plan.included.has(row.key)) { out[key] = { outcome: 'stale', detail: '', findings: [] }; continue; }
    const cell = cells.get(row.key);
    if (cell) {
      out[key] = { outcome: manual.has(row.key) ? 'manual' : 'change', detail: manual.has(row.key) ? gmiBatchSkipSummary(row, field) : '',
        change: { from: cell.previous, to: cell.next, overwrites: cell.overwritesPopulated }, findings: gmiBatchFindingList(row.findings),
        canManual: manual.has(row.key) && advanced, manualOn: manual.has(row.key), cellKey: row.key, explanation: row.explanation };
      continue;
    }
    if (unchanged.has(row.key)) { out[key] = { outcome: 'unchanged', detail: `Har allerede «${String(row.current).trim()}»`, findings: [], explanation: row.explanation }; continue; }
    const reason = finalSkips.get(row.key) || row.reason;
    const canManual = advanced && canManuallySelectGmiBatchRow(row, review.preview.mode);
    out[key] = { outcome: 'skipped', detail: gmiBatchSkipSummary(row, field, reason), findings: [], explanation: row.explanation,
      canManual, manualOn: false, cellKey: row.key,
      // Decision support only: what manual inclusion would do. Never counted.
      hypothetical: canManual ? { change: { from: row.current, to: lexeme }, findings: gmiBatchFindingList(row.findings) } : null };
  }
  return out;
}
