import {
  FieldRelationshipKind,
  GeometryScope,
  RuleCategory,
  RuleEvaluatorKind,
  RuleProvenance,
  RuleReasonCode,
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
export const NETWORK_TYPE_VALUES = ['F', 'H', 'O', 'O1', 'O2', 'S', 'S6', 'S7'];
export const PIPE_SHAPE_VALUES = ['A', 'E', 'F', 'R', 'S', 'T', 'X'];
export const MANHOLE_SHAPE_VALUES = ['AN', 'F', 'FK', 'FR', 'N', 'R', 'X'];
export const CONSTRUCTION_METHOD_VALUES = ['B', 'BU', 'E', 'E0', 'E1', 'G', 'K', 'M', 'MU', 'P', 'S', 'SU', 'UK', 'V', 'W'];
export const CONE_VALUES = ['E', 'R', 'S', 'T', 'U'];
export const OWNER_VALUES = ['AN', 'F', 'I', 'K', 'K1', 'K2', 'L', 'P', 'P1', 'S', 'S1', 'S2', 'S3'];
export const ACCESS_VALUES = ['DO', 'NG', 'NT', 'ST', 'UTENST'];
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
export const SDR_VALUES = ['6.0','7.4','7.5','9.0','11.0','13.6','17.0','17.6','21.0','26.0','33.0','34.0','41.0'];
export const RING_STIFFNESS_VALUES = ['SN2','SN4','SN5','SN6','SN8','SN10','SN16'];
export const PRESSURE_CLASS_VALUES = ['PN1','PN2','PN2.5','PN3.2','PN4','PN5','PN6','PN6.3','PN8','PN10','PN12','PN12.5','PN16','PN20','PN25'];
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
export const TYPE_VALUES = [
  'BBAK', 'BFJE', 'BNOD', 'BRED', 'BSPY', 'BSTR', 'BTRN',
  'DAM', 'KAS', 'SBA', 'STM', 'TAN',
  'DAN', 'DANODE', 'DB11', 'DB15', 'DB22', 'DB30', 'DB45', 'DB90',
  'DBJUST410', 'DBJUST420', 'DBJUST430', 'DDAM', 'DEND', 'DFOT', 'DOVG',
  'DPPT', 'DPORT', 'DREPMUF', 'DST', 'DTERSK', 'DTAN', 'DVF', 'DVPR',
  'FORAKLOSS', 'FORAPLATE', 'FORASPUNT', 'GRØSTENG', 'GRØSTENG01',
  'GRØSTENG06', 'GRØSTENG10', 'KBRE', 'KDRE', 'KFDL', 'KINS', 'KKAB',
  'KLV', 'KMIN', 'KPPK', 'KPRØVFET', 'KPRØVOIL', 'KSDM', 'KSTA', 'KSTF',
  'KTRY', 'KUMINLØP', 'KUMPEILGRV', 'KUMUTJEV', 'KUMUTLØP', 'KVIPP', 'XLOK', 'PSNK',
  'PTOR', 'RBIO', 'RMEK', 'RMKJ', 'RSDM', 'SLAPUMP', 'SMIN', 'SSTA',
  'TTAN',
];
export const TYPE_TEMA_COMPATIBILITY_BY_TYPE = deepFreeze({
  BBAK: ['BAS'],
  BFJE: ['BAS'],
  BNOD: ['BAS'],
  BRED: ['BAS'],
  BSPY: ['BAS', 'BFD'],
  BSTR: ['BAS'],
  BTRN: ['BAS'],
  DAM: ['BFD'],
  KAS: ['BFD'],
  SBA: ['BFD'],
  STM: ['BFD'],
  TAN: ['BFD'],
  DAN: ['DRO'],
  DANODE: ['DRO'],
  DDAM: ['DRO'],
  DPORT: ['DRO'],
  DTAN: ['DRO'],
  DTERSK: ['DRO'],
  DB11: ['DIV'],
  DB15: ['DIV'],
  DB22: ['DIV'],
  DB30: ['DIV'],
  DB45: ['DIV'],
  DB90: ['DIV'],
  DBJUST410: ['DIV'],
  DBJUST420: ['DIV'],
  DBJUST430: ['DIV'],
  DEND: ['DIV'],
  DFOT: ['DIV'],
  DOVG: ['DIV'],
  DPPT: ['DIV'],
  DREPMUF: ['DIV'],
  DST: ['DIV'],
  DVPR: ['DIV'],
  DVF: ['FNT'],
  FORAKLOSS: ['FORAKONSTR'],
  FORAPLATE: ['FORAKONSTR'],
  FORASPUNT: ['FORAKONSTR'],
  GRØSTENG: ['GRØKONSTR'],
  GRØSTENG01: ['GRØKONSTR'],
  GRØSTENG06: ['GRØKONSTR'],
  GRØSTENG10: ['GRØKONSTR'],
  KBRE: ['KUM'],
  KDRE: ['KUM'],
  KFDL: ['KUM'],
  KINS: ['KUM'],
  KKAB: ['KUM'],
  KLV: ['KUM'],
  KMIN: ['KUM'],
  KPPK: ['KUM'],
  KPRØVFET: ['KUM'],
  KPRØVOIL: ['KUM'],
  KSDM: ['KUM'],
  KSTA: ['KUM'],
  KSTF: ['KUM'],
  KTRY: ['KUM'],
  KUMINLØP: ['KUM'],
  KUMPEILGRV: ['KUM'],
  KUMUTJEV: ['KUM'],
  KUMUTLØP: ['KUM'],
  KVIPP: ['KUM'],
  XLOK: ['KUM'],
  PSNK: ['PAF', 'POV', 'PSP', 'PST', 'PMK'],
  PTOR: ['PAF', 'POV', 'PSP', 'PST', 'PMK'],
  RBIO: ['RSP', 'RVA'],
  RMEK: ['RSP', 'RVA'],
  RMKJ: ['RSP', 'RVA'],
  RSDM: ['ROV'],
  SLAPUMP: ['SLA'],
  SMIN: ['SAN'],
  SSTA: ['SLG', 'SLS', 'SLU'],
  TTAN: ['TNK'],
});
export const TYPE_TEMA_ALLOWED_PAIRS = deepFreeze(
  Object.entries(TYPE_TEMA_COMPATIBILITY_BY_TYPE)
    .flatMap(([type, temas]) => temas.map((tema) => [type, tema])),
);
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
const BASE_VALIDATION_RULES = [
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
    ruleId: 'innmaling.point.type.valid',
    canonicalFieldId: 'type',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.ALLOWED_VALUE,
    category: RuleCategory.ALLOWED_VALUE,
    title: 'Punktets Type er gyldig når den er oppgitt',
    description: 'Oppgitt Type for punktobjekt skal være en gyldig v3.2-kode; feltet er valgfritt når det ikke er tilgjengelig.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 12–14' },
    allowedValues: TYPE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.point.manhole-shape.valid',
    canonicalFieldId: 'manholeShape',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.ALLOWED_VALUE,
    category: RuleCategory.ALLOWED_VALUE,
    title: 'Kumform er gyldig når den er oppgitt',
    description: 'Oppgitt Kumform for punktobjekt skal være en gyldig v3.2-kode; feltet er valgfritt i denne automatiske valideringen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 14' },
    allowedValues: MANHOLE_SHAPE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.point.construction-method.valid',
    canonicalFieldId: 'constructionMethod',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.ALLOWED_VALUE,
    category: RuleCategory.ALLOWED_VALUE,
    title: 'Byggemetode er gyldig når den er oppgitt',
    description: 'Oppgitt Byggemetode for punktobjekt skal være en gyldig v3.2-kode; feltet er valgfritt i denne automatiske valideringen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 15' },
    allowedValues: CONSTRUCTION_METHOD_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.point.cone.valid',
    canonicalFieldId: 'cone',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.ALLOWED_VALUE,
    category: RuleCategory.ALLOWED_VALUE,
    title: 'Kjegle er gyldig når den er oppgitt',
    description: 'Oppgitt Kjegle for punktobjekt skal være en gyldig v3.2-kode; feltet er valgfritt i denne automatiske valideringen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 15' },
    allowedValues: CONE_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.point.type-tema.compatible',
    canonicalFieldId: 'type',
    inputFieldIds: ['type', 'tema'],
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.FIELD_RELATIONSHIP,
    category: RuleCategory.FIELD_COMPATIBILITY,
    title: 'Punktets Type passer til Tema',
    resultLabel: 'Type passer til Tema',
    description: 'Oppgitt Type for punktobjekt skal være tillatt for objektets Tema.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '12–14' },
    relationship: {
      kind: FieldRelationshipKind.ALLOWED_PAIRS,
      optionalInputFieldId: 'type',
      optionalInputReasonCode: RuleReasonCode.OPTIONAL_TYPE_NOT_SUPPLIED,
      failureReasonCode: RuleReasonCode.TYPE_TEMA_INCOMPATIBLE,
      prerequisiteRuleIds: [
        'innmaling.point.type.valid',
        'innmaling.point.tema.required',
      ],
      allowedPairs: TYPE_TEMA_ALLOWED_PAIRS,
    },
    fieldDataEnabled: false,
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
    ruleId: 'innmaling.point.width.integer',
    canonicalFieldId: 'width',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.INTEGER_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'Bredde er et heltall når den er oppgitt',
    description: 'Oppgitt Bredde for punktobjekt skal være et heltall i millimeter; feltet er valgfritt i denne automatiske valideringen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 9' },
  },
  {
    ruleId: 'innmaling.point.length.integer',
    canonicalFieldId: 'length',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.INTEGER_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'Lengde er et heltall når den er oppgitt',
    description: 'Oppgitt Lengde for punktobjekt skal være et heltall i millimeter; feltet er valgfritt i denne automatiske valideringen.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 9' },
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
    ruleId: 'innmaling.point.horizontal-accuracy.integer',
    canonicalFieldId: 'horizontalAccuracy',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.INTEGER_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'Nøyaktighet er et heltall når den er oppgitt',
    description: 'Oppgitt Nøyaktighet for punktobjekt skal være et heltall i cm; denne regelen kontrollerer bare levert format, ikke om feltet er påkrevd.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
  },
  {
    ruleId: 'innmaling.point.vertical-accuracy.integer',
    canonicalFieldId: 'verticalAccuracy',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.INTEGER_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'NøyaktighetHøyde er et heltall når den er oppgitt',
    description: 'Oppgitt NøyaktighetHøyde for punktobjekt skal være et heltall i cm; denne regelen kontrollerer bare levert format, ikke om feltet er påkrevd.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
  },
  {
    ruleId: 'innmaling.point.max-horizontal-deviation.integer',
    canonicalFieldId: 'maxHorizontalDeviation',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.INTEGER_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'MaksAvvikHorisontalt er et heltall når den er oppgitt',
    description: 'Oppgitt MaksAvvikHorisontalt for punktobjekt skal være et heltall i cm; denne regelen kontrollerer bare levert format, ikke om feltet er påkrevd.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
  },
  {
    ruleId: 'innmaling.point.max-vertical-deviation.integer',
    canonicalFieldId: 'maxVerticalDeviation',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.INTEGER_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'MaksAvvikVertikalt er et heltall når den er oppgitt',
    description: 'Oppgitt MaksAvvikVertikalt for punktobjekt skal være et heltall i cm; denne regelen kontrollerer bare levert format, ikke om feltet er påkrevd.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
  },
  {
    ruleId: 'innmaling.point.wall-thickness.integer',
    canonicalFieldId: 'wallThickness',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.INTEGER_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'Tykkelse er et heltall når den er oppgitt',
    description: 'Oppgitt Tykkelse for punktobjekt skal være et heltall i mm; denne regelen kontrollerer bare levert format, ikke om feltet er påkrevd.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 9' },
  },
  {
    ruleId: 'innmaling.point.external-height.integer',
    canonicalFieldId: 'externalHeight',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.INTEGER_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'Utvendig_høyde er et heltall når den er oppgitt',
    description: 'Oppgitt Utvendig_høyde for punktobjekt skal være et heltall i mm; denne regelen kontrollerer bare levert format, ikke om feltet er påkrevd.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 9' },
  },
  {
    ruleId: 'innmaling.point.nobb-vavvs-number.integer',
    canonicalFieldId: 'nobbVavvsNumber',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.INTEGER_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'NOBB-VAVVS-nr er et heltall når den er oppgitt',
    description: 'Oppgitt NOBB-VAVVS-nr for punktobjekt skal være et heltall; denne regelen kontrollerer bare levert format, ikke om feltet er påkrevd.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 10' },
  },
  {
    ruleId: 'innmaling.point.nobb-vavvs-frame-number.integer',
    canonicalFieldId: 'nobbVavvsFrameNumber',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.INTEGER_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'NOBB-VAVVS-nr-ramme er et heltall når den er oppgitt',
    description: 'Oppgitt NOBB-VAVVS-nr-ramme for punktobjekt skal være et heltall; denne regelen kontrollerer bare levert format, ikke om feltet er påkrevd.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 10' },
  },
  {
    ruleId: 'innmaling.point.owner.valid',
    canonicalFieldId: 'owner',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.ALLOWED_VALUE,
    category: RuleCategory.ALLOWED_VALUE,
    title: 'Eier er gyldig når den er oppgitt',
    description: 'Oppgitt Eier for punktobjekt skal være en aktuell v3.2-kode for å passere automatisk validering; andre leverte verdier må valideres manuelt. Feltet er valgfritt.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 8–9' },
    allowedValues: OWNER_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.point.access.valid',
    canonicalFieldId: 'access',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.ALLOWED_VALUE,
    category: RuleCategory.ALLOWED_VALUE,
    title: 'Adkomst er gyldig når den er oppgitt',
    description: 'Oppgitt Adkomst for punktobjekt skal være en aktuell v3.2-kode for å passere automatisk validering; andre leverte verdier må valideres manuelt. Feltet er valgfritt.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 15' },
    allowedValues: ACCESS_VALUES,
    valueComparison: ValueComparisonPolicy.EXACT,
  },
  {
    ruleId: 'innmaling.point.bottom-distance.decimal',
    canonicalFieldId: 'innerBottomToOuterUndersideDistance',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.DECIMAL_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'Avst_BunnInnvUnderUtv er et desimaltall når den er oppgitt',
    description: 'Oppgitt Avst_BunnInnvUnderUtv skal følge et helt eller desimaltallformat i meter; regelen avgjør ikke requiredness, fortegn, presisjon eller avstandens faglige riktighet.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 9' },
  },
  {
    ruleId: 'innmaling.point.installation-year.format',
    canonicalFieldId: 'installationYear',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.YEAR_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'Anleggsår følger YYYY-format når det er oppgitt',
    description: 'Oppgitt Anleggsår skal ha nøyaktig fire ASCII-sifre (YYYY); regelen avgjør ikke historisk plausibilitet eller requiredness.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
  },
  {
    ruleId: 'innmaling.point.capture-date.format',
    canonicalFieldId: 'captureDate',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.DATE_FORMAT,
    category: RuleCategory.VALUE_FORMAT,
    title: 'Datafangstdato følger godkjent datoformat når den er oppgitt',
    description: 'Oppgitt Datafangstdato skal ha format DD.MM.YYYY eller kompakt YYYYMMDD; regelen kontrollerer ikke tidssone, kronologi eller requiredness.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
  },
  {
    ruleId: 'innmaling.point.note.max-length',
    canonicalFieldId: 'note',
    geometryScopes: [GeometryScope.POINT],
    evaluatorKind: RuleEvaluatorKind.TEXT_MAX_LENGTH,
    category: RuleCategory.VALUE_FORMAT,
    title: 'Merknad er høyst 255 tegn når den er oppgitt',
    description: 'Oppgitt Merknad kan ha maksimalt 255 Unicode-kodepunkter. Whitespace telles; regelen trimmer eller normaliserer ikke og kontrollerer ikke innhold.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' },
    maximumLength: 255,
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
    ruleId: 'innmaling.line.vertical-dimension.valid',
    canonicalFieldId: 'verticalDimension',
    geometryScopes: [GeometryScope.LINE],
    evaluatorKind: RuleEvaluatorKind.REQUIRED,
    category: RuleCategory.REQUIRED_FIELD,
    title: 'Ledningens vertikale dimensjon følger rørform',
    description: 'VertikalDimensjon kontrolleres kontekstuelt mot gyldig Rørform.',
    severity: RuleSeverity.ERROR,
    provenance: RuleProvenance.STANDARD,
    source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 21' },
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
  { ruleId: 'innmaling.line.sdr.valid', canonicalFieldId: 'sdr', geometryScopes: [GeometryScope.LINE], evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, category: RuleCategory.REQUIRED_ALLOWED_VALUE, title: 'SDR følger hydraulisk kontekst', description: 'SDR vurderes mot Tema og Material.', severity: RuleSeverity.ERROR, provenance: RuleProvenance.STANDARD, source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 21' }, allowedValues: SDR_VALUES, valueComparison: ValueComparisonPolicy.EXACT },
  { ruleId: 'innmaling.line.ring-stiffness.valid', canonicalFieldId: 'ringStiffness', geometryScopes: [GeometryScope.LINE], evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, category: RuleCategory.REQUIRED_ALLOWED_VALUE, title: 'Ringstivhet følger hydraulisk kontekst', description: 'Ringstivhet vurderes mot Tema og Material.', severity: RuleSeverity.ERROR, provenance: RuleProvenance.STANDARD, source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 21' }, allowedValues: RING_STIFFNESS_VALUES, valueComparison: ValueComparisonPolicy.EXACT },
  { ruleId: 'innmaling.line.pressure-class.valid', canonicalFieldId: 'pressureClass', geometryScopes: [GeometryScope.LINE], evaluatorKind: RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE, category: RuleCategory.REQUIRED_ALLOWED_VALUE, title: 'Trykklasse følger hydraulisk kontekst', description: 'Trykklasse vurderes mot Tema.', severity: RuleSeverity.ERROR, provenance: RuleProvenance.STANDARD, source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 21' }, allowedValues: PRESSURE_CLASS_VALUES, valueComparison: ValueComparisonPolicy.EXACT },
];

// Batch 1 deliberately activates only independent common controls.  The omitted
// baseline controls are point applicability/history and line/hydraulic work
// scheduled for later batches; retaining them here would present unfinished
// policy as current validation.
const BATCH1_POLICY_BY_RULE_ID = Object.freeze({
  'innmaling.common.height-reference.valid': 'heightReference',
  'innmaling.common.measurement-method.required': 'measurementMethod',
  'innmaling.common.height-measurement-method.required': 'heightMeasurementMethod',
  'innmaling.common.vertical-level.required': 'verticalLevel',
  'innmaling.common.surveyed-by.required': 'surveyedBy',
  'innmaling.common.case-number.required': 'caseNumber',
  'innmaling.common.horizontal-accuracy.required': 'horizontalAccuracy',
  'innmaling.common.vertical-accuracy.required': 'verticalAccuracy',
  'innmaling.common.max-horizontal-deviation.required': 'maxHorizontalDeviation',
  'innmaling.common.max-vertical-deviation.required': 'maxVerticalDeviation',
  'innmaling.common.positioning-condition.valid': 'positioningCondition',
  'innmaling.point.owner.valid': 'owner',
  'innmaling.point.inside-outside.valid': 'insideOutside',
  'innmaling.line.inside-outside.valid': 'insideOutside',
  'innmaling.point.note.max-length': 'optionalText',
  'innmaling.point.nobb-vavvs-number.integer': 'nobb',
});
const BATCH1_RULE_IDS = new Set([
  ...Object.keys(BATCH1_POLICY_BY_RULE_ID),
  'innmaling.point.tema.required', 'innmaling.line.tema.required',
]);
const BATCH1_SCOPE_BOTH = new Set([
  'innmaling.point.owner.valid',
  'innmaling.point.note.max-length',
  'innmaling.point.nobb-vavvs-number.integer',
]);
const BATCH2_POLICY_BY_RULE_ID = Object.freeze({
  'innmaling.common.installation-year.required': 'installationYear',
  'innmaling.common.capture-date.required': 'captureDate',
  'innmaling.common.positioning-cause.valid': 'positioningCause',
  'innmaling.point.type.valid': 'type',
  'innmaling.point.manhole-shape.valid': 'manholeShape',
  'innmaling.point.construction-method.valid': 'constructionMethod',
  'innmaling.point.cone.valid': 'cone',
  'innmaling.point.width.integer': 'width',
  'innmaling.point.length.integer': 'length',
  'innmaling.point.wall-thickness.integer': 'wallThickness',
  'innmaling.point.external-height.integer': 'externalHeight',
  'innmaling.point.nobb-vavvs-frame-number.integer': 'frameNobb',
  'innmaling.point.access.valid': 'access',
  'innmaling.point.bottom-distance.decimal': 'bottomDistance',
});
const BATCH2_RULE_IDS = new Set([...Object.keys(BATCH2_POLICY_BY_RULE_ID), 'innmaling.point.type-tema.compatible']);
const BATCH3_POLICY_BY_RULE_ID = Object.freeze({
  'innmaling.line.material.required': 'material',
  'innmaling.line.network-type.valid': 'networkType',
  'innmaling.line.dimension.required': 'dimension',
  'innmaling.line.wall-thickness.required': 'lineWallThickness',
  'innmaling.line.pipe-shape.valid': 'pipeShape',
  'innmaling.line.vertical-dimension.valid': 'verticalDimension',
});
const BATCH3_RULE_IDS = new Set(Object.keys(BATCH3_POLICY_BY_RULE_ID));
const BATCH4_POLICY_BY_RULE_ID = Object.freeze({'innmaling.line.sdr.valid':'sdr','innmaling.line.ring-stiffness.valid':'ringStiffness','innmaling.line.pressure-class.valid':'pressureClass'});
const BATCH4_RULE_IDS = new Set(Object.keys(BATCH4_POLICY_BY_RULE_ID));
const batch1Rules = BASE_VALIDATION_RULES
  .filter((rule) => BATCH1_RULE_IDS.has(rule.ruleId) || BATCH2_RULE_IDS.has(rule.ruleId) || BATCH3_RULE_IDS.has(rule.ruleId) || BATCH4_RULE_IDS.has(rule.ruleId))
  .filter((rule) => rule.ruleId !== 'innmaling.point.wall-thickness.required' && rule.ruleId !== 'innmaling.point.installation-year.format' && rule.ruleId !== 'innmaling.point.capture-date.format')
  .map((rule) => BATCH1_POLICY_BY_RULE_ID[rule.ruleId] || BATCH2_POLICY_BY_RULE_ID[rule.ruleId] || BATCH3_POLICY_BY_RULE_ID[rule.ruleId] || BATCH4_POLICY_BY_RULE_ID[rule.ruleId]
    ? { ...rule, evaluatorKind: RuleEvaluatorKind.FIELD_POLICY, category: RuleCategory.VALUE_FORMAT,
      policy: BATCH1_POLICY_BY_RULE_ID[rule.ruleId] || BATCH2_POLICY_BY_RULE_ID[rule.ruleId] || BATCH3_POLICY_BY_RULE_ID[rule.ruleId] || BATCH4_POLICY_BY_RULE_ID[rule.ruleId],
      allowedValues: rule.allowedValues || [], valueComparison: rule.valueComparison || ValueComparisonPolicy.NONE,
      geometryScopes: BATCH1_SCOPE_BOTH.has(rule.ruleId) ? [GeometryScope.POINT, GeometryScope.LINE] : rule.geometryScopes }
    : rule.ruleId === 'innmaling.point.type-tema.compatible'
      ? { ...rule, policy: 'typeCompatibility', allowedPairs: TYPE_TEMA_ALLOWED_PAIRS }
      : { ...rule, evaluatorKind: RuleEvaluatorKind.FIELD_POLICY, category: RuleCategory.REQUIRED_ALLOWED_VALUE, policy: 'tema',
      allowedValues: rule.allowedValues || [], valueComparison: rule.valueComparison || ValueComparisonPolicy.NONE });

batch1Rules.push({
  ruleId: 'innmaling.common.visibility.retired', canonicalFieldId: 'visibility',
  geometryScopes: [GeometryScope.POINT, GeometryScope.LINE], evaluatorKind: RuleEvaluatorKind.FIELD_POLICY,
  category: RuleCategory.VALUE_FORMAT, policy: 'visibility', title: 'Synbarhet er ikke lenger validert',
  description: 'Synbarhet vises som levert, men er utgått fra v3.2-valideringen.',
  severity: RuleSeverity.ERROR, provenance: RuleProvenance.STANDARD,
  source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 6' }, allowedValues: [],
  valueComparison: ValueComparisonPolicy.NONE,
});
batch1Rules.push(
  { ruleId: 'innmaling.point.facility-id.informational', canonicalFieldId: 'facilityId', geometryScopes: [GeometryScope.POINT], evaluatorKind: RuleEvaluatorKind.FIELD_POLICY, category: RuleCategory.VALUE_FORMAT, policy: 'facilityId', title: 'AnleggsID er fremhevet når den er oppgitt', description: 'Oppgitt AnleggsID vises for kontroll. Sjekk er kun informativt og betyr ikke at verdien er feil.', severity: RuleSeverity.ERROR, provenance: RuleProvenance.STANDARD, source: { document: 'Innmålingsinstruks Vedlegg A', pages: '4, 9' }, allowedValues: [], valueComparison: ValueComparisonPolicy.NONE },
  { ruleId: 'innmaling.point.attachment-link.policy', canonicalFieldId: 'attachmentLink', geometryScopes: [GeometryScope.POINT], evaluatorKind: RuleEvaluatorKind.FIELD_POLICY, category: RuleCategory.VALUE_FORMAT, policy: 'attachmentLink', title: 'S_HYPERLINK følger objektpolicy', description: 'Vedlegg forventes på aktuelle kumobjekt. Gemini VA støtter ikke vedlegg på LOK eller TOP.', severity: RuleSeverity.ERROR, provenance: RuleProvenance.STANDARD, source: { document: 'Innmålingsinstruks Vedlegg A', pages: '5, 15' }, allowedValues: [], valueComparison: ValueComparisonPolicy.NONE },
);

const attachmentLinkRule = batch1Rules.find(
  (rule) => rule.ruleId === 'innmaling.point.attachment-link.policy'
);
attachmentLinkRule.geometryScopes = [GeometryScope.POINT, GeometryScope.LINE];
attachmentLinkRule.description = 'Vedlegg forventes på aktuelle kumobjekt. Gemini VA støtter ikke vedlegg på kumlokk (LOK/TOP); en levert lenke skal da fjernes.';

export const VALIDATION_RULES = deepFreeze(batch1Rules);

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
  const rulesById = new Map(rules.map((rule) => [rule?.ruleId, rule]));

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
        (rule.evaluatorKind === RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE && rule.category === RuleCategory.REQUIRED_ALLOWED_VALUE) ||
      ([
        RuleEvaluatorKind.INTEGER_FORMAT,
        RuleEvaluatorKind.DECIMAL_FORMAT,
        RuleEvaluatorKind.YEAR_FORMAT,
        RuleEvaluatorKind.DATE_FORMAT,
        RuleEvaluatorKind.TEXT_MAX_LENGTH,
      ].includes(rule.evaluatorKind) && rule.category === RuleCategory.VALUE_FORMAT) ||
        (rule.evaluatorKind === RuleEvaluatorKind.FIELD_RELATIONSHIP && rule.category === RuleCategory.FIELD_COMPATIBILITY) ||
        (rule.evaluatorKind === RuleEvaluatorKind.FIELD_POLICY &&
          [RuleCategory.VALUE_FORMAT, RuleCategory.REQUIRED_ALLOWED_VALUE].includes(rule.category)),
      `${rule.ruleId} has an evaluator/category mismatch`
    );
    assertInvariant(typeof rule.title === 'string' && rule.title.length > 0, `${rule.ruleId} needs a title`);
    assertInvariant(typeof rule.description === 'string' && rule.description.length > 0, `${rule.ruleId} needs a description`);
    assertInvariant(rule.severity === RuleSeverity.ERROR, `${rule.ruleId} has invalid severity`);
    assertInvariant(rule.provenance === RuleProvenance.STANDARD, `${rule.ruleId} has invalid provenance`);
    assertInvariant(rule.source && typeof rule.source.document === 'string' && typeof rule.source.pages === 'string', `${rule.ruleId} needs source metadata`);

    if (rule.evaluatorKind === RuleEvaluatorKind.FIELD_RELATIONSHIP) {
      assertInvariant(!Object.hasOwn(rule, 'allowedValues'), `${rule.ruleId} must not define allowedValues`);
      assertInvariant(!Object.hasOwn(rule, 'valueComparison'), `${rule.ruleId} must not define valueComparison`);
      assertInvariant(
        Array.isArray(rule.inputFieldIds) &&
          rule.inputFieldIds.length === 2 &&
          new Set(rule.inputFieldIds).size === rule.inputFieldIds.length,
        `${rule.ruleId} needs two unique relationship inputs`
      );
      assertInvariant(
        rule.inputFieldIds[0] === rule.canonicalFieldId,
        `${rule.ruleId} primary field must be the first relationship input`
      );
      assertInvariant(
        rule.inputFieldIds.every((fieldId) => Boolean(getCanonicalField(fieldId))),
        `${rule.ruleId} references an unknown relationship input`
      );
      assertInvariant(
        rule.relationship?.kind === FieldRelationshipKind.ALLOWED_PAIRS,
        `${rule.ruleId} has an invalid relationship kind`
      );
      assertInvariant(
        rule.inputFieldIds.includes(rule.relationship.optionalInputFieldId) &&
          Object.values(RuleReasonCode).includes(rule.relationship.optionalInputReasonCode) &&
          Object.values(RuleReasonCode).includes(rule.relationship.failureReasonCode),
        `${rule.ruleId} has invalid optional-input semantics`
      );
      const prerequisiteRuleIds = rule.relationship?.prerequisiteRuleIds;
      assertInvariant(
        Array.isArray(prerequisiteRuleIds) &&
          prerequisiteRuleIds.length === rule.inputFieldIds.length &&
          new Set(prerequisiteRuleIds).size === prerequisiteRuleIds.length,
        `${rule.ruleId} needs one unique prerequisite rule per input`
      );
      const prerequisiteRules = prerequisiteRuleIds.map((ruleId) => rulesById.get(ruleId));
      assertInvariant(
        prerequisiteRules.every(Boolean),
        `${rule.ruleId} references an unknown prerequisite rule`
      );
      for (const [index, prerequisiteRule] of prerequisiteRules.entries()) {
        assertInvariant(
          prerequisiteRule.canonicalFieldId === rule.inputFieldIds[index],
          `${rule.ruleId} prerequisite order must match relationship inputs`
        );
        assertInvariant(
          prerequisiteRule.evaluatorKind !== RuleEvaluatorKind.FIELD_RELATIONSHIP &&
            Array.isArray(prerequisiteRule.allowedValues) &&
            prerequisiteRule.allowedValues.length > 0,
          `${rule.ruleId} prerequisite must own an allowed-value list`
        );
        assertInvariant(
          rule.geometryScopes.every((scope) => prerequisiteRule.geometryScopes.includes(scope)),
          `${rule.ruleId} prerequisite has incompatible geometry`
        );
      }
      const allowedPairs = rule.relationship?.allowedPairs;
      assertInvariant(Array.isArray(allowedPairs) && allowedPairs.length > 0, `${rule.ruleId} needs allowed pairs`);
      assertInvariant(
        allowedPairs.every((pair) => Array.isArray(pair) && pair.length === rule.inputFieldIds.length),
        `${rule.ruleId} has an invalid allowed pair`
      );
      const pairKeys = allowedPairs.map((pair) => JSON.stringify(pair));
      assertInvariant(new Set(pairKeys).size === pairKeys.length, `${rule.ruleId} has duplicate allowed pairs`);
      for (const pair of allowedPairs) {
        pair.forEach((value, index) => {
          assertInvariant(
            prerequisiteRules[index].allowedValues.some((allowedValue) => Object.is(allowedValue, value)),
            `${rule.ruleId} pair member is not current for ${rule.inputFieldIds[index]}`
          );
        });
      }
      assertInvariant(rule.fieldDataEnabled === false, `${rule.ruleId} must disable single-field data`);
      continue;
    }

    assertInvariant(!Object.hasOwn(rule, 'relationship'), `${rule.ruleId} must not define a relationship`);
    assertInvariant(!Object.hasOwn(rule, 'inputFieldIds'), `${rule.ruleId} must not define relationship inputs`);
    if ([
      RuleEvaluatorKind.INTEGER_FORMAT,
      RuleEvaluatorKind.DECIMAL_FORMAT,
      RuleEvaluatorKind.YEAR_FORMAT,
      RuleEvaluatorKind.DATE_FORMAT,
      RuleEvaluatorKind.TEXT_MAX_LENGTH,
    ].includes(rule.evaluatorKind)) {
      assertInvariant(!Object.hasOwn(rule, 'allowedValues'), `${rule.ruleId} must not define allowedValues`);
      assertInvariant(!Object.hasOwn(rule, 'valueComparison'), `${rule.ruleId} must not define valueComparison`);
      if (rule.evaluatorKind === RuleEvaluatorKind.TEXT_MAX_LENGTH) {
        assertInvariant(Number.isInteger(rule.maximumLength) && rule.maximumLength > 0, `${rule.ruleId} needs a positive maximumLength`);
      } else {
        assertInvariant(!Object.hasOwn(rule, 'maximumLength'), `${rule.ruleId} must not define maximumLength`);
      }
      continue;
    }
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
      rule.evaluatorKind === RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE ||
      rule.evaluatorKind === RuleEvaluatorKind.FIELD_POLICY
    ) {
      assertInvariant(rule.evaluatorKind === RuleEvaluatorKind.FIELD_POLICY || rule.allowedValues.length > 0, `${rule.ruleId} needs allowed values`);
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
