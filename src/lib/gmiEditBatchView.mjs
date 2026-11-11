// M5B presentation/orchestration only. M2 owns applicability, safety and history.
import { createGmiBatchCorrection, evaluateGmiBatchEligibility, getGmiProposedState } from './gmi-edit/index.mjs';
import { GMI_SOURCE_LEXEMES } from './parsing/gmiLexicalEvidence.js';
import { gmiEditObjectDiagnostics } from './gmiEditValidation.mjs';

export const GMI_BATCH_FIELDS = Object.freeze([
  { id: 'sdr', label: 'SDR' }, { id: 'pressureClass', label: 'Trykklasse' }, { id: 'ringStiffness', label: 'Ringstivhet' },
]);

export function describeGmiBatchApplicability(entry, field, findings = []) {
  const relevant = findings.filter((finding) => finding.ruleId === entry.ruleId);
  const facts = entry.evidence?.diagnosticFacts;
  const context = (facts?.context || []).map(({ fieldId, value }) => `${fieldId === 'tema' ? 'Tema' : fieldId === 'material' ? 'Material' : fieldId}: ${value}`);
  const hydraulic = { PRESSURE: 'trykk', GRAVITY: 'selvfall', SPECIAL: 'spesiell / usikker' }[facts?.classification];
  if (hydraulic) context.push(`hydraulisk klasse: ${hydraulic}`);
  const detail = relevant.map((finding) => finding.reason).join(' ');
  const cause = {
    HYDRAULIC_CLASS_NOT_RECOMMENDED: `Objektets hydrauliske klasse er utenfor Validatorens anbefalte bruksområde for ${field}.`,
    MATERIAL_FAMILY_NOT_RECOMMENDED: `Materialfamilien er utenfor Validatorens anbefalte bruksområde for ${field}.`,
    SPECIAL_HYDRAULIC_CONTEXT: 'Tema gir en spesiell hydraulisk klasse. Anvendeligheten må vurderes manuelt.',
  }[facts?.applicabilityReason];
  const status = entry.reason === 'object-not-editable' ? 'Objektets kildestruktur kan ikke rettes sikkert.'
    : entry.reason === 'populated' ? `${field} er allerede utfylt. Velg overskriving for å erstatte verdien.`
      : entry.applicability === 'NOT_APPLICABLE' ? `Validator anbefaler ikke ${field} for dette objektet.`
        : entry.reason === 'unresolved' ? 'Anvendeligheten er uavklart. Validator kan ikke fastslå sikkert om feltet passer for objektet.'
          : `Validator vurderer ${field} som anvendelig.`;
  return [cause || status, context.length ? `Vurderingsgrunnlag: ${context.join(' · ')}.` : '', detail].filter(Boolean).join(' ');
}

export const canManuallySelectGmiBatchRow = (row, mode) => Boolean(row.key && ['not-applicable', 'unresolved'].includes(row.reason)
  && (mode === 'overwrite' || (row.missing && !row.original.trim())));

/** Yield between bounded chunks; never revalidate when selection/search changes. */
export async function prepareGmiBatchReview(view, options, { yieldWork = () => new Promise((resolve) => setTimeout(resolve, 0)), isLive = () => true } = {}) {
  await yieldWork();
  if (!isLive()) return { ok: false, code: 'stale-eligibility' };
  const session = view.session;
  const eligibility = evaluateGmiBatchEligibility(session, options);
  if (!eligibility.ok) return eligibility;
  const proposed = getGmiProposedState(session);
  if (!proposed.ok) return proposed;
  const rows = [], skippedRows = [];
  let processed = 0;
  for (const entry of [...eligibility.eligible, ...eligibility.skipped]) {
    const object = proposed.dataset.lines[entry.sourceIndex];
    const cells = Object.entries(object.attributes).map(([field, value]) => ({ field, editable: true,
      proposed: object.attributes[GMI_SOURCE_LEXEMES]?.[field] ?? (value == null ? '' : String(value)) }));
    const before = gmiEditObjectDiagnostics({ view, ...entry, rows: cells });
    const after = gmiEditObjectDiagnostics({ view, ...entry, rows: cells, drafts: { [entry.field]: options.lexeme } });
    const currentKeys = new Set(before.findings.filter((finding) => finding.transition !== 'resolved').map((finding) => finding.key));
    const findings = after.findings.filter((finding) => finding.transition !== 'resolved')
      .map((finding) => ({ ...finding, batchIntroduced: !currentKeys.has(finding.key) }));
    const row = { ...entry, object, objectId: object.id ?? entry.objectId,
      changedBy: entry.changedBy || [],
      currentFindings: before.findings.filter((finding) => finding.transition !== 'resolved'),
      explanation: describeGmiBatchApplicability({ ...entry, ruleId: eligibility.ruleId }, eligibility.field, before.findings.filter((finding) => finding.transition !== 'resolved')),
      findings: findings.filter((finding) => finding.batchIntroduced || finding.fields.includes(entry.field)),
      otherFindings: findings.filter((finding) => !finding.batchIntroduced && !finding.fields.includes(entry.field)),
      values: cells,
    };
    (entry.reason ? skippedRows : rows).push(row);
    if (++processed % 20 === 0) {
      await yieldWork();
      if (!isLive()) return { ok: false, code: 'stale-eligibility' };
    }
  }
  return { ok: true, session, eligibility, rows, skippedRows, lexeme: options.lexeme, mode: eligibility.mode };
}

export const initialGmiBatchSelection = (preview) => new Set(preview.rows.filter((row) => !row.changedBy.length && row.current !== preview.lexeme).map((row) => row.key));

/** Recheck the selected subset through M2, retaining a genuine eligibility token. */
export function buildGmiBatchSelection(session, preview, selected, replace = false, createdAt = new Date().toISOString(), allowOverride = false, intent = null) {
  // Identity also rejects undo/redo back to the same stateKey while the preview was open.
  if (session !== preview.session) return { ok: false, code: 'stale-eligibility' };
  const manualTargets = (preview.skippedRows || []).filter((row) => selected.has(row.key));
  if (manualTargets.length && (!allowOverride || manualTargets.some((row) => !canManuallySelectGmiBatchRow(row, preview.mode)))) return { ok: false, code: 'manual-target-not-allowed' };
  const targets = [...preview.rows.filter((row) => selected.has(row.key)), ...manualTargets];
  if (targets.length !== selected.size) return { ok: false, code: 'invalid-targets' };
  const eligibility = evaluateGmiBatchEligibility(session, { canonicalFieldId: preview.eligibility.canonicalFieldId, mode: preview.mode, targets });
  if (!eligibility.ok) return eligibility;
  const manual = { manualTargets, allowApplicabilityOverride: allowOverride };
  const result = createGmiBatchCorrection(session, { eligibility, ...manual, lexeme: preview.lexeme, mode: preview.mode,
    conflictPolicy: replace ? 'replace' : 'skip', createdAt, intent });
  if (!result.ok) return result;
  // Rebuild with the real applied count so the history label describes actual changes.
  return createGmiBatchCorrection(session, { eligibility, ...manual, lexeme: preview.lexeme, mode: preview.mode,
    conflictPolicy: replace ? 'replace' : 'skip', createdAt, intent,
    label: `${preview.mode === 'overwrite' ? 'Sett' : 'Fyll'} ${eligibility.field} ${preview.lexeme} · ${result.changeSet.cells.length} ledninger${manualTargets.length ? ' · Manuelt overstyrt' : ''}` });
}
