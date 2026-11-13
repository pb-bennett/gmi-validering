// Shared source-column capabilities. Per-object structural checks remain in M1.
import { GMI_BATCH_ELIGIBILITY_RULES, getGmiDocumentDataset, isGmiFieldEditReservedColumn,
  validateGmiFieldLexeme } from './gmi-edit/index.mjs';
import { bindGmiLayerSchema } from './validation-v2/gmiLayerSchemaBinding.js';
import { getDatasetRevision } from './validation-v2/datasetRevision.js';
import { getCanonicalFields } from './validation-v2/registry/registry.js';
import { getGmiFieldValueDomain } from './validation-v2/fieldValueDomain.js';

const documents = new WeakMap();
const IDENTIFIER_COLUMN = /^(s_)?(guid|uuid|objid|objekt_?id|lokal_?id|id)$/i;

/** Existing cell policy; capability discovery may additionally mark facilityId. */
export function gmiEditColumnPolicy(cell) {
  if (!cell) return Object.freeze({ editable: false, reason: 'field-absent' });
  if (isGmiFieldEditReservedColumn(cell.field)) return Object.freeze({ editable: false, reason: 'field-owned-by-photo-delivery' });
  if (!cell.editable) return Object.freeze({ editable: false, reason: cell.reason || 'document-not-editable' });
  if (IDENTIFIER_COLUMN.test(String(cell.field).trim())) return Object.freeze({ editable: false, reason: 'identifier-column' });
  if (cell.canonicalFieldId === 'facilityId') return Object.freeze({ editable: false, reason: 'individual-only' });
  return Object.freeze({ editable: true, reason: null });
}

export function describeGmiEditColumns(view, scope) {
  if (scope !== 'point' && scope !== 'line') throw new TypeError('scope must be point or line');
  const { document } = view;
  let cached = documents.get(document);
  if (!cached) {
    const dataset = getGmiDocumentDataset(document);
    cached = { binding: bindGmiLayerSchema({ dataset, layerId: view.handle?.layerId || 'gmi-edit-fields',
      datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi' }), scopes: new Map() };
    documents.set(document, cached);
  }
  if (cached.scopes.has(scope)) return cached.scopes.get(scope);
  const bindings = cached.binding.bindings.filter((binding) => binding.geometryScope === scope);
  const names = document.parser[scope === 'point' ? 'pointFieldNames' : 'lineFieldNames'];
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  const columns = names.map((sourceKey, position) => {
    // Accepted source evidence wins over another field's disabled aliases.
    const binding = bindings.find((entry) => entry.candidates.some((candidate) => candidate.sourceKey === sourceKey
      && candidate.mappingKind !== 'UNSUPPORTED_CANDIDATE'));
    const candidate = binding?.candidates.find((entry) => entry.sourceKey === sourceKey);
    const diagnostic = cached.binding.sourceFieldDiagnostics.find((entry) => entry.geometryScope === scope && entry.sourceKey === sourceKey);
    const canonicalFieldId = binding?.canonicalFieldId || diagnostic?.canonicalFieldId || null;
    const validatorKind = binding ? 'bound' : diagnostic?.classification === 'RECOGNIZED_UNRESOLVED' ? 'recognized-unresolved'
      : diagnostic?.classification === 'DISABLED_UNSUPPORTED' ? 'disabled-alias' : 'unknown';
    const domain = binding ? getGmiFieldValueDomain({ canonicalFieldId, geometryScope: scope }) : null;
    const reason = !document.editable ? 'document-not-editable' : sourceKey === '' ? 'unnamed-field'
      : counts.get(sourceKey) > 1 ? 'duplicate-field-name' : null;
    const policy = gmiEditColumnPolicy({ field: sourceKey, canonicalFieldId, editable: !reason, reason });
    const accepted = binding?.candidates.filter((entry) => entry.mappingKind !== 'UNSUPPORTED_CANDIDATE') || [];
    const linkedSourceKeys = binding?.canonicalFieldId === 'tema' && binding.state === 'MULTIPLE_ACCEPTED'
      && accepted.some((entry) => entry.mappingKind === 'ACCEPTED_FALLBACK')
      && accepted.some((entry) => entry.mappingKind === 'DIRECT' || entry.mappingKind === 'CASE_NORMALIZED')
      ? accepted.map((entry) => entry.sourceKey) : [];
    return Object.freeze({ sourceKey, position, canonicalFieldId, bindingState: binding?.state
      || bindings.find((entry) => entry.canonicalFieldId === canonicalFieldId)?.state || null,
    mappingKind: candidate?.mappingKind || diagnostic?.mappingKind || null, validatorKind, ...policy,
    operationKind: !policy.editable ? 'refused' : linkedSourceKeys.length ? 'linked-tema'
      : binding && Object.hasOwn(GMI_BATCH_ELIGIBILITY_RULES, canonicalFieldId) ? 'hydraulic' : 'generic',
    domain, governingRuleId: domain?.ruleId || null, linkedSourceKeys: Object.freeze(linkedSourceKeys) });
  });
  const absent = getCanonicalFields().filter((field) => field.expectedRuleScopes.includes(scope)
    && bindings.some((binding) => binding.canonicalFieldId === field.canonicalFieldId && binding.state === 'FIELD_ABSENT'))
    .map((field) => Object.freeze({ canonicalFieldId: field.canonicalFieldId, label: field.displayLabel, reason: 'field-absent' }));
  const result = Object.freeze({ columns: Object.freeze(columns), absent: Object.freeze(absent) });
  cached.scopes.set(scope, result);
  return result;
}

/**
 * G8: the accepted Tema/S_FCODE pair of one geometry scope, shared by the batch
 * planner and the individual object editor. `null` when the schema has no pair;
 * fails closed unless exactly two unique, editable, linked columns are bound.
 */
export function gmiLinkedTemaPair(view, scope) {
  const { columns } = describeGmiEditColumns(view, scope);
  const claimed = columns.find((column) => column.linkedSourceKeys.length > 0);
  if (!claimed) return null;
  const keys = claimed.linkedSourceKeys;
  const bound = keys.map((key) => columns.filter((column) => column.sourceKey === key));
  if (keys.length !== 2 || new Set(keys).size !== 2 || bound.some((matches) => matches.length !== 1
    || !matches[0].editable || matches[0].operationKind !== 'linked-tema' || matches[0].bindingState === 'AMBIGUOUS')) {
    return Object.freeze({ ok: false, code: 'field-binding-unresolved', keys });
  }
  return Object.freeze({ ok: true, keys, columns: Object.freeze(bound.map(([column]) => column)) });
}

/**
 * Fail-closed check of a built ChangeSet: every linked physical cell of the
 * `objectCount` objects is accounted for as changed or unchanged (never
 * skipped), and both cells of each object end with the same lexeme.
 */
export function gmiLinkedTemaChangeSetComplete(changeSet, keys, objectCount) {
  const linked = (cell) => keys.includes(cell.field);
  if (!changeSet || changeSet.skipped.some(linked)) return false;
  const results = [...changeSet.cells.filter(linked).map((cell) => [cell, cell.next]),
    ...changeSet.unchanged.filter(linked).map((cell) => [cell, cell.current])];
  if (results.length !== keys.length * objectCount) return false;
  const byObject = new Map();
  for (const [cell, lexeme] of results) {
    const key = `${cell.scope}:${cell.sourceIndex}`;
    byObject.set(key, [...(byObject.get(key) || []), [cell.field, lexeme]]);
  }
  return byObject.size === objectCount && [...byObject.values()].every((entries) => entries.length === keys.length
    && new Set(entries.map(([field]) => field)).size === keys.length && new Set(entries.map(([, lexeme]) => lexeme)).size === 1);
}

/** Strict listed lexemes; comparison metadata never admits alternative spellings.
 * currentLexeme explicitly permits keeping an unchanged delivered value.
 * Format hints do not restrict dates, numbers, years or free text.
 */
export function checkGmiFieldDraft(column, input, encodingClass,
  { restrictEnumeration = true, normalizeCase = true, currentLexeme } = {}) {
  const unchanged = typeof input === 'string' && input === currentLexeme;
  const lexeme = !unchanged && normalizeCase && column?.domain?.upperCase && typeof input === 'string' ? input.toUpperCase() : input;
  const safety = validateGmiFieldLexeme(lexeme, encodingClass);
  const outOfDomain = column?.domain?.kind === 'enumeration'
    && !column.domain.options.some(({ value }) => value === lexeme);
  const problem = !safety.ok ? safety : restrictEnumeration && outOfDomain && !unchanged
    ? Object.freeze({ ok: false, code: 'value-out-of-domain' }) : null;
  return Object.freeze({ lexeme, normalized: lexeme !== input, ok: !problem, problem, outOfDomain: Boolean(outOfDomain) });
}
