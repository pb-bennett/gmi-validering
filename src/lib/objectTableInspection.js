import { getDatasetRevision } from './validation-v2/datasetRevision';
import { assertObjectRefOwnership, createObjectRef } from './validation-v2/objectRef';

let inspectionSequence = 0;

function collectionForGeometry(layer, geometryScope) {
  if (!layer?.data || !['point', 'line'].includes(geometryScope)) return null;
  const collection = geometryScope === 'point' ? layer.data.points : layer.data.lines;
  return Array.isArray(collection) ? collection : null;
}

/** Normalize one immutable exact runtime object scope without dereferencing it. */
export function createExactObjectInspection({ layer, request }) {
  const scope = request?.scope;
  if (!layer || !scope || scope.kind !== 'exact-object-set') {
    throw new TypeError('openObjectTable requires an exact object-set scope');
  }
  const { layerId, datasetRevision, geometryScope, objectRefs } = scope;
  const collection = collectionForGeometry(layer, geometryScope);
  const currentRevision = layer?.data ? getDatasetRevision(layer.data) : null;
  if (!collection || layer.id !== layerId || currentRevision !== datasetRevision || !Array.isArray(objectRefs)) {
    throw new Error('exact object scope does not belong to the current layer revision');
  }

  const seen = new Set();
  const sourceIndices = [];
  for (const objectRef of objectRefs) {
    assertObjectRefOwnership({ objectRef, layerId, datasetRevision, geometryScope });
    if (objectRef.sourceIndex >= collection.length || collection[objectRef.sourceIndex] === undefined) {
      throw new RangeError('exact object scope contains an out-of-range source index');
    }
    if (!seen.has(objectRef.key)) {
      seen.add(objectRef.key);
      sourceIndices.push(objectRef.sourceIndex);
    }
  }

  inspectionSequence += 1;
  return Object.freeze({
    id: `object-inspection-${inspectionSequence}`,
    kind: 'exact-object-set',
    layerId,
    datasetRevision,
    geometryScope,
    sourceIndices: Object.freeze(sourceIndices),
    context: Object.freeze({
      title: String(request.context?.title || 'Objektutvalg'),
      reason: String(request.context?.reason || ''),
      status: request.context?.status === 'CHECK' ? 'CHECK' : request.context?.status === 'FAIL' ? 'FAIL' : null,
      source: String(request.context?.source || 'object-inspection'),
    }),
  });
}

function normalizeOwnedRefs({ objectRefs, layerId, datasetRevision, geometryScope, collection, label }) {
  if (!Array.isArray(objectRefs)) throw new TypeError(`${label} must be an exact ObjectRef array`);
  const refsByKey = new Map();
  for (const objectRef of objectRefs) {
    assertObjectRefOwnership({ objectRef, layerId, datasetRevision, geometryScope });
    if (objectRef.sourceIndex >= collection.length || collection[objectRef.sourceIndex] === undefined) {
      throw new RangeError(`${label} contains an out-of-range source index`);
    }
    if (!refsByKey.has(objectRef.key)) refsByKey.set(objectRef.key, objectRef);
  }
  return refsByKey;
}

/**
 * Create a richer exact session without making the table dependent on any
 * Validator implementation. The complete scope and optional focus set remain
 * immutable; only activeView is replaced by the store action below.
 */
export function createContextualObjectInspection({ layer, request }) {
  const scope = request?.scope;
  const contextual = request?.contextual;
  if (!layer || !scope || scope.kind !== 'contextual-object-set' || !contextual) {
    throw new TypeError('openObjectTable requires a contextual exact object-set scope');
  }
  const { layerId, datasetRevision, geometryScope, objectRefs } = scope;
  const collection = collectionForGeometry(layer, geometryScope);
  if (!collection || layer.id !== layerId || getDatasetRevision(layer.data) !== datasetRevision) {
    throw new Error('contextual object scope does not belong to the current layer revision');
  }
  const scopeRefs = normalizeOwnedRefs({ objectRefs, layerId, datasetRevision, geometryScope, collection, label: 'field scope' });
  const focusRefs = normalizeOwnedRefs({ objectRefs: contextual.focusObjectRefs, layerId, datasetRevision, geometryScope, collection, label: 'focus subset' });
  for (const key of focusRefs.keys()) {
    if (!scopeRefs.has(key)) throw new Error('focus subset is not contained by the complete scope');
  }
  const resultByObjectKey = contextual.resultByObjectKey;
  if (!resultByObjectKey || typeof resultByObjectKey !== 'object') throw new TypeError('contextual scope needs result metadata');
  for (const key of scopeRefs.keys()) {
    if (!['FAIL', 'CHECK', 'PASS'].includes(resultByObjectKey[key])) {
      throw new Error('every contextual scope object needs a field result');
    }
  }
  const presentation = contextual.presentation || {};
  if (typeof presentation.temaColumn !== 'string' || typeof presentation.fieldColumn !== 'string') {
    throw new TypeError('contextual scope needs authoritative source columns');
  }
  inspectionSequence += 1;
  return Object.freeze({
    id: `object-inspection-${inspectionSequence}`,
    kind: 'contextual-object-set',
    layerId, datasetRevision, geometryScope,
    scopeIndices: Object.freeze([...scopeRefs.values()].map((ref) => ref.sourceIndex)),
    focusIndices: Object.freeze([...focusRefs.values()].map((ref) => ref.sourceIndex)),
    activeView: 'focus',
    resultByObjectKey: Object.freeze({ ...resultByObjectKey }),
    context: Object.freeze({
      title: String(request.context?.title || 'Objektutvalg'), reason: String(request.context?.reason || ''),
      status: request.context?.status === 'CHECK' ? 'CHECK' : request.context?.status === 'FAIL' ? 'FAIL' : null,
      source: String(request.context?.source || 'object-inspection'),
    }),
    presentation: Object.freeze({
      temaColumn: presentation.temaColumn,
      fieldColumn: presentation.fieldColumn,
      fieldLabel: String(presentation.fieldLabel || presentation.fieldColumn),
    }),
  });
}

/** Resolve only a validated current session; stale or missing data fails closed. */
export function resolveExactObjectInspectionRows({ layer, inspection }) {
  if (!inspection || !['exact-object-set', 'contextual-object-set'].includes(inspection.kind) || layer?.id !== inspection.layerId || !layer.data) return null;
  if (getDatasetRevision(layer.data) !== inspection.datasetRevision) return null;
  const collection = collectionForGeometry(layer, inspection.geometryScope);
  if (!collection) return null;
  const rows = [];
  const sourceIndices = inspection.kind === 'contextual-object-set'
    ? inspection.activeView === 'scope' ? inspection.scopeIndices : inspection.focusIndices
    : inspection.sourceIndices;
  for (const sourceIndex of sourceIndices) {
    const item = collection[sourceIndex];
    if (item === undefined) return null;
    const key = createObjectRef({
      layerId: inspection.layerId,
      datasetRevision: inspection.datasetRevision,
      geometryScope: inspection.geometryScope,
      objectIndex: sourceIndex,
    }).key;
    const result = inspection.kind === 'contextual-object-set' ? inspection.resultByObjectKey[key] : null;
    if (inspection.kind === 'contextual-object-set' && !result) return null;
    rows.push({ ...item, __index: sourceIndex, __contextualResult: result });
  }
  return rows;
}
