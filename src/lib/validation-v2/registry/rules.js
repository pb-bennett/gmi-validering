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
const NETWORK_TYPE_VALUES = ['F', 'H', 'O', 'O1', 'O2', 'S', 'S6', 'S7'];
const PIPE_SHAPE_VALUES = ['A', 'E', 'F', 'R', 'S', 'T', 'X'];
export const MEASUREMENT_METHOD_VALUES = [
  '10', '11', '12', '13', '14', '15', '18', '19', '20', '21', '22', '23', '24',
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '40', '41', '42', '43',
  '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56',
  '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72',
  '73', '74', '77', '78', '79', '80', '81', '82', '90', '91', '92', '93', '94',
  '95', '96', '97', '99',
];
export const HEIGHT_MEASUREMENT_METHOD_VALUES = [
  '10', '11', '12', '13', '14', '15', '18', '19', '20', '21', '22', '23', '24',
  '36', '60', '61', '62', '63', '64', '66', '67', '68', '69', '70', '74', '78',
  '79', '90', '91', '92', '93', '94', '95', '96', '99',
];
export const VERTICAL_LEVEL_VALUES = [
  'UNDER_GRUNN',
  'PÅ_GRUNN_VANNOVERF',
  'OVER_GRUNN',
  'PÅ_BUNN',
  'I_VANNSØYL',
  'SLISSING',
  'UNDER_BUNN',
];
export const MATERIAL_VALUES = [
  'AAS', 'ABS', 'AN', 'ATF', 'BET', 'FJE', 'GRP', 'GSE', 'GUP', 'ICO', 'KISVEIT',
  'KOMPOS', 'LER', 'MCU', 'MGA', 'MRS', 'MSF', 'MST', 'PE', 'PE32', 'PE50', 'PE80',
  'PE100', 'PE100-RC-PP0', 'PEH', 'PEH_PEM', 'PEL', 'PEM', 'PERC', 'PLAST', 'PP',
  'PVC', 'PVC-O', 'PVC-U', 'RDEL', 'SJ', 'SJG', 'SJK', 'STA', 'STF', 'STG', 'TEG',
  'TNA', 'TRE', 'UK',
];
export const POINT_TEMA_VALUES = [
  'ANB', 'BAS', 'BERGROM', 'BFD', 'BRN', 'DAM', 'DIV', 'DRO', 'FET', 'FNT',
  'FORAKONSTR', 'GRN', 'GRØKONSTR', 'GUT', 'GVT', 'HFO', 'HYD', 'I2B', 'I2C',
  'I2K', 'I2O', 'I2P', 'I2R', 'I2T', 'INB', 'INR', 'INT', 'KMR', 'KNP', 'KOELSKAP',
  'KOGLYSMAS', 'KONSTROMRIS', 'KOTREKUM', 'KRN', 'KUM', 'KUMI', 'LOK', 'MAS', 'MKS',
  'MKV', 'OFFENTOAL', 'OIL', 'OVL', 'PAF', 'PMK', 'PMKAF', 'PMKOV', 'PMKSP', 'PMKVL',
  'POV', 'PSP', 'PST', 'PSTVL', 'PSU', 'RED', 'RES', 'ROV', 'RSP', 'RVA', 'SAN', 'SANI',
  'SEP', 'SLA', 'SLAMKIOSK', 'SLG', 'SLI', 'SLS', 'SLU', 'SPR', 'STR', 'SUMP', 'SVB',
  'TNK', 'TOP', 'TØKSTVL', 'TØMSTBOBIL', 'UTS', 'VANNPOST', 'VKI', 'VPK', 'VST',
];
export const LINE_TEMA_VALUES = [
  'AF', 'AFBO', 'AFD', 'AFK', 'AFLU', 'AFO', 'AFP', 'AFS', 'AFT', 'AFVAR', 'AFX', 'DR',
  'I2', 'I2D', 'I2I', 'I2O', 'I2P', 'I2S', 'I3', 'LEBEKXX500', 'LEBEKXX510', 'LEBEKXX511',
  'LEBO', 'LEBRO', 'LEBUNT', 'LEBYGLIN', 'LEDIV', 'LEELKABJOR', 'LEELKABLUF', 'LEELKABRØR',
  'LEFIBEKAB', 'LEFJ', 'LEFJRETUR', 'LEFJTUR', 'LEFUNDKANT', 'LEGAS', 'LEGASP', 'LEGASS',
  'LEGLYSKAB', 'LEGRØ', 'LEGRØXX500', 'LEHJELIN', 'LEISOL', 'LEKA', 'LEKAXX500', 'LEKU',
  'LEKULD', 'LELYTKAB', 'LEOPIKANAL', 'LESIGNKAB', 'LESLISS', 'LESPUNT', 'LESTIKKB',
  'LESTØTMUR', 'LETRA', 'LETRE', 'LETREMKAB', 'LETREUKAB', 'LETRYKLUFT', 'LETU', 'LETUADK',
  'LEVANNBVARM', 'LEVAR', 'LEVARAF', 'LEVARGAMAF', 'LEVARGAMOV', 'LEVARGAMSP', 'LEVARGAMVL',
  'LEVAROV', 'LEVARSP', 'LEVARVL', 'OV', 'OVBO', 'OVF', 'OVI', 'OVK', 'OVKU', 'OVO', 'OVP',
  'OVR', 'OVS', 'OVT', 'OVU', 'OVVAR', 'OVX', 'SP', 'SPBO', 'SPD', 'SPGRÅ', 'SPI', 'SPK',
  'SPLU', 'SPO', 'SPP', 'SPS', 'SPT', 'SPVAR', 'SPX', 'VL', 'VLBO', 'VLI', 'VLK', 'VLLU',
  'VLP', 'VLSPR', 'VLT', 'VLU', 'VLVAR',
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
      pages: '4, 6; main 10, 13–18',
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.common.measurement-method.required',
    canonicalFieldId: 'measurementMethod',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Målemetode er gyldig',
    description: 'Alle innmålte objekt skal ha en gyldig målemetodekode fra v3.2-listen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6–7, 23–25' },
    allowedValues: MEASUREMENT_METHOD_VALUES,
    valueComparison: ValueComparisonPolicy.INTEGER_CODE_STRING,
  },
  {
    ruleId: 'innmaling.common.height-measurement-method.required',
    canonicalFieldId: 'heightMeasurementMethod',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Målemetode høyde er gyldig',
    description: 'Alle innmålte objekt skal ha en gyldig høydemålemetodekode fra v3.2-listen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 7, 25–27' },
    allowedValues: HEIGHT_MEASUREMENT_METHOD_VALUES,
    valueComparison: ValueComparisonPolicy.INTEGER_CODE_STRING,
  },
  {
    ruleId: 'innmaling.common.vertical-level.required',
    canonicalFieldId: 'verticalLevel',
    geometryScopes: [GeometryScope.POINT, GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Vertikalnivå er gyldig',
    description: 'Alle innmålte objekt skal ha en gyldig vertikalnivåkode fra v3.2-listen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 9' },
    allowedValues: VERTICAL_LEVEL_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6; main 10' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6; main 10' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6; main 5, 10' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6; main 5, 10' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 7–8' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 8; main 9–10, 18' },
    allowedValues: POSITIONING_CAUSE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.point.tema.required',
    canonicalFieldId: 'tema',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Punktobjekt har gyldig Tema',
    description: 'Punktobjekt skal ha et gyldig Tema fra v3.2-listen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: {
      document: 'Innmålingsinstruks Vedlegg A',
      pages: '4, 10–12',
    },
    allowedValues: POINT_TEMA_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 14' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 9' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.line.wall-thickness.required',
    canonicalFieldId: 'wallThickness',
    geometryScopes: [GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Ledningens tykkelse er oppgitt',
    description: 'Alle ledninger skal ha oppgitt tykkelse.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 16' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.line.tema.required',
    canonicalFieldId: 'tema',
    geometryScopes: [GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Ledning har gyldig Tema',
    description: 'Ledning skal ha et gyldig Tema fra v3.2-listen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: {
      document: 'Innmålingsinstruks Vedlegg A',
      pages: '5, 16–19',
    },
    allowedValues: LINE_TEMA_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 16' },
    allowedValues: [],
    valueComparison: ValueComparisonPolicy.NONE,
  },
  {
    ruleId: 'innmaling.line.material.required',
    canonicalFieldId: 'material',
    geometryScopes: [GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE,
    category: RuleCategory.REQUIRED_ALLOWED_VALUE,
    title: 'Ledningens materiale er gyldig',
    description: 'Alle ledninger skal ha et gyldig materiale fra v3.2-listen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 19–21' },
    allowedValues: MATERIAL_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 19' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 21' },
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
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 21' },
    allowedValues: PIPE_SHAPE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
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
