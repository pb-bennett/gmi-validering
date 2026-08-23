import {
  GeometryScope,
  RuleCategory,
  RuleEvaluatorKind,
  RuleProvenance,
  RuleSeverity,
} from '../contracts.js';
import { getCanonicalField } from './registry.js';

const HEIGHT_REFERENCE_VALUES = [
  'BUNN_INNVENDIG',
  'PÅ_BAKKEN',
  'SENTER',
  'TOPP_INNVENDIG',
  'TOPP_UTVENDIG',
  'UKJENT',
  'UNDERKANT_UTVENDIG',
];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

/**
 * First deliberately small source-backed V2 rule set.
 *
 * Høydereferanse codes are the exact seven lexical codes on Appendix A p. 7.
 */
export const VALIDATION_RULES = deepFreeze([
  {
    ruleId: 'innmaling.common.height-reference.required',
    canonicalFieldId: 'heightReference',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Høydereferanse er påkrevd',
    description: 'Alle innmålte objekt skal ha en tilhørende høydereferanse.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: {
      document: 'Innmålingsinstruks Vedlegg A',
      pages: '5, 7',
    },
    allowedValues: [],
  },
  {
    ruleId: 'innmaling.common.height-reference.allowed-value',
    canonicalFieldId: 'heightReference',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.ALLOWED_VALUE,
    category: RuleCategory.ALLOWED_VALUE,
    title: 'Høydereferanse har tillatt verdi',
    description: 'En oppgitt høydereferanse skal bruke en kildeautorisert kode.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: {
      document: 'Innmålingsinstruks Vedlegg A',
      pages: '7',
    },
    allowedValues: HEIGHT_REFERENCE_VALUES,
  },
  {
    ruleId: 'innmaling.point.tema.required',
    canonicalFieldId: 'tema',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Punktobjekt har Tema',
    description: 'Punktobjekt skal ha et Tema.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: {
      document: 'Innmålingsinstruks Vedlegg A',
      pages: '5, 11-13',
    },
    allowedValues: [],
  },
  {
    ruleId: 'innmaling.line.tema.required',
    canonicalFieldId: 'tema',
    geometryScopes: [GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Ledning har Tema',
    description: 'Ledning skal ha et Tema.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: {
      document: 'Innmålingsinstruks Vedlegg A',
      pages: '6, 19-21',
    },
    allowedValues: [],
  },
]);

function assertInvariant(condition, message) {
  if (!condition) {
    throw new Error(`Invalid Validator 2.0 rule registry: ${message}`);
  }
}

/**
 * Validate the small immutable A5 rule registry.
 *
 * @param {Array<Object>} rules
 * @returns {true}
 */
export function validateRuleRegistry(rules = VALIDATION_RULES) {
  assertInvariant(Array.isArray(rules), 'rules must be an array');
  assertInvariant(rules.length === 4, `expected 4 rules, got ${rules.length}`);
  const ruleIds = new Set();

  for (const rule of rules) {
    assertInvariant(rule && typeof rule === 'object', 'rule must be an object');
    assertInvariant(typeof rule.ruleId === 'string' && rule.ruleId.length > 0, 'ruleId must be non-empty');
    assertInvariant(!ruleIds.has(rule.ruleId), `duplicate ruleId ${rule.ruleId}`);
    ruleIds.add(rule.ruleId);
    assertInvariant(Boolean(getCanonicalField(rule.canonicalFieldId)), `${rule.ruleId} references unknown field`);
    assertInvariant(
      Array.isArray(rule.geometryScopes) &&
        rule.geometryScopes.length > 0 &&
        new Set(rule.geometryScopes).size === rule.geometryScopes.length &&
        rule.geometryScopes.every((scope) => Object.values(GeometryScope).includes(scope)),
      `${rule.ruleId} has invalid geometry scopes`
    );
    assertInvariant(
      Object.values(RuleEvaluatorKind).includes(rule.evaluatorKind),
      `${rule.ruleId} has invalid evaluator kind`
    );
    assertInvariant(
      Object.values(RuleCategory).includes(rule.category),
      `${rule.ruleId} has invalid category`
    );
    assertInvariant(
      (rule.evaluatorKind === RuleEvaluatorKind.REQUIRED && rule.category === RuleCategory.REQUIRED_FIELD) ||
        (rule.evaluatorKind === RuleEvaluatorKind.ALLOWED_VALUE && rule.category === RuleCategory.ALLOWED_VALUE),
      `${rule.ruleId} has an evaluator/category mismatch`
    );
    assertInvariant(typeof rule.title === 'string' && rule.title.length > 0, `${rule.ruleId} needs a title`);
    assertInvariant(typeof rule.description === 'string' && rule.description.length > 0, `${rule.ruleId} needs a description`);
    assertInvariant(rule.severity === RuleSeverity.ERROR, `${rule.ruleId} has invalid severity`);
    assertInvariant(rule.provenance === RuleProvenance.STANDARD, `${rule.ruleId} has invalid provenance`);
    assertInvariant(rule.source && typeof rule.source.document === 'string' && typeof rule.source.pages === 'string', `${rule.ruleId} needs source metadata`);
    assertInvariant(Array.isArray(rule.allowedValues), `${rule.ruleId} needs allowedValues`);
    assertInvariant(new Set(rule.allowedValues).size === rule.allowedValues.length, `${rule.ruleId} has duplicate allowed values`);
    if (rule.evaluatorKind === RuleEvaluatorKind.ALLOWED_VALUE) {
      assertInvariant(rule.allowedValues.length > 0, `${rule.ruleId} needs allowed values`);
    } else {
      assertInvariant(rule.allowedValues.length === 0, `${rule.ruleId} must not define allowed values`);
    }
  }
  return true;
}

validateRuleRegistry();

/**
 * @returns {ReadonlyArray<Object>}
 */
export function getValidationRules() {
  return VALIDATION_RULES;
}

/**
 * @param {string} ruleId
 * @returns {Object|undefined}
 */
export function getValidationRule(ruleId) {
  return VALIDATION_RULES.find((rule) => rule.ruleId === ruleId);
}
