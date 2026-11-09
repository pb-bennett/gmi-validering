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
export function gmiEditObjectDiagnostics({ view, scope, sourceIndex, rows, drafts = {} }) {
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
  return { findings, deferred: result.deferred.length > 0 };
}
