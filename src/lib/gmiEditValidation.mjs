// Inspection-only lexical overlays. Export still uses M1's verified reparse;
// neither the source object nor the M2 session is mutated here.
import { getGmiDocumentDataset } from './gmi-edit/index.mjs';
import { GMI_SOURCE_LEXEMES } from './parsing/gmiLexicalEvidence.js';
import { getDatasetRevision } from './validation-v2/datasetRevision.js';
import { createGmiObjectValidator } from './validation-v2/validationRunner.js';
import { buildFieldDiagnostics, renderValidationV2Diagnostic, renderValidationV2DependencyNote } from './validation-v2/diagnostics.js';

const documents = new WeakMap();
const TRANSITION = { original: 'Finnes i originalen', introduced: 'Nytt i forslaget', resolved: 'Løst i forslaget' };

function validatorFor(document, layerId) {
  let layers = documents.get(document);
  if (!layers) { layers = new Map(); documents.set(document, layers); }
  if (!layers.has(layerId)) {
    const dataset = getGmiDocumentDataset(document);
    layers.set(layerId, { dataset, originals: new Map(), validator: createGmiObjectValidator({
      layerId, dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi',
    }) });
  }
  return layers.get(layerId);
}

export function overlayGmiObjectValues(object, values) {
  const attributes = { ...object.attributes };
  const lexemes = { ...object.attributes?.[GMI_SOURCE_LEXEMES] };
  for (const [field, value] of Object.entries(values)) {
    // Structural columns cannot be created by a draft overlay.
    if (!Object.hasOwn(attributes, field)) continue;
    attributes[field] = value.trim() === '' ? null : value.trim();
    lexemes[field] = value;
  }
  Object.defineProperty(attributes, GMI_SOURCE_LEXEMES, { value: Object.freeze(lexemes) });
  return { ...object, attributes };
}

function diagnosticsFor(result, scope) {
  return result.ruleResults.flatMap(({ rule }) => {
    const model = buildFieldDiagnostics({ result, rule, geometryScope: scope });
    const fields = [...new Set((rule.inputFieldIds || [rule.canonicalFieldId, ...(rule.relatedFieldIds || [])]).flatMap((id) =>
      result.schemaBinding.bindings.filter((binding) => binding.geometryScope === scope && binding.canonicalFieldId === id)
        .flatMap((binding) => binding.candidates.filter((candidate) => candidate.mappingKind !== 'UNSUPPORTED_CANDIDATE').map((candidate) => candidate.sourceKey))))];
    return [
      ...model.diagnostics.map((diagnostic) => ({ key: `${rule.ruleId}|${diagnostic.state}|${diagnostic.reasonCodes.join(',')}`,
        ruleId: rule.ruleId, state: diagnostic.state, fields, description: rule.description,
        reason: renderValidationV2Diagnostic(diagnostic) })),
      ...model.unresolved.map((note) => ({ key: `${rule.ruleId}|dependency|${note.dependency}`, ruleId: rule.ruleId,
        state: 'CHECK', fields, description: rule.description, reason: renderValidationV2DependencyNote(note) })),
    ];
  });
}

/** Current effective cell lexemes + local drafts, compared with the immutable original. */
export function gmiEditObjectDiagnostics({ view, scope, sourceIndex, rows, drafts = {}, governingRuleId = null }) {
  if (!view || !scope || !Number.isInteger(sourceIndex)) return { findings: [], deferred: false };
  const cached = validatorFor(view.document, view.handle.layerId);
  const object = cached.dataset[scope === 'line' ? 'lines' : 'points'][sourceIndex];
  if (!object) return { findings: [], deferred: false };
  const key = `${scope}:${sourceIndex}`;
  const selection = { geometryScope: scope, sourceIndex };
  if (!cached.originals.has(key)) cached.originals.set(key, diagnosticsFor(cached.validator.evaluate(selection), scope));
  const original = cached.originals.get(key);
  const values = Object.fromEntries((rows || []).filter((row) => row.proposed !== null && row.proposed !== undefined)
    .map((row) => [row.field, Object.hasOwn(drafts, row.field) && row.editable ? drafts[row.field] : row.proposed]));
  const result = cached.validator.evaluate({ ...selection, object: overlayGmiObjectValues(object, values) });
  const proposed = diagnosticsFor(result, scope);
  const originalKeys = new Set(original.map((finding) => finding.key));
  const proposedKeys = new Set(proposed.map((finding) => finding.key));
  const findings = [
    ...proposed.map((finding) => ({ ...finding, transition: originalKeys.has(finding.key) ? 'original' : 'introduced' })),
    ...original.filter((finding) => !proposedKeys.has(finding.key))
      // A cross-object outcome is unknown locally, never a resolved issue.
      .filter((finding) => !result.deferred.some((outcome) => outcome.ruleId === finding.ruleId))
      .map((finding) => ({ ...finding, transition: 'resolved' })),
  ].map((finding) => ({ ...finding, tooltip: `${finding.transition === 'resolved' ? 'OK' : finding.state === 'FAIL' ? 'FEIL' : 'SJEKK'} · ${TRANSITION[finding.transition]}\n${finding.transition === 'resolved' ? 'Opprinnelig funn: ' : ''}${finding.reason}` }));
  return { findings, deferred: result.deferred.length > 0, deferredRuleIds: result.deferred.map((outcome) => outcome.ruleId),
    governingOutcome: result.outcomes.find((outcome) => outcome.ruleId === governingRuleId) || null };
}

/** Review consequences against the current working copy, including earlier staged corrections.
 * Reuse the Validator's findings; input domains never decide whether a value is valid.
 * Call with the checked correction's actual cell values, not skipped form requests.
 */
export function gmiEditObjectReviewErrors({ view, scope, sourceIndex, rows, values }) {
  return gmiEditObjectReviewConsequences({ view, scope, sourceIndex, rows, values }).newErrors;
}

/** G8: the same comparison, also reporting new SJEKK and current findings the correction resolves.
 * Cross-object (deferred) rules are never reported as resolved locally.
 */
export function gmiEditObjectReviewConsequences({ view, scope, sourceIndex, rows, values }) {
  const context = { view, scope, sourceIndex, rows };
  const current = gmiEditObjectDiagnostics(context).findings.filter((finding) => finding.transition !== 'resolved');
  const after = gmiEditObjectDiagnostics({ ...context, drafts: values });
  const proposed = after.findings.filter((finding) => finding.transition !== 'resolved');
  const proposedKeys = new Set(proposed.map((finding) => finding.key));
  // Per-severity comparison, as before: a finding that escalates from SJEKK to FEIL counts as a new FEIL.
  const introduced = (state) => {
    const before = new Set(current.filter((finding) => finding.state === state).map((finding) => finding.key));
    return proposed.filter((finding) => finding.state === state && !before.has(finding.key));
  };
  const gone = current.filter((finding) => !proposedKeys.has(finding.key) && !(after.deferredRuleIds || []).includes(finding.ruleId));
  const dependency = (finding) => finding.key.startsWith(`${finding.ruleId}|dependency|`);
  return {
    newErrors: introduced('FAIL'),
    newChecks: introduced('CHECK'),
    // Rule findings that disappear; «cannot be assessed» dependency notes are counted separately.
    resolved: gone.filter((finding) => !dependency(finding)),
    unblocked: gone.filter(dependency).length,
  };
}
