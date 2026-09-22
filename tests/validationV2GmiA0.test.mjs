import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const {
  AuthorityState,
  BindingState,
  CaseNormalizationPolicy,
  Confidence,
  GeometryScope,
  MappingKind,
  ObjectValueState,
  SourceKind,
  TemaIdentityState,
  getCanonicalField,
  getCanonicalFieldByDirectSourceKey,
  getCanonicalFields,
  hasCanonicalField,
  validateCanonicalRegistry,
} = api;

const expectedDirectMappings = {
  access: 'Adkomst',
  attachmentLink: 'S_HYPERLINK',
  captureDate: 'Datafangstdato',
  caseNumber: 'Saksnummer',
  cone: 'Kjegle',
  constructionMethod: 'Byggemetode',
  dimension: 'Dimensjon',
  externalHeight: 'Utvendig_høyde',
  facilityId: 'AnleggsID',
  heightMeasurementMethod: 'MålemetodeHøyde',
  heightReference: 'Høydereferanse',
  horizontalAccuracy: 'Nøyaktighet',
  innerBottomToOuterUndersideDistance: 'Avst_BunnInnvUnderUtv',
  insideOutside: 'InnvendigUtvendig',
  installationYear: 'Anleggsår',
  length: 'Lengde',
  manholeShape: 'Kumform',
  material: 'Material',
  maxHorizontalDeviation: 'MaksAvvikHorisontalt',
  maxVerticalDeviation: 'MaksAvvikVertikalt',
  measurementMethod: 'Målemetode',
  networkType: 'Nett_type',
  nobbVavvsFrameNumber: 'NOBB-VAVVS-nr-ramme',
  nobbVavvsNumber: 'NOBB-VAVVS-nr',
  note: 'Merknad',
  owner: 'Eier',
  pipeShape: 'Rørform',
  positioningCause: 'Stedfestingsårsak',
  positioningCondition: 'Stedfestingsforhold',
  pressureClass: 'Trykklasse',
  ringStiffness: 'Ringstivhet',
  sdr: 'SDR',
  surveyedBy: 'Innmålt_av',
  tema: 'Tema',
  type: 'Type',
  verticalAccuracy: 'NøyaktighetHøyde',
  verticalDimension: 'VertikalDimensjon',
  verticalLevel: 'Vertikalnivå',
  visibility: 'Synbarhet',
  wallThickness: 'Tykkelse',
  width: 'Bredde',
};

test('the canonical registry has exactly 41 unique fields and direct mappings', () => {
  const fields = getCanonicalFields();
  const canonicalIds = fields.map((field) => field.canonicalFieldId);
  const directSourceKeys = fields.map((field) => field.directGmiSourceKey);
  const actualDirectMappings = Object.fromEntries(
    fields.map((field) => [field.canonicalFieldId, field.directGmiSourceKey])
  );

  assert.equal(fields.length, 41);
  assert.equal(new Set(canonicalIds).size, 41);
  assert.equal(new Set(directSourceKeys).size, 41);
  assert.deepEqual(actualDirectMappings, expectedDirectMappings);
  assert.equal(validateCanonicalRegistry(), true);
});

test('registry queries are exact, deterministic, and safe for unknown values', () => {
  assert.equal(getCanonicalField('tema').directGmiSourceKey, 'Tema');
  assert.equal(getCanonicalFieldByDirectSourceKey('Dimensjon').canonicalFieldId, 'dimension');
  assert.equal(getCanonicalFieldByDirectSourceKey('DIMENSJON'), undefined);
  assert.equal(getCanonicalField('doesNotExist'), undefined);
  assert.equal(hasCanonicalField('width'), true);
  assert.equal(hasCanonicalField('width_punkt'), false);
});

test('public registry data is deeply frozen', () => {
  const fields = getCanonicalFields();
  const tema = getCanonicalField('tema');

  assert(Object.isFrozen(fields));
  assert(Object.isFrozen(tema));
  assert(Object.isFrozen(tema.acceptedFallbackKeys));
  assert.throws(() => fields.push({}), TypeError);
  assert.throws(() => { tema.canonicalFieldId = 'changed'; }, TypeError);
  assert.throws(() => { tema.acceptedFallbackKeys.push('other'); }, TypeError);
  assert.equal(getCanonicalField('tema').canonicalFieldId, 'tema');
});

test('approved enum values are frozen and unique within each enum', () => {
  for (const enumValues of [
    GeometryScope,
    BindingState,
    ObjectValueState,
    TemaIdentityState,
    MappingKind,
    SourceKind,
    AuthorityState,
    Confidence,
    CaseNormalizationPolicy,
  ]) {
    assert(Object.isFrozen(enumValues));
    const values = Object.values(enumValues);
    assert.equal(new Set(values).size, values.length);
  }
});

test('geometry suffixes never become canonical or direct source identities', () => {
  const suffixKeys = [
    'InnvendigUtvendig_punkt',
    'InnvendigUtvendig_led',
    'Tykkelse_punkt',
    'Tykkelse_led',
    'Tema_punkt',
    'Tema_led',
    'NOBB-VAVVS-nr_punkt',
    'NOBB-VAVVS-nr_led',
    'S_HYPERLINK_punkt',
  ];
  const fields = getCanonicalFields();

  assert(fields.every((field) => !/_((punkt)|(led))$/.test(field.canonicalFieldId)));
  assert(fields.every((field) => !suffixKeys.includes(field.directGmiSourceKey)));
  for (const suffixKey of suffixKeys) {
    assert.equal(getCanonicalFieldByDirectSourceKey(suffixKey), undefined);
  }
});

test('Tema metadata preserves the approved fallback and unresolved candidates', () => {
  const tema = getCanonicalField('tema');

  assert.deepEqual(tema.acceptedFallbackKeys, ['S_FCODE']);
  assert.deepEqual(tema.disabledLegacyAliases, [
    'Tema_punkt',
    'Tema_led',
    'PTEMA',
    'LTEMA',
    'FCODE',
  ]);
  assert.deepEqual(tema.recognizedUnresolvedKeys, ['.P_TEMA', '.L_TEMA']);
  assert.equal(tema.recognizedUnresolvedKeys.includes('S_FCODE'), false);
  assert.equal(tema.acceptedFallbackKeys.includes('.P_TEMA'), false);
  assert.equal(tema.acceptedFallbackKeys.includes('.L_TEMA'), false);
});

test('Trykklasse preserves the direct key and approved alias policy', () => {
  const pressureClass = getCanonicalField('pressureClass');

  assert.equal(pressureClass.directGmiSourceKey, 'Trykklasse');
  assert.equal(pressureClass.disabledLegacyAliases.includes('TRYKKLASSE'), false);
  assert.equal(pressureClass.disabledLegacyAliases.includes('TRYKKKLASSE'), true);
  assert.equal(pressureClass.disabledLegacyAliases.includes('PN'), true);
});

test('width and dimension remain geometry-separated without resolver behavior', () => {
  const width = getCanonicalField('width');
  const dimension = getCanonicalField('dimension');

  assert.equal(width.directGmiSourceKey, 'Bredde');
  assert.deepEqual(width.expectedRuleScopes, ['point']);
  assert.deepEqual(width.acceptedFallbackKeys, []);
  for (const rejected of ['DIM', 'DIMENSJON', 'Dimensjon', 'DIAMETER']) {
    assert.equal(width.acceptedFallbackKeys.includes(rejected), false);
  }

  assert.equal(dimension.directGmiSourceKey, 'Dimensjon');
  assert.deepEqual(dimension.expectedRuleScopes, ['line']);
  assert.deepEqual(dimension.acceptedFallbackKeys, []);
  assert.equal(dimension.recognizedUnresolvedKeys.includes('DIM'), true);
});

test('XY and Z measurement concepts are four independent canonical entries', () => {
  const measurements = [
    ['measurementMethod', 'Målemetode'],
    ['horizontalAccuracy', 'Nøyaktighet'],
    ['heightMeasurementMethod', 'MålemetodeHøyde'],
    ['verticalAccuracy', 'NøyaktighetHøyde'],
  ];

  assert.equal(new Set(measurements.map(([fieldId]) => fieldId)).size, 4);
  for (const [fieldId, sourceKey] of measurements) {
    assert.equal(getCanonicalField(fieldId).directGmiSourceKey, sourceKey);
    assert.deepEqual(getCanonicalField(fieldId).acceptedFallbackKeys, []);
  }
  assert.equal(getCanonicalField('horizontalAccuracy').disabledLegacyAliases.includes('H_MÅLEMETODE'), true);
  assert.equal(getCanonicalField('horizontalAccuracy').disabledLegacyAliases.includes('H_NOYAKTIGHET'), true);
  assert.equal(getCanonicalField('verticalAccuracy').disabledLegacyAliases.includes('H_NOYAKTIGHET'), true);
});

test('structural validation rejects a malformed registry without resolving fields', () => {
  const malformed = getCanonicalFields().slice(0, 40);
  assert.throws(
    () => validateCanonicalRegistry(malformed),
    /expected 41 fields/
  );
});

test('V2 runtime modules stay isolated from legacy code and planning JSON', async () => {
  const runtimePaths = [
    '../src/lib/validation-v2/contracts.js',
    '../src/lib/validation-v2/index.js',
    '../src/lib/validation-v2/registry/fields.js',
    '../src/lib/validation-v2/registry/registry.js',
  ];
  const source = await Promise.all(
    runtimePaths.map((relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8'))
  );
  const runtimeSource = source.join('\n');

  for (const forbiddenImport of [
    'src/lib/validation/fieldValidation.js',
    'src/data/fields.json',
    'src/lib/validation/validator.js',
    'gmi-adapter-spec.json',
    'gmi-adapter-test-vectors.json',
  ]) {
    assert.equal(runtimeSource.includes(forbiddenImport), false, forbiddenImport);
  }
  assert.equal('resolveField' in api, false);
  assert.equal('bindSchema' in api, false);
  assert.equal('resolveTema' in api, false);
  assert.equal('extractObjectValue' in api, false);
  assert.equal('runValidationV2' in api, false);
});
