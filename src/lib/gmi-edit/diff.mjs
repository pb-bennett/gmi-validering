// Structured comparison of two parsed GMI datasets (M2, acceptance T17).
//
// diffGmiDatasets(original, proposed) compares the datasets object by object
// in parser order and reports exactly the attribute cells whose delivered
// source lexeme differs (with object identity and old/new lexemes and parsed
// values). Anything else that differs — header, warnings, object counts, ids,
// types, GUIDs, extents, coordinates or the column set of an object — is
// reported under `structural`, which must be empty for a field-only edit.
//
// It works on what was produced, not on ChangeSet history, so cancelled,
// superseded and reverted changes can never appear as differences.
//
// Accepts the app dataset shape ({points, lines}) or a GMIParser result
// ({points, linesParsed}).
import { GMI_SOURCE_LEXEMES } from '../parsing/gmiLexicalEvidence.js';

const SCOPES = Object.freeze([['point', 'points'], ['line', 'lines']]);

function collection(dataset, scope) {
  if (scope === 'point') return dataset?.points;
  return dataset?.lines ?? dataset?.linesParsed;
}

function same(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key, k) => key === keysB[k] && same(a[key], b[key]));
}

const lexemesOf = (object) => object?.attributes?.[GMI_SOURCE_LEXEMES] ?? null;

/**
 * @returns {{
 *   identical: boolean,
 *   changes: Array<{scope, sourceIndex, objectId, guid, field, position,
 *                   original: string|null, proposed: string|null,
 *                   originalValue: *, proposedValue: *}>,
 *   structural: Array<{code, scope?, sourceIndex?, field?}>,
 *   counts: {cells, objects, byField: Object<string, number>}
 * }}
 */
export function diffGmiDatasets(original, proposed) {
  if (!original || !proposed || typeof original !== 'object' || typeof proposed !== 'object') throw new TypeError('diffGmiDatasets expects two datasets');
  const changes = [], structural = [];
  if (!same(original.header ?? null, proposed.header ?? null)) structural.push({ code: 'header-changed' });
  if (!same(original.warnings ?? [], proposed.warnings ?? [])) structural.push({ code: 'warnings-changed' });
  for (const [scope] of SCOPES) {
    const before = collection(original, scope), after = collection(proposed, scope);
    if (!Array.isArray(before) || !Array.isArray(after)) { structural.push({ code: 'collection-missing', scope }); continue; }
    if (before.length !== after.length) structural.push({ code: 'object-count-changed', scope, original: before.length, proposed: after.length });
    const count = Math.min(before.length, after.length);
    for (let sourceIndex = 0; sourceIndex < count; sourceIndex++) {
      const a = before[sourceIndex], b = after[sourceIndex];
      for (const property of ['id', 'type', 'guid', 'extent']) {
        if (!Object.is(a?.[property] ?? null, b?.[property] ?? null)) structural.push({ code: `${property}-changed`, scope, sourceIndex });
      }
      if (!same(a?.coordinates ?? null, b?.coordinates ?? null)) structural.push({ code: 'coordinates-changed', scope, sourceIndex });
      const fieldsA = Object.keys(a?.attributes ?? {}), fieldsB = Object.keys(b?.attributes ?? {});
      if (!same(fieldsA, fieldsB)) { structural.push({ code: 'fields-changed', scope, sourceIndex }); continue; }
      const lexA = lexemesOf(a), lexB = lexemesOf(b);
      fieldsA.forEach((field, position) => {
        const valueA = a.attributes[field], valueB = b.attributes[field];
        const lexemeA = lexA && Object.hasOwn(lexA, field) ? lexA[field] : null;
        const lexemeB = lexB && Object.hasOwn(lexB, field) ? lexB[field] : null;
        // Lexemes are authoritative when both sides carry them (11 vs 11.0);
        // otherwise fall back to parsed values.
        const differs = lexA && lexB ? lexemeA !== lexemeB : !Object.is(valueA, valueB);
        if (!differs) return;
        changes.push({
          scope, sourceIndex, objectId: a.id ?? null, guid: a.guid ?? null, field, position,
          original: lexemeA, proposed: lexemeB, originalValue: valueA, proposedValue: valueB,
        });
      });
    }
  }
  const byField = {};
  for (const change of changes) byField[change.field] = (byField[change.field] || 0) + 1;
  const result = {
    identical: changes.length === 0 && structural.length === 0,
    changes: changes.map((change) => Object.freeze(change)),
    structural: structural.map((entry) => Object.freeze(entry)),
    counts: {
      cells: changes.length,
      objects: new Set(changes.map((change) => `${change.scope}:${change.sourceIndex}`)).size,
      byField: Object.freeze(byField),
    },
  };
  Object.freeze(result.changes); Object.freeze(result.structural); Object.freeze(result.counts);
  return Object.freeze(result);
}
