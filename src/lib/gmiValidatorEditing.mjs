// M5C orchestration. Rules, applicability, parsing and mutations remain in M1/M2.
import { evaluateGmiBatchEligibility, getGmiDocumentDataset, gmiSourceIntact } from './gmi-edit/index.mjs';
import { getDatasetRevision } from './validation-v2/datasetRevision.js';
import { compareGmiValidationRuns } from './validation-v2/findingDiff.js';
export { compareGmiValidationRuns } from './validation-v2/findingDiff.js';

export const CORRECTABLE_RULES = Object.freeze({
  'innmaling.line.sdr.valid': 'sdr',
  'innmaling.line.pressure-class.valid': 'pressureClass',
  'innmaling.line.ring-stiffness.valid': 'ringStiffness',
});

export const isCorrectableMissingFinding = (finding) => ['REQUIRED_VALUE_MISSING', 'APPLICABILITY_REQUIRED_MISSING', 'NON_NEW_REQUIRED_VALUE_MISSING', 'EXISTING_INFRASTRUCTURE_VALUE_MISSING'].includes(finding.reasonCode);

export const validatorCheckCount = (summary) => summary.checkFindingCount + summary.indeterminateFindingCount;
export function buildGmiValidationComparison(session, validation, referenceDate) {
  if (!validation.ok) return { ok: false, code: 'proposed-validation-failed' };
  if (session.layerId !== validation.original.layerId || validation.original.runContext.referenceDate !== referenceDate) return { ok: false, code: 'comparison-mismatch' };
  return { ok: true, session, fingerprint: session.document.fingerprint, referenceDate,
    effectiveKey: validation.proposed.effectiveKey, validation,
    ...compareGmiValidationRuns(validation.original, validation.revised, getGmiDocumentDataset(session.document), validation.proposed.dataset) };
}

export function isCurrentGmiComparison(comparison, session, referenceDate) {
  return Boolean(comparison?.ok && comparison.session === session && comparison.fingerprint === session?.document.fingerprint && comparison.referenceDate === referenceDate);
}

/** Only exact, owned missing findings can seed the existing batch engine. */
export function prepareValidatorCorrection(session, run, ruleIds) {
  if (!session || !run || run.layerId !== session.layerId) return { ok: false, code: 'session-mismatch' };
  const ruleId = ruleIds.find((id) => CORRECTABLE_RULES[id]);
  if (!ruleId) return { ok: false, code: 'unsupported-rule' };
  const canonicalFieldId = CORRECTABLE_RULES[ruleId];
  const findings = run.ruleResults.find((result) => result.rule.ruleId === ruleId)?.findings || [];
  const targets = findings.filter((f) => isCorrectableMissingFinding(f)
    && f.objectRef?.layerId === session.layerId && f.objectRef.datasetRevision === run.datasetRevision)
    .map((f) => ({ scope: f.objectRef.geometryScope, sourceIndex: f.objectRef.sourceIndex }));
  if (!targets.length) return { ok: false, code: 'no-missing-targets' };
  const eligibility = evaluateGmiBatchEligibility(session, { canonicalFieldId, mode: 'fill-missing', targets });
  if (!eligibility.ok) return eligibility;
  // The shortcut never includes previously populated original values, even if cleared by a proposal.
  const eligible = eligibility.eligible.filter((entry) => !entry.original.trim() && entry.missing);
  if (!eligible.length) return { ok: false, code: 'no-editable-targets' };
  return { ok: true, layerId: session.layerId, session, fingerprint: session.document.fingerprint, ruleId, canonicalFieldId,
    targets: eligible.map(({ scope, sourceIndex }) => ({ scope, sourceIndex })), datasetRevision: run.datasetRevision };
}

export const VALIDATOR_CORRECTION_STALE = 'Kildegrunnlaget for Validator-utvalget er endret. Gå tilbake til Validator og lag et nytt utvalg.';

/** Navigation only: checked source identities, without a field or editing permission. */
export function validatorSelectionHandoff(handoff, view, layer) {
  const fail = () => ({ ok: false, code: 'stale-session', message: VALIDATOR_CORRECTION_STALE });
  const binding = handoff?.binding;
  if (handoff?.kind !== 'validator-selection' || !binding || !view?.session || !view.handle || !layer
    || binding.layerId !== layer.id || binding.layerId !== view.session.layerId
    || view.handle.layerId !== layer.id || binding.sessionId !== view.handle.sessionId
    || handoff.sessionId !== binding.sessionId || handoff.session !== view.session
    || handoff.document !== view.document || view.session.document !== view.document
    || !binding.fingerprint || binding.fingerprint !== view.document.fingerprint
    || view.handle.fingerprint !== binding.fingerprint || !view.document.editable || !gmiSourceIntact(view.document)
    || !['point', 'line'].includes(handoff.scope) || !Array.isArray(handoff.keys) || !handoff.keys.length
    || !['original', 'proposed'].includes(handoff.provenance?.datasetKind)) return fail();
  const objects = handoff.scope === 'point' ? 'points' : 'lines';
  const dataset = getGmiDocumentDataset(view.document);
  for (const key of handoff.keys) {
    const match = /^(point|line):(0|[1-9]\d*)$/.exec(key);
    if (!match || match[1] !== handoff.scope) return fail();
    const index = Number(match[2]), source = dataset[objects]?.[index], object = layer.data?.[objects]?.[index];
    if (!Number.isSafeInteger(index) || !source || !object || source.id !== object.id
      || (source.guid ?? null) !== (object.guid ?? null)) return fail();
  }
  if (new Set(handoff.keys).size !== handoff.keys.length) return fail();
  const provenance = { ...handoff.provenance, ruleIds: [...(handoff.provenance.ruleIds || [])] };
  const keys = [...handoff.keys], focus = keys.length === 1
    ? { scope: handoff.scope, sourceIndex: Number(keys[0].split(':')[1]) } : null;
  return { ok: true, datasetKind: provenance.datasetKind,
    handoff: { mode: focus ? 'object' : 'batch', focus, provenance },
    selection: { binding: { ...binding }, host: { kind: 'rettinger' }, scope: handoff.scope, keys,
      anchor: null, showOnly: keys.length > 1, origin: { kind: 'validator-selection', ...provenance, count: keys.length } } };
}

/** Accept prepared targets only against their exact live session and immutable source. */
export function validatorCorrectionSelection(correction, view, layer) {
  const fail = () => ({ ok: false, code: 'stale-session', message: VALIDATOR_CORRECTION_STALE });
  if (!correction?.ok || !view || !layer || correction.layerId !== layer.id
    || correction.layerId !== view.session.layerId || correction.sessionId !== view.handle.sessionId
    || correction.session !== view.session || correction.session.document !== view.document
    || correction.fingerprint !== view.document.fingerprint || view.handle.fingerprint !== correction.fingerprint
    || !gmiSourceIntact(view.document) || CORRECTABLE_RULES[correction.ruleId] !== correction.canonicalFieldId) return fail();
  const dataset = getGmiDocumentDataset(view.document);
  const keys = [];
  for (const target of correction.targets || []) {
    if (target.scope !== 'line' || !Number.isInteger(target.sourceIndex) || target.sourceIndex < 0) return fail();
    const source = dataset.lines[target.sourceIndex], object = layer.data?.lines?.[target.sourceIndex];
    if (!source || !object || source.id !== object.id || (source.guid ?? null) !== (object.guid ?? null)) return fail();
    keys.push(`line:${target.sourceIndex}`);
  }
  if (!keys.length || new Set(keys).size !== keys.length) return fail();
  const binding = { layerId: layer.id, sessionId: view.handle.sessionId, fingerprint: view.document.fingerprint };
  return { ok: true, selection: { binding, scope: 'line', keys, anchor: null, showOnly: true,
    origin: { kind: 'validator', ruleId: correction.ruleId, canonicalFieldId: correction.canonicalFieldId,
      targets: correction.targets.map((target) => ({ ...target })), ...binding } } };
}

// Resolve an inspection against the exact verified session, never another layer
// or a replacement source. The original imported layer stays untouched.
export function validatorInspectionLayer(registry, layer, basis) {
  if (!basis) return layer;
  if (!layer || basis.layerId !== layer.id) return null;
  const resolved = registry.resolve(registry.getHandle(layer.id));
  if (!resolved.ok || resolved.session !== basis.session) return null;
  const proposed = registry.proposed(registry.getHandle(layer.id));
  if (!proposed.ok || getDatasetRevision(proposed.dataset) !== basis.datasetRevision) return null;
  return { ...layer, data: proposed.dataset };
}
