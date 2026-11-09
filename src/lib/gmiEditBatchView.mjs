// M5B presentation/orchestration only. M2 owns applicability, safety and history.
import { createGmiBatchCorrection, evaluateGmiBatchEligibility, getGmiProposedState } from './gmi-edit/index.mjs';
import { GMI_SOURCE_LEXEMES } from './parsing/gmiLexicalEvidence.js';
import { gmiEditObjectDiagnostics } from './gmiEditValidation.mjs';

export const GMI_BATCH_FIELDS = Object.freeze([
  { id: 'sdr', label: 'SDR' }, { id: 'pressureClass', label: 'Trykklasse' }, { id: 'ringStiffness', label: 'Ringstivhet' },
]);

/** Yield between bounded chunks; never revalidate when selection/search changes. */
export async function prepareGmiBatchReview(view, options, { yieldWork = () => new Promise((resolve) => setTimeout(resolve, 0)), isLive = () => true } = {}) {
  await yieldWork();
  if (!isLive()) return { ok: false, code: 'stale-eligibility' };
  const session = view.session;
  const eligibility = evaluateGmiBatchEligibility(session, options);
  if (!eligibility.ok) return eligibility;
  const proposed = getGmiProposedState(session);
  if (!proposed.ok) return proposed;
  const rows = [];
  for (const entry of eligibility.eligible) {
    const object = proposed.dataset.lines[entry.sourceIndex];
    const cells = Object.entries(object.attributes).map(([field, value]) => ({ field, editable: true,
      proposed: object.attributes[GMI_SOURCE_LEXEMES]?.[field] ?? (value == null ? '' : String(value)) }));
    const before = gmiEditObjectDiagnostics({ view, ...entry, rows: cells });
    const after = gmiEditObjectDiagnostics({ view, ...entry, rows: cells, drafts: { [entry.field]: options.lexeme } });
    const currentKeys = new Set(before.findings.filter((finding) => finding.transition !== 'resolved').map((finding) => finding.key));
    const findings = after.findings.filter((finding) => finding.transition !== 'resolved')
      .map((finding) => ({ ...finding, batchIntroduced: !currentKeys.has(finding.key) }));
    rows.push({ ...entry, object,
      findings: findings.filter((finding) => finding.batchIntroduced || finding.fields.includes(entry.field)),
      otherFindings: findings.filter((finding) => !finding.batchIntroduced && !finding.fields.includes(entry.field)),
    });
    if (rows.length % 20 === 0) {
      await yieldWork();
      if (!isLive()) return { ok: false, code: 'stale-eligibility' };
    }
  }
  return { ok: true, session, eligibility, rows, lexeme: options.lexeme, mode: eligibility.mode };
}

export const initialGmiBatchSelection = (preview) => new Set(preview.rows.filter((row) => !row.changedBy.length && row.current !== preview.lexeme).map((row) => row.key));

/** Recheck the selected subset through M2, retaining a genuine eligibility token. */
export function buildGmiBatchSelection(session, preview, selected, replace = false, createdAt = new Date().toISOString()) {
  // Identity also rejects undo/redo back to the same stateKey while the preview was open.
  if (session !== preview.session) return { ok: false, code: 'stale-eligibility' };
  const targets = preview.rows.filter((row) => selected.has(row.key));
  const eligibility = evaluateGmiBatchEligibility(session, { canonicalFieldId: preview.eligibility.canonicalFieldId, mode: preview.mode, targets });
  if (!eligibility.ok) return eligibility;
  const result = createGmiBatchCorrection(session, { eligibility, lexeme: preview.lexeme, mode: preview.mode,
    conflictPolicy: replace ? 'replace' : 'skip', createdAt });
  if (!result.ok) return result;
  // Rebuild with the real applied count so the history label describes actual changes.
  return createGmiBatchCorrection(session, { eligibility, lexeme: preview.lexeme, mode: preview.mode,
    conflictPolicy: replace ? 'replace' : 'skip', createdAt,
    label: `${preview.mode === 'overwrite' ? 'Sett' : 'Fyll'} ${eligibility.field} ${preview.lexeme} · ${result.changeSet.cells.length} ledninger` });
}
