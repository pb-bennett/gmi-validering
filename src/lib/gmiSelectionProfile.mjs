// B1, presentation only: a value profile of the current selection. It reads the
// proposed working dataset (staged corrections included), never edits it, and
// never decides eligibility. Narrowing only ever produces keys to remove.
import { GMI_SOURCE_LEXEMES } from './parsing/gmiLexicalEvidence.js';
import { describeGmiEditColumns } from './gmiEditFields.mjs';

export const GMI_SELECTION_PROFILE_FIELDS = Object.freeze([
  Object.freeze({ id: 'tema', label: 'Tema' }),
  Object.freeze({ id: 'material', label: 'Material' }),
  Object.freeze({ id: 'dimension', label: 'Dimensjon' }),
  Object.freeze({ id: 'positioningCause', label: 'Stedfestingsårsak' }),
]);

const FIXED_IDS = new Set(GMI_SELECTION_PROFILE_FIELDS.map((field) => field.id));
const CONTEXT_LABELS = Object.freeze({ pipeShape: 'Rørform', installationYear: 'Leggeår' });
const HYDRAULIC_LABELS = Object.freeze({ PRESSURE: 'Trykk', GRAVITY: 'Selvfall', SPECIAL: 'Spesiell / usikker' });
// Delivered key before an accepted fallback (Tema before S_FCODE).
const MAPPING_RANK = Object.freeze({ DIRECT: 0, CASE_NORMALIZED: 1, ACCEPTED_FALLBACK: 2 });

export const GMI_PROFILE_MISSING_LABEL = '(tom)';

/**
 * Physical source columns for the fixed profile fields, resolved only through
 * the existing schema binding (describeGmiEditColumns). Fields that the
 * binding neither binds nor expects for this geometry are left out.
 */
export function gmiSelectionProfileSources(view, scope) {
  if (!['point', 'line'].includes(scope)) return [];
  const { columns, absent } = describeGmiEditColumns(view, scope);
  return GMI_SELECTION_PROFILE_FIELDS.flatMap(({ id, label }) => {
    const bound = columns.filter((column) => column.canonicalFieldId === id && column.validatorKind === 'bound');
    if (bound.some((column) => column.bindingState === 'AMBIGUOUS')) return [{ id, label, state: 'ambiguous', sourceKeys: [] }];
    if (bound.length) {
      const sourceKeys = [...bound].sort((a, b) => (MAPPING_RANK[a.mappingKind] ?? 9) - (MAPPING_RANK[b.mappingKind] ?? 9)
        || a.position - b.position).map((column) => column.sourceKey);
      return [{ id, label, state: 'bound', sourceKeys: [...new Set(sourceKeys)] }];
    }
    return absent.some((entry) => entry.canonicalFieldId === id) ? [{ id, label, state: 'absent', sourceKeys: [] }] : [];
  });
}

function objectFor(dataset, key, scope) {
  const match = /^(point|line):(0|[1-9]\d*)$/.exec(key);
  if (!match || match[1] !== scope) return null;
  return dataset?.[scope === 'point' ? 'points' : 'lines']?.[Number(match[2])] || null;
}

/** The exact proposed lexeme (or the attribute value if no lexeme is recorded), trimmed for grouping only. */
function proposedValue(object, sourceKeys) {
  const attributes = object?.attributes;
  if (!attributes) return '';
  for (const sourceKey of sourceKeys) {
    const lexeme = attributes[GMI_SOURCE_LEXEMES]?.[sourceKey];
    const raw = lexeme ?? attributes[sourceKey];
    const text = raw === null || raw === undefined ? '' : String(raw).trim();
    if (text !== '') return text;
  }
  return '';
}

function groupsOf(entries) {
  const groups = new Map();
  for (const [key, value] of entries) {
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(key);
  }
  return [...groups.entries()].map(([value, keys]) => Object.freeze({ value, missing: value === '',
    label: value === '' ? GMI_PROFILE_MISSING_LABEL : value, count: keys.length, keys: Object.freeze(keys) }))
    // Most frequent first; missing last; otherwise stable by value.
    .sort((a, b) => Number(a.missing) - Number(b.missing) || b.count - a.count || a.value.localeCompare(b.value, 'nb', { numeric: true }));
}

function dimensionOf(id, label, kind, entries, total) {
  const groups = groupsOf(entries);
  return Object.freeze({ id, label, kind, state: 'bound', total, groups: Object.freeze(groups),
    distinct: groups.filter((group) => !group.missing).length,
    missing: groups.find((group) => group.missing)?.count || 0, uniform: groups.length === 1 });
}

/**
 * Value distributions over the selected objects of `dataset` (the proposed
 * dataset). `ruleRows` optionally adds the governing rule's own context facts
 * (evidence.diagnosticFacts) from a current preview; objects without a row are
 * counted as missing, never guessed.
 */
export function buildGmiSelectionProfile({ dataset, scope, keys, sources, ruleRows = null }) {
  const selected = Array.isArray(keys) ? keys : [];
  const total = selected.length;
  const objects = selected.map((key) => [key, objectFor(dataset, key, scope)]);
  const fields = (sources || []).map((source) => source.state !== 'bound'
    ? Object.freeze({ id: source.id, label: source.label, kind: 'field', state: source.state, total, groups: Object.freeze([]), distinct: 0, missing: 0, uniform: false })
    : dimensionOf(source.id, source.label, 'field', objects.map(([key, object]) => [key, proposedValue(object, source.sourceKeys)]), total));
  const context = [];
  if (ruleRows) {
    const facts = new Map();
    for (const row of ruleRows) facts.set(row.key, row.evidence?.diagnosticFacts || row.governingOutcome?.diagnosticFacts || null);
    if (selected.some((key) => facts.get(key)?.classification)) {
      context.push(dimensionOf('hydraulicClass', 'Hydraulisk klasse', 'rule', selected.map((key) => {
        const value = facts.get(key)?.classification;
        return [key, value ? HYDRAULIC_LABELS[value] || String(value) : ''];
      }), total));
    }
    const ids = [...new Set(selected.flatMap((key) => (facts.get(key)?.context || []).map((entry) => entry.fieldId)))]
      .filter((id) => !FIXED_IDS.has(id) && id !== 'hydraulicClass');
    for (const id of ids) {
      context.push(dimensionOf(`rule:${id}`, CONTEXT_LABELS[id] || id, 'rule', selected.map((key) => {
        const value = facts.get(key)?.context?.find((entry) => entry.fieldId === id)?.value;
        return [key, value === null || value === undefined ? '' : String(value).trim()];
      }), total));
    }
  }
  return Object.freeze({ scope, total, fields: Object.freeze(fields), context: Object.freeze(context) });
}

/**
 * Keys to remove so that only `keep` remains. Never adds: keys outside the
 * current selection are ignored. Returns null when nothing would be removed or
 * when the selection would become empty.
 */
export function gmiSelectionNarrowing(selection, keep) {
  if (!selection || !Array.isArray(selection.keys)) return null;
  const kept = new Set(keep || []);
  const remaining = selection.keys.filter((key) => kept.has(key));
  const remove = selection.keys.filter((key) => !kept.has(key));
  if (!remaining.length || !remove.length) return null;
  return Object.freeze({ type: 'remove', scope: selection.scope, keys: Object.freeze(remove), remaining: remaining.length });
}
