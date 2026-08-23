import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const {
  GeometryScope,
  assertObjectRefOwnership,
  createGmiObjectRefs,
  createObjectRef,
} = api;

const revision = 'synthetic-rev-a2';

function enumerationInput(dataset, overrides = {}) {
  return {
    layerId: 'layer-a',
    dataset,
    datasetRevision: revision,
    sourceFormat: 'gmi',
    ...overrides,
  };
}

function refInput(overrides = {}) {
  return {
    layerId: 'layer-a',
    datasetRevision: revision,
    geometryScope: GeometryScope.POINT,
    objectIndex: 0,
    ...overrides,
  };
}

test('rejects malformed ObjectRef constructor input', () => {
  assert.throws(() => createObjectRef(), /input object/);
  assert.throws(() => createObjectRef(refInput({ layerId: '' })), /layerId/);
  for (const datasetRevision of ['', ' ', '\n', 123, {}, null]) {
    assert.throws(
      () => createObjectRef(refInput({ datasetRevision })),
      /datasetRevision/
    );
  }
  assert.throws(() => createObjectRef(refInput({ geometryScope: 'polygon' })), /geometryScope/);
  assert.throws(() => createObjectRef(refInput({ objectIndex: -1 })), /objectIndex/);
  assert.throws(() => createObjectRef(refInput({ objectIndex: 1.5 })), /objectIndex/);
  assert.throws(() => createObjectRef(refInput({ objectIndex: '0' })), /objectIndex/);
  assert.throws(() => createObjectRef(refInput({ objectIndex: null })), /objectIndex/);
});

test('creates immutable point and line refs with the A0 identity fields', () => {
  const pointRef = createObjectRef(refInput({ objectIndex: 3 }));
  const lineRef = createObjectRef(refInput({
    geometryScope: GeometryScope.LINE,
    objectIndex: 4,
  }));

  assert.equal(pointRef.layerId, 'layer-a');
  assert.equal(pointRef.datasetRevision, revision);
  assert.equal(pointRef.geometryScope, GeometryScope.POINT);
  assert.equal(pointRef.geometryType, GeometryScope.POINT);
  assert.equal(pointRef.sourceIndex, 3);
  assert.deepEqual(pointRef.localIdentity, { kind: 'index', value: 3 });
  assert.equal('guid' in pointRef, false);
  assert.equal('parserId' in pointRef, false);
  assert.equal(lineRef.geometryScope, GeometryScope.LINE);
  assert.equal(lineRef.geometryType, GeometryScope.LINE);
  assert.equal(lineRef.sourceIndex, 4);
  assert(Object.isFrozen(pointRef));
  assert(Object.isFrozen(pointRef.localIdentity));
  assert.throws(() => { pointRef.sourceIndex = 9; }, TypeError);
});

test('creates distinct keys for every identity dimension and accepts matching ownership', () => {
  const layerA = createObjectRef(refInput({ layerId: 'layer-a' }));
  const layerB = createObjectRef(refInput({ layerId: 'layer-b' }));
  const revisionTwo = createObjectRef(refInput({ datasetRevision: 'synthetic-rev-a2b' }));
  const line = createObjectRef(refInput({ geometryScope: GeometryScope.LINE }));
  const same = createObjectRef(refInput());

  assert.notEqual(layerA.key, layerB.key);
  assert.notEqual(layerA.key, revisionTwo.key);
  assert.notEqual(layerA.key, line.key);
  assert.equal(layerA.key, same.key);
  assert.deepEqual(layerA, same);
  assert.equal(
    assertObjectRefOwnership({
      objectRef: layerA,
      layerId: 'layer-a',
      datasetRevision: revision,
      geometryScope: GeometryScope.POINT,
    }),
    true
  );
  assert.throws(
    () => assertObjectRefOwnership({ objectRef: layerA, layerId: 'layer-b', datasetRevision: revision }),
    /different layer/
  );
  assert.throws(
    () => assertObjectRefOwnership({ objectRef: layerA, layerId: 'layer-a', datasetRevision: 'other-rev' }),
    /different dataset revision/
  );
  assert.throws(
    () => assertObjectRefOwnership({ objectRef: layerA, layerId: 'layer-a', datasetRevision: revision, geometryScope: GeometryScope.LINE }),
    /different geometry scope/
  );
});

test('length-prefixed keys resist delimiter and Unicode collision vectors', () => {
  const naiveFirst = createObjectRef(refInput({
    layerId: 'layer|a',
    datasetRevision: 'revision:b',
  }));
  const naiveSecond = createObjectRef(refInput({
    layerId: 'layer',
    datasetRevision: 'a|revision:b',
  }));
  const naiveKey = (ref) => [
    ref.layerId,
    ref.datasetRevision,
    ref.geometryScope,
    ref.sourceIndex,
  ].join('|');

  assert.equal(naiveKey(naiveFirst), naiveKey(naiveSecond));
  assert.notEqual(naiveFirst.key, naiveSecond.key);

  const adversarial = [
    refInput({ layerId: '7:|', datasetRevision: ':|7:' }),
    refInput({ layerId: '0:', datasetRevision: '|0:' }),
    refInput({ layerId: 'literal|pipe', datasetRevision: 'literal:colon' }),
    refInput({ layerId: 'å', datasetRevision: 'rev-å' }),
    refInput({ layerId: 'a\u030a', datasetRevision: 'rev-a\u030a' }),
    refInput({ layerId: 'empty-looking:0:', datasetRevision: '|:' }),
  ].map((values) => createObjectRef(values));

  assert.equal(new Set(adversarial.map((ref) => ref.key)).size, adversarial.length);
  assert.notEqual(adversarial[3].key, adversarial[4].key);
  assert.equal(adversarial[3].layerId, 'å');
  assert.equal(adversarial[4].layerId, 'a\u030a');
  assert.equal(adversarial[3].datasetRevision, 'rev-å');
  assert.equal(adversarial[4].datasetRevision, 'rev-a\u030a');
});

test('ownership validation rejects forged or internally inconsistent ObjectRefs', () => {
  const original = createObjectRef(refInput({ objectIndex: 2 }));
  const otherLayer = createObjectRef(refInput({ layerId: 'layer-b', objectIndex: 2 }));
  const otherRevision = createObjectRef(refInput({ datasetRevision: 'synthetic-rev-a2b', objectIndex: 2 }));
  const otherIndex = createObjectRef(refInput({ objectIndex: 3 }));
  const owner = {
    layerId: 'layer-a',
    datasetRevision: revision,
    geometryScope: GeometryScope.POINT,
  };

  assert.throws(
    () => assertObjectRefOwnership({
      ...owner,
      objectRef: {
        ...original,
        localIdentity: { kind: 'index', value: 1 },
      },
    }),
    /localIdentity/
  );
  assert.throws(
    () => assertObjectRefOwnership({
      ...owner,
      objectRef: { ...original, geometryType: GeometryScope.LINE },
    }),
    /geometryType/
  );
  assert.throws(
    () => assertObjectRefOwnership({
      ...owner,
      objectRef: { ...original, key: `${original.key}-forged` },
    }),
    /key does not match/
  );
  for (const forgedKey of [otherLayer.key, otherRevision.key, otherIndex.key]) {
    assert.throws(
      () => assertObjectRefOwnership({
        ...owner,
        objectRef: { ...original, key: forgedKey },
      }),
      /key does not match/
    );
  }
  assert.throws(
    () => assertObjectRefOwnership({
      ...owner,
      objectRef: {
        ...original,
        localIdentity: { kind: 'guid', value: 'not-an-index' },
      },
    }),
    /localIdentity/
  );
  assert.throws(
    () => assertObjectRefOwnership({
      ...owner,
      objectRef: { ...original, sourceIndex: 3 },
    }),
    /localIdentity/
  );
});

test('rejects malformed GMI enumeration input and non-GMI source format', () => {
  assert.throws(() => createGmiObjectRefs(), /input object/);
  assert.throws(
    () => createGmiObjectRefs(enumerationInput(null)),
    /dataset must be an object/
  );
  assert.throws(
    () => createGmiObjectRefs(enumerationInput({ points: [] })),
    /points and lines arrays/
  );
  assert.throws(
    () => createGmiObjectRefs(enumerationInput({ points: [], lines: [] }, { sourceFormat: 'GMI' })),
    /exactly gmi/
  );
  assert.throws(
    () => createGmiObjectRefs(enumerationInput({ points: [], lines: [] }, { datasetRevision: ' ' })),
    /datasetRevision/
  );
});

test('enumerates empty, point, and line collections independently', () => {
  const empty = createGmiObjectRefs(enumerationInput({ points: [], lines: [] }));
  const populated = createGmiObjectRefs(enumerationInput({
    points: [{}, {}, {}],
    lines: [{}, {}],
  }));

  assert.deepEqual(empty.pointRefs, []);
  assert.deepEqual(empty.lineRefs, []);
  assert.deepEqual(populated.pointRefs.map((ref) => ref.sourceIndex), [0, 1, 2]);
  assert.deepEqual(populated.lineRefs.map((ref) => ref.sourceIndex), [0, 1]);
  assert(populated.pointRefs.every((ref) => ref.geometryScope === GeometryScope.POINT));
  assert(populated.lineRefs.every((ref) => ref.geometryScope === GeometryScope.LINE));
  assert(populated.pointRefs.every((ref) => ref.layerId === 'layer-a' && ref.datasetRevision === revision));
  assert(populated.lineRefs.every((ref) => ref.layerId === 'layer-a' && ref.datasetRevision === revision));
  assert.equal(populated.sourceFormat, 'gmi');
});

test('enumeration uses only collection structure and does not read object properties', () => {
  const throwingFeature = {};
  for (const property of ['attributes', 'id', 'guid', 'type', 'coordinates']) {
    Object.defineProperty(throwingFeature, property, {
      enumerable: true,
      get() {
        throw new Error(`${property} must not be read`);
      },
    });
  }
  const dataset = {
    points: [throwingFeature],
    lines: [throwingFeature],
  };

  const result = createGmiObjectRefs(enumerationInput(dataset));
  assert.equal(result.pointRefs.length, 1);
  assert.equal(result.lineRefs.length, 1);
});

test('enumeration does not use field values, schemas, coordinates, or global layers', () => {
  const dataset = { points: [{}], lines: [{}] };
  Object.defineProperty(dataset, 'fieldAnalysis', {
    enumerable: true,
    get() {
      throw new Error('field schema must not be read');
    },
  });
  Object.defineProperty(dataset, 'layers', {
    enumerable: true,
    get() {
      throw new Error('other layers must not be read');
    },
  });
  const previous = globalThis.getVisibleLayersData;
  globalThis.getVisibleLayersData = () => {
    throw new Error('global layers must not be read');
  };

  try {
    const result = createGmiObjectRefs(enumerationInput(dataset));
    assert.equal(result.pointRefs.length, 1);
    assert.equal(result.lineRefs.length, 1);
  } finally {
    if (previous === undefined) {
      delete globalThis.getVisibleLayersData;
    } else {
      globalThis.getVisibleLayersData = previous;
    }
  }
});

test('enumeration leaves the selected dataset unchanged and returns frozen collections', () => {
  const dataset = { points: [{ id: 1 }], lines: [{ id: 2 }] };
  const before = JSON.stringify(dataset);
  const result = createGmiObjectRefs(enumerationInput(dataset));

  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result.pointRefs));
  assert(Object.isFrozen(result.lineRefs));
  assert.throws(() => result.pointRefs.push({}), TypeError);
  assert.equal(JSON.stringify(dataset), before);
});

test('ObjectRef creation does not require A1 schema binding or in-range dereference', () => {
  const result = createGmiObjectRefs(enumerationInput({ points: [], lines: [] }));
  const outOfRangeButStructural = createObjectRef(refInput({ objectIndex: 99 }));

  assert.deepEqual(result.pointRefs, []);
  assert.equal(outOfRangeButStructural.sourceIndex, 99);
  assert.equal(outOfRangeButStructural.geometryScope, GeometryScope.POINT);
});

test('A2 public surface has no value, Tema, validation, or application dependencies', async () => {
  const runtimePaths = [
    '../src/lib/validation-v2/contracts.js',
    '../src/lib/validation-v2/index.js',
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
    'gmi-adapter-spec.json',
    'gmi-adapter-test-vectors.json',
    "from '../../lib/store.js'",
  ]) {
    assert.equal(runtimeSource.includes(forbiddenImport), false, forbiddenImport);
  }
  assert.equal('extractObjectValue' in api, false);
  assert.equal('resolveTemaIdentity' in api, false);
  assert.equal('validateGmiData' in api, false);
  assert.equal('runValidationV2' in api, false);
});
