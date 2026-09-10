import fieldInformationData from '../../../data/validation-v2/field-information.json' with { type: 'json' };
import { getCanonicalField } from './registry.js';
import {
  ACCESS_VALUES,
  OWNER_VALUES,
  HEIGHT_MEASUREMENT_METHOD_VALUES,
  LINE_TEMA_VALUES,
  MATERIAL_VALUES,
  NETWORK_TYPE_VALUES,
  PIPE_SHAPE_VALUES,
  CONE_VALUES,
  CONSTRUCTION_METHOD_VALUES,
  MANHOLE_SHAPE_VALUES,
  MEASUREMENT_METHOD_VALUES,
  POINT_TEMA_VALUES,
  TYPE_TEMA_COMPATIBILITY_BY_TYPE,
  TYPE_VALUES,
  VERTICAL_LEVEL_VALUES,
} from './rules.js';

const MEASUREMENT_VALUE_INFO = Object.fromEntries(
  MEASUREMENT_METHOD_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '23–25' }],
  }]),
);
const HEIGHT_MEASUREMENT_VALUE_INFO = Object.fromEntries(
  HEIGHT_MEASUREMENT_METHOD_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '25–27' }],
  }]),
);
const VERTICAL_LEVEL_VALUE_INFO = Object.fromEntries(
  VERTICAL_LEVEL_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '4, 9' }],
  }]),
);
const MATERIAL_VALUE_INFO = Object.fromEntries(
  MATERIAL_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '19–21' }],
  }]),
);
const NETWORK_TYPE_VALUE_INFO = Object.fromEntries(NETWORK_TYPE_VALUES.map((value) => [value, { label: value, sources: [{ documentId: 'appendix-a', pages: '19' }] }]));
const PIPE_SHAPE_VALUE_INFO = Object.fromEntries(PIPE_SHAPE_VALUES.map((value) => [value, { label: value, sources: [{ documentId: 'appendix-a', pages: '21' }] }]));
const POINT_TEMA_VALUE_INFO = Object.fromEntries(
  POINT_TEMA_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '10–12' }],
  }]),
);
const LINE_TEMA_VALUE_INFO = Object.fromEntries(
  LINE_TEMA_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '16–19' }],
  }]),
);
const TYPE_VALUE_INFO = Object.fromEntries(
  TYPE_VALUES.map((value) => [value, {
    label: value,
    sources: [{ documentId: 'appendix-a', pages: '12–14' }],
  }]),
);
const POINT_CODE_LIST_INFORMATION = {
  owner: {
    values: OWNER_VALUES,
    pages: '4, 8–9',
    ruleId: 'innmaling.point.owner.valid',
  },
  access: {
    values: ACCESS_VALUES,
    pages: '5, 15',
    ruleId: 'innmaling.point.access.valid',
  },
  manholeShape: {
    values: MANHOLE_SHAPE_VALUES,
    pages: '14',
    ruleId: 'innmaling.point.manhole-shape.valid',
  },
  constructionMethod: {
    values: CONSTRUCTION_METHOD_VALUES,
    pages: '15',
    ruleId: 'innmaling.point.construction-method.valid',
  },
  cone: {
    values: CONE_VALUES,
    pages: '15',
    ruleId: 'innmaling.point.cone.valid',
  },
};
const TYPE_TEMA_COMPATIBILITY_SOURCE = {
  documentId: 'appendix-a',
  pages: '12–14',
  auditSourceRuleIds: [
    'innmaling.point.type.valid',
    'innmaling.point.type-tema.compatible',
  ],
};
const TYPE_TEMA_COMPATIBILITY_INFO = {
  kind: 'ALLOWED_PAIRS',
  inputFieldIds: ['type', 'tema'],
  byType: Object.fromEntries(Object.entries(TYPE_TEMA_COMPATIBILITY_BY_TYPE).map(
    ([type, temaValues]) => [type, {
      temaValues: [...temaValues],
      sources: [{ ...TYPE_TEMA_COMPATIBILITY_SOURCE }],
    }],
  )),
  multiTemaTypes: Object.fromEntries(Object.entries(TYPE_TEMA_COMPATIBILITY_BY_TYPE)
    .filter(([, temaValues]) => temaValues.length > 1)
    .map(([type, temaValues]) => [type, [...temaValues]])),
  sources: [{ ...TYPE_TEMA_COMPATIBILITY_SOURCE }],
};

const FIELD_INFORMATION_WITH_MEASUREMENT_LISTS = fieldInformationData.map((entry) => {
  if (entry.canonicalFieldId === 'measurementMethod') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [],
      valueInfo: MEASUREMENT_VALUE_INFO,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '4, 6–7, 23–25',
        auditSourceRuleIds: ['innmaling.common.measurement-method.required'],
      })),
    };
  }
  if (entry.canonicalFieldId === 'heightMeasurementMethod') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [],
      valueInfo: HEIGHT_MEASUREMENT_VALUE_INFO,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '4, 7, 25–27',
        auditSourceRuleIds: ['innmaling.common.height-measurement-method.required'],
      })),
    };
  }
  if (entry.canonicalFieldId === 'verticalLevel') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [],
      valueInfo: VERTICAL_LEVEL_VALUE_INFO,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '4, 9',
        auditSourceRuleIds: ['innmaling.common.vertical-level.required'],
      })),
    };
  }
  if (entry.canonicalFieldId === 'material') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [],
      valueInfo: MATERIAL_VALUE_INFO,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '5, 19–21',
        auditSourceRuleIds: ['innmaling.line.material.required'],
      })),
    };
  }
  if (entry.canonicalFieldId === 'networkType' || entry.canonicalFieldId === 'pipeShape' || entry.canonicalFieldId === 'dimension' || entry.canonicalFieldId === 'verticalDimension' || entry.canonicalFieldId === 'wallThickness') {
    const details = {
      networkType: { qualifications: [{ text: 'Påkrevd for ledning. F, H, O og S er normale; O1, O2, S6 og S7 er gyldige, men markeres Sjekk.', validationStatus: 'INFORMATIONAL' }], valueInfo: NETWORK_TYPE_VALUE_INFO, ruleId: 'innmaling.line.network-type.valid' },
      pipeShape: { qualifications: [{ text: 'Påkrevd for ledning. A og X er gyldige, men uvanlige og markeres Sjekk.', validationStatus: 'INFORMATIONAL' }], valueInfo: PIPE_SHAPE_VALUE_INFO, ruleId: 'innmaling.line.pipe-shape.valid' },
      dimension: { qualifications: [{ text: 'Påkrevd heltall for ledning. Verdier under 32 markeres Sjekk.', validationStatus: 'INFORMATIONAL' }], valueInfo: {}, ruleId: 'innmaling.line.dimension.required' },
      wallThickness: { qualifications: [{ text: 'For ledning er Tykkelse påkrevd: positivt heltall eller opptil to desimaler passerer; null og flere desimaler markeres Sjekk. Negativ eller feil format er Feil. Punkt-Tykkelse er fortsatt heltall.', validationStatus: 'INFORMATIONAL' }], valueInfo: {}, ruleId: 'innmaling.line.wall-thickness.required' },
      verticalDimension: { qualifications: [{ text: 'Avhenger av Rørform: valgfritt for S, påkrevd for annen gyldig form. For annen form er 1–30 Sjekk og minst 31 Pass.', validationStatus: 'INFORMATIONAL' }], valueInfo: {}, ruleId: 'innmaling.line.vertical-dimension.valid' },
    }[entry.canonicalFieldId];
    return { ...entry, documentationStatus: 'COMPLETE', qualifications: details.qualifications, valueInfo: details.valueInfo,
      sources: entry.sources.map((source) => ({ ...source, auditSourceRuleIds: [details.ruleId] })) };
  }
  if (entry.canonicalFieldId === 'tema') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [],
      valueInfo: {},
      byGeometry: {
        ...(entry.byGeometry || {}),
        point: { ...(entry.byGeometry?.point || {}), valueInfo: POINT_TEMA_VALUE_INFO },
        line: { ...(entry.byGeometry?.line || {}), valueInfo: LINE_TEMA_VALUE_INFO },
      },
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '4, 10–12; line 16–19',
        auditSourceRuleIds: [
          'innmaling.point.tema.required',
          'innmaling.line.tema.required',
        ],
      })),
    };
  }
  if (entry.canonicalFieldId === 'type') {
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      valueInfo: TYPE_VALUE_INFO,
      compatibility: TYPE_TEMA_COMPATIBILITY_INFO,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: '4, 12–14',
        auditSourceRuleIds: [
          'innmaling.point.type.valid',
          'innmaling.point.type-tema.compatible',
        ],
      })),
    };
  }
  const pointCodeList = POINT_CODE_LIST_INFORMATION[entry.canonicalFieldId];
  if (pointCodeList) {
    const valueInfo = Object.fromEntries(pointCodeList.values.map((value) => [value, {
      label: value,
      sources: [{ documentId: 'appendix-a', pages: pointCodeList.pages }],
    }]));
    return {
      ...entry,
      documentationStatus: 'COMPLETE',
      qualifications: [
        { text: entry.appliesTo.includes('line')
          ? 'Kilde-feltet gjelder punkt og ledning; den aktive regelen er punkt-only og valgfri i denne automatiske valideringen.'
          : 'Feltet er punkt-only og valgfritt i denne automatiske valideringen; manglende verdi er ikke et kravbrudd.', validationStatus: 'INFORMATIONAL' },
        { text: 'Kun eksakte aktuelle v3.2-koder passerer automatisk kodevalidering; andre leverte verdier flagges for manuell validering.', validationStatus: 'INFORMATIONAL' },
      ],
      valueInfo,
      sources: entry.sources.map((source) => ({
        ...source,
        pages: pointCodeList.pages,
        auditSourceRuleIds: [pointCodeList.ruleId],
      })),
    };
  }
  return entry;
});

const REQUIRED_FIELD_INFORMATION = Object.freeze([
  'externalHeight',
  'owner',
  'access',
  'nobbVavvsNumber',
  'nobbVavvsFrameNumber',
  'heightReference',
  'measurementMethod',
  'heightMeasurementMethod',
  'verticalLevel',
  'installationYear',
  'captureDate',
  'surveyedBy',
  'caseNumber',
  'horizontalAccuracy',
  'verticalAccuracy',
  'maxHorizontalDeviation',
  'maxVerticalDeviation',
  'positioningCondition',
  'positioningCause',
  'tema',
  'insideOutside',
  'wallThickness',
  'width',
  'length',
  'material',
  'dimension',
  'networkType',
  'pipeShape',
  'verticalDimension',
  'facilityId',
  'attachmentLink',
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export function validateFieldInformationRegistry(entries = fieldInformationData) {
  if (!Array.isArray(entries)) throw new Error('Validator 2.0 field information must be an array');
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') throw new Error('Validator 2.0 field information entry must be an object');
    if (!entry.canonicalFieldId || ids.has(entry.canonicalFieldId)) {
      throw new Error(`Duplicate or missing field information ID: ${entry.canonicalFieldId || '?'}`);
    }
    if (!entry.displayName || !Array.isArray(entry.appliesTo)) {
      throw new Error(`Incomplete field information: ${entry.canonicalFieldId}`);
    }
    if (!entry.appliesTo.every((scope) => scope === 'point' || scope === 'line')) {
      throw new Error(`Invalid field information geometry: ${entry.canonicalFieldId}`);
    }
    if (!['COMPLETE', 'PARTIAL', 'MISSING'].includes(entry.documentationStatus)) {
      throw new Error(`Invalid documentation status: ${entry.canonicalFieldId}`);
    }
    if (!['VERIFIED_SOURCE_REFERENCE', 'TRACEABILITY_PENDING'].includes(entry.sourceStatus)) {
      throw new Error(`Invalid source status: ${entry.canonicalFieldId}`);
    }
    if (!Array.isArray(entry.sources)) throw new Error(`Sources must be an array: ${entry.canonicalFieldId}`);
    for (const source of entry.sources) {
      if (!source || !source.documentId || !source.pages || !Array.isArray(source.auditSourceRuleIds)) {
        throw new Error(`Incomplete source reference: ${entry.canonicalFieldId}`);
      }
    }
    if (!entry.valueInfo || typeof entry.valueInfo !== 'object' || Array.isArray(entry.valueInfo)) {
      throw new Error(`Value information must be an object: ${entry.canonicalFieldId}`);
    }
    for (const [value, valueInfo] of Object.entries(entry.valueInfo)) {
      if (!valueInfo || typeof valueInfo.label !== 'string' || !Array.isArray(valueInfo.sources)) {
        throw new Error(`Incomplete value information: ${entry.canonicalFieldId}.${value}`);
      }
    }
    if (entry.byGeometry && Object.keys(entry.byGeometry).some((scope) => !['point', 'line'].includes(scope))) {
      throw new Error(`Invalid geometry overlay: ${entry.canonicalFieldId}`);
    }
    if (entry.compatibility) {
      if (
        entry.compatibility.kind !== 'ALLOWED_PAIRS' ||
        !Array.isArray(entry.compatibility.inputFieldIds) ||
        !entry.compatibility.byType ||
        !Array.isArray(entry.compatibility.sources)
      ) {
        throw new Error(`Invalid compatibility information: ${entry.canonicalFieldId}`);
      }
      for (const [type, relationship] of Object.entries(entry.compatibility.byType)) {
        if (!Array.isArray(relationship.temaValues) || !Array.isArray(relationship.sources)) {
          throw new Error(`Invalid compatibility relationship: ${entry.canonicalFieldId}.${type}`);
        }
      }
    }
    ids.add(entry.canonicalFieldId);
  }
  for (const fieldId of REQUIRED_FIELD_INFORMATION) {
    if (!ids.has(fieldId)) throw new Error(`Missing active field information: ${fieldId}`);
  }
  return true;
}

validateFieldInformationRegistry(FIELD_INFORMATION_WITH_MEASUREMENT_LISTS);

export const FIELD_INFORMATION = deepFreeze(FIELD_INFORMATION_WITH_MEASUREMENT_LISTS);
const byId = new Map(FIELD_INFORMATION.map((entry) => [entry.canonicalFieldId, entry]));

const CONDITIONAL_POLICIES = new Set([
  'installationYear', 'type', 'manholeShape', 'constructionMethod', 'cone', 'width',
  'wallThickness', 'bottomDistance', 'access', 'attachmentLink', 'verticalDimension',
  'sdr', 'ringStiffness', 'pressureClass',
]);
const OPTIONAL_POLICIES = new Set([
  'caseNumber', 'owner', 'length', 'externalHeight', 'nobb', 'frameNobb',
  'optionalText', 'visibility', 'facilityId', 'typeCompatibility',
]);
const POLICY_METADATA = Object.freeze({
  heightReference: ['Høydereferanse er påkrevd. UKJENT gir Sjekk; andre godkjente koder gir Pass.', []],
  installationYear: ['Anleggsår valideres som fire ASCII-sifre og vurderes mot Stedfestingsårsak og kontrollåret.', ['0000 og år før 1900 gir Sjekk. Fremtidig eller feil format gir Feil. NYTT krever år; eldre NYTT-år enn fem år gir Sjekk.']],
  measurementMethod: ['Målemetode er påkrevd. Kode 96 gir Pass; andre godkjente XY-koder gir Sjekk.', []],
  heightMeasurementMethod: ['MålemetodeHøyde er påkrevd. Kode 96 gir Pass; andre godkjente koder og særtilfellet 97 gir Sjekk.', []],
  verticalLevel: ['Vertikalnivå er påkrevd. UNDER_GRUNN og PÅ_GRUNN_VANNOVERF gir Pass; andre godkjente koder gir Sjekk.', []],
  captureDate: ['Datafangstdato er påkrevd, må være en reell DD.MM.YYYY-dato og kan ikke ligge i fremtiden eller før et brukbart Anleggsår.', ['En gyldig dato eldre enn fem år gir Sjekk. Nøyaktig femårsdato gir Pass.']],
  surveyedBy: ['Innmålt_av er påkrevd. Vanlig ikke-tom tekst gir Pass; avtalte plassholdere gir Sjekk.', []],
  caseNumber: ['Saksnummer er valgfritt. Vanlig tekst eller tall gir Pass; avtalte plassholdere gir Sjekk.', []],
  horizontalAccuracy: ['Nøyaktighet er et påkrevd heltall i cm. 1–3 gir Pass, 0 og verdier over 3 gir Sjekk, og negativt eller feil format gir Feil.', []],
  verticalAccuracy: ['NøyaktighetHøyde er et påkrevd heltall i cm. 1–5 gir Pass, 0 og verdier over 5 gir Sjekk, og negativt eller feil format gir Feil.', []],
  maxHorizontalDeviation: ['MaksAvvikHorisontalt er et påkrevd heltall i cm. 1–20 gir Pass, 0 gir Sjekk, og større, negative eller ugyldige verdier gir Feil.', []],
  maxVerticalDeviation: ['MaksAvvikVertikalt er et påkrevd heltall i cm. 1–30 gir Pass, 0 gir Sjekk, og større, negative eller ugyldige verdier gir Feil.', []],
  positioningCondition: ['Stedfestingsforhold er påkrevd. ÅPEN_GRØ og ÅPEN_KUM gir Pass; andre godkjente koder gir Sjekk.', []],
  positioningCause: ['Stedfestingsårsak er påkrevd og vurderes også mot brukbare NYTT-år i samme valgte levering og lag.', ['En ikke-NYTT-verdi med samme Anleggsår som et NYTT-objekt gir Sjekk.']],
  tema: ['Tema og S_FCODE er likeverdige identitetskilder. En godkjent verdi gir Pass; ugyldig, manglende eller uenig identitet håndteres før avhengige regler.', ['Når begge kolonner finnes i skjemaet, vises en egen Sjekk. Uenige gyldige objektverdier gir Sjekk og undertrykker kontekstuelle følgekonklusjoner.']],
  type: ['Type vurderes mot løst Tema. DIV krever Type; andre Tema med kjente Type-koblinger gir Sjekk ved fravær.', ['XLOK er godkjent sammen med Tema KUM. Ugyldig eller inkompatibel levert Type gir Feil.']],
  typeCompatibility: ['Levert godkjent Type må være tillatt for objektets løste Tema.', []],
  manholeShape: ['Kumform er kontekstavhengig etter eksplisitt Tema-applicability. Manglende verdi er Feil når feltet gjelder.', []],
  constructionMethod: ['Byggemetode er kontekstavhengig etter eksplisitt Tema-applicability. UK er gyldig, men gir Sjekk.', []],
  cone: ['Kjegle er kontekstavhengig etter eksplisitt Tema-applicability. Manglende verdi er Feil når feltet gjelder.', []],
  insideOutside: ['InnvendigUtvendig er påkrevd for punkt og ledning. Bare ID og OD er godkjent.', []],
  width: ['Bredde er et kontekstavhengig heltall i mm. Når feltet gjelder, gir minst 20 Pass og 0–19 Sjekk.', []],
  length: ['Lengde er valgfritt. En levert gyldig heltallsverdi fremheves alltid med Sjekk.', []],
  wallThickness: ['Punkt-Tykkelse er et kontekstavhengig heltall i mm. Positiv verdi gir Pass når feltet gjelder; 0 gir Sjekk.', []],
  externalHeight: ['Utvendig_høyde er valgfritt. En levert gyldig heltallsverdi fremheves alltid med Sjekk.', []],
  nobb: ['NOBB-VAVVS-nr er valgfritt og kontrolleres bare som heltall. Det gjøres ingen katalog- eller lengdekontroll.', ['Leverte heltall vises som lenker til nobb.no.']],
  frameNobb: ['NOBB-VAVVS-nr-ramme er valgfritt og kontrolleres bare som heltall. Det gjøres ingen katalog- eller lengdekontroll.', ['Leverte heltall vises som lenker til nobb.no.']],
  owner: ['Eier mangler eller AN gir Sjekk. Andre godkjente koder gir Pass; ukjent kode gir Feil.', []],
  access: ['Adkomst vurderes bare kontekstuelt for Tema KUM. Manglende KUM-verdi gir Sjekk; gyldig verdi på andre Tema gir Sjekk.', []],
  bottomDistance: ['Avst_BunnInnvUnderUtv er et kontekstavhengig vanlig tall med punktum eller komma. Positiv verdi gir Pass når feltet gjelder; 0 gir Sjekk.', []],
  optionalText: ['Merknad er valgfri og vises fremhevet når den er levert. Maksimum er 255 Unicode-kodepunkter, og whitespace teller.', []],
  lineWallThickness: ['Lednings-Tykkelse er påkrevd og bruker vanlig tallformat. Positiv verdi med høyst to desimaler gir Pass; 0 eller flere desimaler gir Sjekk.', []],
  material: ['Material er påkrevd og må være en av de 45 godkjente kodene. Ni foretrukne koder gir Pass; andre godkjente koder gir Sjekk.', []],
  networkType: ['Nett_type er påkrevd. F, H, O og S gir Pass; O1, O2, S6 og S7 gir Sjekk.', []],
  dimension: ['Dimensjon er et påkrevd heltall i mm. 0–31 gir Sjekk; minst 32 gir Pass.', []],
  verticalDimension: ['VertikalDimensjon avhenger av gyldig Rørform. Det er valgfritt for S og påkrevd for andre godkjente former.', ['For ikke-sirkulær form gir 1–30 Sjekk og minst 31 Pass.']],
  pipeShape: ['Rørform er påkrevd. A og X gir Sjekk; andre godkjente koder gir Pass.', []],
  sdr: ['SDR vurderes mot hydraulisk Tema og gyldig Material. Ugyldig levert verdi gir alltid Feil.', ['Trykkledning i godkjent SDR-materialfamilie krever SDR. Spesial-Tema gir Sjekk både med og uten verdi.']],
  ringStiffness: ['Ringstivhet vurderes mot hydraulisk Tema og gyldig Material. Ugyldig levert verdi gir alltid Feil.', ['Gravity-ledning i godkjent polymerfamilie krever Ringstivhet. Spesial-Tema gir Sjekk både med og uten verdi.']],
  pressureClass: ['Trykklasse vurderes bare mot hydraulisk Tema og avhenger ikke av Material.', ['Trykk-Tema med gyldig PN-verdi gir Pass og uten verdi Sjekk. Spesial-Tema gir Sjekk både med og uten verdi.']],
  visibility: ['Synbarhet er utgått i v3.2, men vises fortsatt når det er levert. Feltet valideres ikke og gir Pass.', []],
  facilityId: ['AnleggsID er valgfritt. En levert verdi fremheves med informativ Sjekk og mistenkes ikke derfor å være feil.', []],
  attachmentLink: ['S_HYPERLINK vurderes ut fra løst Tema, uten URL-syntakskontroll.', ['Vedlegg forventes for Byggemetode-aktuelle Tema. Gemini VA støtter ikke vedlegg på kumlokk (LOK/TOP); en levert lenke gir Feil og skal fjernes.']],
});

export function getFieldInformation(canonicalFieldId) {
  return byId.get(canonicalFieldId);
}

export function composeFieldInformation({ canonicalFieldId, geometryScope, rule }) {
  const information = getFieldInformation(canonicalFieldId);
  const canonicalField = getCanonicalField(canonicalFieldId);
  if (!information || !canonicalField || !rule) return null;
  const overlay = information.byGeometry?.[geometryScope] || {};
  const policyMetadata = POLICY_METADATA[rule.policy];
  const requiredness = OPTIONAL_POLICIES.has(rule.policy)
    ? 'NOT_REQUIRED'
    : CONDITIONAL_POLICIES.has(rule.policy)
      ? 'CONDITIONAL'
      : 'REQUIRED';
  return {
    ...information,
    ...overlay,
    canonicalFieldId,
    displayName: information.displayName,
    directGmiSourceKey: canonicalField.directGmiSourceKey,
    appliesTo: [...information.appliesTo],
    geometryScope,
    description: policyMetadata?.[0] || overlay.description || information.description,
    qualifications: policyMetadata
      ? policyMetadata[1].map((text) => ({ text, validationStatus: 'INFORMATIONAL' }))
      : overlay.qualifications || information.qualifications,
    documentationStatus: policyMetadata ? 'COMPLETE' : information.documentationStatus,
    required: requiredness !== 'NOT_REQUIRED',
    requiredness,
    allowedValues: [...(rule.allowedValues || [])],
    ruleId: rule.ruleId,
  };
}

export function getFieldInformationRegistry() {
  return FIELD_INFORMATION;
}
