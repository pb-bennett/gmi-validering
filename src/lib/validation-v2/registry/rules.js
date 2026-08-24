import {
  GeometryScope,
  RuleCategory,
  RuleEvaluatorKind,
  RuleProvenance,
  RuleSeverity,
  ValueComparisonPolicy,
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

const POSITIONING_CONDITION_VALUES = [
  'DELV_LUKK_GRØ',
  'I_TUNNEL',
  'I_VANN',
  'IKKE_STEDF',
  'LUKK_GRØ',
  'OVERFL_VANN',
  'POS_FRA_KUM',
  'PÅVI',
  'ÅPEN_GRØ',
  'ÅPEN_KUM',
];

const POSITIONING_CAUSE_VALUES = [
  'FJERN',
  'FLYTT_DELV',
  'FLYTT_HELT',
  'NYTT',
  'PÅVI',
  'UENDR',
];

const INSIDE_OUTSIDE_VALUES = ['ID', 'OD'];
const NETWORK_TYPE_VALUES = ['F', 'H', 'O', 'S', 'S6'];
const PIPE_SHAPE_VALUES = ['A', 'E', 'F', 'R', 'S', 'T', 'X'];
const VISIBILITY_VALUES = ['0', '1', '2', '3'];

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
 * A8 source-backed V2 rule set.
 *
 * Combined required/value rules remain one practical rule so missing fields and
 * invalid present values retain distinct findings.
 */
export const VALIDATION_RULES = deepFreeze([
  {
    ruleId: 'innmaling.common.height-reference.valid',
    canonicalFieldId: 'heightReference',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Høydereferanse er gyldig',
    description: 'Alle innmålte objekt skal ha en gyldig høydereferanse.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: {
      document: 'Innmålingsinstruks Vedlegg A',
      pages: '5, 7',
    },
    allowedValues: HEIGHT_REFERENCE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.common.installation-year.required',
    canonicalFieldId: 'installationYear',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Anleggsår er oppgitt',
    description: 'Alle innmålte objekt skal ha oppgitt anleggsår.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5–6' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.common.capture-date.required',
    canonicalFieldId: 'captureDate',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Datafangstdato er oppgitt',
    description: 'Alle innmålte objekt skal ha oppgitt datafangstdato.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5–6' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.common.surveyed-by.required',
    canonicalFieldId: 'surveyedBy',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Innmålt av er oppgitt',
    description: 'Alle innmålte objekt skal ha oppgitt hvem som målte inn objektet.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5–6' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.common.case-number.required',
    canonicalFieldId: 'caseNumber',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Saksnummer er oppgitt',
    description: 'Alle innmålte objekt skal ha oppgitt saksnummer.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5–6' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.common.horizontal-accuracy.required',
    canonicalFieldId: 'horizontalAccuracy',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Nøyaktighet XY er oppgitt',
    description: 'Alle innmålte objekt skal ha oppgitt horisontal nøyaktighet.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 8' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.common.vertical-accuracy.required',
    canonicalFieldId: 'verticalAccuracy',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Nøyaktighet høyde Z er oppgitt',
    description: 'Alle innmålte objekt skal ha oppgitt vertikal nøyaktighet.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 8' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.common.max-horizontal-deviation.required',
    canonicalFieldId: 'maxHorizontalDeviation',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Maksavvik horisontalt er oppgitt',
    description: 'Alle innmålte objekt skal ha oppgitt maksimalt horisontalt avvik.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 10' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.common.max-vertical-deviation.required',
    canonicalFieldId: 'maxVerticalDeviation',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Maksavvik vertikalt er oppgitt',
    description: 'Alle innmålte objekt skal ha oppgitt maksimalt vertikalt avvik.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 10' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.common.positioning-condition.valid',
    canonicalFieldId: 'positioningCondition',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Stedfestingsforhold er gyldig',
    description: 'Alle innmålte objekt skal ha et gyldig stedfestingsforhold.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 8–9' },
    allowedValues: POSITIONING_CONDITION_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.common.positioning-cause.valid',
    canonicalFieldId: 'positioningCause',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Stedfestingsårsak er gyldig',
    description: 'Alle innmålte objekt skal ha en gyldig stedfestingsårsak.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 9' },
    allowedValues: POSITIONING_CAUSE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.common.visibility.valid',
    canonicalFieldId: 'visibility',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Synbarhet er gyldig',
    description: 'Alle innmålte objekt skal ha en gyldig synbarhetskode.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 9' },
    allowedValues: VISIBILITY_VALUES,
    valueComparison: ValueComparisonPolicy.INTEGER_CODE_STRING,
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
      pages: '5, 11–13',
    },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.point.inside-outside.valid',
    canonicalFieldId: 'insideOutside',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Punktets innvendig/utvendig-kode er gyldig',
    description: 'Alle punktobjekt skal ha en gyldig innvendig/utvendig-kode.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 15' },
    allowedValues: INSIDE_OUTSIDE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.point.wall-thickness.required',
    canonicalFieldId: 'wallThickness',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Punktets tykkelse er oppgitt',
    description: 'Alle punktobjekt skal ha oppgitt tykkelse.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 15' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.point.nobb-vavvs-number.required',
    canonicalFieldId: 'nobbVavvsNumber',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Punktets NOBB/VAVVS-nummer er oppgitt',
    description: 'Alle punktobjekt skal ha oppgitt NOBB/VAVVS-nummer.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 17' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.point.nobb-vavvs-frame-number.required',
    canonicalFieldId: 'nobbVavvsFrameNumber',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Rammens NOBB/VAVVS-nummer er oppgitt',
    description: 'Alle punktobjekt skal ha oppgitt NOBB/VAVVS-nummer for ramme.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 18' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
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
      pages: '6, 19–21',
    },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.line.dimension.required',
    canonicalFieldId: 'dimension',
    geometryScopes: [GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Ledningens dimensjon er oppgitt',
    description: 'Alle ledninger skal ha oppgitt dimensjon.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '6, 23' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.line.network-type.valid',
    canonicalFieldId: 'networkType',
    geometryScopes: [GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Nett-type er gyldig',
    description: 'Alle ledninger skal ha en gyldig nett-type.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '6, 21–22' },
    allowedValues: NETWORK_TYPE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.line.inside-outside.valid',
    canonicalFieldId: 'insideOutside',
    geometryScopes: [GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Ledningens innvendig/utvendig-kode er gyldig',
    description: 'Alle ledninger skal ha en gyldig innvendig/utvendig-kode.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '6, 23' },
    allowedValues: INSIDE_OUTSIDE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.line.pipe-shape.valid',
    canonicalFieldId: 'pipeShape',
    geometryScopes: [GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Rørform er gyldig',
    description: 'Alle ledninger skal ha en gyldig rørform.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '6, 23–24' },
    allowedValues: PIPE_SHAPE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.line.nobb-vavvs-number.required',
    canonicalFieldId: 'nobbVavvsNumber',
    geometryScopes: [GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Ledningens NOBB/VAVVS-nummer er oppgitt',
    description: 'Alle ledninger skal ha oppgitt NOBB/VAVVS-nummer.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '6, 25' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
]);

function assertInvariant(condition, message) {
  if (!condition) {
    throw new Error(`Invalid Validator 2.0 rule registry: ${message}`);
  }
}

/**
 * Validate the immutable rule registry structurally.
 *
 * @param {Array<Object>} rules
 * @returns {true}
 */
export function validateRuleRegistry(rules = VALIDATION_RULES) {
  assertInvariant(Array.isArray(rules), 'rules must be an array');
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
        (rule.evaluatorKind === RuleEvaluatorKind.ALLOWED_VALUE && rule.category === RuleCategory.ALLOWED_VALUE) ||
        (rule.evaluatorKind === RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE && rule.category === RuleCategory.REQUIRED_ALLOWED_VALUE),
      `${rule.ruleId} has an evaluator/category mismatch`
    );
    assertInvariant(typeof rule.title === 'string' && rule.title.length > 0, `${rule.ruleId} needs a title`);
    assertInvariant(typeof rule.description === 'string' && rule.description.length > 0, `${rule.ruleId} needs a description`);
    assertInvariant(rule.severity === RuleSeverity.ERROR, `${rule.ruleId} has invalid severity`);
    assertInvariant(rule.provenance === RuleProvenance.STANDARD, `${rule.ruleId} has invalid provenance`);
    assertInvariant(rule.source && typeof rule.source.document === 'string' && typeof rule.source.pages === 'string', `${rule.ruleId} needs source metadata`);
    assertInvariant(Array.isArray(rule.allowedValues), `${rule.ruleId} needs allowedValues`);
    assertInvariant(new Set(rule.allowedValues).size === rule.allowedValues.length, `${rule.ruleId} has duplicate allowed values`);
    assertInvariant(
      Object.values(ValueComparisonPolicy).includes(rule.valueComparison),
      `${rule.ruleId} has invalid value comparison policy`
    );
    if (rule.evaluatorKind === RuleEvaluatorKind.REQUIRED) {
      assertInvariant(
        rule.valueComparison === ValueComparisonPolicy.NONE,
        `${rule.ruleId} must use no value comparison`
      );
    }
    if (rule.evaluatorKind === RuleEvaluatorKind.ALLOWED_VALUE) {
      assertInvariant(
        rule.valueComparison === ValueComparisonPolicy.EXACT,
        `${rule.ruleId} must use exact comparison`
      );
    }
    if (
      rule.evaluatorKind === RuleEvaluatorKind.ALLOWED_VALUE ||
      rule.evaluatorKind === RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE
    ) {
      assertInvariant(rule.allowedValues.length > 0, `${rule.ruleId} needs allowed values`);
    } else {
      assertInvariant(rule.allowedValues.length === 0, `${rule.ruleId} must not define allowed values`);
    }
    if (rule.evaluatorKind === RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE) {
      assertInvariant(
        rule.valueComparison === ValueComparisonPolicy.EXACT ||
          rule.valueComparison === ValueComparisonPolicy.INTEGER_CODE_STRING,
        `${rule.ruleId} has invalid combined comparison policy`
      );
      if (rule.valueComparison === ValueComparisonPolicy.INTEGER_CODE_STRING) {
        assertInvariant(
          rule.ruleId === 'innmaling.common.visibility.valid',
          `${rule.ruleId} uses an unapproved integer-code comparison policy`
        );
      }
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
