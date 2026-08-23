const datasetRevisions = new WeakMap();
let revisionSequence = 0;

function createOpaqueRevision() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `v2-${globalThis.crypto.randomUUID()}`;
  }

  revisionSequence += 1;
  return `v2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${revisionSequence}`;
}

/**
 * Return one opaque revision for the lifetime of an in-memory dataset object.
 * The dataset is used only as a WeakMap key and is never mutated.
 */
export function getDatasetRevision(dataset) {
  if (!dataset || typeof dataset !== 'object') {
    throw new TypeError('dataset must be an object');
  }

  let revision = datasetRevisions.get(dataset);
  if (!revision) {
    revision = createOpaqueRevision();
    datasetRevisions.set(dataset, revision);
  }
  return revision;
}
