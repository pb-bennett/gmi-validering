import { emptyCaptureMetadata, normalizeCaptureTime, normalizePhotographer, gmlCaptureEvidence } from './photoCaptureMetadata.mjs';
import { classifyPhotoFile, createPhotoThumbnail } from './imagePreview.mjs';
import { readExifGps } from './exifGps.mjs';
import { acceptManualPhotoPosition, acceptPhotoCandidate, createPhotoCandidate, emptySpatial, immutable, isPhotoPosition, photoSpatialCounts } from './photoSpatial.mjs';
import { matchPhotoReferences } from './photoReferenceMatching.mjs';
import { acceptManualPhotoDirection, acceptEvidencePhotoDirection, emptyDirection } from './photoDirection.mjs';
import { planEvidenceAdoption } from './photoEvidenceAdoption.mjs';
import { duplicatePhotoNames, photoAppendPolicy, prunePhotoSource, reviewPhotoSource } from './photoPositionSources.mjs';
import { gmiPhotoAssociations, gmiPointPosition, parseGmiPhotoSource, pruneGmiPhotoSource, reviewGmiPhotoSource } from './gmiPhotoSource.mjs';
import { planPhotoSourcePositions } from './photoPositioning.mjs';

export const EMPTY_PHOTO_SNAPSHOT = Object.freeze({
  photos: Object.freeze([]), selectedId: null, batchSelectedIds: Object.freeze([]),
  photoLayers: Object.freeze([]), lastImport: null,
  draftTargetLayerId: null, appendStatus: null, duplicateNames: Object.freeze([]), sourceReviews: Object.freeze({}),
  loadedImport: null,
  positioning: Object.freeze({ state: 'empty', source: null, errorCode: null, ledger: null }),
});
let fallbackId = 0;

export function createPhotoSession({
  createThumbnail = createPhotoThumbnail,
  extractGps = readExifGps,
  parseGml = async (file) => {
    const { parseTerrainPhotoGml, MAX_PHOTO_GML_BYTES } = await import('./terrainPhotoGml.mjs');
    if (file.size > MAX_PHOTO_GML_BYTES) throw Object.assign(new Error('gml-too-large'), { code: 'gml-too-large' });
    return parseTerrainPhotoGml(await file.text());
  },
  createId = () => globalThis.crypto?.randomUUID?.() || `photo-${Date.now()}-${++fallbackId}`,
  urls = globalThis.URL,
  yieldJob = () => new Promise((resolve) => setTimeout(resolve, 0)),
  sourceAdapters = {},
} = {}) {
  // Originals and browser resources deliberately live outside Zustand/React snapshots.
  const records = new Map();
  // Assets own File, preview and shared EXIF/GML evidence. Records are occurrences:
  // current position, direction and exact referring point, with shared metadata views.
  const assets = new Map();
  const workflowMembers = new WeakMap();
  const manualTickets = new WeakSet();
  const directionTickets = new WeakSet();
  // Only one editing transaction is live; starting either kind invalidates the other.
  let editVersion = 0;
  const manualVisibilityVersions = new Map();
  // Each asset has exactly one owner: the current import or one created FOTO layer.
  // Transfer changes membership, never copies the File or invalidates thumbnail work.
  const layers = new Map();
  let importIds = [];
  let batchSelectedIds = new Set();
  const listeners = new Set();
  let snapshot = EMPTY_PHOTO_SNAPSHOT;
  let selectedId = null;
  let lastImport = null;
  let generation = 0;
  let queue = [];
  let running = false;
  let activeJob = null;
  let metadataQueue = [];
  let metadataRunning = false;
  let activeMetadata = null;
  let draftToken = 0;
  let gmlRequest = 0;
  let positioning = EMPTY_PHOTO_SNAPSHOT.positioning;
  let draftTargetLayerId = null;
  let loadedImport = null;
  const loadedPlans = new WeakMap();
  const appendOverrideIds = new Set();
  const sourceReviews = new Map();
  const sourceRequests = new Map();
  const gmiReviews = new WeakMap();
  const sourceWorkflows = new Map();
  const workflowReviews = new WeakMap();

  function sourceWorkflowIsLive(ticket) {
    return Boolean(ticket && ticket.generation === generation && sourceWorkflows.get(ticket.layerId) === ticket
      && layers.get(ticket.layerId)?.photoIds === workflowMembers.get(ticket));
  }

  const assetIds = (ids) => [...new Set(ids.map((id) => records.get(id)?.assetId).filter(Boolean))];
  const assetPhotos = (ids) => assetIds(ids).map((id) => ({ ...assets.get(id), id }));
  const fileFor = (id) => assets.get(records.get(id)?.assetId)?.file || null;
  function makeOccurrence(assetId, id = assetId, occurrence = null) {
    const { file: _file, spatial, captureMetadata: _capture, metadataEvidence: _evidence, directionEvidence: _directionEvidence, ...metadata } = assets.get(assetId);
    return { ...metadata, id, assetId, occurrence, spatial: Object.freeze({ ...spatial, current: null }), direction: emptyDirection() };
  }
  function updateAsset(assetId, patch, jobGeneration = generation) {
    const asset = assets.get(assetId);
    if (!asset || jobGeneration !== generation) return false;
    const updated = { ...asset, ...patch(asset) };
    assets.set(assetId, updated);
    for (const [id, record] of records) {
      if (record.assetId !== assetId) continue;
      const { file: _file, spatial: shared, captureMetadata: _capture, metadataEvidence: _evidence, directionEvidence: _directionEvidence, ...metadata } = updated;
      const local = record.spatial.candidates.filter((candidate) => candidate.kind === 'gmi');
      const candidates = [...shared.candidates, ...local];
      const same = record.spatial.exifRead === shared.exifRead && candidates.length === record.spatial.candidates.length
        && candidates.every((item, index) => item === record.spatial.candidates[index]);
      records.set(id, { ...record, ...metadata, spatial: same ? record.spatial : Object.freeze({
        ...record.spatial, exifRead: shared.exifRead, candidates: Object.freeze(candidates),
      }) });
    }
    return true;
  }

  async function makeSource(file, kind) {
    const adapter = sourceAdapters[kind] || (kind === 'gml' ? parseGml : kind === 'gmi' ? parseGmiPhotoSource : null);
    if (!adapter) throw Object.assign(new Error('unsupported-source'), { code: 'unsupported-source' });
    const parsed = await adapter(file);
    const evidence = parsed.fingerprint ? null : JSON.stringify({ kind, ...parsed });
    // Keep existing HTTP/LAN import support: Web Crypto is restricted to secure contexts.
    // Exact evidence comparison is conservative; never substitute a collision-prone hash.
    let fingerprint = parsed.fingerprint || `evidence-json:${evidence}`;
    if (!parsed.fingerprint && globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidence));
      fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    const id = `photo-${kind}-${createId()}`;
    return immutable({ ...parsed, ...(kind === 'gmi' ? {
      references: parsed.references.map((reference) => ({ ...reference, id: `${id}:${reference.id}` })),
    } : {}), id, kind, fingerprint, filename: file.name, importedAt: Date.now() });
  }

  function attachSource(source, photoIds) {
    const ledger = matchPhotoReferences(source.entries, assetPhotos(photoIds));
    for (const match of ledger.matches) {
      if (match.status !== 'matched') continue;
      const entry = source.entries.find((item) => item.id === match.entryId);
      const candidate = createPhotoCandidate({ ...entry, id: `${source.id}:${entry.id}`, kind: entry.kind || source.kind,
        sourceId: source.id, sourceFilename: source.filename, sourceEntryId: entry.id });
      updateAsset(match.photoId, (live) => {
        if (live.spatial.candidates.some((item) => item.sourceId === source.id && item.sourceEntryId === entry.id)) return {};
        const spatial = Object.freeze({ ...live.spatial, candidates: Object.freeze([...live.spatial.candidates, candidate]) });
        return { spatial, metadataEvidence: immutable([...live.metadataEvidence, ...gmlCaptureEvidence(source, entry)]) };
      });
    }
    return immutable({ ...source, ledger });
  }

  function manualPlacementIsLive(ticket) {
    return Boolean(ticket && manualTickets.has(ticket) && ticket.generation === generation
      && ticket.editVersion === editVersion
      && ticket.visibilityVersion === (manualVisibilityVersions.get(ticket.layerId) || 0)
      && layers.get(ticket.layerId)?.visible
      && layers.get(ticket.layerId)?.photoIds.includes(ticket.photoId)
      && records.get(ticket.photoId)?.spatial.current === ticket.expectedCurrent);
  }

  function directionEditIsLive(ticket) {
    return Boolean(ticket && directionTickets.has(ticket) && ticket.generation === generation
      && ticket.editVersion === editVersion
      && ticket.visibilityVersion === (manualVisibilityVersions.get(ticket.layerId) || 0)
      && layers.get(ticket.layerId)?.visible
      && layers.get(ticket.layerId)?.photoIds.includes(ticket.photoId)
      && records.get(ticket.photoId)?.direction.current === ticket.expectedCurrent);
  }

  function transferDraft() {
    loadedImport = null;
    draftToken++; gmlRequest++;
    positioning = EMPTY_PHOTO_SNAPSHOT.positioning;
    importIds = []; selectedId = null; batchSelectedIds.clear(); lastImport = null; draftTargetLayerId = null;
    appendOverrideIds.clear();
  }

  const publicPhoto = (photo, context = null) => {
    const layer = context?.layer || [...layers.values()].find((item) => item.photoIds.includes(photo.id));
    const peers = context?.peers.get(photo.assetId) || (layer ? layer.photoIds.map((id) => records.get(id)).filter((item) => item.assetId === photo.assetId) : [photo]);
    const links = layer ? gmiPhotoAssociations(layer, photo.id) : [];
    return Object.freeze({ ...photo, directionEvidence: assets.get(photo.assetId).directionEvidence || Object.freeze([]), captureMetadata: assets.get(photo.assetId).captureMetadata, metadataEvidence: assets.get(photo.assetId).metadataEvidence, repeatGroup: Object.freeze({ assetId: photo.assetId,
      occurrenceCount: peers.length, occurrenceIndex: peers.findIndex((item) => item.id === photo.id) + 1,
      pointObjectCount: links.filter((link) => link.object.geometryScope === 'point').length,
      referringObjectCount: links.length, repeated: links.length > 1 || peers.length > 1 }) });
  };

  // Never write a record captured before an await back into the registry.
  // Each writer owns a field patch; all other live fields survive completion.
  function updateRecord(id, patch, jobGeneration = generation) {
    const current = records.get(id);
    if (!current || jobGeneration !== generation) return false;
    const changes = patch(current);
    const { spatial, direction, occurrence, ...shared } = changes;
    if (Object.keys(shared).length) updateAsset(current.assetId, () => shared);
    records.set(id, { ...records.get(id), ...(spatial ? { spatial } : {}), ...(direction ? { direction } : {}),
      ...(occurrence !== undefined ? { occurrence } : {}) });
    return true;
  }

  const appendPolicy = () => draftTargetLayerId ? photoAppendPolicy(importIds.map((id) => records.get(id)),
    assetPhotos(layers.get(draftTargetLayerId)?.photoIds || []), appendOverrideIds) : null;
  const skippedSpatial = () => immutable({ ...emptySpatial(), exifRead: { state: 'skipped-duplicate', errorCode: null } });
  const publish = () => {
    const appendStatus = appendPolicy();
    const skipped = new Set(appendStatus?.skippedIds || []);
    let resumedMetadata = false;
    // Reconcile before publishing, including target membership changes while a draft is open.
    for (const id of importIds) {
      const live = records.get(id);
      if (skipped.has(id) && live.spatial.exifRead.state !== 'skipped-duplicate') {
        metadataQueue = metadataQueue.filter((job) => job.id !== id);
        if (activeMetadata?.id === id) activeMetadata.cancelled = true;
        updateAsset(id, () => ({ spatial: skippedSpatial() }));
      } else if (!skipped.has(id) && live.spatial.exifRead.state === 'skipped-duplicate') {
        updateAsset(id, () => ({ spatial: emptySpatial() }));
        metadataQueue.push({ id, generation });
        resumedMetadata = true;
      }
    }
    if (positioning.source) positioning = Object.freeze({ ...positioning, ledger: matchPhotoReferences(positioning.source.entries,
      (appendStatus?.appendableIds || importIds).map((id) => records.get(id))) });
    for (const [id, layer] of layers) {
      const counts = { ...photoSpatialCounts(layer.photoIds.map((photoId) => records.get(photoId))),
        assetCount: assetIds(layer.photoIds).length };
      if (Object.keys(counts).some((key) => counts[key] !== layer[key])) layers.set(id, Object.freeze({ ...layer, ...counts }));
    }
    for (const [id, review] of sourceReviews) {
      if (review.source && layers.has(id)) {
        const memberIds = layers.get(id).photoIds;
        if (review.source.kind === 'gmi') {
          const cached = gmiReviews.get(review.source);
          const associationLedger = cached?.memberIds === memberIds ? cached.associationLedger
            : reviewGmiPhotoSource(review.source, assetPhotos(memberIds));
          gmiReviews.set(review.source, { memberIds, associationLedger });
          sourceReviews.set(id, Object.freeze({ ...review, memberIds, associationLedger }));
        } else sourceReviews.set(id, Object.freeze({ ...review,
          ...reviewPhotoSource(review.source, assetPhotos(memberIds).map((asset) => ({ ...asset,
            spatial: records.get(memberIds.find((photoId) => records.get(photoId).assetId === asset.id)).spatial }))),
        }));
      }
    }
    snapshot = Object.freeze({
      photos: Object.freeze(importIds.map((id) => publicPhoto(records.get(id)))),
      selectedId,
      batchSelectedIds: Object.freeze(importIds.filter((id) => batchSelectedIds.has(id))),
      photoLayers: Object.freeze(Array.from(layers.values()).reverse()),
      lastImport,
      positioning,
      draftTargetLayerId,
      loadedImport: loadedImport ? Object.freeze({ state: loadedImport.state, errorCode: loadedImport.errorCode,
        binding: loadedImport.binding, source: loadedImport.source }) : null,
      appendStatus,
      duplicateNames: duplicatePhotoNames(importIds.map((id) => records.get(id))),
      sourceReviews: Object.freeze(Object.fromEntries(sourceReviews)),
    });
    for (const listener of listeners) listener();
    if (resumedMetadata) void drainMetadata();
  };

  async function drainMetadata() {
    if (metadataRunning) return;
    metadataRunning = true;
    try {
      while (metadataQueue.length) {
        await yieldJob();
        const job = metadataQueue.shift();
        const record = assets.get(job?.id);
        if (!record || job.generation !== generation || record.spatial.exifRead.state === 'skipped-duplicate') continue;
        activeMetadata = { id: job.id, cancelled: false };
        const token = activeMetadata;
        let result;
        try { result = await extractGps(record.file); }
        catch { result = { state: 'error', errorCode: 'gps-read-failed', candidate: null }; }
        if (!token.cancelled && updateAsset(job.id, (live) => ({
          directionEvidence: immutable(result.directionEvidence || []),
          metadataEvidence: immutable([...live.metadataEvidence.filter((item) => item.kind !== 'exif'), ...(result.metadataEvidence || [])]),
          spatial: Object.freeze({
            ...live.spatial,
            exifRead: immutable({ state: result.state, errorCode: result.errorCode }),
            candidates: Object.freeze([...live.spatial.candidates, ...(result.candidate ? [createPhotoCandidate({ ...result.candidate, id: `${job.id}:exif`, kind: 'exif', sourceAssetId: job.id })] : [])]),
          }),
        }), job.generation)) publish();
        activeMetadata = null;
      }
    } finally { activeMetadata = null; metadataRunning = false; }
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        await yieldJob();
        const job = queue.shift();
        if (!job || job.generation !== generation) continue;
        const record = assets.get(job.id);
        if (!record) continue;
        const controller = new AbortController();
        activeJob = { id: job.id, controller };
        let thumbnailUrl = null;
        try {
          const result = await createThumbnail(record.file, { signal: controller.signal });
          if (job.generation !== generation || !assets.has(job.id)) continue;
          thumbnailUrl = urls.createObjectURL(result.thumbnailBlob);
          const previousUrl = assets.get(job.id).preview.thumbnailUrl;
          if (previousUrl) urls.revokeObjectURL(previousUrl);
          updateAsset(job.id, () => ({
            dimensions: Object.freeze(result.dimensions),
            preview: Object.freeze({ state: 'ready', thumbnailUrl, errorCode: null }),
          }), job.generation);
          thumbnailUrl = null; // Ownership transferred to the registry.
          publish();
        } catch (error) {
          if (job.generation === generation && assets.has(job.id)) {
            updateAsset(job.id, () => ({
              dimensions: error.dimensions ? Object.freeze(error.dimensions) : null,
              preview: Object.freeze({ state: 'error', thumbnailUrl: null, errorCode: error.code || 'decode-failed' }),
            }), job.generation);
            publish();
          }
        } finally {
          if (thumbnailUrl) urls.revokeObjectURL(thumbnailUrl);
          activeJob = null;
        }
      }
    } finally {
      running = false;
    }
  }

  function release(ids) {
    const candidates = assetIds(ids);
    for (const id of ids) { records.delete(id); appendOverrideIds.delete(id); }
    const live = new Set([...records.values()].map((record) => record.assetId));
    const removed = new Set(candidates.filter((id) => !live.has(id)));
    queue = queue.filter((job) => !removed.has(job.id));
    metadataQueue = metadataQueue.filter((job) => !removed.has(job.id));
    if (removed.has(activeMetadata?.id)) activeMetadata.cancelled = true;
    if (removed.has(activeJob?.id)) activeJob.controller.abort();
    for (const id of removed) {
      const record = assets.get(id);
      if (record?.preview.thumbnailUrl) urls.revokeObjectURL(record.preview.thumbnailUrl);
      assets.delete(id);
    }
  }

  function clearImport() {
    loadedImport = null;
    draftToken++;
    gmlRequest++;
    positioning = EMPTY_PHOTO_SNAPSHOT.positioning;
    release(importIds);
    importIds = [];
    batchSelectedIds.clear();
    selectedId = null;
    lastImport = null;
    draftTargetLayerId = null;
    appendOverrideIds.clear();
    publish();
  }

  function planGmiAssociations(layer, source, associationLedger) {
    const layerId = layer.id, sourceId = source.id;
    const existing = layer.spatialSources.some((item) => item.id === sourceId);
    const additions = [], replacements = new Map(), memberList = [...layer.photoIds];
    const dismissed = new Set(layer.dismissedGmiPlacements || []);
    try {
      for (const association of Object.values(associationLedger.associationsById)) {
        const object = source.objectsByKey[association.objectKey];
        const position = gmiPointPosition(source, object);
        if (!position) continue;
        const assetId = association.photoId;
        const key = JSON.stringify([source.fingerprint, object.objectKey, assetId]);
        if (dismissed.has(key)) continue;
        const peers = memberList.map((id) => replacements.get(id) || records.get(id) || additions.find((item) => item.id === id))
          .filter((record) => record.assetId === assetId);
        let record = peers.find((item) => item.occurrence?.key === key);
        if (record?.occurrence.sourceId === sourceId) continue;
        record = record || peers.find((item) => !item.occurrence) || makeOccurrence(assetId, createId());
        const occurrence = immutable({ key, assetId, sourceId, sourceFingerprint: source.fingerprint,
          sourceFilename: source.filename, objectKey: object.objectKey, object,
          referenceIds: association.referenceIds, references: source.references.filter((ref) => association.referenceIds.includes(ref.id)),
          matchMethods: association.matchMethods, ownerLayerId: layerId });
        const candidate = createPhotoCandidate({ id: `gmi-position:${key}`, kind: 'gmi', sourceId,
          sourceFilename: source.filename, sourceEntryId: association.id, ...position,
          raw: { geometry: object.rawGeometry }, provenance: occurrence });
        const updated = { ...record, occurrence, spatial: Object.freeze({ ...record.spatial,
          candidates: Object.freeze([...record.spatial.candidates.filter((item) => item.provenance?.key !== key), candidate]) }) };
        if (records.has(record.id)) replacements.set(record.id, updated);
        else { additions.push(updated); memberList.push(record.id); }
      }
    } catch { throw new Error('invalid-source'); }
    const sources = existing ? layer.spatialSources.map((item) => item.id === sourceId ? source : item) : [...layer.spatialSources, source];
    const photoIds = additions.length ? Object.freeze(memberList) : layer.photoIds;
    const lookup = (id) => replacements.get(id) || records.get(id) || additions.find((item) => item.id === id);
    return { additions, replacements, photoIds, layer: Object.freeze({ ...layer, photoIds, photoCount: photoIds.length,
      assetIdsByPhotoId: Object.freeze(Object.fromEntries(photoIds.map((id) => [id, lookup(id).assetId]))),
      spatialSources: Object.freeze(sources) }) };
  }
  function commitGmiPlan(plan) {
    for (const [id, record] of plan.replacements) records.set(id, record);
    for (const record of plan.additions) records.set(record.id, record);
    layers.set(plan.layer.id, plan.layer);
  }

  return {
    getSnapshot: () => snapshot,
    async beginLoadedGmiImport({ binding, read, isLive }, targetLayerId = null) {
      if (!isLive(binding) || !this.beginImport(targetLayerId)) return false;
      const operation = { binding, isLive, state: 'pending', source: null, errorCode: null };
      loadedImport = operation;
      publish();
      try {
        const parsed = await read();
        if (loadedImport !== operation || !isLive(binding)) return false;
        const id = `photo-gmi-${createId()}`;
        operation.source = immutable({ ...parsed, id, kind: 'gmi', filename: binding.filename, importedAt: Date.now(),
          references: parsed.references.map((reference) => ({ ...reference, id: `${id}:${reference.id}` })),
          loadedBinding: { ...binding, live: true } });
        operation.state = 'ready';
        publish(); return true;
      } catch {
        if (loadedImport !== operation) return false;
        operation.state = 'error'; operation.errorCode = 'loaded-source-unavailable';
        publish(); return false;
      }
    },
    setLoadedGmiTarget(layerId = null) {
      if (!loadedImport || (layerId && !layers.has(layerId))) return false;
      draftTargetLayerId = layerId; appendOverrideIds.clear(); publish(); return true;
    },
    reconcileLoadedGmiBindings(isLive) {
      if (loadedImport && !isLive(loadedImport.binding)) {
        const binding = loadedImport.binding;
        clearImport();
        loadedImport = { binding, state: 'error', errorCode: 'loaded-source-unavailable', source: null };
      }
      let changed = false;
      for (const [id, layer] of layers) {
        const sources = layer.spatialSources.map((source) => {
          if (!source.loadedBinding || !source.loadedBinding.live || isLive(source.loadedBinding)) return source;
          changed = true;
          return Object.freeze({ ...source, loadedBinding: Object.freeze({ ...source.loadedBinding, live: false }) });
        });
        if (sources.some((source, index) => source !== layer.spatialSources[index]))
          layers.set(id, Object.freeze({ ...layer, spatialSources: Object.freeze(sources) }));
      }
      if (changed || loadedImport?.state === 'error') publish();
    },
    reviewLoadedGmiImport({ includeUnreferenced = true } = {}) {
      if (loadedImport?.state !== 'ready' || !loadedImport.isLive(loadedImport.binding)
        || ['pending', 'error'].includes(positioning.state)) return null;
      const target = draftTargetLayerId ? layers.get(draftTargetLayerId) : null;
      if (draftTargetLayerId && !target) return null;
      const eligibleIds = appendPolicy()?.appendableIds || importIds;
      const photos = assetPhotos([...(target?.photoIds || []), ...eligibleIds]);
      const existing = target?.spatialSources.find((source) => source.kind === 'gmi' && source.fingerprint === loadedImport.source.fingerprint);
      const source = existing ? Object.freeze({ ...existing, loadedBinding: loadedImport.source.loadedBinding }) : loadedImport.source;
      const associationLedger = reviewGmiPhotoSource(source, photos);
      // Ambiguous candidates are possibly referenced; excluding unrelated files must
      // never turn an ambiguous pair into an automatic single-file association.
      const possible = new Set(associationLedger.resolutions.flatMap((row) => row.photoIds));
      const unreferencedIds = eligibleIds.filter((id) => !possible.has(id));
      const includedIds = eligibleIds.filter((id) => includeUnreferenced || !unreferencedIds.includes(id));
      const review = Object.freeze({ source, associationLedger, includedIds: Object.freeze([...includedIds]),
        files: Object.freeze(photos.map((photo) => Object.freeze({ id: photo.id, filename: photo.originalFilename, relativePath: photo.sourceRelativePath }))),
        unreferencedIds: Object.freeze(unreferencedIds),
        repeatedCount: Object.values(associationLedger.reverseIndexes.byPhotoId).filter((ids) => ids.length > 1).length,
        pathCount: photos.filter((photo) => photo.sourceRelativePath).length, assetCount: photos.length,
        targetLayerId: target?.id || null, includeUnreferenced });
      loadedPlans.set(review, { operation: loadedImport, draftIds: [...importIds], eligibleIds: [...eligibleIds],
        target, members: target?.photoIds, sources: target?.spatialSources, positioning });
      return review;
    },
    // One checkpoint/publication for ownership + links + occurrence evidence.
    // Every preflight completes before assets or retained sources change.
    applyLoadedGmiImport(review) {
      const guard = loadedPlans.get(review), target = layers.get(draftTargetLayerId);
      const same = (a, b) => a.length === b.length && a.every((id, index) => id === b[index]);
      if (!guard || guard.operation !== loadedImport || loadedImport?.state !== 'ready'
        || !loadedImport.isLive(loadedImport.binding) || guard.positioning !== positioning
        || review.targetLayerId !== draftTargetLayerId
        || !same(guard.draftIds, importIds) || !same(guard.eligibleIds, appendPolicy()?.appendableIds || importIds)
        || (draftTargetLayerId && (!target || target.photoIds !== guard.members || target.spatialSources !== guard.sources)))
        return { ok: false, error: 'review-changed' };
      if (!target && !review.includedIds.length) return { ok: false, error: 'empty-import' };
      let name = 'Bilder', suffix = 1;
      while ([...layers.values()].some((layer) => layer.name === name)) name = `Bilder (${++suffix})`;
      const ids = Object.freeze([...(target?.photoIds || []), ...review.includedIds]);
      const base = target || { id: `photo-layer-${createId()}`, type: 'FOTO', name, visible: true, createdAt: Date.now(), spatialSources: [] };
      const layer = Object.freeze({ ...base, photoIds: ids, photoCount: ids.length });
      let plan;
      try {
        // GML import is optional and remains candidate-only, as in ordinary import.
        if (positioning.source) for (const match of matchPhotoReferences(positioning.source.entries, assetPhotos(review.includedIds)).matches) {
          if (match.status === 'matched') createPhotoCandidate({ ...positioning.source.entries.find((entry) => entry.id === match.entryId), id: `preflight:${match.entryId}`, kind: 'gml' });
        }
        plan = planGmiAssociations(layer, Object.freeze({ ...review.source, associationLedger: review.associationLedger }), review.associationLedger);
      } catch { return { ok: false, error: 'invalid-source' }; }
      commitGmiPlan(plan);
      if (positioning.source) {
        const gml = attachSource(positioning.source, review.includedIds);
        const committed = layers.get(layer.id);
        layers.set(layer.id, Object.freeze({ ...committed, spatialSources: Object.freeze([...committed.spatialSources, gml]) }));
      }
      release(importIds.filter((id) => !review.includedIds.includes(id)));
      transferDraft(); loadedPlans.delete(review); publish();
      return { ok: true, layer: layers.get(layer.id), sourceId: review.source.id };
    },
    beginSourceWorkflow(layerId) {
      const layer = layers.get(layerId);
      if (!layer) return null;
      const ticket = Object.freeze({ operationId: createId(), layerId, generation, memberIds: layer.photoIds });
      sourceWorkflows.set(layerId, ticket);
      workflowMembers.set(ticket, layer.photoIds);
      sourceRequests.set(layerId, (sourceRequests.get(layerId) || 0) + 1);
      if (sourceReviews.delete(layerId)) publish();
      return ticket;
    },
    sourceWorkflowIsLive,
    endSourceWorkflow(ticket) {
      if (!ticket || sourceWorkflows.get(ticket.layerId) !== ticket) return;
      sourceWorkflows.delete(ticket.layerId);
      sourceRequests.set(ticket.layerId, (sourceRequests.get(ticket.layerId) || 0) + 1);
      sourceReviews.delete(ticket.layerId);
      publish();
    },
    saveSourceWorkflowSource(ticket, expectedReview) {
      if (!sourceWorkflowIsLive(ticket)) return { ok: false, error: 'membership-changed' };
      const review = sourceReviews.get(ticket.layerId), layer = layers.get(ticket.layerId);
      if (!review || review.state !== 'ready' || review.source !== expectedReview?.source
        || review.recheck !== expectedReview.recheck) return { ok: false, error: 'source-changed' };
      if (review.source.kind === 'gmi') return this.applyGmiAssociations(ticket.layerId, {
        confirmed: true, sourceId: review.source.id, memberIds: layer.photoIds,
        associationLedger: expectedReview.associationLedger,
      });
      if (review.source.kind !== 'gml') return { ok: false, error: 'unsupported-source' };
      if (review.recheck && !layer.spatialSources.includes(review.source)) return { ok: false, error: 'source-removed' };
      if (!review.recheck && layer.spatialSources.some((source) => source.fingerprint === review.source.fingerprint))
        return { ok: false, error: 'duplicate-source' };
      // Validate every attachment before the first record write.
      try {
        for (const match of matchPhotoReferences(review.source.entries, assetPhotos(layer.photoIds)).matches) {
          if (match.status !== 'matched') continue;
          const entry = review.source.entries.find((item) => item.id === match.entryId);
          createPhotoCandidate({ ...entry, id: `${review.source.id}:${entry.id}`, kind: 'gml' });
        }
      } catch { return { ok: false, error: 'invalid-source' }; }
      return { ok: this.applyLayerSource(ticket.layerId) };
    },
    reviewSourceWorkflowPositions(ticket) {
      if (!sourceWorkflowIsLive(ticket) || sourceReviews.has(ticket.layerId)) return null;
      const layer = layers.get(ticket.layerId);
      const plan = planPhotoSourcePositions(layer.photoIds.map((id) => records.get(id)), layer.spatialSources);
      workflowReviews.set(plan, { ticket, sources: layer.spatialSources });
      return plan;
    },
    applySourceWorkflowPositions(ticket, plan, requests) {
      const reviewed = workflowReviews.get(plan), layer = layers.get(ticket?.layerId);
      if (!sourceWorkflowIsLive(ticket) || reviewed?.ticket !== ticket || reviewed.sources !== layer.spatialSources
        || sourceReviews.has(ticket.layerId)) return { ok: false, error: 'review-changed' };
      if (!requests?.length) return { ok: false, error: 'invalid-selection' };
      const seen = new Set();
      for (const request of requests) {
        const row = plan.rows.find((item) => item.photoId === request.photoId);
        const live = records.get(request.photoId);
        const candidate = row?.options.find((item) => item.id === request.candidateId);
        if (seen.has(request.photoId) || !live || !row || live.spatial.current !== row.current
          || !candidate || !live.spatial.candidates.includes(candidate)
          || candidate.status !== 'viable' || !isPhotoPosition(candidate.position)
          || (['gml', 'gmi'].includes(candidate.kind) && !layer.spatialSources.some((source) => source.kind === candidate.kind && source.id === candidate.sourceId)))
          return { ok: false, error: 'review-changed' };
        seen.add(request.photoId);
      }
      const acceptedAt = Date.now();
      for (const request of requests) updateRecord(request.photoId, (live) => ({
        spatial: acceptPhotoCandidate(live.spatial, request.candidateId, 'explicit-candidate', acceptedAt),
      }));
      workflowReviews.delete(plan);
      publish();
      return { ok: true, acceptedIds: [...seen] };
    },
    beginManualPlacement(layerId, photoId) {
      if (!layers.get(layerId)?.visible || !layers.get(layerId)?.photoIds.includes(photoId)) return null;
      const ticket = Object.freeze({ layerId, photoId, generation, editVersion: ++editVersion, visibilityVersion: manualVisibilityVersions.get(layerId) || 0, expectedCurrent: records.get(photoId).spatial.current });
      manualTickets.add(ticket);
      return ticket;
    },
    manualPlacementIsLive,
    cancelManualPlacement(ticket) { if (ticket) manualTickets.delete(ticket); },
    applyManualPlacement(ticket, position) {
      if (!manualPlacementIsLive(ticket)) return { ok: false, error: 'placement-changed' };
      const live = records.get(ticket.photoId);
      const spatial = acceptManualPhotoPosition(live.spatial, position);
      if (!spatial) return { ok: false, error: 'invalid-position' };
      // Only current changes; the latest preview, metadata and source evidence survive.
      updateRecord(ticket.photoId, () => ({ spatial }));
      manualTickets.delete(ticket);
      publish();
      return { ok: true };
    },
    beginDirectionEdit(layerId, photoId) {
      if (!layers.get(layerId)?.visible || !layers.get(layerId)?.photoIds.includes(photoId)) return null;
      const ticket = Object.freeze({ layerId, photoId, generation, editVersion: ++editVersion,
        visibilityVersion: manualVisibilityVersions.get(layerId) || 0, expectedCurrent: records.get(photoId).direction.current });
      directionTickets.add(ticket);
      return ticket;
    },
    directionEditIsLive,
    cancelDirectionEdit(ticket) { if (ticket) directionTickets.delete(ticket); },
    applyDirectionEdit(ticket, degrees) {
      if (!directionEditIsLive(ticket)) return { ok: false, error: 'direction-changed' };
      const direction = acceptManualPhotoDirection(degrees);
      if (!direction) return { ok: false, error: 'invalid-direction' };
      updateRecord(ticket.photoId, () => ({ direction }));
      directionTickets.delete(ticket);
      publish();
      return { ok: true };
    },
    // Owner-scoped, deduplicated asset writes. Stale occurrences are ignored;
    // invalid values and stale evidence fail before any write.
    setCaptureMetadata(layerId, photoIds, field, input, { evidenceId = null } = {}) {
      if (!['captureTime', 'photographer'].includes(field)) return { ok: false, error: 'invalid-field', assetIds: [] };
      const members = layerId ? layers.get(layerId)?.photoIds || [] : importIds;
      const ids = assetIds(photoIds.filter((id) => members.includes(id)));
      const changes = [];
      for (const assetId of ids) {
        const asset = assets.get(assetId);
        const evidence = evidenceId ? asset.metadataEvidence.find((item) => item.id === evidenceId && item.field === field) : null;
        const value = evidenceId ? evidence?.value : input === null ? null
          : field === 'captureTime' ? normalizeCaptureTime(input) : normalizePhotographer(input);
        if ((evidenceId && !value) || (input !== null && !evidenceId && !value)) return { ok: false, error: 'invalid-value', assetIds: [] };
        const accepted = value === null ? null : immutable({ value, provenance: evidence
          ? { kind: evidence.kind, evidenceId: evidence.id, sourceId: evidence.sourceId || null,
            sourceFilename: evidence.sourceFilename || null, sourceEntryId: evidence.sourceEntryId || null, tag: evidence.tag || null, raw: evidence.raw }
          : { kind: 'manual' }, acceptedAt: Date.now() });
        changes.push([assetId, accepted]);
      }
      for (const [assetId, accepted] of changes) updateAsset(assetId, (asset) => ({ captureMetadata: immutable({ ...asset.captureMetadata, [field]: accepted }) }));
      if (changes.length) publish();
      return { ok: true, assetIds: ids };
    },
    adoptSourceEvidence(layerId, field, kind = 'exif', photoIds = null) {
      if (!['captureTime', 'photographer', 'direction'].includes(field) || !['exif', 'gml'].includes(kind)) return { ok: false, error: 'invalid-field' };
      const members = layers.get(layerId)?.photoIds || [];
      const photos = members.map((id) => {
        const record = records.get(id), asset = assets.get(record.assetId);
        return { ...record, captureMetadata: asset.captureMetadata, metadataEvidence: asset.metadataEvidence, directionEvidence: asset.directionEvidence };
      });
      const plan = planEvidenceAdoption(photos, field, kind, photoIds || members);
      const acceptedAt = Date.now();
      for (const target of plan.targets) {
        if (field === 'direction') records.set(target.photoId, { ...records.get(target.photoId),
          direction: acceptEvidencePhotoDirection(target.evidence, target.agreeingEvidence, acceptedAt) });
        else {
          const asset = assets.get(target.assetId), evidence = target.evidence;
          // Metadata is projected from the asset; avoid a record scan per asset.
          assets.set(target.assetId, { ...asset, captureMetadata: immutable({ ...asset.captureMetadata, [field]: {
            value: evidence.value, provenance: { kind: evidence.kind, evidenceId: evidence.id, tag: evidence.tag || null,
              sourceId: evidence.sourceId || null, sourceFilename: evidence.sourceFilename || null,
              sourceEntryId: evidence.sourceEntryId || null, raw: evidence.raw, evidence: target.agreeingEvidence }, acceptedAt,
          } }) });
        }
      }
      if (plan.targets.length) publish();
      return { ok: true, ...plan, counts: { ...plan.counts, adopted: plan.targets.length } };
    },
    getFile: fileFor,
    getAssetFile: (assetId) => assets.get(assetId)?.file || null,
    getPhoto: (id) => records.has(id) ? publicPhoto(records.get(id)) : null,
    getLayerPhotos(layerId) {
      const layer = layers.get(layerId);
      if (!layer) return [];
      const peers = new Map();
      for (const id of layer.photoIds) {
        const record = records.get(id);
        if (!peers.has(record.assetId)) peers.set(record.assetId, []);
        peers.get(record.assetId).push(record);
      }
      return layer.photoIds.map((id) => publicPhoto(records.get(id), { layer, peers }));
    },
    getLayer: (id) => layers.get(id) || null,
    getGmiPhotoAssociations(layerId, photoId) {
      return gmiPhotoAssociations(layers.get(layerId), photoId);
    },
    async importPositioningGml(file) {
      const owner = draftToken, request = ++gmlRequest;
      positioning = Object.freeze({ ...positioning, state: 'pending', errorCode: null });
      publish();
      try {
        const source = await makeSource(file, 'gml');
        if (owner !== draftToken || request !== gmlRequest) return false;
        positioning = Object.freeze({ state: 'ready', source, errorCode: null, ledger: null });
        publish();
        return true;
      } catch (error) {
        if (owner !== draftToken || request !== gmlRequest) return false;
        positioning = Object.freeze({ ...positioning, state: 'error', errorCode: error.code || 'gml-read-failed' });
        publish();
        return false;
      }
    },
    discardPositioningError() {
      if (positioning.state !== 'error') return;
      positioning = Object.freeze({ ...positioning, state: positioning.source ? 'ready' : 'empty', errorCode: null });
      publish();
    },
    async stageLayerSource(layerId, file, kind = 'gml') {
      if (!layers.has(layerId)) return false;
      const ownerGeneration = generation;
      const request = (sourceRequests.get(layerId) || 0) + 1;
      sourceRequests.set(layerId, request);
      const previous = sourceReviews.get(layerId);
      sourceReviews.set(layerId, Object.freeze({ ...previous, state: 'pending', errorCode: null }));
      publish();
      try {
        const source = await makeSource(file, kind);
        if (generation !== ownerGeneration || !layers.has(layerId) || sourceRequests.get(layerId) !== request) return false;
        const attached = layers.get(layerId).spatialSources.find((item) => item.fingerprint === source.fingerprint);
        if (attached) {
          throw Object.assign(new Error('duplicate-source'), { code: 'duplicate-source', attachedSourceId: attached.id });
        }
        sourceReviews.set(layerId, Object.freeze({ state: 'ready', source, errorCode: null, recheck: false }));
        publish(); return true;
      } catch (error) {
        if (generation !== ownerGeneration || !layers.has(layerId) || sourceRequests.get(layerId) !== request) return false;
        sourceReviews.set(layerId, Object.freeze({ ...previous, state: 'error', errorCode: error.code || 'source-read-failed', attachedSourceId: error.attachedSourceId || null }));
        publish(); return false;
      }
    },
    recheckLayerSource(layerId, sourceId) {
      const source = layers.get(layerId)?.spatialSources.find((item) => item.id === sourceId);
      if (!source) return false;
      sourceRequests.set(layerId, (sourceRequests.get(layerId) || 0) + 1);
      sourceReviews.set(layerId, Object.freeze({ state: 'ready', source, errorCode: null, recheck: true }));
      publish(); return true;
    },
    cancelLayerSourceReview(layerId) {
      sourceRequests.set(layerId, (sourceRequests.get(layerId) || 0) + 1);
      sourceReviews.delete(layerId); publish();
    },
    discardLayerSourceError(layerId) {
      const review = sourceReviews.get(layerId);
      if (review?.state !== 'error') return;
      if (!review.source) sourceReviews.delete(layerId);
      else sourceReviews.set(layerId, Object.freeze({ ...review, state: 'ready', errorCode: null }));
      publish();
    },
    applyLayerSource(layerId) {
      const layer = layers.get(layerId), review = sourceReviews.get(layerId);
      if (!layer || review?.state !== 'ready' || review.source.kind === 'gmi') return false;
      const source = attachSource(review.source, layer.photoIds);
      const existing = layer.spatialSources.some((item) => item.id === source.id);
      const sources = existing ? layer.spatialSources.map((item) => item.id === source.id ? source : item)
        : [...layer.spatialSources, source];
      layers.set(layerId, Object.freeze({ ...layer, spatialSources: Object.freeze(sources) }));
      sourceReviews.delete(layerId);
      sourceRequests.set(layerId, (sourceRequests.get(layerId) || 0) + 1);
      publish(); return true;
    },
    // Checkpoint A: source, asset associations and point occurrences, never current.
    // Construct the entire change before publishing any occurrence/source writes.
    applyGmiAssociations(layerId, { confirmed = false, sourceId, memberIds, associationLedger } = {}) {
      const layer = layers.get(layerId), review = sourceReviews.get(layerId);
      if (!confirmed || !layer || review?.state !== 'ready' || review.source?.kind !== 'gmi'
        || review.source.id !== sourceId || review.associationLedger !== associationLedger
        || !memberIds || memberIds.length !== layer.photoIds.length
        || memberIds.some((id, index) => id !== layer.photoIds[index])) return { ok: false, error: 'review-changed' };
      if (review.recheck && !layer.spatialSources.some((source) => source.id === sourceId)) return { ok: false, error: 'source-removed' };
      const source = Object.freeze({ ...review.source, associationLedger });
      const existing = layer.spatialSources.some((item) => item.id === sourceId);
      if (!existing && layer.spatialSources.some((item) => item.kind === 'gmi' && item.fingerprint === source.fingerprint))
        return { ok: false, error: 'duplicate-source' };
      let plan;
      try { plan = planGmiAssociations(layer, source, associationLedger); }
      catch { return { ok: false, error: 'invalid-source' }; }
      commitGmiPlan(plan);
      const { photoIds } = plan;
      const workflow = sourceWorkflows.get(layerId);
      if (workflow && workflowMembers.get(workflow) === layer.photoIds) workflowMembers.set(workflow, photoIds);
      sourceReviews.delete(layerId);
      sourceRequests.set(layerId, (sourceRequests.get(layerId) || 0) + 1);
      publish(); return { ok: true };
    },
    removeGmiSource(layerId, sourceId, { confirmed = false } = {}) {
      const layer = layers.get(layerId);
      if (!confirmed || !layer?.spatialSources.some((source) => source.id === sourceId && source.kind === 'gmi')) return false;
      layers.set(layerId, Object.freeze({ ...layer,
        spatialSources: Object.freeze(layer.spatialSources.filter((source) => source.id !== sourceId)) }));
      sourceReviews.delete(layerId);
      sourceRequests.set(layerId, (sourceRequests.get(layerId) || 0) + 1);
      publish(); return true;
    },
    // Explicit wizard confirmation: evidence + selected current positions publish together.
    // The same immutable candidate/current records and owner-scoped matching remain canonical.
    applyPhotoPositioning(layerId, { kind, sourceId = null, memberIds, requests }) {
      const layer = layers.get(layerId);
      const fail = (error) => ({ ok: false, error });
      if (!layer || !memberIds || memberIds.length !== layer.photoIds.length
        || memberIds.some((id, index) => id !== layer.photoIds[index])) return fail('membership-changed');
      if (!['gml', 'exif'].includes(kind) || !requests?.length) return fail('invalid-selection');
      const review = sourceReviews.get(layerId);
      if (kind === 'gml' && (review?.state !== 'ready' || review.source.id !== sourceId)) return fail('source-changed');
      const proposed = new Map();
      if (kind === 'gml') {
        const source = review.source;
        const ledger = matchPhotoReferences(source.entries, assetPhotos(layer.photoIds));
        // Preflight every attachment before writing anything (including diagnostic evidence).
        try {
          for (const match of ledger.matches.filter((item) => item.status === 'matched')) {
            const entry = source.entries.find((item) => item.id === match.entryId);
            proposed.set(match.photoId, createPhotoCandidate({ ...entry, id: `${source.id}:${entry.id}`, kind: entry.kind || source.kind,
              sourceId: source.id, sourceFilename: source.filename, sourceEntryId: entry.id }));
          }
        } catch { return fail('invalid-source'); }
      }
      const seen = new Set();
      for (const request of requests) {
        const live = records.get(request.photoId);
        if (!layer.photoIds.includes(request.photoId) || seen.has(request.photoId)
          || !live || live.spatial.current !== request.expectedCurrent) return fail('review-changed');
        const candidate = kind === 'gml' ? proposed.get(live.assetId)
          : live.spatial.candidates.find((item) => item.id === request.candidateId && item.kind === 'exif');
        if (candidate?.id !== request.candidateId || candidate?.status !== 'viable' || !isPhotoPosition(candidate.position)) return fail('review-changed');
        seen.add(request.photoId);
      }
      if (kind === 'gml') {
        const source = attachSource(review.source, layer.photoIds);
        const existing = layer.spatialSources.some((item) => item.id === source.id);
        const sources = existing ? layer.spatialSources.map((item) => item.id === source.id ? source : item) : [...layer.spatialSources, source];
        layers.set(layerId, Object.freeze({ ...layer, spatialSources: Object.freeze(sources) }));
        sourceReviews.delete(layerId);
        sourceRequests.set(layerId, (sourceRequests.get(layerId) || 0) + 1);
      }
      const acceptedAt = Date.now();
      for (const request of requests) updateRecord(request.photoId, (live) => ({
        spatial: acceptPhotoCandidate(live.spatial, request.candidateId, 'explicit-candidate', acceptedAt),
      }));
      publish();
      return { ok: true, acceptedIds: [...seen] };
    },
    removeLayerPhotos(layerId, photoIds, { confirmed = false } = {}) {
      const layer = layers.get(layerId);
      if (!layer || !confirmed) return [];
      const requested = new Set(photoIds);
      const removed = layer.photoIds.filter((id) => requested.has(id));
      if (!removed.length) return [];
      const remaining = layer.photoIds.filter((id) => !requested.has(id));
      const remainingAssets = assetIds(remaining);
      layers.set(layerId, Object.freeze({ ...layer, photoIds: Object.freeze(remaining), photoCount: remaining.length,
        assetIdsByPhotoId: Object.freeze(Object.fromEntries(remaining.map((id) => [id, records.get(id).assetId]))),
        dismissedGmiPlacements: Object.freeze([...new Set([...(layer.dismissedGmiPlacements || []),
          ...removed.map((id) => records.get(id).occurrence?.key).filter(Boolean)])]),
        spatialSources: Object.freeze(layer.spatialSources.map((source) => source.kind === 'gmi'
          ? pruneGmiPhotoSource(source, remainingAssets) : prunePhotoSource(source, remainingAssets))),
      }));
      release(removed); publish(); return removed;
    },
    removeLayerAssets(layerId, requestedAssetIds, options) {
      const requested = new Set(requestedAssetIds);
      return this.removeLayerPhotos(layerId, (layers.get(layerId)?.photoIds || []).filter((id) => requested.has(records.get(id).assetId)), options);
    },
    // One owner-scoped API for single acceptance and a future batch operation.
    // It validates each pair, updates only current, and publishes once.
    acceptCandidates(layerId, requests) {
      const layer = layers.get(layerId);
      if (!layer) return [];
      const accepted = [];
      const seen = new Set();
      for (const { photoId, candidateId } of requests) {
        if (seen.has(photoId) || !layer.photoIds.includes(photoId)) continue;
        seen.add(photoId);
        const live = records.get(photoId);
        const spatial = acceptPhotoCandidate(live.spatial, candidateId);
        if (spatial) { updateRecord(photoId, () => ({ spatial })); accepted.push(photoId); }
      }
      if (accepted.length) publish();
      return accepted;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    importFiles(files) {
      const acceptedIds = [];
      const rejectedNames = [];
      for (const file of files) {
        const classification = classifyPhotoFile(file);
        if (!classification.candidate) { rejectedNames.push(file.name); continue; }
        const id = createId();
        const errorCode = !classification.supported ? 'unsupported-format' : !file.size ? 'empty-file' : null;
        assets.set(id, {
          file, originalFilename: file.name, mimeType: file.type || null,
          size: file.size, lastModified: file.lastModified, importedAt: Date.now(), source: 'local-file',
          dimensions: null, captureMetadata: emptyCaptureMetadata(), metadataEvidence: immutable([]),
          sourceRelativePath: file.webkitRelativePath || null,
          spatial: emptySpatial(),
          preview: Object.freeze({ state: errorCode ? 'error' : 'pending', thumbnailUrl: null, errorCode }),
        });
        records.set(id, makeOccurrence(id));
        acceptedIds.push(id);
        importIds.push(id);
        if (!errorCode) queue.push({ id, generation });
        metadataQueue.push({ id, generation });
      }
      if (!selectedId) selectedId = acceptedIds[0] || null;
      lastImport = Object.freeze({ acceptedCount: acceptedIds.length, rejectedNames: Object.freeze(rejectedNames) });
      publish();
      void drain();
      void drainMetadata();
      return { acceptedIds, rejectedNames };
    },
    select(id) {
      if (!importIds.includes(id) || id === selectedId) return;
      selectedId = id;
      publish();
    },
    toggleBatchSelection(id) {
      if (!importIds.includes(id)) return;
      if (batchSelectedIds.has(id)) batchSelectedIds.delete(id);
      else batchSelectedIds.add(id);
      publish();
    },
    selectAll() { batchSelectedIds = new Set(appendPolicy()?.appendableIds || importIds); publish(); },
    setAppendDuplicateOverride(id, allowed) {
      if (!appendPolicy()?.targetCollisions.some((item) => item.photoId === id)) return false;
      if (allowed) appendOverrideIds.add(id); else appendOverrideIds.delete(id);
      publish(); return true;
    },
    clearSelection() { batchSelectedIds.clear(); publish(); },
    removeSelected() {
      const oldIndex = importIds.indexOf(selectedId);
      const removed = importIds.filter((id) => batchSelectedIds.has(id));
      importIds = importIds.filter((id) => !batchSelectedIds.has(id));
      release(removed);
      if (!importIds.includes(selectedId)) selectedId = importIds[Math.min(oldIndex, importIds.length - 1)] || null;
      batchSelectedIds.clear();
      publish();
    },
    beginImport(targetLayerId = null) {
      if (targetLayerId && !layers.has(targetLayerId)) return false;
      clearImport(); draftTargetLayerId = targetLayerId; publish(); return true;
    },
    cancelImport: clearImport,
    createLayer() {
      if (loadedImport || draftTargetLayerId || !importIds.length || ['pending', 'error'].includes(positioning.state)) return null;
      const source = positioning.source;
      const attached = source ? attachSource(source, importIds) : null;
      let suffix = 1;
      let name = 'Bilder';
      const names = new Set(Array.from(layers.values(), (layer) => layer.name));
      while (names.has(name)) name = `Bilder (${++suffix})`;
      const layer = Object.freeze({
        id: `photo-layer-${createId()}`, type: 'FOTO', name,
        photoIds: Object.freeze([...importIds]), photoCount: importIds.length, assetCount: importIds.length,
        assetIdsByPhotoId: Object.freeze(Object.fromEntries(importIds.map((id) => [id, records.get(id).assetId]))),
        visible: true, createdAt: Date.now(),
        spatialSources: Object.freeze(attached ? [attached] : []),
        ...photoSpatialCounts(importIds.map((id) => records.get(id))),
      });
      layers.set(layer.id, layer);
      transferDraft();
      publish();
      return layer;
    },
    appendImport() {
      const layer = layers.get(draftTargetLayerId);
      const policy = appendPolicy();
      if (loadedImport || !layer || !policy.appendableIds.length || ['pending', 'error'].includes(positioning.state)) return null;
      // Import retains evidence only for new curated assets; acceptance is separate.
      const source = positioning.source ? attachSource(positioning.source, policy.appendableIds) : null;
      const updated = Object.freeze({ ...layer, photoIds: Object.freeze([...layer.photoIds, ...policy.appendableIds]),
        photoCount: layer.photoIds.length + policy.appendableIds.length,
        assetIdsByPhotoId: Object.freeze({ ...layer.assetIdsByPhotoId, ...Object.fromEntries(policy.appendableIds.map((id) => [id, records.get(id).assetId])) }),
        spatialSources: Object.freeze([...layer.spatialSources, ...(source ? [source] : [])]),
      });
      layers.set(layer.id, updated); release(policy.skippedIds); transferDraft(); publish(); return layers.get(layer.id);
    },
    setLayerVisibility(id, visible) {
      const layer = layers.get(id);
      if (!layer || layer.visible === visible) return;
      manualVisibilityVersions.set(id, (manualVisibilityVersions.get(id) || 0) + 1);
      layers.set(id, Object.freeze({ ...layer, visible }));
      publish();
    },
    setAllLayersVisible(visible) {
      for (const [id, layer] of layers) {
        if (layer.visible !== visible) manualVisibilityVersions.set(id, (manualVisibilityVersions.get(id) || 0) + 1);
        layers.set(id, Object.freeze({ ...layer, visible }));
      }
      publish();
    },
    deleteLayer(id) {
      const layer = layers.get(id);
      if (!layer) return;
      layers.delete(id);
      sourceWorkflows.delete(id);
      sourceReviews.delete(id); sourceRequests.delete(id);
      release(layer.photoIds);
      if (draftTargetLayerId === id) clearImport();
      publish();
    },
    clear() {
      loadedImport = null;
      generation++;
      draftToken++;
      gmlRequest++;
      positioning = EMPTY_PHOTO_SNAPSHOT.positioning;
      release(Array.from(records.keys()));
      layers.clear();
      sourceWorkflows.clear();
      sourceReviews.clear(); sourceRequests.clear(); draftTargetLayerId = null;
      appendOverrideIds.clear();
      importIds = [];
      selectedId = null;
      batchSelectedIds.clear();
      lastImport = null;
      publish();
    },
  };
}

export const photoSession = createPhotoSession();
