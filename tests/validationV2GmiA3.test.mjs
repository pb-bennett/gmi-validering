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
  TemaIdentityState,
  bindGmiLayerSchema,
  createObjectRef,
  resolveGmiTemaIdentity,
} = api;

const layerId = 'layer-a';
const datasetRevision = 'synthetic-rev-a3';

function makeDataset({
  pointSchema,
  lineSchema,
  pointAttributes = {},
  lineAttributes = {},
  points,
  lines,
} = {}) {
  const dataset = {
    points: points ?? [{ attributes: pointAttributes }],
    lines: lines ?? [{ attributes: lineAttributes }],
  };
  if (pointSchema !== undefined || lineSchema !== undefined) {
    dataset.fieldAnalysis = {};
    if (pointSchema !== undefined) dataset.fieldAnalysis.points = pointSchema;
    if (lineSchema !== undefined) dataset.fieldAnalysis.lines = lineSchema;
  }
  return dataset;
}

function makeInput(dataset, overrides = {}) {
  return {
    layerId,
    dataset,
    datasetRevision,
    sourceFormat: 'gmi',
    ...overrides,
  };
}

function makeObjectRef(geometryScope = GeometryScope.POINT, objectIndex = 0, overrides = {}) {
  return createObjectRef({
    layerId,
    datasetRevision,
    geometryScope,
    objectIndex,
    ...overrides,
  });
}

function resolveFixture({
  geometryScope = GeometryScope.POINT,
  pointSchema = { Tema: {} },
  lineSchema = {},
  pointAttributes = {},
  lineAttributes = {},
  points,
  lines,
  objectIndex = 0,
} = {}) {
  const dataset = makeDataset({
    pointSchema,
    lineSchema,
    pointAttributes,
    lineAttributes,
    points,
    lines,
  });
  const schemaBinding = bindGmiLayerSchema(makeInput(dataset));
  const objectRef = makeObjectRef(geometryScope, objectIndex);
  const result = resolveGmiTemaIdentity({
    ...makeInput(dataset),
    schemaBinding,
    objectRef,
  });
  return { dataset, schemaBinding, objectRef, result };
}

test('resolves direct Tema for point and line ObjectRefs only in their own collections', () => {
  const point = resolveFixture({
    pointAttributes: { Tema: 'POINT_TEMA' },
    lineAttributes: { Tema: 'LINE_TEMA' },
    lineSchema: { Tema: {} },
  });
  const lineDataset = point.dataset;
  const lineSchemaBinding = point.schemaBinding;
  const lineRef = makeObjectRef(GeometryScope.LINE);
  const lineResult = resolveGmiTemaIdentity({
    ...makeInput(lineDataset),
    schemaBinding: lineSchemaBinding,
    objectRef: lineRef,
  });

  assert.equal(point.result.state, TemaIdentityState.RESOLVED);
  assert.equal(point.result.resolvedValue, 'POINT_TEMA');
  assert.equal(point.result.objectRef.geometryScope, GeometryScope.POINT);
  assert.equal(lineResult.state, TemaIdentityState.RESOLVED);
  assert.equal(lineResult.resolvedValue, 'LINE_TEMA');
  assert.equal(lineResult.objectRef.geometryScope, GeometryScope.LINE);
});

test('rejects schema, layer, revision, source, and ObjectRef ownership mismatches', () => {
  const fixture = resolveFixture({ pointAttributes: { Tema: 'VL' } });
  const otherLayerRef = makeObjectRef(GeometryScope.POINT, 0, { layerId: 'layer-b' });
  const otherRevisionRef = makeObjectRef(GeometryScope.POINT, 0, { datasetRevision: 'other-rev' });

  assert.throws(
    () => resolveGmiTemaIdentity({
      ...makeInput(fixture.dataset),
      schemaBinding: fixture.schemaBinding,
      objectRef: otherLayerRef,
    }),
    /different layer/
  );
  assert.throws(
    () => resolveGmiTemaIdentity({
      ...makeInput(fixture.dataset),
      schemaBinding: fixture.schemaBinding,
      objectRef: otherRevisionRef,
    }),
    /different dataset revision/
  );
  assert.throws(
    () => resolveGmiTemaIdentity({
      ...makeInput(fixture.dataset, { layerId: 'layer-b' }),
      schemaBinding: fixture.schemaBinding,
      objectRef: makeObjectRef(GeometryScope.POINT, 0, { layerId: 'layer-b' }),
    }),
    /schemaBinding belongs to a different layer/
  );
  assert.throws(
    () => resolveGmiTemaIdentity({
      ...makeInput(fixture.dataset, { datasetRevision: 'other-rev' }),
      schemaBinding: fixture.schemaBinding,
      objectRef: makeObjectRef(GeometryScope.POINT, 0, { datasetRevision: 'other-rev' }),
    }),
    /schemaBinding belongs to a different dataset revision/
  );
  assert.throws(
    () => resolveGmiTemaIdentity({
      ...makeInput(fixture.dataset),
      schemaBinding: { ...fixture.schemaBinding, sourceFormat: 'sosi' },
      objectRef: fixture.objectRef,
    }),
    /schemaBinding has an unsupported source format/
  );
});

test('rejects out-of-range point and line refs without cross-geometry fallback', () => {
  const pointDataset = makeDataset({
    pointSchema: { Tema: {} },
    points: [{ attributes: { Tema: 'VL' } }],
    lines: [{ attributes: { Tema: 'LINE' } }, { attributes: { Tema: 'LINE2' } }],
  });
  const pointSchemaBinding = bindGmiLayerSchema(makeInput(pointDataset));
  assert.throws(
    () => resolveGmiTemaIdentity({
      ...makeInput(pointDataset),
      schemaBinding: pointSchemaBinding,
      objectRef: makeObjectRef(GeometryScope.POINT, 1),
    }),
    /outside the selected dataset geometry/
  );

  const lineDataset = makeDataset({
    geometryScope: GeometryScope.LINE,
    pointSchema: {},
    lineSchema: { Tema: {} },
    points: [{ attributes: { Tema: 'POINT' } }, { attributes: { Tema: 'POINT2' } }],
    lines: [{ attributes: { Tema: 'LINE' } }],
  });
  const lineSchemaBinding = bindGmiLayerSchema(makeInput(lineDataset));
  assert.throws(
    () => resolveGmiTemaIdentity({
      ...makeInput(lineDataset),
      schemaBinding: lineSchemaBinding,
      objectRef: makeObjectRef(GeometryScope.LINE, 1),
    }),
    /outside the selected dataset geometry/
  );
});

test('resolves exact and case-only direct Tema candidates', () => {
  const exact = resolveFixture({ pointAttributes: { Tema: 'VL' } });
  const caseOnly = resolveFixture({
    pointSchema: { TEMA: {} },
    pointAttributes: { TEMA: 'SP' },
  });

  assert.equal(exact.result.state, TemaIdentityState.RESOLVED);
  assert.equal(exact.result.preferredSourceKey, 'Tema');
  assert.equal(exact.result.mappingKind, MappingKind.DIRECT);
  assert.equal(caseOnly.result.state, TemaIdentityState.RESOLVED);
  assert.equal(caseOnly.result.preferredSourceKey, 'TEMA');
  assert.equal(caseOnly.result.mappingKind, MappingKind.CASE_NORMALIZED);
});

test('resolves exact and case-only S_FCODE fallback candidates', () => {
  const exact = resolveFixture({
    pointSchema: { S_FCODE: {} },
    pointAttributes: { S_FCODE: 'VL' },
  });
  const caseOnly = resolveFixture({
    pointSchema: { s_fcode: {} },
    pointAttributes: { s_fcode: 'SP' },
  });

  assert.equal(exact.result.state, TemaIdentityState.RESOLVED);
  assert.equal(exact.result.preferredSourceKey, 'S_FCODE');
  assert.equal(exact.result.mappingKind, MappingKind.ACCEPTED_FALLBACK);
  assert.equal(caseOnly.result.state, TemaIdentityState.RESOLVED);
  assert.equal(caseOnly.result.preferredSourceKey, 's_fcode');
  assert.equal(caseOnly.result.mappingKind, MappingKind.ACCEPTED_FALLBACK);
});

test('preserves direct/fallback coexistence and reports conflicts without a winner', () => {
  const equal = resolveFixture({
    pointSchema: { Tema: {}, S_FCODE: {} },
    pointAttributes: { Tema: 'VL', S_FCODE: 'VL' },
  });
  const conflict = resolveFixture({
    pointSchema: { Tema: {}, S_FCODE: {} },
    pointAttributes: { Tema: 'VL', S_FCODE: 'SP' },
  });

  assert.equal(equal.result.state, TemaIdentityState.RESOLVED);
  assert.equal(equal.result.preferredSourceKey, 'Tema');
  assert.deepEqual(equal.result.observations.map((observation) => observation.sourceKey), [
    'Tema',
    'S_FCODE',
  ]);
  assert.equal(conflict.result.state, TemaIdentityState.CONFLICT);
  assert.equal(conflict.result.resolvedValue, null);
  assert.equal(conflict.result.preferredSourceKey, null);
  assert.deepEqual(
    conflict.result.conflicts.map((observation) => observation.rawValue),
    ['VL', 'SP']
  );
});

test('uses object-level fallback and distinguishes missing accepted values', () => {
  const fallback = resolveFixture({
    pointSchema: { Tema: {}, S_FCODE: {} },
    pointAttributes: { Tema: null, S_FCODE: 'VL' },
  });
  const direct = resolveFixture({
    pointSchema: { Tema: {}, S_FCODE: {} },
    pointAttributes: { Tema: 'VL', S_FCODE: null },
  });
  const missing = resolveFixture({
    pointSchema: { Tema: {}, S_FCODE: {} },
    pointAttributes: { Tema: null, S_FCODE: '' },
  });

  assert.equal(fallback.result.state, TemaIdentityState.RESOLVED);
  assert.equal(fallback.result.preferredSourceKey, 'S_FCODE');
  assert.equal(direct.result.state, TemaIdentityState.RESOLVED);
  assert.equal(direct.result.preferredSourceKey, 'Tema');
  assert.equal(missing.result.state, TemaIdentityState.MISSING);
  assert.equal(missing.result.observations[0].valueState, 'VALUE_MISSING');
});

test('applies the explicit missing-value policy without trimming or coercion', () => {
  for (const missingValue of [undefined, null, '']) {
    const fixture = resolveFixture({ pointAttributes: { Tema: missingValue } });
    assert.equal(fixture.result.state, TemaIdentityState.MISSING);
  }
  for (const presentValue of [0, false, '0', '   ']) {
    const fixture = resolveFixture({ pointAttributes: { Tema: presentValue } });
    assert.equal(fixture.result.state, TemaIdentityState.RESOLVED);
    assert.equal(fixture.result.resolvedValue, presentValue);
  }
});

test('compares raw values strictly with Object.is', () => {
  for (const [directValue, fallbackValue] of [
    ['VL', 'vl'],
    ['VL', ' VL '],
    ['12', 12],
  ]) {
    const fixture = resolveFixture({
      pointSchema: { Tema: {}, S_FCODE: {} },
      pointAttributes: { Tema: directValue, S_FCODE: fallbackValue },
    });
    assert.equal(fixture.result.state, TemaIdentityState.CONFLICT);
  }
});

test('returns UNRESOLVED_SOURCE without reading unresolved or disabled values', () => {
  for (const sourceKey of ['.P_TEMA', 'PTEMA', 'LTEMA', 'FCODE']) {
    const attributes = {};
    Object.defineProperty(attributes, sourceKey, {
      enumerable: true,
      get() {
        throw new Error('unsupported Tema value must not be read');
      },
    });
    const fixture = resolveFixture({
      pointSchema: { [sourceKey]: {} },
      pointAttributes: attributes,
    });
    assert.equal(fixture.result.state, TemaIdentityState.UNRESOLVED_SOURCE, sourceKey);
    assert.equal(fixture.result.observations.length, 0);
    assert.equal(fixture.result.unresolvedCandidates[0].sourceKey, sourceKey);
  }
});

test('returns MISSING for FIELD_ABSENT and does not let unsupported fields rescue it', () => {
  const absentAttributes = {};
  Object.defineProperty(absentAttributes, 'Tema', {
    enumerable: true,
    get() {
      throw new Error('FIELD_ABSENT must not read object attributes');
    },
  });
  const absent = resolveFixture({
    pointSchema: { CUSTOM_FIELD: {} },
    pointAttributes: absentAttributes,
  });
  const unsupportedAttributes = { Tema: null };
  Object.defineProperty(unsupportedAttributes, 'PTEMA', {
    enumerable: true,
    get() {
      throw new Error('unsupported Tema value must not rescue missing direct value');
    },
  });
  const unsupported = resolveFixture({
    pointSchema: { Tema: {}, PTEMA: {} },
    pointAttributes: unsupportedAttributes,
  });

  assert.equal(absent.result.state, TemaIdentityState.MISSING);
  assert.equal(absent.result.bindingState, BindingState.FIELD_ABSENT);
  assert.equal(unsupported.result.state, TemaIdentityState.MISSING);
  assert.equal(unsupported.result.unresolvedCandidates[0].sourceKey, 'PTEMA');
});

test('rejects unavailable and ambiguous schema bindings conservatively', () => {
  const unavailableDataset = makeDataset({
    points: [{}],
    lines: [],
  });
  const unavailableBinding = bindGmiLayerSchema(makeInput(unavailableDataset));
  assert.throws(
    () => resolveGmiTemaIdentity({
      ...makeInput(unavailableDataset),
      schemaBinding: unavailableBinding,
      objectRef: makeObjectRef(),
    }),
    /schema is unavailable/
  );

  const collisionFields = [
    {
      canonicalFieldId: 'tema',
      directGmiSourceKey: 'COLLISION',
      acceptedFallbackKeys: [],
      disabledLegacyAliases: [],
      recognizedUnresolvedKeys: [],
      mappingEvidenceConfidence: 'HIGH',
    },
    {
      canonicalFieldId: 'otherTema',
      directGmiSourceKey: 'COLLISION',
      acceptedFallbackKeys: [],
      disabledLegacyAliases: [],
      recognizedUnresolvedKeys: [],
      mappingEvidenceConfidence: 'HIGH',
    },
  ];
  const ambiguousDataset = makeDataset({
    pointSchema: undefined,
    points: [{ attributes: { COLLISION: 'VL' } }],
    lines: [],
  });
  const ambiguousBinding = bindGmiLayerSchemaWithRegistry(
    makeInput(ambiguousDataset),
    collisionFields
  );
  assert.equal(
    ambiguousBinding.bindings.find((binding) => binding.canonicalFieldId === 'tema').state,
    BindingState.AMBIGUOUS
  );
  assert.throws(
    () => resolveGmiTemaIdentity({
      ...makeInput(ambiguousDataset),
      schemaBinding: ambiguousBinding,
      objectRef: makeObjectRef(),
    }),
    /ambiguous schema binding/
  );
});

test('uses own accepted properties and does not read unrelated object data', () => {
  const attributes = Object.create({ Tema: 'INHERITED' });
  const inherited = resolveFixture({
    pointSchema: { Tema: {} },
    pointAttributes: attributes,
  });
  Object.defineProperty(attributes, 'Tema', {
    enumerable: true,
    value: 'OWN',
  });
  const own = resolveFixture({
    pointSchema: { Tema: {} },
    pointAttributes: attributes,
    points: [{
      get id() { throw new Error('id must not be read'); },
      get guid() { throw new Error('guid must not be read'); },
      get coordinates() { throw new Error('coordinates must not be read'); },
      attributes,
    }],
  });

  assert.equal(inherited.result.state, TemaIdentityState.MISSING);
  assert.equal(own.result.state, TemaIdentityState.RESOLVED);
  assert.equal(own.result.resolvedValue, 'OWN');
});

test('reads only accepted Tema candidate values', () => {
  const attributes = {};
  Object.defineProperty(attributes, 'Tema', {
    enumerable: true,
    get() {
      return 'VL';
    },
  });
  Object.defineProperty(attributes, 'Unrelated', {
    enumerable: true,
    get() {
      throw new Error('unrelated value must not be read');
    },
  });
  const fixture = resolveFixture({
    pointSchema: { Tema: {}, Unrelated: {} },
    pointAttributes: attributes,
  });

  assert.equal(fixture.result.state, TemaIdentityState.RESOLVED);
  assert.equal(fixture.result.resolvedValue, 'VL');
});

test('returns immutable results without mutating ObjectRef, dataset, or A1 binding', () => {
  const fixture = resolveFixture({
    pointSchema: { Tema: {}, S_FCODE: {} },
    pointAttributes: { Tema: 'VL', S_FCODE: 'SP' },
  });
  const datasetBefore = JSON.stringify(fixture.dataset);
  const bindingCandidate = fixture.schemaBinding.bindings.find(
    (binding) => binding.canonicalFieldId === 'tema' && binding.geometryScope === GeometryScope.POINT
  ).candidates[0];

  assert(Object.isFrozen(fixture.result));
  assert(Object.isFrozen(fixture.result.observations));
  assert(Object.isFrozen(fixture.result.observations[0]));
  assert(Object.isFrozen(fixture.result.conflicts));
  assert.throws(() => fixture.result.observations.push({}), TypeError);
  assert.equal(JSON.stringify(fixture.dataset), datasetBefore);
  assert.equal(bindingCandidate.sourceKey, 'Tema');
  assert.equal(fixture.objectRef.sourceIndex, 0);
});

test('A3 public boundary excludes general extraction, validation, classification, and application code', async () => {
  const runtimePaths = [
    '../src/lib/validation-v2/contracts.js',
    '../src/lib/validation-v2/index.js',
    '../src/lib/validation-v2/temaIdentity.js',
    '../src/lib/validation-v2/objectRef.js',
  ];
  const source = await Promise.all(
    runtimePaths.map((relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8'))
  );
  const runtimeSource = source.join('\n');

  for (const forbiddenImport of [
    'src/lib/validation/fieldValidation.js',
    'src/data/fields.json',
    'src/lib/validation/validator.js',
    'src/lib/store.js',
    'gmi-adapter-spec.json',
    'gmi-adapter-test-vectors.json',
  ]) {
    assert.equal(runtimeSource.includes(forbiddenImport), false, forbiddenImport);
  }
  assert.equal('extractObjectValue' in api, false);
  assert.equal('resolveCanonicalField' in api, false);
  assert.equal('classifyHydraulicType' in api, false);
  assert.equal('validateGmiData' in api, false);
  assert.equal('ObjectFieldValue' in api, false);
});
