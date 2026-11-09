// Batch-correction eligibility for field editing (M2, acceptance T6).
//
// evaluateGmiBatchEligibility(session, { canonicalFieldId, mode, targets? })
// decides, object by object, whether a batch correction of a hydraulic-context
// field (SDR, pressure class, ring stiffness) may write that object's cell.
//
// It reuses Validator 2.0 policy instead of re-implementing it: applicability
// comes from evaluateGmiRuleApplicability (validationRunner.js), the same
// derivation that produces the rule's diagnostic coverage applicability. It
// is evaluated on the **current proposed dataset** (the verified output of the
// session's effective edits), so a material or Tema corrected earlier changes
// eligibility. The target column comes from the Validator schema binding on
// that dataset; an absent or unresolved column is a rejection (no column is
// ever added here).
//
// Categories:
//   eligible        APPLICABLE, editable cell, and missing (fill-missing) or
//                   any value (overwrite, explicit)
//   skipped reasons not-applicable | unresolved | populated |
//                   object-not-editable | out-of-scope
//
// The result is bound to the exact session state it was computed on;
// createGmiBatchCorrection refuses it for any other state.
//
// This is deliberately not a general auto-fix system (M5): it never picks a
// value and covers only the allow-listed fields below.
import { evaluateGmiRuleApplicability } from '../validation-v2/validationRunner.js';
import { getDatasetRevision } from '../validation-v2/datasetRevision.js';
import { BindingState } from '../validation-v2/contracts.js';
import { GMI_CHANGE_SET_MODES, GMI_SKIP_REASONS, compareGmiCells, isGmiFieldEditReservedColumn, isGmiMissingLexeme } from './changeSet.mjs';
import { getGmiProposedState } from './proposed.mjs';
import { gmiSessionEffectiveCells, registerGmiEligibilityBasis } from './session.mjs';
import { resolveGmiCell } from './targets.mjs';

/** Allow-listed batch fields and the Validator rule whose applicability governs them. */
export const GMI_BATCH_ELIGIBILITY_RULES = Object.freeze({
  sdr: 'innmaling.line.sdr.valid',
  pressureClass: 'innmaling.line.pressure-class.valid',
  ringStiffness: 'innmaling.line.ring-stiffness.valid',
});

const RULE_SCOPE = 'line';
const applicabilityRuns = new WeakMap();   // dataset -> Map(layerId|ruleId -> result)

function applicabilityFor(dataset, layerId, ruleId) {
  let runs = applicabilityRuns.get(dataset);
  if (!runs) { runs = new Map(); applicabilityRuns.set(dataset, runs); }
  const key = `${layerId}|${ruleId}`;
  if (!runs.has(key)) {
    runs.set(key, evaluateGmiRuleApplicability({ layerId, dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi' }, ruleId));
  }
  return runs.get(key);
}

const reject = (code, detail = {}) => Object.freeze({ ok: false, code, ...detail });

/**
 * @param {object} session GMI edit session
 * @param {{canonicalFieldId: 'sdr'|'pressureClass'|'ringStiffness',
 *          mode?: 'fill-missing'|'overwrite',
 *          targets?: Array<{scope, sourceIndex}>,
 *          cache?: object}} options
 *   `targets` restricts evaluation to explicit objects (e.g. a Validator
 *   finding's object refs); by default every object in the rule's scope.
 */
export function evaluateGmiBatchEligibility(session, { canonicalFieldId, mode = GMI_CHANGE_SET_MODES.FILL_MISSING, targets, cache } = {}) {
  if (canonicalFieldId === 'attachmentLink') return reject('field-owned-by-photo-delivery');
  const ruleId = GMI_BATCH_ELIGIBILITY_RULES[canonicalFieldId];
  if (!ruleId) return reject('unsupported-field', { canonicalFieldId });
  if (!Object.values(GMI_CHANGE_SET_MODES).includes(mode)) return reject('invalid-mode');
  if (targets !== undefined && !Array.isArray(targets)) return reject('invalid-targets');
  if (!session.document.editable) return reject('document-not-editable', { status: session.document.status });

  const proposed = getGmiProposedState(session, cache ? { cache } : undefined);
  if (!proposed.ok) return reject('proposed-unavailable', { stage: proposed.stage });
  const applicability = applicabilityFor(proposed.dataset, session.layerId, ruleId);
  const binding = applicability.schemaBinding.bindings.find((entry) => entry.canonicalFieldId === canonicalFieldId && entry.geometryScope === RULE_SCOPE);
  if (!binding || binding.state === BindingState.FIELD_ABSENT) return reject('field-absent', { canonicalFieldId });
  if (binding.state !== BindingState.BOUND || typeof binding.preferredSourceKey !== 'string') return reject('field-binding-unresolved', { canonicalFieldId, bindingState: binding.state });
  const field = binding.preferredSourceKey;
  if (isGmiFieldEditReservedColumn(field)) return reject('field-owned-by-photo-delivery', { field });

  const byIndex = new Map(applicability.outcomes.map((outcome) => [outcome.objectRef.sourceIndex, outcome]));
  const effective = gmiSessionEffectiveCells(session);
  const eligible = [], skipped = [];
  const counts = { total: 0, applicable: 0, notApplicable: 0, unresolved: 0, missing: 0, populated: 0, previouslyChanged: 0, eligible: 0, skipped: 0, skippedByReason: {} };
  const skip = (entry, reason, detail = {}) => { skipped.push({ ...entry, reason, ...detail }); counts.skippedByReason[reason] = (counts.skippedByReason[reason] || 0) + 1; };

  let requested;
  if (targets) {
    const seen = new Set();
    requested = [];
    for (const target of targets) {
      const key = `${target?.scope}:${target?.sourceIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      requested.push({ scope: target?.scope, sourceIndex: target?.sourceIndex });
    }
  } else {
    requested = applicability.outcomes.map((outcome) => ({ scope: RULE_SCOPE, sourceIndex: outcome.objectRef.sourceIndex }));
  }

  for (const { scope, sourceIndex } of requested) {
    counts.total++;
    const outcome = scope === RULE_SCOPE ? byIndex.get(sourceIndex) : null;
    if (!outcome) { skip({ key: null, scope, sourceIndex, field }, GMI_SKIP_REASONS.OUT_OF_SCOPE); continue; }
    const resolved = resolveGmiCell(session.document, { scope, sourceIndex, field });
    const base = resolved.ok
      ? { key: resolved.cell.key, scope, sourceIndex, field, position: resolved.cell.position, objectId: resolved.cell.objectId, guid: resolved.cell.guid }
      : { key: null, scope, sourceIndex, field };
    const state = outcome.applicability;
    if (state === 'APPLICABLE') counts.applicable++;
    else if (state === 'NOT_APPLICABLE') counts.notApplicable++;
    else counts.unresolved++;
    if (!resolved.ok) { skip(base, GMI_SKIP_REASONS.OBJECT_NOT_EDITABLE, { code: resolved.code, applicability: state }); continue; }
    const entry = effective.get(resolved.cell.key);
    const original = resolved.cell.lexeme;
    const current = entry ? entry.proposed : original;
    const missing = isGmiMissingLexeme(current);
    if (missing) counts.missing++; else counts.populated++;
    if (entry) counts.previouslyChanged++;
    const facts = { original, current, missing, changedBy: entry ? [...entry.touchedBy] : [] };
    if (state === 'NOT_APPLICABLE') { skip({ ...base, ...facts }, GMI_SKIP_REASONS.NOT_APPLICABLE, { applicability: state }); continue; }
    // EXPECTED (special hydraulic class), UNRESOLVED and anything else need a
    // human decision: never batch-filled.
    if (state !== 'APPLICABLE') { skip({ ...base, ...facts }, GMI_SKIP_REASONS.UNRESOLVED, { applicability: state }); continue; }
    if (mode === GMI_CHANGE_SET_MODES.FILL_MISSING && !missing) { skip({ ...base, ...facts }, GMI_SKIP_REASONS.POPULATED, { applicability: state }); continue; }
    eligible.push({ ...base, ...facts, overwrite: !missing });
  }
  eligible.sort(compareGmiCells);
  skipped.sort(compareGmiCells);
  counts.eligible = eligible.length;
  counts.skipped = skipped.length;
  const freezeAll = (list) => Object.freeze(list.map((item) => Object.freeze({ ...item, ...(item.changedBy ? { changedBy: Object.freeze(item.changedBy) } : {}) })));
  const result = Object.freeze({
    ok: true,
    kind: 'gmi-batch-eligibility',
    canonicalFieldId,
    ruleId,
    field,
    mode,
    basis: Object.freeze({ stateKey: session.stateKey, effectiveKey: proposed.effectiveKey }),
    eligible: freezeAll(eligible),
    skipped: freezeAll(skipped),
    counts: Object.freeze({ ...counts, skippedByReason: Object.freeze(counts.skippedByReason) }),
  });
  registerGmiEligibilityBasis(result, session);
  return result;
}
