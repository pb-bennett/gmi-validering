// Batch 1B.3A: what a revised GMI must mean to FOTO, checked on its own bytes.
//
// The revised GMI's FOTO evidence is derived afresh, with the production
// factory and reviewer (createGmiPhotoSource + reviewGmiPhotoSource), from the
// parsed revised document, and compared with the association ledger the
// delivery intends:
//   original confident edges
//   - edges whose occurrence was removed for GML / Ikke (M7 delivery removals)
//   - edges moved by a hyperlink transfer (source object)
//   + the moved edges on their recipient
// Every other edge must survive with the same reference count, and nothing
// else may appear. This uses the delivery decisions and the transfer record,
// never a plan's lexemes.
//
// Occurrence identity across the revision (decision recorded in the Batch 1B.3A
// report): FOTO keys an occurrence by [source fingerprint, objectKey, assetId]
// and reference ids by `${source.id}:${objectKey}:S_HYPERLINK:0:wrapper:member`.
// A revised file has a different fingerprint, so it is a different source with
// different occurrence keys; the stable part is (objectKey, assetId), and the
// object keys themselves are unchanged (the byte verifier proves identity).
// `occurrenceMapping` maps each moved occurrence from its original key, through
// the proposed key (original fingerprint, recipient), to the revised key
// (revised fingerprint, recipient), with the revised reference ids.
import { createGmiPhotoSource, reviewGmiPhotoSource } from '../photos/gmiPhotoSource.mjs';

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (values) => [...values].sort(compare);
const pairKey = (objectKey, assetId) => JSON.stringify([objectKey, assetId]);
const occurrenceKey = (fingerprint, objectKey, assetId) => JSON.stringify([fingerprint, objectKey, assetId]);
const localId = (prefix, id) => (prefix && typeof id === 'string' && id.startsWith(prefix) ? id.slice(prefix.length) : id);

/**
 * FOTO evidence of a parsed GMI document as the FOTO session would hold it for source id `sourceId`: references
 * prefixed with the source id, and the association ledger reviewed against `assets` ({ assetId, originalFilename,
 * sourceRelativePath? }).
 */
export function deriveRevisionPhotoSource(document, { sourceId, fingerprint = document?.fingerprint ?? null, assets = [] } = {}) {
  if (!document?.parser) throw new TypeError('deriveRevisionPhotoSource expects a parsed GMI source document');
  const parsed = createGmiPhotoSource(document.parser, fingerprint);
  const withIds = Object.freeze({ ...parsed, id: sourceId, references: Object.freeze(parsed.references.map((reference) =>
    Object.freeze({ ...reference, id: `${sourceId}:${reference.id}` }))) });
  const ledger = reviewGmiPhotoSource(withIds, assets.map((asset) => ({ ...asset, id: asset.assetId ?? asset.id })));
  return Object.freeze({ ...withIds, associationLedger: ledger });
}

const edgesOf = (source) => Object.values(source?.associationLedger?.associationsById || {});

/**
 * @param {object} options
 * @param {object} options.originalSource the FOTO GMI source of the original bytes (with its ledger)
 * @param {object} options.revisedSource deriveRevisionPhotoSource of the revised bytes
 * @param {Array<{transferKey?, assetId, fromObjectKey, toObjectKey, referenceIds}>} [options.transfers] the committed transfers
 * @param {Array<{objectKey, assetId, referenceIds}>} [options.removals] the delivery removal selections
 * @returns {{ok: boolean, failures: object[], occurrenceMapping: object[], summary: object}}
 */
export function verifyRevisionAssociations({ originalSource, revisedSource, transfers = [], removals = [] } = {}) {
  const failures = [];
  const fail = (code, detail = {}) => failures.push(Object.freeze({ code, ...detail }));
  if (!originalSource?.associationLedger || !revisedSource?.associationLedger) {
    fail('revision-evidence-missing');
    return Object.freeze({ ok: false, failures: Object.freeze(failures), occurrenceMapping: Object.freeze([]), summary: Object.freeze({}) });
  }
  const originalKeys = sorted(Object.keys(originalSource.objectsByKey)), revisedKeys = sorted(Object.keys(revisedSource.objectsByKey));
  if (JSON.stringify(originalKeys) !== JSON.stringify(revisedKeys)) fail('revision-object-keys-changed');
  const originalPrefix = originalSource.id == null ? '' : `${originalSource.id}:`;
  const revisedPrefix = revisedSource.id == null ? '' : `${revisedSource.id}:`;
  const expected = new Map(edgesOf(originalSource).map((edge) => [pairKey(edge.objectKey, edge.photoId),
    { count: edge.referenceIds.length, referenceIds: sorted(edge.referenceIds.map((id) => localId(originalPrefix, id))) }]));
  const take = (objectKey, assetId, referenceIds, code) => {
    const key = pairKey(objectKey, assetId), edge = expected.get(key);
    const want = sorted(referenceIds.map((id) => localId(originalPrefix, id)));
    if (!edge || JSON.stringify(edge.referenceIds) !== JSON.stringify(want)) { fail(code, { objectKey, assetId }); return null; }
    expected.delete(key);
    return edge;
  };
  for (const removal of removals) take(removal.objectKey, removal.assetId, removal.referenceIds || [], 'revision-removal-not-in-original');
  const moved = [];
  for (const transfer of transfers) {
    const edge = take(transfer.fromObjectKey, transfer.assetId, transfer.referenceIds || [], 'revision-transfer-not-in-original');
    if (!edge) continue;
    moved.push(transfer);
  }
  for (const transfer of moved) {
    const key = pairKey(transfer.toObjectKey, transfer.assetId);
    if (expected.has(key)) { fail('revision-recipient-already-linked', { objectKey: transfer.toObjectKey, assetId: transfer.assetId }); continue; }
    expected.set(key, { count: transfer.referenceIds.length, referenceIds: null });
  }
  const revised = new Map(edgesOf(revisedSource).map((edge) => [pairKey(edge.objectKey, edge.photoId), edge]));
  for (const key of sorted(new Set([...expected.keys(), ...revised.keys()]))) {
    const want = expected.get(key), have = revised.get(key);
    const [objectKey, assetId] = JSON.parse(key);
    if (!want) { fail('revision-unexpected-association', { objectKey, assetId }); continue; }
    if (!have) { fail('revision-association-missing', { objectKey, assetId }); continue; }
    if (have.referenceIds.length !== want.count) fail('revision-reference-count-mismatch', { objectKey, assetId });
    const resolutions = revisedSource.associationLedger.reverseIndexes?.byReferenceId || {};
    if (have.referenceIds.some((id) => resolutions[id]?.status !== 'confident' || resolutions[id]?.photoId !== assetId)) fail('revision-reference-not-confident', { objectKey, assetId });
  }
  const occurrenceMapping = moved.map((transfer) => {
    const edge = revised.get(pairKey(transfer.toObjectKey, transfer.assetId));
    return Object.freeze({
      transferKey: transfer.transferKey ?? null, assetId: transfer.assetId,
      originalOccurrenceKey: occurrenceKey(originalSource.fingerprint, transfer.fromObjectKey, transfer.assetId),
      proposedOccurrenceKey: occurrenceKey(originalSource.fingerprint, transfer.toObjectKey, transfer.assetId),
      revisedOccurrenceKey: occurrenceKey(revisedSource.fingerprint, transfer.toObjectKey, transfer.assetId),
      objectKey: transfer.toObjectKey,
      revisedReferenceIds: Object.freeze(sorted(edge?.referenceIds || [])),
      localReferenceIds: Object.freeze(sorted((edge?.referenceIds || []).map((id) => localId(revisedPrefix, id)))),
    });
  });
  if (revisedSource.fingerprint && originalSource.fingerprint && revisedSource.fingerprint === originalSource.fingerprint
    && (transfers.length || removals.length)) fail('revision-fingerprint-not-distinct');
  return Object.freeze({
    ok: failures.length === 0,
    failures: Object.freeze(failures),
    occurrenceMapping: Object.freeze(occurrenceMapping),
    summary: Object.freeze({ associations: revised.size, moved: moved.length, removed: removals.length,
      references: revisedSource.references.length }),
  });
}
