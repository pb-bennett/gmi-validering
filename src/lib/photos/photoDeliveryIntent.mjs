// Combined-delivery decisions for FOTO occurrences (GMI editing M8).
//
// Pure derivation. The photo session stores one explicit decision per
// occurrence (record id) in its own map, outside the records, so no
// positioning, metadata or edit action can touch it:
//   { kind: 'gmi', occurrenceKey, intent: 'transfer' }   GMI-linked occurrence
//   { kind: 'unlinked', include: true }                   occurrence without a GMI link
// The absence of a decision is the default: 'keep-link' for a GMI-linked
// occurrence, not included for an unlinked one.
//
// The two concepts are never interchangeable. A decision whose kind no
// longer matches the occurrence (an unlinked inclusion on an occurrence that
// has since become GMI-linked), or a transfer whose GMI association is no
// longer confident, is reported as 'review'. It is never silently turned
// into a valid selection of the other kind.
//
// Nothing here modifies a GMI file, a hyperlink or the standalone FOTO
// export. M9 reads `buildPhotoDeliverySnapshot` and hands the transfer
// selections to M7, which keeps the authoritative removal eligibility.
import { gmiObjectLabel } from './gmiPhotoSource.mjs';

export const PHOTO_DELIVERY_INTENTS = Object.freeze({ KEEP_LINK: 'keep-link', TRANSFER: 'transfer' });

export const PHOTO_DELIVERY_STATUS = Object.freeze({
  KEEP_LINK: 'keep-link',
  TRANSFER: 'transfer',
  INCLUDE: 'include',
  NOT_SELECTED: 'not-selected',
  REVIEW: 'review',
});

export const PHOTO_DELIVERY_FILTERS = Object.freeze([
  Object.freeze({ key: 'all', label: 'Alle' }),
  Object.freeze({ key: 'keep-link', label: 'Beholdes i GMI' }),
  Object.freeze({ key: 'transfer', label: 'Overføres til GML' }),
  Object.freeze({ key: 'include', label: 'Tas med uten GMI-lenke' }),
  Object.freeze({ key: 'not-selected', label: 'Ikke valgt' }),
  Object.freeze({ key: 'review', label: 'Krever gjennomgang' }),
]);

export const PHOTO_DELIVERY_STATUS_LABELS = Object.freeze({
  'keep-link': 'Beholdes i GMI',
  transfer: 'Overføres til GML',
  include: 'Tas med uten GMI-lenke',
  'not-selected': 'Ikke valgt',
  review: 'Krever gjennomgang',
});

// Why a decision needs review, or why a transfer is not possible now.
export const PHOTO_DELIVERY_REASON_TEXT = Object.freeze({
  'source-missing': 'GMI-kilden er fjernet fra fotolaget.',
  'source-not-live': 'GMI-filen er ikke lenger lastet inn som kartlag.',
  'fingerprint-mismatch': 'GMI-kilden er en annen versjon enn den plasseringen ble koblet fra.',
  'association-lost': 'Den sikre GMI-koblingen finnes ikke lenger.',
  'association-changed': 'GMI-koblingen er endret etter at plasseringen ble laget.',
  'occurrence-changed': 'Plasseringen er koblet til et annet GMI-objekt enn da valget ble gjort.',
  'decision-type-changed': 'Bildet ble valgt uten GMI-lenke, men plasseringen er nå koblet til GMI.',
  'link-removed': 'Plasseringen var valgt for overføring, men har ikke lenger en GMI-kobling.',
  'linked-without-occurrence': 'Bildet er koblet til et GMI-objekt uten egen plassering i FOTO (for eksempel en ledning). Lenken beholdes i GMI.',
});

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (values) => [...values].sort(compare);
const sameSet = (a, b) => a.length === b.length && sorted(a).every((value, index) => value === sorted(b)[index]);

/** The FOTO occurrence identity; identical to M7 `gmiHyperlinkSelectionKey`. */
export const photoDeliveryOccurrenceKey = ({ sourceFingerprint, objectKey, assetId }) =>
  JSON.stringify([sourceFingerprint, objectKey, assetId]);

/**
 * Whether a GMI-linked occurrence still rests on a confident ledger edge of a
 * live source in its layer. Uses source ids, fingerprints and ledger edges
 * only, never filenames.
 */
export function photoOccurrenceAssociation(layer, record) {
  const occurrence = record?.occurrence;
  if (!occurrence) return Object.freeze({ state: 'unlinked', source: null, edge: null });
  const source = (layer?.spatialSources || []).find((item) => item.kind === 'gmi' && item.id === occurrence.sourceId) || null;
  const result = (state, edge = null) => Object.freeze({ state, source, edge });
  if (!source) return result('source-missing');
  if (source.fingerprint !== occurrence.sourceFingerprint
    || occurrence.key !== photoDeliveryOccurrenceKey({ sourceFingerprint: source.fingerprint, objectKey: occurrence.objectKey, assetId: occurrence.assetId })
    || occurrence.assetId !== record.assetId) return result('fingerprint-mismatch');
  if (source.loadedBinding && source.loadedBinding.live === false) return result('source-not-live');
  const ledger = source.associationLedger;
  const edgeId = JSON.stringify([source.id, occurrence.objectKey, occurrence.assetId]);
  const edge = ledger?.associationsById && Object.hasOwn(ledger.associationsById, edgeId) ? ledger.associationsById[edgeId] : null;
  if (!edge) return result('association-lost');
  const resolutions = ledger.reverseIndexes?.byReferenceId || {};
  if (!sameSet(edge.referenceIds, occurrence.referenceIds || [])
    || edge.referenceIds.some((id) => resolutions[id]?.status !== 'confident' || resolutions[id]?.photoId !== occurrence.assetId)) {
    return result('association-changed', edge);
  }
  return result('confident', edge);
}

// GMI evidence about an asset that has no GMI occurrence of its own: a confident
// edge without a positioned occurrence (line objects), or an ambiguous reference.
function unlinkedAssetEvidence(layer, assetId) {
  let confident = false, ambiguous = false;
  for (const source of layer?.spatialSources || []) {
    if (source.kind !== 'gmi' || !source.associationLedger) continue;
    if (source.associationLedger.reverseIndexes?.byPhotoId?.[assetId]?.length) confident = true;
    if (source.associationLedger.resolutions?.some((row) => row.status === 'ambiguous' && row.photoIds?.includes(assetId))) ambiguous = true;
  }
  return { confident, ambiguous };
}

/** The derived delivery state of one occurrence. */
export function photoDeliveryEntry(layer, record, decision = null) {
  const occurrence = record.occurrence || null;
  const linked = Boolean(occurrence);
  const association = photoOccurrenceAssociation(layer, record);
  const evidence = linked ? { confident: false, ambiguous: false } : unlinkedAssetEvidence(layer, record.assetId);
  let status, reason = null, intent = null, include = false;
  if (linked) {
    intent = decision?.kind === 'gmi' ? decision.intent : PHOTO_DELIVERY_INTENTS.KEEP_LINK;
    if (decision && decision.kind !== 'gmi') { status = PHOTO_DELIVERY_STATUS.REVIEW; reason = 'decision-type-changed'; intent = null; }
    else if (decision?.kind === 'gmi' && decision.occurrenceKey !== occurrence.key) { status = PHOTO_DELIVERY_STATUS.REVIEW; reason = 'occurrence-changed'; }
    else if (intent === PHOTO_DELIVERY_INTENTS.TRANSFER && association.state !== 'confident') { status = PHOTO_DELIVERY_STATUS.REVIEW; reason = association.state; }
    else status = intent;
  } else if (decision?.kind === 'gmi' && decision.intent === PHOTO_DELIVERY_INTENTS.TRANSFER) {
    status = PHOTO_DELIVERY_STATUS.REVIEW; reason = 'link-removed';
  } else if (evidence.confident) {
    // Linked from a GMI object that has no FOTO occurrence: the link stays in the GMI. An inclusion made
    // before the link appeared needs review; it is never treated as a second, unlinked delivery.
    if (decision?.kind === 'unlinked') { status = PHOTO_DELIVERY_STATUS.REVIEW; reason = 'decision-type-changed'; }
    else { status = PHOTO_DELIVERY_STATUS.KEEP_LINK; reason = 'linked-without-occurrence'; }
  } else {
    include = decision?.kind === 'unlinked' && decision.include === true;
    status = include ? PHOTO_DELIVERY_STATUS.INCLUDE : PHOTO_DELIVERY_STATUS.NOT_SELECTED;
  }
  return Object.freeze({
    photoId: record.id,
    assetId: record.assetId,
    linked,
    status,
    reason,
    intent,
    include,
    explicit: Boolean(decision),
    canTransfer: linked && association.state === 'confident',
    canInclude: !linked && !evidence.confident,
    linkedWithoutOccurrence: !linked && evidence.confident,
    ambiguousGmiReference: !linked && evidence.ambiguous,
    association: Object.freeze({
      state: association.state,
      sourceId: occurrence?.sourceId ?? null,
      sourceFingerprint: occurrence?.sourceFingerprint ?? null,
      objectKey: occurrence?.objectKey ?? null,
      occurrenceKey: occurrence?.key ?? null,
      objectLabel: occurrence?.object ? gmiObjectLabel(occurrence.object) : null,
      geometryScope: occurrence?.object?.geometryScope ?? null,
    }),
  });
}

/** Occurrence and distinct-asset counts per status. */
export function summarizePhotoDelivery(entries) {
  const occurrences = Object.fromEntries(Object.values(PHOTO_DELIVERY_STATUS).map((status) => [status, 0]));
  const assetSets = Object.fromEntries(Object.values(PHOTO_DELIVERY_STATUS).map((status) => [status, new Set()]));
  for (const entry of entries) { occurrences[entry.status]++; assetSets[entry.status].add(entry.assetId); }
  const assets = Object.fromEntries(Object.entries(assetSets).map(([status, set]) => [status, set.size]));
  const linked = entries.filter((entry) => entry.linked).length;
  return Object.freeze({
    occurrences: Object.freeze(occurrences),
    assets: Object.freeze(assets),
    total: entries.length,
    linked,
    unlinked: entries.length - linked,
    // Any explicit choice the user made (or one that needs attention).
    active: occurrences.transfer + occurrences.include + occurrences.review > 0,
  });
}

/** Delivery entries for every occurrence of a layer, keyed by photo id. */
export function photoLayerDelivery(layer, records, decisions) {
  const entries = layer.photoIds.map((id) => photoDeliveryEntry(layer, records.get(id), decisions.get(id) || null));
  return Object.freeze({
    byPhotoId: Object.freeze(Object.fromEntries(entries.map((entry) => [entry.photoId, entry]))),
    summary: summarizePhotoDelivery(entries),
  });
}

const occurrenceView = (record, entry, edge) => Object.freeze({
  photoId: record.id,
  assetId: record.assetId,
  occurrenceKey: record.occurrence.key,
  sourceId: record.occurrence.sourceId,
  sourceFingerprint: record.occurrence.sourceFingerprint,
  objectKey: record.occurrence.objectKey,
  objectLabel: entry.association.objectLabel,
  geometryScope: entry.association.geometryScope,
  referenceIds: Object.freeze(sorted(edge?.referenceIds || record.occurrence.referenceIds || [])),
  associationState: entry.association.state,
});

/**
 * Read-only, deterministic snapshot for the combined delivery planner (M9).
 * `stateKey` covers every value M9 relies on; compare it with a fresh
 * snapshot (session.isPhotoDeliverySnapshotCurrent) to reject a stale plan.
 */
export function buildPhotoDeliverySnapshot(layer, records, decisions, { generation = 0 } = {}) {
  const transfers = [], retained = [], included = [], unresolved = [];
  const order = (a, b) => compare(a.assetId, b.assetId) || compare(a.occurrenceKey ?? '', b.occurrenceKey ?? '') || compare(a.photoId, b.photoId);
  const occurrenceKeys = new Set();
  for (const id of layer.photoIds) {
    const record = records.get(id);
    const entry = photoDeliveryEntry(layer, record, decisions.get(id) || null);
    if (record.occurrence) occurrenceKeys.add(record.occurrence.key);
    const { edge } = record.occurrence ? photoOccurrenceAssociation(layer, record) : { edge: null };
    if (entry.status === PHOTO_DELIVERY_STATUS.TRANSFER) transfers.push(occurrenceView(record, entry, edge));
    else if (entry.status === PHOTO_DELIVERY_STATUS.KEEP_LINK) { if (record.occurrence) retained.push(occurrenceView(record, entry, edge)); }
    else if (entry.status === PHOTO_DELIVERY_STATUS.INCLUDE) included.push(Object.freeze({ photoId: record.id, assetId: record.assetId,
      ambiguousGmiReference: entry.ambiguousGmiReference }));
    else if (entry.status === PHOTO_DELIVERY_STATUS.REVIEW) {
      unresolved.push(Object.freeze({ photoId: record.id, assetId: record.assetId, linked: entry.linked, reason: entry.reason,
        decision: decisions.get(id)?.kind === 'unlinked' ? 'include' : 'transfer',
        occurrenceKey: entry.association.occurrenceKey, sourceId: entry.association.sourceId,
        sourceFingerprint: entry.association.sourceFingerprint, objectKey: entry.association.objectKey }));
    }
  }
  for (const list of [transfers, retained, included, unresolved]) list.sort(order);

  // Confident links that have no FOTO occurrence (line objects, removed placements):
  // they always stay in the GMI and cannot be transferred from FOTO.
  const linksWithoutOccurrence = [];
  const sources = (layer.spatialSources || []).filter((source) => source.kind === 'gmi').map((source) => {
    const edges = Object.values(source.associationLedger?.associationsById || {});
    for (const edge of edges) {
      const key = photoDeliveryOccurrenceKey({ sourceFingerprint: source.fingerprint, objectKey: edge.objectKey, assetId: edge.photoId });
      if (occurrenceKeys.has(key)) continue;
      const object = source.objectsByKey?.[edge.objectKey];
      linksWithoutOccurrence.push(Object.freeze({ sourceId: source.id, sourceFingerprint: source.fingerprint, objectKey: edge.objectKey,
        assetId: edge.photoId, occurrenceKey: key, referenceIds: Object.freeze(sorted(edge.referenceIds)),
        geometryScope: object?.geometryScope ?? null, objectLabel: object ? gmiObjectLabel(object) : null,
        reason: object?.geometryScope === 'line' ? 'line-object' : (layer.dismissedGmiPlacements || []).includes(key) ? 'placement-removed' : 'no-occurrence' }));
    }
    return Object.freeze({
      sourceId: source.id,
      fingerprint: source.fingerprint,
      filename: source.filename ?? null,
      live: !(source.loadedBinding && source.loadedBinding.live === false),
      loadedBinding: source.loadedBinding ? Object.freeze({ ...source.loadedBinding }) : null,
      confidentAssociationCount: edges.length,
      transferCount: transfers.filter((item) => item.sourceId === source.id).length,
      retainedCount: retained.filter((item) => item.sourceId === source.id).length,
    });
  }).sort((a, b) => compare(a.sourceId, b.sourceId));
  linksWithoutOccurrence.sort((a, b) => compare(a.occurrenceKey, b.occurrenceKey));

  const removalSelections = transfers.map((item) => Object.freeze({
    key: item.occurrenceKey, sourceId: item.sourceId, sourceFingerprint: item.sourceFingerprint,
    objectKey: item.objectKey, assetId: item.assetId, referenceIds: item.referenceIds,
  }));
  const distinct = (list) => Object.freeze(sorted(new Set(list.map((item) => item.assetId))));
  const transferredAssets = distinct(transfers), retainedAssets = distinct([...retained, ...linksWithoutOccurrence]);
  const transferFingerprints = sorted(new Set(transfers.map((item) => item.sourceFingerprint)));
  const issues = [];
  if (unresolved.length) issues.push('unresolved-decisions');
  if (transferFingerprints.length > 1) issues.push('multiple-gmi-sources');
  if (sources.some((source) => !source.live && transfers.some((item) => item.sourceId === source.sourceId))) issues.push('gmi-source-not-live');
  if (included.some((item) => item.ambiguousGmiReference)) issues.push('included-photo-ambiguously-referenced');
  const body = {
    layerId: layer.id,
    sources,
    transfers,
    retained,
    included,
    unresolved,
    linksWithoutOccurrence,
    removalSelections,
  };
  const stateKey = JSON.stringify([generation, body]);
  return Object.freeze({
    kind: 'photo-delivery-snapshot',
    generation,
    ...body,
    sources: Object.freeze(sources),
    transfers: Object.freeze(transfers),
    retained: Object.freeze(retained),
    included: Object.freeze(included),
    unresolved: Object.freeze(unresolved),
    linksWithoutOccurrence: Object.freeze(linksWithoutOccurrence),
    removalSelections: Object.freeze(removalSelections),
    assets: Object.freeze({
      transferred: transferredAssets,
      included: distinct(included),
      retainedLinked: retainedAssets,
      // Shared photographs: transferred from one object, still linked from another.
      transferredAndRetained: Object.freeze(transferredAssets.filter((id) => retainedAssets.includes(id))),
      all: distinct([...transfers, ...retained, ...included, ...unresolved, ...linksWithoutOccurrence]),
    }),
    counts: Object.freeze({
      transferOccurrences: transfers.length, retainedOccurrences: retained.length, includedOccurrences: included.length,
      unresolvedOccurrences: unresolved.length, linksWithoutOccurrence: linksWithoutOccurrence.length,
      transferredAssets: transferredAssets.length, includedAssets: distinct(included).length,
    }),
    readiness: Object.freeze({
      decisionsResolved: unresolved.length === 0,
      sourceFingerprints: Object.freeze(transferFingerprints),
      issues: Object.freeze(issues),
    }),
    stateKey,
  });
}
