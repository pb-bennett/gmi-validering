import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const { bindGmiLayerSchemaWithRegistry } = await import(
  '../src/lib/validation-v2/gmiLayerSchemaBinding.js'
);
const {
  BindingState,
  GeometryScope,
  MappingKind,
  SourceFieldDiagnosticKind,
  bindGmiLayerSchema,
  getCanonicalFields,
} = api;

const revision = 'synthetic-rev-a1';

function input(dataset, overrides = {}) {
  return {
    layerId: 'layer-a',
    dataset,
    datasetRevision: revision,
    sourceFormat: 'gmi',
    ...overrides,
  };
}

function getBinding(result, geometryScope, canonicalFieldId) {
  return result.bindings.find(
    (binding) =>
      binding.geometryScope === geometryScope &&
      binding.canonicalFieldId === canonicalFieldId
  );
}

function getDiagnostic(result, geometryScope, sourceKey) {
  return result.sourceFieldDiagnostics.find(
    (diagnostic) =>
      diagnostic.geometryScope === geometryScope &&
      diagnostic.sourceKey === sourceKey
  );
}

test('rejects malformed one-layer input explicitly', () => {
  assert.throws(() => bindGmiLayerSchema(), /input object/);
  assert.throws(
    () => bindGmiLayerSchema(input({}, { layerId: ' ' })),
    /non-empty layerId/
  );
  assert.throws(
    () => bindGmiLayerSchema(input(null)),
    /dataset object/
  );
  assert.throws(
    () => bindGmiLayerSchema(input({}, { datasetRevision: '' })),
    /non-empty datasetRevision/
  );
  for (const datasetRevision of [123, {}, null, ' ', '\t']) {
    assert.throws(
      () => bindGmiLayerSchema(input({}, { datasetRevision })),
      /non-empty datasetRevision/
    );
  }
  assert.throws(
    () => bindGmiLayerSchema(input({}, { sourceFormat: 'GMI' })),
    /exactly gmi/
  );
});

test('binds an exact direct field from explicit fieldAnalysis metadata', () => {
  const result = bindGmiLayerSchema(input({
    fieldAnalysis: {
      points: { Høydereferanse: { present: false } },
    },
  }));
  const binding = getBinding(result, GeometryScope.POINT, 'heightReference');

  assert.equal(binding.state, BindingState.BOUND);
  assert.equal(binding.preferredSourceKey, 'Høydereferanse');
  assert.equal(binding.mappingKind, MappingKind.DIRECT);
  assert.deepEqual(binding.candidates.map((candidate) => candidate.sourceKey), [
    'Høydereferanse',
  ]);
  assert.equal(binding.layerId, 'layer-a');
  assert.equal(binding.datasetRevision, revision);
  assert.equal(result.geometryContexts.point.schemaSource, 'FIELD_ANALYSIS');
});

test('parameterized direct mappings bind all 41 canonical fields without scope filtering', () => {
  for (const field of getCanonicalFields()) {
    const result = bindGmiLayerSchema(input({
      fieldAnalysis: { points: { [field.directGmiSourceKey]: {} } },
    }));
    const binding = getBinding(result, GeometryScope.POINT, field.canonicalFieldId);

    assert.equal(binding.state, BindingState.BOUND, field.canonicalFieldId);
    assert.equal(binding.preferredSourceKey, field.directGmiSourceKey);
    assert.equal(binding.mappingKind, MappingKind.DIRECT);
  }
});

test('matches only conservative Unicode case-only variants', () => {
  const result = bindGmiLayerSchema(input({
    fieldAnalysis: {
      lines: {
        MATERIAL: {},
        DIMENSJON: {},
        TRYKKLASSE: {},
        HOYDEREFERANSE: {},
        MALEMETODE: {},
        NETTTYPE: {},
      },
    },
  }));

  assert.equal(getBinding(result, GeometryScope.LINE, 'material').mappingKind, MappingKind.CASE_NORMALIZED);
  assert.equal(getBinding(result, GeometryScope.LINE, 'dimension').mappingKind, MappingKind.CASE_NORMALIZED);
  assert.equal(getBinding(result, GeometryScope.LINE, 'pressureClass').mappingKind, MappingKind.CASE_NORMALIZED);
  for (const fieldId of ['heightReference', 'measurementMethod', 'networkType']) {
    assert.equal(getBinding(result, GeometryScope.LINE, fieldId).state, BindingState.UNRESOLVED_SOURCE);
  }
  assert.equal(getDiagnostic(result, GeometryScope.LINE, 'HOYDEREFERANSE').classification, SourceFieldDiagnosticKind.DISABLED_UNSUPPORTED);
  assert.equal(getDiagnostic(result, GeometryScope.LINE, 'MALEMETODE').classification, SourceFieldDiagnosticKind.DISABLED_UNSUPPORTED);
  assert.equal(getDiagnostic(result, GeometryScope.LINE, 'NETTTYPE').classification, SourceFieldDiagnosticKind.DISABLED_UNSUPPORTED);
});

test('accepts only S_FCODE as the schema-level Tema fallback', () => {
  const fallback = bindGmiLayerSchema(input({
    fieldAnalysis: { points: { S_FCODE: {} } },
  }));
  const both = bindGmiLayerSchema(input({
    fieldAnalysis: { points: { Tema: {}, S_FCODE: {} } },
  }));
  const fallbackBinding = getBinding(fallback, GeometryScope.POINT, 'tema');
  const bothBinding = getBinding(both, GeometryScope.POINT, 'tema');

  assert.equal(fallbackBinding.state, BindingState.BOUND);
  assert.equal(fallbackBinding.preferredSourceKey, 'S_FCODE');
  assert.equal(fallbackBinding.mappingKind, MappingKind.ACCEPTED_FALLBACK);
  assert.equal(bothBinding.state, BindingState.MULTIPLE_ACCEPTED);
  assert.equal(bothBinding.preferredSourceKey, 'Tema');
  assert.deepEqual(bothBinding.candidates.map((candidate) => candidate.sourceKey), [
    'Tema',
    'S_FCODE',
  ]);
  assert.equal(bothBinding.conflicts.length, 0);
});

test('keeps Tema unsupported candidates unresolved and non-authoritative', () => {
  const result = bindGmiLayerSchema(input({
    fieldAnalysis: {
      points: {
        '.P_TEMA': {},
        PTEMA: {},
        LTEMA: {},
        FCODE: {},
      },
    },
  }));
  const binding = getBinding(result, GeometryScope.POINT, 'tema');

  assert.equal(binding.state, BindingState.UNRESOLVED_SOURCE);
  assert.equal(binding.preferredSourceKey, null);
  assert.deepEqual(
    binding.candidates.map((candidate) => candidate.sourceKey).sort(),
    ['.P_TEMA', 'PTEMA', 'LTEMA', 'FCODE'].sort()
  );
  assert.equal(getDiagnostic(result, GeometryScope.POINT, '.P_TEMA').classification, SourceFieldDiagnosticKind.RECOGNIZED_UNRESOLVED);
  assert.equal(getDiagnostic(result, GeometryScope.POINT, 'PTEMA').classification, SourceFieldDiagnosticKind.DISABLED_UNSUPPORTED);
  assert.equal(getDiagnostic(result, GeometryScope.POINT, 'LTEMA').classification, SourceFieldDiagnosticKind.DISABLED_UNSUPPORTED);
  assert.equal(getDiagnostic(result, GeometryScope.POINT, 'FCODE').classification, SourceFieldDiagnosticKind.DISABLED_UNSUPPORTED);
});

test('keeps .L_TEMA, HREF, and DIM unresolved without cross-mapping', () => {
  const result = bindGmiLayerSchema(input({
    fieldAnalysis: {
      lines: {
        '.L_TEMA': {},
        HREF: {},
        DIM: {},
      },
    },
  }));

  assert.equal(getBinding(result, GeometryScope.LINE, 'tema').state, BindingState.UNRESOLVED_SOURCE);
  assert.equal(getBinding(result, GeometryScope.LINE, 'heightReference').state, BindingState.UNRESOLVED_SOURCE);
  assert.equal(getBinding(result, GeometryScope.LINE, 'dimension').state, BindingState.UNRESOLVED_SOURCE);
  assert.equal(getDiagnostic(result, GeometryScope.LINE, '.L_TEMA').classification, SourceFieldDiagnosticKind.RECOGNIZED_UNRESOLVED);
  assert.equal(getDiagnostic(result, GeometryScope.LINE, 'HREF').classification, SourceFieldDiagnosticKind.RECOGNIZED_UNRESOLVED);
  assert.equal(getDiagnostic(result, GeometryScope.LINE, 'DIM').classification, SourceFieldDiagnosticKind.RECOGNIZED_UNRESOLVED);
  assert.equal(getBinding(result, GeometryScope.LINE, 'width').state, BindingState.UNRESOLVED_SOURCE);
});

test('binds Bredde to point width and Dimensjon to line dimension only', () => {
  const result = bindGmiLayerSchema(input({
    fieldAnalysis: {
      points: { Bredde: {}, DIMENSJON: {} },
      lines: { Dimensjon: {} },
    },
  }));

  assert.equal(getBinding(result, GeometryScope.POINT, 'width').state, BindingState.BOUND);
  assert.equal(getBinding(result, GeometryScope.POINT, 'width').preferredSourceKey, 'Bredde');
  assert.equal(getBinding(result, GeometryScope.POINT, 'dimension').state, BindingState.BOUND);
  assert.equal(getBinding(result, GeometryScope.POINT, 'dimension').mappingKind, MappingKind.CASE_NORMALIZED);
  assert.equal(getBinding(result, GeometryScope.LINE, 'dimension').state, BindingState.BOUND);
  assert.equal(getBinding(result, GeometryScope.LINE, 'dimension').mappingKind, MappingKind.DIRECT);
  assert.equal(getBinding(result, GeometryScope.LINE, 'width').state, BindingState.UNRESOLVED_SOURCE);
  assert.equal(getDiagnostic(result, GeometryScope.POINT, 'DIMENSJON'), undefined);
});

test('accepted canonical evidence suppresses cross-target unsupported diagnostics', () => {
  const cases = [
    ['Dimensjon', 'dimension', GeometryScope.POINT],
    ['Kumform', 'manholeShape', GeometryScope.POINT],
    ['Rørform', 'pipeShape', GeometryScope.LINE],
  ];

  for (const [sourceKey, canonicalFieldId, geometryScope] of cases) {
    const result = bindGmiLayerSchema(input({
      fieldAnalysis: {
        [geometryScope === GeometryScope.POINT ? 'points' : 'lines']: {
          [sourceKey]: {},
        },
      },
    }));
    const binding = getBinding(result, geometryScope, canonicalFieldId);

    assert.equal(binding.state, BindingState.BOUND, sourceKey);
    assert.equal(binding.preferredSourceKey, sourceKey);
    assert.equal(getDiagnostic(result, geometryScope, sourceKey), undefined);
  }
});

test('does not accept any of the nine geometry-suffixed source keys', () => {
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
  const result = bindGmiLayerSchema(input({
    fieldAnalysis: { points: Object.fromEntries(suffixKeys.map((key) => [key, {}])) },
  }));

  for (const fieldId of [
    'insideOutside',
    'wallThickness',
    'tema',
    'nobbVavvsNumber',
    'attachmentLink',
  ]) {
    assert.equal(getBinding(result, GeometryScope.POINT, fieldId).state, BindingState.UNRESOLVED_SOURCE);
  }
  assert.equal(
    result.bindings.filter((binding) => binding.geometryScope === GeometryScope.POINT && binding.state === BindingState.BOUND).length,
    0
  );
});

test('reports FIELD_ABSENT for known empty schemas and SCHEMA_UNAVAILABLE otherwise', () => {
  const known = bindGmiLayerSchema(input({
    fieldAnalysis: { points: {} },
  }));
  const unavailable = bindGmiLayerSchema(input({}));

  assert.equal(getBinding(known, GeometryScope.POINT, 'tema').state, BindingState.FIELD_ABSENT);
  assert.equal(getBinding(known, GeometryScope.LINE, 'tema').state, BindingState.SCHEMA_UNAVAILABLE);
  assert.equal(getBinding(unavailable, GeometryScope.POINT, 'tema').state, BindingState.SCHEMA_UNAVAILABLE);
  assert.equal(getBinding(unavailable, GeometryScope.LINE, 'tema').state, BindingState.SCHEMA_UNAVAILABLE);
});

test('explicit fieldAnalysis metadata takes precedence over attribute-key fallback', () => {
  const dataset = {
    fieldAnalysis: { points: { Tema: {} }, lines: {} },
    lines: [],
  };
  Object.defineProperty(dataset, 'points', {
    enumerable: true,
    get() {
      throw new Error('point attributes must not be inspected when fieldAnalysis exists');
    },
  });

  const result = bindGmiLayerSchema(input(dataset));
  assert.equal(result.geometryContexts.point.schemaSource, 'FIELD_ANALYSIS');
  assert.equal(getBinding(result, GeometryScope.POINT, 'tema').state, BindingState.BOUND);
});

test('explicit all-null field metadata still proves schema presence', () => {
  const result = bindGmiLayerSchema(input({
    fieldAnalysis: {
      lines: {
        Ringstivhet: { present: false, nullCount: 2, totalCount: 2 },
      },
    },
    lines: [
      { attributes: { Ringstivhet: null } },
      { attributes: { Ringstivhet: null } },
    ],
  }));

  const binding = getBinding(result, GeometryScope.LINE, 'ringStiffness');
  assert.equal(binding.state, BindingState.BOUND);
  assert.equal(binding.preferredSourceKey, 'Ringstivhet');
});

test('attribute fallback uses same-geometry objects and reads keys without reading values', () => {
  const pointAttributes = {};
  Object.defineProperty(pointAttributes, 'Bredde', {
    enumerable: true,
    get() {
      throw new Error('attribute value must not be read');
    },
  });
  const dataset = {
    points: [{ attributes: pointAttributes }],
    lines: [{ attributes: { Dimensjon: 200 } }],
  };
  const result = bindGmiLayerSchema(input(dataset));

  assert.equal(result.geometryContexts.point.schemaSource, 'FEATURE_ATTRIBUTES');
  assert.equal(result.geometryContexts.line.schemaSource, 'FEATURE_ATTRIBUTES');
  assert.equal(getBinding(result, GeometryScope.POINT, 'width').state, BindingState.BOUND);
  assert.equal(getBinding(result, GeometryScope.POINT, 'dimension').state, BindingState.FIELD_ABSENT);
  assert.equal(getBinding(result, GeometryScope.LINE, 'dimension').state, BindingState.BOUND);
  assert.equal(getBinding(result, GeometryScope.LINE, 'width').state, BindingState.UNRESOLVED_SOURCE);
});

test('preserves multiple accepted case variants without reading values', () => {
  const result = bindGmiLayerSchema(input({
    fieldAnalysis: { lines: { Material: {}, MATERIAL: {} } },
  }));
  const binding = getBinding(result, GeometryScope.LINE, 'material');

  assert.equal(binding.state, BindingState.MULTIPLE_ACCEPTED);
  assert.equal(binding.preferredSourceKey, 'Material');
  assert.deepEqual(binding.candidates.map((candidate) => candidate.sourceKey), [
    'Material',
    'MATERIAL',
  ]);
});

test('inventories unknown fields separately from recognized unresolved fields', () => {
  const result = bindGmiLayerSchema(input({
    fieldAnalysis: {
      points: {
        CUSTOM_FIELD_X: {},
        HREF: {},
        Material: {},
      },
    },
  }));

  const unknown = getDiagnostic(result, GeometryScope.POINT, 'CUSTOM_FIELD_X');
  const unresolved = getDiagnostic(result, GeometryScope.POINT, 'HREF');

  assert.equal(unknown.classification, SourceFieldDiagnosticKind.UNKNOWN_SOURCE_FIELD);
  assert.deepEqual(unknown.possibleCanonicalFieldIds, []);
  assert.equal(unresolved.classification, SourceFieldDiagnosticKind.RECOGNIZED_UNRESOLVED);
  assert.deepEqual(unresolved.possibleCanonicalFieldIds, ['heightReference']);
  assert.equal(getDiagnostic(result, GeometryScope.POINT, 'Material'), undefined);
  assert.equal(getBinding(result, GeometryScope.POINT, 'access').state, BindingState.FIELD_ABSENT);
  assert.equal('errors' in result, false);
});

test('does not inspect global or extra-layer data', () => {
  const previous = globalThis.getVisibleLayersData;
  globalThis.getVisibleLayersData = () => {
    throw new Error('global layer state must not be read');
  };
  const dataset = { fieldAnalysis: { points: { Tema: {} }, lines: {} } };
  Object.defineProperty(dataset, 'layers', {
    enumerable: true,
    get() {
      throw new Error('other layers must not be read');
    },
  });

  try {
    const result = bindGmiLayerSchema(input(dataset));
    assert.equal(result.layerId, 'layer-a');
    assert.equal(result.datasetRevision, revision);
  } finally {
    if (previous === undefined) {
      delete globalThis.getVisibleLayersData;
    } else {
      globalThis.getVisibleLayersData = previous;
    }
  }
});

test('returns immutable binding records and leaves the input dataset unchanged', () => {
  const dataset = {
    fieldAnalysis: { points: { Tema: {} }, lines: {} },
  };
  const before = JSON.stringify(dataset);
  const result = bindGmiLayerSchema(input(dataset));

  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result.bindings));
  assert(Object.isFrozen(result.bindings[0]));
  assert(Object.isFrozen(result.geometryContexts));
  assert.throws(() => result.bindings.push({}), TypeError);
  assert.equal(JSON.stringify(dataset), before);
});

test('AMBIGUOUS bindings retain every competing canonical target', () => {
  const collisionFields = [
    {
      canonicalFieldId: 'syntheticFirst',
      directGmiSourceKey: 'COLLISION',
      acceptedFallbackKeys: [],
      disabledLegacyAliases: [],
      recognizedUnresolvedKeys: [],
      mappingEvidenceConfidence: 'HIGH',
    },
    {
      canonicalFieldId: 'syntheticSecond',
      directGmiSourceKey: 'COLLISION',
      acceptedFallbackKeys: [],
      disabledLegacyAliases: [],
      recognizedUnresolvedKeys: [],
      mappingEvidenceConfidence: 'HIGH',
    },
  ];
  const result = bindGmiLayerSchemaWithRegistry(
    input({ fieldAnalysis: { points: { COLLISION: {} } } }),
    collisionFields
  );
  const expectedTargets = ['syntheticFirst', 'syntheticSecond'];

  for (const canonicalFieldId of expectedTargets) {
    const binding = getBinding(result, GeometryScope.POINT, canonicalFieldId);
    assert.equal(binding.state, BindingState.AMBIGUOUS);
    assert.deepEqual(binding.candidates.map((candidate) => candidate.sourceKey), ['COLLISION']);
    assert.deepEqual([...binding.conflicts[0].canonicalFieldIds].sort(), expectedTargets);
  }
});

test('A1 runtime has no planning or legacy dependencies and exposes no later APIs', async () => {
  const runtimePaths = [
    '../src/lib/validation-v2/contracts.js',
    '../src/lib/validation-v2/index.js',
    '../src/lib/validation-v2/gmiLayerSchemaBinding.js',
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
  assert.equal('extractObjectValue' in api, false);
  assert.equal('resolveTemaIdentity' in api, false);
  assert.equal('runValidationV2' in api, false);
  assert.equal('bindGmiLayerSchemaWithRegistry' in api, false);
});
