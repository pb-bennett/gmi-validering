import { classifyPhotoFile, createPhotoThumbnail } from './imagePreview.mjs';
import { readExifGps } from './exifGps.mjs';
import { acceptManualPhotoPosition, acceptPhotoCandidate, createPhotoCandidate, emptySpatial, immutable, isPhotoPosition, photoSpatialCounts } from './photoSpatial.mjs';
import { matchPhotoReferences } from './photoReferenceMatching.mjs';
import { duplicatePhotoNames, photoAppendPolicy, prunePhotoSource, reviewPhotoSource } from './photoPositionSources.mjs';

export const EMPTY_PHOTO_SNAPSHOT = Object.freeze({
  photos: Object.freeze([]), selectedId: null, batchSelectedIds: Object.freeze([]),
  photoLayers: Object.freeze([]), lastImport: null,
  draftTargetLayerId: null, appendStatus: null, duplicateNames: Object.freeze([]), sourceReviews: Object.freeze({}),
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
  const manualTickets = new WeakSet();
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
  const appendOverrideIds = new Set();
  const sourceReviews = new Map();
  const sourceRequests = new Map();

  async function makeSource(file, kind) {
    const adapter = sourceAdapters[kind] || (kind === 'gml' ? parseGml : null);
    if (!adapter) throw Object.assign(new Error('unsupported-source'), { code: 'unsupported-source' });
    const parsed = await adapter(file);
    const evidence = JSON.stringify({ kind, ...parsed });
    // Keep existing HTTP/LAN import support: Web Crypto is restricted to secure contexts.
    // Exact evidence comparison is conservative; never substitute a collision-prone hash.
    let fingerprint = `evidence-json:${evidence}`;
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidence));
      fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return immutable({ ...parsed, id: `photo-${kind}-${createId()}`, kind, fingerprint, filename: file.name, importedAt: Date.now() });
  }

  function attachSource(source, photoIds, initializeCurrent) {
    const ledger = matchPhotoReferences(source.entries, photoIds.map((id) => records.get(id)));
    for (const match of ledger.matches) {
      if (match.status !== 'matched') continue;
      const entry = source.entries.find((item) => item.id === match.entryId);
      const candidate = createPhotoCandidate({ ...entry, id: `${source.id}:${entry.id}`, kind: entry.kind || source.kind,
        sourceId: source.id, sourceFilename: source.filename, sourceEntryId: entry.id });
      updateRecord(match.photoId, (live) => {
        if (live.spatial.candidates.some((item) => item.sourceId === source.id && item.sourceEntryId === entry.id)) return {};
        let spatial = Object.freeze({ ...live.spatial, candidates: Object.freeze([...live.spatial.candidates, candidate]) });
        if (initializeCurrent && !spatial.current && candidate.status === 'viable') spatial = acceptPhotoCandidate(spatial, candidate.id, 'initial-confident-gml-match');
        return { spatial };
      });
    }
    return immutable({ ...source, ledger });
  }

  function manualPlacementIsLive(ticket) {
    return Boolean(ticket && manualTickets.has(ticket) && ticket.generation === generation
      && ticket.visibilityVersion === (manualVisibilityVersions.get(ticket.layerId) || 0)
      && layers.get(ticket.layerId)?.visible
      && layers.get(ticket.layerId)?.photoIds.includes(ticket.photoId)
      && records.get(ticket.photoId)?.spatial.current === ticket.expectedCurrent);
  }

  function transferDraft() {
    draftToken++; gmlRequest++;
    positioning = EMPTY_PHOTO_SNAPSHOT.positioning;
    importIds = []; selectedId = null; batchSelectedIds.clear(); lastImport = null; draftTargetLayerId = null;
    appendOverrideIds.clear();
  }

  const publicPhoto = ({ file: _file, ...photo }) => Object.freeze(photo);

  // Never write a record captured before an await back into the registry.
  // Each writer owns a field patch; all other live fields survive completion.
  function updateRecord(id, patch, jobGeneration = generation) {
    const current = records.get(id);
    if (!current || jobGeneration !== generation) return false;
    records.set(id, { ...current, ...patch(current) });
    return true;
  }

  const appendPolicy = () => draftTargetLayerId ? photoAppendPolicy(importIds.map((id) => records.get(id)),
    (layers.get(draftTargetLayerId)?.photoIds || []).map((id) => records.get(id)), appendOverrideIds) : null;
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
        updateRecord(id, () => ({ spatial: skippedSpatial() }));
      } else if (!skipped.has(id) && live.spatial.exifRead.state === 'skipped-duplicate') {
        updateRecord(id, () => ({ spatial: emptySpatial() }));
        metadataQueue.push({ id, generation });
        resumedMetadata = true;
      }
    }
    if (positioning.source) positioning = Object.freeze({ ...positioning, ledger: matchPhotoReferences(positioning.source.entries,
      (appendStatus?.appendableIds || importIds).map((id) => records.get(id))) });
    for (const [id, layer] of layers) {
      const counts = photoSpatialCounts(layer.photoIds.map((photoId) => records.get(photoId)));
      if (Object.keys(counts).some((key) => counts[key] !== layer[key])) layers.set(id, Object.freeze({ ...layer, ...counts }));
    }
    for (const [id, review] of sourceReviews) {
      if (review.source && layers.has(id)) sourceReviews.set(id, Object.freeze({ ...review,
        ...reviewPhotoSource(review.source, layers.get(id).photoIds.map((photoId) => records.get(photoId))),
      }));
    }
    snapshot = Object.freeze({
      photos: Object.freeze(importIds.map((id) => publicPhoto(records.get(id)))),
      selectedId,
      batchSelectedIds: Object.freeze(importIds.filter((id) => batchSelectedIds.has(id))),
      photoLayers: Object.freeze(Array.from(layers.values()).reverse()),
      lastImport,
      positioning,
      draftTargetLayerId,
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
        const record = records.get(job?.id);
        if (!record || job.generation !== generation || record.spatial.exifRead.state === 'skipped-duplicate') continue;
        activeMetadata = { id: job.id, cancelled: false };
        const token = activeMetadata;
        let result;
        try { result = await extractGps(record.file); }
        catch { result = { state: 'error', errorCode: 'gps-read-failed', candidate: null }; }
        if (!token.cancelled && updateRecord(job.id, (live) => ({
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
        const record = records.get(job.id);
        if (!record) continue;
        const controller = new AbortController();
        activeJob = { id: job.id, controller };
        let thumbnailUrl = null;
        try {
          const result = await createThumbnail(record.file, { signal: controller.signal });
          if (job.generation !== generation || !records.has(job.id)) continue;
          thumbnailUrl = urls.createObjectURL(result.thumbnailBlob);
          const previousUrl = records.get(job.id).preview.thumbnailUrl;
          if (previousUrl) urls.revokeObjectURL(previousUrl);
          updateRecord(job.id, () => ({
            dimensions: Object.freeze(result.dimensions),
            preview: Object.freeze({ state: 'ready', thumbnailUrl, errorCode: null }),
          }), job.generation);
          thumbnailUrl = null; // Ownership transferred to the registry.
          publish();
        } catch (error) {
          if (job.generation === generation && records.has(job.id)) {
            updateRecord(job.id, () => ({
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
    const removed = new Set(ids);
    queue = queue.filter((job) => !removed.has(job.id));
    metadataQueue = metadataQueue.filter((job) => !removed.has(job.id));
    if (removed.has(activeMetadata?.id)) activeMetadata.cancelled = true;
    if (removed.has(activeJob?.id)) activeJob.controller.abort();
    for (const id of removed) {
      const record = records.get(id);
      if (record?.preview.thumbnailUrl) urls.revokeObjectURL(record.preview.thumbnailUrl);
      records.delete(id);
      appendOverrideIds.delete(id);
    }
  }

  function clearImport() {
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

  return {
    getSnapshot: () => snapshot,
    beginManualPlacement(layerId, photoId) {
      if (!layers.get(layerId)?.visible || !layers.get(layerId)?.photoIds.includes(photoId)) return null;
      const ticket = Object.freeze({ layerId, photoId, generation, visibilityVersion: manualVisibilityVersions.get(layerId) || 0, expectedCurrent: records.get(photoId).spatial.current });
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
    getFile: (id) => records.get(id)?.file || null,
    getPhoto: (id) => records.has(id) ? publicPhoto(records.get(id)) : null,
    getLayerPhotos: (layerId) => (layers.get(layerId)?.photoIds || []).map((id) => publicPhoto(records.get(id))),
    getLayer: (id) => layers.get(id) || null,
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
      if (!layer || review?.state !== 'ready') return false;
      const source = attachSource(review.source, layer.photoIds, false);
      const existing = layer.spatialSources.some((item) => item.id === source.id);
      const sources = existing ? layer.spatialSources.map((item) => item.id === source.id ? source : item)
        : [...layer.spatialSources, source];
      layers.set(layerId, Object.freeze({ ...layer, spatialSources: Object.freeze(sources) }));
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
        const ledger = matchPhotoReferences(source.entries, layer.photoIds.map((id) => records.get(id)));
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
        const candidate = kind === 'gml' ? proposed.get(request.photoId)
          : live.spatial.candidates.find((item) => item.id === request.candidateId && item.kind === 'exif');
        if (candidate?.id !== request.candidateId || candidate?.status !== 'viable' || !isPhotoPosition(candidate.position)) return fail('review-changed');
        seen.add(request.photoId);
      }
      if (kind === 'gml') {
        const source = attachSource(review.source, layer.photoIds, false);
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
      layers.set(layerId, Object.freeze({ ...layer, photoIds: Object.freeze(remaining), photoCount: remaining.length,
        spatialSources: Object.freeze(layer.spatialSources.map((source) => prunePhotoSource(source, remaining))),
      }));
      release(removed); publish(); return removed;
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
        records.set(id, {
          id, file, originalFilename: file.name, mimeType: file.type || null,
          size: file.size, lastModified: file.lastModified, importedAt: Date.now(), source: 'local-file',
          dimensions: null,
          sourceRelativePath: file.webkitRelativePath || null,
          spatial: emptySpatial(),
          preview: Object.freeze({ state: errorCode ? 'error' : 'pending', thumbnailUrl: null, errorCode }),
        });
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
      if (draftTargetLayerId || !importIds.length || ['pending', 'error'].includes(positioning.state)) return null;
      const source = positioning.source;
      const attached = source ? attachSource(source, importIds, true) : null;
      let suffix = 1;
      let name = 'Bilder';
      const names = new Set(Array.from(layers.values(), (layer) => layer.name));
      while (names.has(name)) name = `Bilder (${++suffix})`;
      const layer = Object.freeze({
        id: `photo-layer-${createId()}`, type: 'FOTO', name,
        photoIds: Object.freeze([...importIds]), photoCount: importIds.length,
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
      if (!layer || !policy.appendableIds.length || ['pending', 'error'].includes(positioning.state)) return null;
      // Positioning supplied here applies only to the new, curated draft assets.
      const source = positioning.source ? attachSource(positioning.source, policy.appendableIds, true) : null;
      const updated = Object.freeze({ ...layer, photoIds: Object.freeze([...layer.photoIds, ...policy.appendableIds]),
        photoCount: layer.photoIds.length + policy.appendableIds.length,
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
      sourceReviews.delete(id); sourceRequests.delete(id);
      release(layer.photoIds);
      if (draftTargetLayerId === id) clearImport();
      publish();
    },
    clear() {
      generation++;
      draftToken++;
      gmlRequest++;
      positioning = EMPTY_PHOTO_SNAPSHOT.positioning;
      release(Array.from(records.keys()));
      layers.clear();
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
