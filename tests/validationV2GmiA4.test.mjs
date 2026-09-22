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
  ObjectValueState,
  TemaIdentityState,
  bindGmiLayerSchema,
  createObjectRef,
  extractGmiObjectFieldValue,
  getCanonicalFields,
  resolveGmiTemaIdentity,
} = api;

const layerId = 'layer-a';
const datasetRevision = 'synthetic-rev-a4';

function makeDataset({
  pointSchema = {},
  lineSchema = {},
  pointAttributes = {},
  lineAttributes = {},
  points,
  lines,
  includeFieldAnalysis = true,
} = {}) {
  const dataset = {
    points: points ?? [{ attributes: pointAttributes }],
    lines: lines ?? [{ attributes: lineAttributes }],
  };
  if (includeFieldAnalysis) {
    dataset.fieldAnalysis = {
      points: pointSchema,
      lines: lineSchema,
    };
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

function makeRef(geometryScope = GeometryScope.POINT, objectIndex = 0, overrides = {}) {
  return createObjectRef({
    layerId,
    datasetRevision,
    geometryScope,
    objectIndex,
    ...overrides,
  });
}

function extractFixture({
  canonicalFieldId = 'heightReference',
  geometryScope = GeometryScope.POINT,
  pointSchema = { Høydereferanse: {} },
  lineSchema = {},
  pointAttributes = {},
  lineAttributes = {},
  points,
  lines,
  includeFieldAnalysis = true,
  objectIndex = 0,
} = {}) {
  const dataset = makeDataset({
    pointSchema,
    lineSchema,
    pointAttributes,
    lineAttributes,
    points,
    lines,
    includeFieldAnalysis,
  });
  const schemaBinding = bindGmiLayerSchema(makeInput(dataset));
  const objectRef = makeRef(geometryScope, objectIndex);
  const result = extractGmiObjectFieldValue({
    ...makeInput(dataset),
    schemaBinding,
    objectRef,
    canonicalFieldId,
  });
  return { dataset, schemaBinding, objectRef, result };
}

test('rejects unknown canonical IDs and ownership/input mismatches', () => {
  const fixture = extractFixture({
    canonicalFieldId: 'heightReference',
    pointAttributes: { Høydereferanse: 'NN2000' },
  });

  assert.throws(
    () => extractGmiObjectFieldValue({
      ...makeInput(fixture.dataset),
      schemaBinding: fixture.schemaBinding,
      objectRef: fixture.objectRef,
      canonicalFieldId: 'Tema',
    }),
    /unknown canonicalFieldId/
  );
  assert.throws(
    () => extractGmiObjectFieldValue({
      ...makeInput(fixture.dataset, { layerId: 'layer-b' }),
      schemaBinding: fixture.schemaBinding,
      objectRef: makeRef(GeometryScope.POINT, 0, { layerId: 'layer-b' }),
      canonicalFieldId: 'heightReference',
    }),
    /schemaBinding belongs to a different layer/
  );
  assert.throws(
    () => extractGmiObjectFieldValue({
      ...makeInput(fixture.dataset, { datasetRevision: 'other-rev' }),
      schemaBinding: fixture.schemaBinding,
      objectRef: makeRef(GeometryScope.POINT, 0, { datasetRevision: 'other-rev' }),
      canonicalFieldId: 'heightReference',
    }),
    /schemaBinding belongs to a different dataset revision/
  );
  assert.throws(
    () => extractGmiObjectFieldValue({
      ...makeInput(fixture.dataset),
      schemaBinding: { ...fixture.schemaBinding, sourceFormat: 'sosi' },
      objectRef: fixture.objectRef,
      canonicalFieldId: 'heightReference',
    }),
    /schemaBinding has an unsupported source format/
  );
});

test('rejects forged and out-of-range ObjectRefs before field access', () => {
  const fixture = extractFixture({
    pointAttributes: { Høydereferanse: 'NN2000' },
    points: [{ attributes: { Høydereferanse: 'NN2000' } }],
  });
  const forged = { ...fixture.objectRef, sourceIndex: 1 };
  assert.throws(
    () => extractGmiObjectFieldValue({
      ...makeInput(fixture.dataset),
      schemaBinding: fixture.schemaBinding,
      objectRef: forged,
      canonicalFieldId: 'heightReference',
    }),
    /localIdentity/
  );
  assert.throws(
    () => extractGmiObjectFieldValue({
      ...makeInput(fixture.dataset),
      schemaBinding: fixture.schemaBinding,
      objectRef: makeRef(GeometryScope.POINT, 1),
      canonicalFieldId: 'heightReference',
    }),
    /outside the selected dataset geometry/
  );

  const lineFixture = extractFixture({
    geometryScope: GeometryScope.LINE,
    pointSchema: {},
    lineSchema: { Dimensjon: {} },
    lineAttributes: { Dimensjon: 200 },
    points: [],
    lines: [{ attributes: { Dimensjon: 200 } }],
  });
  assert.throws(
    () => extractGmiObjectFieldValue({
      ...makeInput(lineFixture.dataset),
      schemaBinding: lineFixture.schemaBinding,
      objectRef: makeRef(GeometryScope.LINE, 1),
      canonicalFieldId: 'dimension',
    }),
    /outside the selected dataset geometry/
  );
});

test('propagates FIELD_ABSENT, SCHEMA_UNAVAILABLE, and UNRESOLVED_SOURCE without reading values', () => {
  const absentAttributes = {};
  Object.defineProperty(absentAttributes, 'Høydereferanse', {
    enumerable: true,
    get() {
      throw new Error('absent field value must not be read');
    },
  });
  const absent = extractFixture({
    pointSchema: { CUSTOM_FIELD: {} },
    pointAttributes: absentAttributes,
  });
  assert.equal(absent.result.state, ObjectValueState.FIELD_ABSENT);
  assert.equal(absent.result.bindingState, BindingState.FIELD_ABSENT);

  const unavailableDataset = makeDataset({
    includeFieldAnalysis: false,
    points: [{}],
    lines: [],
  });
  const unavailableBinding = bindGmiLayerSchema(makeInput(unavailableDataset));
  Object.defineProperty(unavailableDataset.points[0], 'attributes', {
    get() {
      throw new Error('unavailable schema must not read object attributes');
    },
  });
  const unavailable = extractGmiObjectFieldValue({
    ...makeInput(unavailableDataset),
    schemaBinding: unavailableBinding,
    objectRef: makeRef(),
    canonicalFieldId: 'heightReference',
  });
  assert.equal(unavailable.state, ObjectValueState.SCHEMA_UNAVAILABLE);
  assert.equal(unavailable.bindingState, BindingState.SCHEMA_UNAVAILABLE);

  const unresolvedAttributes = {};
  Object.defineProperty(unresolvedAttributes, 'HREF', {
    enumerable: true,
    get() {
      throw new Error('unresolved value must not be read');
    },
  });
  const unresolved = extractFixture({
    pointSchema: { HREF: {} },
    pointAttributes: unresolvedAttributes,
  });
  assert.equal(unresolved.result.state, ObjectValueState.UNRESOLVED_SOURCE);
  assert.equal(unresolved.result.bindingState, BindingState.UNRESOLVED_SOURCE);
  assert.equal(unresolved.result.unresolvedCandidates[0].sourceKey, 'HREF');
});

test('rejects malformed attributes containers for bound fields but accepts an empty object', () => {
  for (const malformedAttributes of [
    undefined,
    null,
    [],
    'not-an-object',
  ]) {
    const feature = malformedAttributes === undefined
      ? {}
      : { attributes: malformedAttributes };
    const dataset = makeDataset({
      pointSchema: { Høydereferanse: {} },
      points: [feature],
    });
    const schemaBinding = bindGmiLayerSchema(makeInput(dataset));
    assert.throws(
      () => extractGmiObjectFieldValue({
        ...makeInput(dataset),
        schemaBinding,
        objectRef: makeRef(),
        canonicalFieldId: 'heightReference',
      }),
      /feature\.attributes must be an object container/
    );
  }

  const empty = extractFixture({
    pointSchema: { Høydereferanse: {} },
    pointAttributes: {},
  });
  assert.equal(empty.result.state, ObjectValueState.VALUE_MISSING);
});

test('extracts every current canonical field through the same generic direct path', () => {
  for (const field of getCanonicalFields()) {
    const fixture = extractFixture({
      canonicalFieldId: field.canonicalFieldId,
      pointSchema: { [field.directGmiSourceKey]: {} },
      pointAttributes: { [field.directGmiSourceKey]: 'synthetic-value' },
    });
    assert.equal(fixture.result.state, ObjectValueState.VALUE_PRESENT, field.canonicalFieldId);
    assert.equal(fixture.result.sourceKey, field.directGmiSourceKey);
    assert.equal(fixture.result.sourceValue, 'synthetic-value');
  }
});

test('extracts exact and UNIQUE_CASE_ONLY source candidates without new matching', () => {
  const exact = extractFixture({
    canonicalFieldId: 'material',
    pointSchema: { Material: {} },
    pointAttributes: { Material: 'PVC' },
  });
  const caseOnly = extractFixture({
    canonicalFieldId: 'material',
    pointSchema: { MATERIAL: {} },
    pointAttributes: { MATERIAL: 'PE' },
  });

  assert.equal(exact.result.state, ObjectValueState.VALUE_PRESENT);
  assert.equal(exact.result.mappingKind, MappingKind.DIRECT);
  assert.equal(caseOnly.result.state, ObjectValueState.VALUE_PRESENT);
  assert.equal(caseOnly.result.sourceKey, 'MATERIAL');
  assert.equal(caseOnly.result.mappingKind, MappingKind.CASE_NORMALIZED);
});

test('distinguishes missing values from absent properties and preserves raw presence policy', () => {
  const absent = extractFixture({
    canonicalFieldId: 'note',
    pointSchema: { Merknad: {} },
    pointAttributes: {},
  });
  assert.equal(absent.result.state, ObjectValueState.VALUE_MISSING);
  assert.equal(absent.result.candidates[0].propertyPresent, false);

  for (const missingValue of [undefined, null, '']) {
    const fixture = extractFixture({
      canonicalFieldId: 'note',
      pointSchema: { Merknad: {} },
      pointAttributes: { Merknad: missingValue },
    });
    assert.equal(fixture.result.state, ObjectValueState.VALUE_MISSING);
    assert.equal(fixture.result.candidates[0].propertyPresent, true);
  }
  for (const presentValue of [0, '0', false, '   ']) {
    const fixture = extractFixture({
      canonicalFieldId: 'note',
      pointSchema: { Merknad: {} },
      pointAttributes: { Merknad: presentValue },
    });
    assert.equal(fixture.result.state, ObjectValueState.VALUE_PRESENT);
    assert.equal(fixture.result.sourceValue, presentValue);
  }
});

test('preserves multiple accepted candidates and applies strict raw comparison', () => {
  const equal = extractFixture({
    canonicalFieldId: 'material',
    pointSchema: { Material: {}, MATERIAL: {} },
    pointAttributes: { Material: 'PVC', MATERIAL: 'PVC' },
  });
  const oneMissing = extractFixture({
    canonicalFieldId: 'material',
    pointSchema: { Material: {}, MATERIAL: {} },
    pointAttributes: { Material: null, MATERIAL: 'PVC' },
  });
  const allMissing = extractFixture({
    canonicalFieldId: 'material',
    pointSchema: { Material: {}, MATERIAL: {} },
    pointAttributes: { Material: '', MATERIAL: undefined },
  });
  const conflict = extractFixture({
    canonicalFieldId: 'material',
    pointSchema: { Material: {}, MATERIAL: {} },
    pointAttributes: { Material: 'PVC', MATERIAL: 'PE' },
  });

  assert.equal(equal.result.state, ObjectValueState.VALUE_PRESENT);
  assert.equal(equal.result.sourceKey, 'Material');
  assert.equal(equal.result.candidates.length, 2);
  assert.equal(oneMissing.result.state, ObjectValueState.VALUE_PRESENT);
  assert.equal(oneMissing.result.sourceKey, 'MATERIAL');
  assert.equal(allMissing.result.state, ObjectValueState.VALUE_MISSING);
  assert.equal(conflict.result.state, ObjectValueState.BINDING_AMBIGUOUS);
  assert.equal(conflict.result.sourceKey, null);
  assert.deepEqual(
    conflict.result.conflicts.map((candidate) => candidate.rawValue),
    ['PVC', 'PE']
  );

  for (const [first, second] of [['VL', 'vl'], ['VL', ' VL '], ['1', 1]]) {
    const rawConflict = extractFixture({
      canonicalFieldId: 'tema',
      pointSchema: { Tema: {}, S_FCODE: {} },
      pointAttributes: { Tema: first, S_FCODE: second },
    });
    assert.equal(rawConflict.result.state, ObjectValueState.BINDING_AMBIGUOUS);
  }
});

test('keeps generic Tema extraction compatible with A3 identity results', () => {
  const cases = [
    {
      pointSchema: { Tema: {} },
      pointAttributes: { Tema: 'VL' },
      a3: TemaIdentityState.RESOLVED,
      a4: ObjectValueState.VALUE_PRESENT,
    },
    {
      pointSchema: { Tema: {}, S_FCODE: {} },
      pointAttributes: { Tema: null, S_FCODE: 'VL' },
      a3: TemaIdentityState.RESOLVED,
      a4: ObjectValueState.VALUE_PRESENT,
    },
    {
      pointSchema: { Tema: {}, S_FCODE: {} },
      pointAttributes: { Tema: 'VL', S_FCODE: 'SP' },
      a3: TemaIdentityState.CONFLICT,
      a4: ObjectValueState.BINDING_AMBIGUOUS,
    },
    {
      pointSchema: { PTEMA: {} },
      pointAttributes: { PTEMA: 'VL' },
      a3: TemaIdentityState.UNRESOLVED_SOURCE,
      a4: ObjectValueState.UNRESOLVED_SOURCE,
    },
  ];

  for (const testCase of cases) {
    const fixture = extractFixture({
      canonicalFieldId: 'tema',
      pointSchema: testCase.pointSchema,
      pointAttributes: testCase.pointAttributes,
    });
    const a3 = resolveGmiTemaIdentity({
      ...makeInput(fixture.dataset),
      schemaBinding: fixture.schemaBinding,
      objectRef: fixture.objectRef,
    });
    assert.equal(a3.state, testCase.a3);
    assert.equal(fixture.result.state, testCase.a4);
  }

  const absentFixture = extractFixture({
    canonicalFieldId: 'tema',
    pointSchema: { CUSTOM_FIELD: {} },
    pointAttributes: {},
  });
  const absentA3 = resolveGmiTemaIdentity({
    ...makeInput(absentFixture.dataset),
    schemaBinding: absentFixture.schemaBinding,
    objectRef: absentFixture.objectRef,
  });
  assert.equal(absentA3.state, TemaIdentityState.MISSING);
  assert.equal(absentFixture.result.state, ObjectValueState.FIELD_ABSENT);
});

test('uses only the ObjectRef geometry and does not filter by expectedRuleScopes', () => {
  const dataset = makeDataset({
    pointSchema: { Material: {} },
    lineSchema: { Material: {} },
    pointAttributes: { Material: 'POINT' },
    lineAttributes: { Material: 'LINE' },
  });
  const schemaBinding = bindGmiLayerSchema(makeInput(dataset));
  const pointRef = makeRef(GeometryScope.POINT);
  const lineRef = makeRef(GeometryScope.LINE);
  const pointResult = extractGmiObjectFieldValue({
    ...makeInput(dataset),
    schemaBinding,
    objectRef: pointRef,
    canonicalFieldId: 'material',
  });
  const lineResult = extractGmiObjectFieldValue({
    ...makeInput(dataset),
    schemaBinding,
    objectRef: lineRef,
    canonicalFieldId: 'material',
  });

  assert.equal(pointResult.sourceValue, 'POINT');
  assert.equal(lineResult.sourceValue, 'LINE');
});

test('uses own properties and does not read unrelated, unknown, or object metadata values', () => {
  const inheritedAttributes = Object.create({ Material: 'INHERITED' });
  const inherited = extractFixture({
    canonicalFieldId: 'material',
    pointSchema: { Material: {} },
    pointAttributes: inheritedAttributes,
  });
  assert.equal(inherited.result.state, ObjectValueState.VALUE_MISSING);

  const attributes = {};
  Object.defineProperty(attributes, 'Material', {
    enumerable: true,
    get() {
      return 'PVC';
    },
  });
  for (const property of ['Unrelated', 'UNKNOWN_FIELD']) {
    Object.defineProperty(attributes, property, {
      enumerable: true,
      get() {
        throw new Error(`${property} must not be read`);
      },
    });
  }
  const object = {};
  for (const property of ['id', 'guid', 'coordinates', 'type']) {
    Object.defineProperty(object, property, {
      enumerable: true,
      get() {
        throw new Error(`${property} must not be read`);
      },
    });
  }
  object.attributes = attributes;
  const fixture = extractFixture({
    canonicalFieldId: 'material',
    pointSchema: { Material: {}, Unrelated: {}, UNKNOWN_FIELD: {} },
    points: [object],
  });

  assert.equal(fixture.result.state, ObjectValueState.VALUE_PRESENT);
  assert.equal(fixture.result.sourceValue, 'PVC');
});

test('copies and freezes A4-owned observations without mutating inputs', () => {
  const attributes = { HREF: 'unresolved' };
  const fixture = extractFixture({
    canonicalFieldId: 'heightReference',
    pointSchema: { HREF: {} },
    pointAttributes: attributes,
  });
  const bindingCandidate = fixture.schemaBinding.bindings.find(
    (binding) => binding.canonicalFieldId === 'heightReference' && binding.geometryScope === GeometryScope.POINT
  ).candidates[0];

  assert(Object.isFrozen(fixture.result));
  assert(Object.isFrozen(fixture.result.unresolvedCandidates));
  assert(Object.isFrozen(fixture.result.unresolvedCandidates[0]));
  assert.notEqual(fixture.result.unresolvedCandidates[0], bindingCandidate);
  assert.equal(attributes.HREF, 'unresolved');
  assert.equal(fixture.objectRef.sourceIndex, 0);
  assert.throws(() => fixture.result.unresolvedCandidates.push({}), TypeError);
});

test('propagates an A1 AMBIGUOUS binding without reading or selecting values', () => {
  const feature = {};
  Object.defineProperty(feature, 'attributes', {
    get() {
      throw new Error('ambiguous schema must not read object attributes');
    },
  });
  const dataset = makeDataset({
    pointSchema: { COLLISION: {} },
    points: [feature],
    lines: [],
  });
  const schemaBinding = bindGmiLayerSchemaWithRegistry(
    makeInput(dataset),
    [
      {
        canonicalFieldId: 'material',
        directGmiSourceKey: 'COLLISION',
        acceptedFallbackKeys: [],
        disabledLegacyAliases: [],
        recognizedUnresolvedKeys: [],
        mappingEvidenceConfidence: 'HIGH',
      },
      {
        canonicalFieldId: 'otherField',
        directGmiSourceKey: 'COLLISION',
        acceptedFallbackKeys: [],
        disabledLegacyAliases: [],
        recognizedUnresolvedKeys: [],
        mappingEvidenceConfidence: 'HIGH',
      },
    ]
  );
  const result = extractGmiObjectFieldValue({
    ...makeInput(dataset),
    schemaBinding,
    objectRef: makeRef(),
    canonicalFieldId: 'material',
  });

  assert.equal(result.state, ObjectValueState.BINDING_AMBIGUOUS);
  assert.equal(result.sourceKey, null);
  assert.equal(result.candidates.length, 0);
  assert.deepEqual([...result.conflicts[0].canonicalFieldIds].sort(), [
    'material',
    'otherField',
  ]);
  assert.equal(result.schemaCandidates[0].sourceKey, 'COLLISION');
});

test('evaluates three accepted candidates completely and preserves deterministic provenance', () => {
  const fields = [{
    canonicalFieldId: 'material',
    directGmiSourceKey: 'A',
    acceptedFallbackKeys: ['B', 'C'],
    disabledLegacyAliases: [],
    recognizedUnresolvedKeys: [],
    mappingEvidenceConfidence: 'HIGH',
  }];
  const cases = [
    {
      attributes: { A: 'X', B: 'X', C: 'X' },
      state: ObjectValueState.VALUE_PRESENT,
      sourceKey: 'A',
      conflictCount: 0,
    },
    {
      attributes: { A: 'X', B: 'X', C: 'Y' },
      state: ObjectValueState.BINDING_AMBIGUOUS,
      sourceKey: null,
      conflictCount: 3,
    },
    {
      attributes: { B: 'X', C: 'X' },
      state: ObjectValueState.VALUE_PRESENT,
      sourceKey: 'B',
      conflictCount: 0,
    },
  ];

  for (const testCase of cases) {
    const dataset = makeDataset({
      pointSchema: { A: {}, B: {}, C: {} },
      points: [{ attributes: testCase.attributes }],
      lines: [],
    });
    const schemaBinding = bindGmiLayerSchemaWithRegistry(
      makeInput(dataset),
      fields
    );
    const result = extractGmiObjectFieldValue({
      ...makeInput(dataset),
      schemaBinding,
      objectRef: makeRef(),
      canonicalFieldId: 'material',
    });

    assert.equal(result.state, testCase.state);
    assert.equal(result.sourceKey, testCase.sourceKey);
    assert.deepEqual(result.candidates.map((candidate) => candidate.sourceKey), [
      'A',
      'B',
      'C',
    ]);
    assert.equal(result.candidates.length, 3);
    assert.equal(result.conflicts.length, testCase.conflictCount === 0 ? 0 : 3);
  }
});

test('A4 public boundary has no validation or application dependencies', async () => {
  const runtimePaths = [
    '../src/lib/validation-v2/contracts.js',
    '../src/lib/validation-v2/index.js',
    '../src/lib/validation-v2/objectFieldValue.js',
    '../src/lib/validation-v2/valueSemantics.js',
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
  assert.equal('runValidationV2' in api, false);
  assert.equal('validateGmiData' in api, false);
  assert.equal('classifyHydraulicType' in api, false);
});
