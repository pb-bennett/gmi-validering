// Input hints and offered lexemes only. Validator policies own format verdicts.
import { getValidationRules } from './registry/rules.js';
import { getCanonicalField } from './registry/registry.js';
import { getFieldInformation, getAuthoritativeValueTable } from './registry/fieldInformation.js';

const domains = new Map();

export function getGmiFieldValueDomain({ canonicalFieldId, geometryScope }) {
  const key = `${geometryScope}:${canonicalFieldId}`;
  if (domains.has(key)) return domains.get(key);
  const field = getCanonicalField(canonicalFieldId);
  if (!field?.expectedRuleScopes.includes(geometryScope)) return null;
  // Relationship rules describe consequences, not a field's input domain.
  const rule = getValidationRules().find((candidate) => candidate.canonicalFieldId === canonicalFieldId
    && candidate.geometryScopes.includes(geometryScope) && candidate.policy !== 'sdrRingExclusive'
    && candidate.evaluatorKind !== 'FIELD_RELATIONSHIP');
  const information = getFieldInformation(canonicalFieldId);
  const hints = { ...information, ...information?.byGeometry?.[geometryScope] };
  const table = getAuthoritativeValueTable(canonicalFieldId, geometryScope);
  const options = Object.freeze((rule?.allowedValues || []).map((value) => {
    const row = table?.rows.find((entry) => entry.code === value);
    return Object.freeze({ value, label: row?.meaning || value, longLabel: row?.longMeaning || row?.tema || null });
  }));
  const format = hints.documentedFormat || null;
  const kind = options.length ? 'enumeration' : format === 'Heltall' ? 'integer'
    : format === 'Desimaltall' ? 'decimal' : format === 'YYYY' ? 'year'
      : format === 'DD.MM.YYYY' ? 'date' : 'text';
  const domain = Object.freeze({ kind, options,
    upperCase: options.length > 0 && options.every(({ value }) => value === value.toUpperCase())
      && options.some(({ value }) => /\p{L}/u.test(value)),
    ruleId: rule?.ruleId || null, unit: hints.units || null, format,
    comparison: rule?.policy === 'sdr' ? 'numeric' : rule?.valueComparison || null });
  domains.set(key, domain);
  return domain;
}
