import {
  GeometryScope,
  GMI_SOURCE_FORMAT,
} from './contracts.js';

const GEOMETRY_SCOPES = new Set(Object.values(GeometryScope));

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertLayerIdentity(layerId, name = 'layerId') {
  if (!isNonEmptyString(layerId)) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertDatasetRevision(datasetRevision) {
  if (!isNonEmptyString(datasetRevision)) {
    throw new TypeError('datasetRevision must be a non-empty string');
  }
}

function assertGeometryScope(geometryScope) {
  if (!GEOMETRY_SCOPES.has(geometryScope)) {
    throw new TypeError('geometryScope must be point or line');
  }
}

function assertObjectIndex(objectIndex) {
  if (!Number.isInteger(objectIndex) || objectIndex < 0) {
    throw new TypeError('objectIndex must be a non-negative integer');
  }
}

function encodeKeyPart(value) {
  const text = String(value);
  return `${text.length}:${text}`;
}

function createObjectRefKey({ layerId, datasetRevision, geometryScope, objectIndex }) {
  return [
    'validator-v2-object',
    encodeKeyPart(layerId),
    encodeKeyPart(datasetRevision),
    encodeKeyPart(geometryScope),
    String(objectIndex),
  ].join('|');
}

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

function assertGmiDataset(dataset) {
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) {
    throw new TypeError('dataset must be an object');
  }
  if (!Array.isArray(dataset.points) || !Array.isArray(dataset.lines)) {
    throw new TypeError('dataset must contain points and lines arrays');
  }
}

function assertGmiEnumerationInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('createGmiObjectRefs requires an input object');
  }
  assertLayerIdentity(input.layerId);
  assertDatasetRevision(input.datasetRevision);
  assertGmiDataset(input.dataset);
  if (input.sourceFormat !== GMI_SOURCE_FORMAT) {
    throw new TypeError('createGmiObjectRefs requires sourceFormat to be exactly gmi');
  }
}

function createRefsForCollection({ layerId, datasetRevision, geometryScope, collection }) {
  const refs = [];
  for (let objectIndex = 0; objectIndex < collection.length; objectIndex += 1) {
    refs.push(createObjectRef({
      layerId,
      datasetRevision,
      geometryScope,
      objectIndex,
    }));
  }
  return refs;
}

/**
 * Create one immutable, geometry-local ObjectRef without inspecting an object.
 *
 * @param {Object} input
 * @param {string} input.layerId
 * @param {string} input.datasetRevision
 * @param {'point'|'line'} input.geometryScope
 * @param {number} input.objectIndex
 * @returns {import('./contracts.js').ObjectRef}
 */
export function createObjectRef(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('createObjectRef requires an input object');
  }
  const {
    layerId,
    datasetRevision,
    geometryScope,
    objectIndex,
  } = input;
  assertLayerIdentity(layerId);
  assertDatasetRevision(datasetRevision);
  assertGeometryScope(geometryScope);
  assertObjectIndex(objectIndex);

  return deepFreeze({
    key: createObjectRefKey({
      layerId,
      datasetRevision,
      geometryScope,
      objectIndex,
    }),
    layerId,
    datasetRevision,
    geometryScope,
    // Retain the A0 contract name alongside the explicit A2 scope name.
    geometryType: geometryScope,
    sourceIndex: objectIndex,
    localIdentity: {
      kind: 'index',
      value: objectIndex,
    },
  });
}

/**
 * Enumerate refs for both geometry collections in one explicit GMI dataset.
 * Only collection structure and lengths are read; object properties are not.
 *
 * @param {import('./contracts.js').GmiLayerAdapterInput} input
 * @returns {Object}
 */
export function createGmiObjectRefs(input) {
  assertGmiEnumerationInput(input);
  const { layerId, datasetRevision, dataset } = input;

  return deepFreeze({
    layerId,
    datasetRevision,
    sourceFormat: GMI_SOURCE_FORMAT,
    pointRefs: createRefsForCollection({
      layerId,
      datasetRevision,
      geometryScope: GeometryScope.POINT,
      collection: dataset.points,
    }),
    lineRefs: createRefsForCollection({
      layerId,
      datasetRevision,
      geometryScope: GeometryScope.LINE,
      collection: dataset.lines,
    }),
  });
}

function assertObjectRefShape(objectRef) {
  if (!objectRef || typeof objectRef !== 'object' || Array.isArray(objectRef)) {
    throw new TypeError('objectRef must be an ObjectRef object');
  }
  assertLayerIdentity(objectRef.layerId, 'objectRef.layerId');
  assertDatasetRevision(objectRef.datasetRevision);
  assertGeometryScope(objectRef.geometryScope);
  if (objectRef.geometryType !== objectRef.geometryScope) {
    throw new TypeError('objectRef geometryType must match geometryScope');
  }
  assertObjectIndex(objectRef.sourceIndex);
  if (
    !objectRef.localIdentity ||
    objectRef.localIdentity.kind !== 'index' ||
    objectRef.localIdentity.value !== objectRef.sourceIndex
  ) {
    throw new TypeError('objectRef localIdentity must retain its source index');
  }
  const expectedKey = createObjectRefKey({
    layerId: objectRef.layerId,
    datasetRevision: objectRef.datasetRevision,
    geometryScope: objectRef.geometryScope,
    objectIndex: objectRef.sourceIndex,
  });
  if (objectRef.key !== expectedKey) {
    throw new TypeError('objectRef key does not match its identity dimensions');
  }
}

/**
 * Assert that an ObjectRef belongs to one exact layer and dataset revision.
 * This performs no dereference and never searches another dataset.
 *
 * @param {Object} input
 * @param {import('./contracts.js').ObjectRef} input.objectRef
 * @param {string} input.layerId
 * @param {string} input.datasetRevision
 * @param {'point'|'line'|undefined} [input.geometryScope]
 * @returns {true}
 */
export function assertObjectRefOwnership(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('assertObjectRefOwnership requires an input object');
  }
  const {
    objectRef,
    layerId,
    datasetRevision,
    geometryScope,
  } = input;
  assertObjectRefShape(objectRef);
  assertLayerIdentity(layerId);
  assertDatasetRevision(datasetRevision);
  if (geometryScope !== undefined) {
    assertGeometryScope(geometryScope);
  }
  if (objectRef.layerId !== layerId) {
    throw new Error('objectRef belongs to a different layer');
  }
  if (objectRef.datasetRevision !== datasetRevision) {
    throw new Error('objectRef belongs to a different dataset revision');
  }
  if (geometryScope !== undefined && objectRef.geometryScope !== geometryScope) {
    throw new Error('objectRef belongs to a different geometry scope');
  }
  return true;
}
