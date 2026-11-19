import { importPlacementRequests, previewImportPlacement, summarizeImportOutcome } from './photoImportOutcome.mjs';
import { emptyCaptureMetadata, evidenceProvenance, normalizeCaptureTime, normalizePhotographer, gmlCaptureEvidence } from './photoCaptureMetadata.mjs';
import { classifyPhotoFile, createPhotoThumbnail, THUMBNAIL_MAX_EDGE } from './imagePreview.mjs';
import { createDisplayPreviewCache, DISPLAY_PREVIEW_JPEG_QUALITY, DISPLAY_PREVIEW_MAX_EDGE } from './photoDisplayPreviews.mjs';
import { readExifGps } from './exifGps.mjs';
import { acceptManualPhotoPosition, acceptPhotoCandidate, createPhotoCandidate, emptySpatial, immutable, isPhotoPosition, photoSpatialCounts } from './photoSpatial.mjs';
import { matchPhotoReferences } from './photoReferenceMatching.mjs';
import { acceptManualPhotoDirection, acceptEvidencePhotoDirection, emptyDirection, gmlDirectionEvidence, normalizePhotoDirection } from './photoDirection.mjs';
import { planEvidenceAdoption } from './photoEvidenceAdoption.mjs';
import { planAutoCaptureTime, planAutoDirection, planAutoPhotographer } from './photoAutoMetadata.mjs';
import { MANUAL_FILL_FIELDS, normalizeManualPhotoFill, planManualPhotoFill } from './photoManualFill.mjs';
import { estimatedCaptureTime, estimatedDateReviewSignature, photoEstimatedDateModel } from './photoEstimatedDates.mjs';
import { captureCompletionSignature, planCaptureCompletion, selectedCaptureCompletionRows } from './photoCaptureCompletion.mjs';
import { localCalendarDate, planFilenameCaptureSuggestions, selectedFilenameCaptureWrites } from './photoFilenameCaptureTime.mjs';
import { gmlCaptureDecisionWrites, gmlCapturePlanSignature, planGmlCaptureTimeReconciliation, selectedGmlCaptureRows } from './photoGmlCaptureReconciliation.mjs';
import { duplicatePhotoNames, photoAppendPolicy, prunePhotoSource, reviewPhotoSource } from './photoPositionSources.mjs';
import { equivalentGmiPhotoEvidence, gmiPhotoAssociations, gmiPointPosition, parseGmiPhotoSource, pruneGmiPhotoSource, reviewGmiPhotoSource } from './gmiPhotoSource.mjs';
import { photoSourceEvidenceSignature, planPhotoSourcePositions, selectedPhotoSourcePositions } from './photoPositioning.mjs';
import { PHOTO_DELIVERY_INTENTS, buildPhotoDeliverySnapshot, photoDeliveryEntry, photoLayerDelivery } from './photoDeliveryIntent.mjs';
import { photoPositionDeliveryEffect, planPhotoExclusion } from './photoDeliveryChoice.mjs';

export const EMPTY_PHOTO_SNAPSHOT = Object.freeze({
  photos: Object.freeze([]), selectedId: null, batchSelectedIds: Object.freeze([]),
  photoLayers: Object.freeze([]), lastImport: null,
  draftTargetLayerId: null, appendStatus: null, duplicateNames: Object.freeze([]), sourceReviews: Object.freeze({}),
  sourceWorkflowDrafts: Object.freeze({}), loadedImport: null,
  positioning: Object.freeze({ state: 'empty', source: null, errorCode: null, ledger: null }),
});
let fallbackId = 0;

// B2: copy-on-write accepted data for a source-workflow draft. A draft runs the very cores a final save runs, against
// these copies; `touched` records every key a core wrote, so the commit can swap exactly those keys and nothing else.
class DraftMap extends Map {
  constructor(base) {
    super();
    for (const [key, value] of base) super.set(key, value);
    this.touched = new Set();
  }
  set(key, value) { this.touched?.add(key); return super.set(key, value); }
  delete(key) { this.touched?.add(key); return super.delete(key); }
}
const ACCEPTED_MAPS = Object.freeze(['layers', 'assets', 'records', 'deliveryDecisions']);
const commitFailed = () => ({ ok: false, error: 'commit-failed', message: 'Endringene kunne ikke lagres. Ingenting er endret.' });

// A GMI occurrence can have a temporary photo id in the preview. Its association key is stable across both plans.
const importPlacementPlan = (plan, placement) => {
  const requests = importPlacementRequests(plan, placement);
  const byId = new Map(plan.rows.map((row) => [row.photoId, row]));
  const signature = JSON.stringify(requests.map(({ photoId, candidateId }) => {
    const row = byId.get(photoId);
    return [row.occurrence?.key ?? row.assetId, candidateId];
  }));
  return { requests, signature };
};

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
  today = () => localCalendarDate(),
  // Test seam (B2a): called after each write of an atomic commit; a throw there must roll every write back.
  commitFault = null,
} = {}) {
  // Originals and browser resources deliberately live outside Zustand/React snapshots.
  let records = new Map();
  // Assets own File, preview and shared EXIF/GML evidence. Records are occurrences:
  // current position, direction and exact referring point, with shared metadata views.
  let assets = new Map();
  // Map inspection previews: same decoder as thumbnails, bigger output, owned and released here with the asset.
  const displayPreviews = createDisplayPreviewCache({ urls, createPreview: (file, { signal }) => createThumbnail(file, {
    maxEdge: DISPLAY_PREVIEW_MAX_EDGE, quality: DISPLAY_PREVIEW_JPEG_QUALITY, signal }) });
  const workflowMembers = new WeakMap();
  // One Edit-mode transaction per FOTO layer: a ticket of baseline identities, never staged values.
  const editSessions = new Map();
  const captureTimeUndos = new WeakMap();
  let editSerial = 0;
  // Each asset has exactly one owner: the current import or one created FOTO layer.
  // Transfer changes membership, never copies the File or invalidates thumbnail work.
  let layers = new Map();
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
  const importPreviews = new WeakMap();
  const appendOverrideIds = new Set();
  const sourceReviews = new Map();
  const sourceRequests = new Map();
  const gmiReviews = new WeakMap();
  const sourceWorkflows = new Map();
  const workflowReviews = new WeakMap();
  // Combined-delivery decisions (M8), one per occurrence (record id), kept apart from the records so that no
  // positioning, metadata or edit action can change them. The explicit delivery actions write here; the only other
  // writers are the two automatic defaults (GML positions adopted in the source workflow, a saved move away from the
  // originating GMI point), which are committed together with their position and never replace a stored decision
  // or an explicit choice.
  let deliveryDecisions = new Map();
  // Occurrences whose current delivery state the user chose explicitly, including a default state (GMI, Ikke valgt).
  // Presentation input for automatic defaults only; never part of the export snapshot.
  const deliveryChoiceIds = new Set();
  const markDeliveryChoices = (ids) => {
    const before = deliveryChoiceIds.size;
    for (const id of ids) deliveryChoiceIds.add(id);
    return deliveryChoiceIds.size !== before;
  };
  const layerDelivery = (layer) => photoLayerDelivery(layer, records, deliveryDecisions, deliveryChoiceIds);
  const includeAsGml = (ids) => { for (const id of ids) deliveryDecisions.set(id, Object.freeze({ kind: 'unlinked', include: true })); };
  // B1.1: the automatic delivery consequences of accepted positions, planned from the state before the writes.
  // `changes`: [{ photoId, position, includeUnlinked }]. Explicit choices are kept and reported for review.
  const positionDeliveryEffects = (layer, changes) => {
    const delivery = layerDelivery(layer);
    const effects = { transfer: [], restore: [], include: [], keptExplicit: [], keptUnavailable: [] };
    const keys = { transfer: 'transfer', restore: 'restore', include: 'include', 'kept-explicit': 'keptExplicit', 'kept-unavailable': 'keptUnavailable' };
    for (const { photoId, position, includeUnlinked = false } of changes) {
      const effect = photoPositionDeliveryEffect(records.get(photoId), delivery.byPhotoId[photoId], position, { includeUnlinked });
      if (effect) effects[keys[effect]].push(photoId);
    }
    return effects;
  };
  const applyPositionDeliveryEffects = (effects) => {
    includeAsGml(effects.include);
    for (const id of effects.transfer) deliveryDecisions.set(id, Object.freeze({ kind: 'gmi', occurrenceKey: records.get(id).occurrence.key,
      intent: PHOTO_DELIVERY_INTENTS.TRANSFER, automatic: true }));
    for (const id of effects.restore) deliveryDecisions.delete(id);
  };
  const deliveryEffectIds = (effects) => [...effects.include, ...effects.transfer, ...effects.restore];
  const deliveryEffectSummary = (effects) => Object.freeze({ gml: effects.include.length + effects.transfer.length,
    gmi: effects.restore.length, keptExplicit: effects.keptExplicit.length, keptUnavailable: effects.keptUnavailable.length,
    ids: Object.freeze({ ...effects }) });
  const failed = (error) => ({ ok: false, error });

  // Runs fn against copies of the accepted data (seeded from `seed`, the live maps by default). Synchronous by
  // contract: every closure reads these bindings, and the live maps are restored before anything else can run.
  function inDraft(fn, seed = null) {
    const live = { layers, records, assets, deliveryDecisions }, from = seed || live;
    const state = Object.fromEntries(ACCEPTED_MAPS.map((name) => [name, new DraftMap(from[name])]));
    ({ layers, records, assets, deliveryDecisions } = state);
    try { return { result: fn(), state }; }
    finally { ({ layers, records, assets, deliveryDecisions } = live); }
  }
  // Reads a draft state through the ordinary readers; never used to write.
  function readDraft(state, fn) {
    const live = { layers, records, assets, deliveryDecisions };
    ({ layers, records, assets, deliveryDecisions } = state);
    try { return fn(); } finally { ({ layers, records, assets, deliveryDecisions } = live); }
  }

  function commitDraftMaps(state, base = state, before = null) {
    const maps = { layers, records, assets, deliveryDecisions };
    const writes = ACCEPTED_MAPS.flatMap((name) => [...new Set([...base[name].touched, ...state[name].touched])].map((key) => {
      const map = maps[name];
      const baseline = before ? base[name] : map;
      const [had, value] = before?.[name].get(key) ?? [baseline.has(key), baseline.get(key)];
      return { map, key, had, value, has: state[name].has(key), after: state[name].get(key) };
    }));
    if (writes.some(({ map, key, had, value }) => map.has(key) !== had || map.get(key) !== value)) return failed('review-changed');
    const done = [];
    try {
      for (const write of writes) {
        done.push(write);
        if (write.has) write.map.set(write.key, write.after); else write.map.delete(write.key);
        commitFault?.(done.length);
      }
    } catch {
      for (const { map, key, had, value } of done.reverse()) {
        if (had) map.set(key, value); else map.delete(key);
      }
      return commitFailed();
    }
    return { ok: true };
  }
  // One candidate object per source entry (and per GMI association), so a draft re-derived from newer data offers the
  // very candidates it reviewed and the existing identity checks keep their meaning.
  const sourceCandidates = new WeakMap();
  function cachedSourceValue(owner, key, create) {
    let cache = sourceCandidates.get(owner);
    if (!cache) sourceCandidates.set(owner, cache = new Map());
    if (!cache.has(key)) cache.set(key, create());
    return cache.get(key);
  }

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

  // One shape for a GMI source read from an already-loaded survey layer, in import and in the source workflow.
  function loadedGmiSource(parsed, binding, file = null) {
    const id = `photo-gmi-${createId()}`;
    return immutable({ ...parsed, id, kind: 'gmi', filename: binding?.filename || file?.name, importedAt: Date.now(),
      references: parsed.references.map((reference) => ({ ...reference, id: `${id}:${reference.id}` })),
      ...(binding ? { loadedBinding: { ...binding, live: true } } : {}) });
  }

  function verifiedGmiBinding(attached, loaded, binding, isLive) {
    if (!binding?.layerId || !binding.inputId || !binding.datasetRevision || !isLive(binding))
      return { error: 'loaded-source-unavailable' };
    const current = attached.loadedBinding;
    const live = current && isLive(current);
    if (live && (current.layerId !== binding.layerId || current.inputId !== binding.inputId))
      return { error: 'source-bound-elsewhere' };
    const fingerprint = attached.fingerprint;
    if (fingerprint !== loaded.fingerprint || !/^(sha256:|exact-bytes:)/.test(fingerprint) || !equivalentGmiPhotoEvidence(attached, loaded))
      return { error: 'source-evidence-mismatch' };
    return { source: live && current.live ? attached : Object.freeze({ ...attached,
      loadedBinding: Object.freeze({ ...binding, live: true }) }) };
  }

  const matchingGmiSources = (layer, fingerprint) => layer?.spatialSources.filter((source) =>
    source.kind === 'gmi' && source.fingerprint === fingerprint) || [];

  function replaceBoundGmiSource(layer, source) {
    layers.set(layer.id, Object.freeze({ ...layer,
      spatialSources: Object.freeze(layer.spatialSources.map((item) => item.id === source.id ? source : item)) }));
  }

  function attachSource(source, photoIds) {
    const ledger = matchPhotoReferences(source.entries, assetPhotos(photoIds));
    for (const match of ledger.matches) {
      if (match.status !== 'matched') continue;
      const entry = source.entries.find((item) => item.id === match.entryId);
      const candidate = cachedSourceValue(source, entry.id, () => createPhotoCandidate({ ...entry, id: `${source.id}:${entry.id}`,
        kind: entry.kind || source.kind, sourceId: source.id, sourceFilename: source.filename, sourceEntryId: entry.id }));
      updateAsset(match.photoId, (live) => {
        if (live.spatial.candidates.some((item) => item.sourceId === source.id && item.sourceEntryId === entry.id)) return {};
        const spatial = Object.freeze({ ...live.spatial, candidates: Object.freeze([...live.spatial.candidates, candidate]) });
        return { spatial, metadataEvidence: immutable([...live.metadataEvidence, ...gmlCaptureEvidence(source, entry)]),
          directionEvidence: immutable([...live.directionEvidence, ...gmlDirectionEvidence(source, entry)]) };
      });
    }
    return immutable({ ...source, ledger });
  }

  // Visibility is not part of liveness: Edit mode forces its layer visible, and data
  // integrity rests on generation, registration and per-occurrence identity.
  function photoEditsAreLive(ticket) {
    return Boolean(ticket && ticket.generation === generation && editSessions.get(ticket.layerId) === ticket
      && layers.has(ticket.layerId));
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

  // The one place metadata is accepted automatically. It runs before every publication, so no route that brings in
  // a source, a photo or an occurrence can miss it. An open Edit session owns its layer: its Save and Discard compare
  // against a fixed baseline, so the layer waits and catches up when the session ends.
  function autoAcceptMetadata(onlyLayerId = null) {
    const acceptedAt = Date.now();
    let changed = false;
    const scope = onlyLayerId === null ? layers : [[onlyLayerId, layers.get(onlyLayerId)]];
    for (const [layerId, layer] of scope) {
      if (editSessions.has(layerId)) continue;
      for (const id of layer.photoIds) {
        const record = records.get(id), asset = assets.get(record.assetId);
        const captureTime = planAutoCaptureTime(asset.captureMetadata, asset.metadataEvidence, acceptedAt);
        const photographer = planAutoPhotographer(asset.captureMetadata, asset.metadataEvidence, acceptedAt);
        if (captureTime || photographer) assets.set(record.assetId, { ...asset, captureMetadata: Object.freeze({ ...asset.captureMetadata,
          ...(captureTime ? { captureTime } : {}), ...(photographer ? { photographer } : {}) }) });
        const direction = planAutoDirection(record.direction, asset.directionEvidence, { exifPending: asset.spatial.exifRead.state === 'pending', acceptedAt });
        if (direction) records.set(id, { ...record, direction });
        changed ||= Boolean(captureTime || photographer || direction);
      }
    }
    return changed;
  }

  const appendPolicy = () => draftTargetLayerId ? photoAppendPolicy(importIds.map((id) => records.get(id)),
    assetPhotos(layers.get(draftTargetLayerId)?.photoIds || []), appendOverrideIds) : null;
  const skippedSpatial = () => immutable({ ...emptySpatial(), exifRead: { state: 'skipped-duplicate', errorCode: null } });
  function refreshLayerCounts(layer) {
    const counts = { ...photoSpatialCounts(layer.photoIds.map((id) => records.get(id))),
      assetCount: assetIds(layer.photoIds).length };
    if (Object.keys(counts).some((key) => counts[key] !== layer[key])) layers.set(layer.id, Object.freeze({ ...layer, ...counts }));
  }
  const publish = () => {
    autoAcceptMetadata();
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
    for (const layer of layers.values()) refreshLayerCounts(layer);
    for (const [id, review] of sourceReviews) {
      if (review.source && layers.has(id)) {
        const memberIds = layers.get(id).photoIds;
        if (review.source.kind === 'gmi') {
          const cached = gmiReviews.get(review.source);
          const associationLedger = review.rebinding ? review.source.associationLedger : cached?.memberIds === memberIds ? cached.associationLedger
            : reviewGmiPhotoSource(review.source, assetPhotos(memberIds));
          if (!review.rebinding) gmiReviews.set(review.source, { memberIds, associationLedger });
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
      sourceWorkflowDrafts: Object.freeze(Object.fromEntries([...sourceWorkflows].flatMap(([layerId, ticket]) => {
        const draft = sourceWorkflowDrafts.get(ticket);
        return draft ? [[layerId, Object.freeze({ version: draft.version, ops: Object.freeze(draft.ops.map((op) => draftOpSummary(op))) })]] : [];
      }))),
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
          directionEvidence: immutable([...live.directionEvidence.filter((item) => item.kind !== 'exif'), ...(result.directionEvidence || [])]),
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

  function detachRecords(ids) {
    const candidates = assetIds(ids);
    for (const id of ids) { records.delete(id); deliveryDecisions.delete(id); }
    const live = new Set([...records.values()].map((record) => record.assetId));
    const removed = new Map(candidates.filter((id) => !live.has(id)).map((id) => [id, assets.get(id)]));
    for (const id of removed.keys()) assets.delete(id);
    return removed;
  }

  function releaseResources(ids, removed) {
    for (const id of ids) { appendOverrideIds.delete(id); deliveryChoiceIds.delete(id); }
    queue = queue.filter((job) => !removed.has(job.id));
    metadataQueue = metadataQueue.filter((job) => !removed.has(job.id));
    if (removed.has(activeMetadata?.id)) activeMetadata.cancelled = true;
    if (removed.has(activeJob?.id)) activeJob.controller.abort();
    for (const [id, asset] of removed) {
      if (asset?.preview.thumbnailUrl) urls.revokeObjectURL(asset.preview.thumbnailUrl);
      displayPreviews.drop(id);
    }
  }

  function release(ids) { releaseResources(ids, detachRecords(ids)); }

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

  function planGmiAssociations(layer, source, associationLedger, occurrenceId = () => createId()) {
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
        record = record || peers.find((item) => !item.occurrence) || makeOccurrence(assetId, occurrenceId(assetId, key));
        const { occurrence, candidate } = cachedSourceValue(associationLedger, `${layerId}|${sourceId}|${key}`, () => {
          const occurrence = immutable({ key, assetId, sourceId, sourceFingerprint: source.fingerprint,
            sourceFilename: source.filename, objectKey: object.objectKey, object,
            referenceIds: association.referenceIds, references: source.references.filter((ref) => association.referenceIds.includes(ref.id)),
            matchMethods: association.matchMethods, ownerLayerId: layerId });
          return { occurrence, candidate: createPhotoCandidate({ id: `gmi-position:${key}`, kind: 'gmi', sourceId,
            sourceFilename: source.filename, sourceEntryId: association.id, ...position,
            raw: { geometry: object.rawGeometry }, provenance: occurrence }) };
        });
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
  // Filename suggestions for the incoming draft assets. Assets with usable EXIF or draft-GML capture times are
  // never candidates, so a suggestion can never compete with a source value at import.
  function draftCaptureSuggestions(incoming) {
    const photos = assetPhotos(incoming), draftGmlEvidenceByAsset = new Map();
    if (positioning.source) for (const match of matchPhotoReferences(positioning.source.entries, photos).matches) {
      if (match.status !== 'matched') continue;
      const entry = positioning.source.entries.find((item) => item.id === match.entryId);
      draftGmlEvidenceByAsset.set(match.photoId, [...(draftGmlEvidenceByAsset.get(match.photoId) || []), ...gmlCaptureEvidence(positioning.source, entry)]);
    }
    return planFilenameCaptureSuggestions(photos, { draftGmlEvidenceByAsset, today: today() });
  }
  const captureIdentity = (incoming) => assetIds(incoming).map((id) => [id, assets.get(id).captureMetadata, assets.get(id).metadataEvidence]);
  // Approved filename values land before the committing method's single publication, so the automatic pass
  // sees them as non-automatic. Accepted or removed values are never overwritten.
  function applyCaptureTimeWrites(writes, eligibleIds) {
    const eligible = new Set(assetIds(eligibleIds));
    for (const [assetId, write] of writes || []) {
      if (!eligible.has(assetId)) continue;
      updateAsset(assetId, (asset) => asset.captureMetadata.captureTime || asset.captureMetadata.captureTimeCleared ? {}
        : { captureMetadata: Object.freeze({ ...asset.captureMetadata, captureTime: write }) });
    }
  }

  // M3: a GML capture time is written only on an explicit wizard decision, never by publication. Each plan is
  // registered with the per-asset identities it was made from, so a commit can tell a current review from a stale one.
  const captureTimePlans = new WeakMap();
  const captureStates = (ids) => assetIds(ids).map((id) => [id, assets.get(id).captureMetadata, assets.get(id).metadataEvidence, assets.get(id).spatial.exifRead]);
  const sameCaptureStates = (a, b) => a.length === b.length
    && a.every(([id, metadata, evidence, exifRead], index) => b[index][0] === id && b[index][1] === metadata && b[index][2] === evidence && b[index][3] === exifRead);
  // Draft assets are not in a layer yet, so the automatic EXIF pass has not run on them. The import plan is made
  // against what that pass will accept at layer creation, so EXIF meets GML exactly as it will be kept.
  function draftGmlCapturePlan(incoming) {
    if (!positioning.source) return null;
    return planGmlCaptureTimeReconciliation(assetPhotos(incoming).map((asset) => {
      const automatic = planAutoCaptureTime(asset.captureMetadata, asset.metadataEvidence, 0);
      return automatic ? { ...asset, captureMetadata: Object.freeze({ ...asset.captureMetadata, captureTime: automatic }) } : asset;
    }), positioning.source);
  }
  // Validated rows land after the source is attached and before the single publication. The value is the GML value
  // exactly as recorded; the provenance names the attached evidence and the wizard it was chosen in. No `acceptance`
  // field is written, so the automatic pass treats the value as a decision. A removal is never undone here.
  function applyGmlCaptureTimeRows(rows, eligibleIds, via) {
    const eligible = new Set(assetIds(eligibleIds)), acceptedAt = Date.now();
    let written = 0;
    for (const row of rows || []) {
      if (!eligible.has(row.assetId) || assets.get(row.assetId)?.captureMetadata.captureTimeCleared) continue;
      written += updateAsset(row.assetId, (asset) => {
        const usable = asset.metadataEvidence.filter((item) => item.field === 'captureTime' && item.value);
        const evidence = usable.find((item) => item.id === row.evidence.id) || row.evidence;
        return { captureMetadata: Object.freeze({ ...asset.captureMetadata, captureTime: immutable({ value: row.proposedValue,
          provenance: { ...evidenceProvenance(evidence, usable), via }, acceptedAt }) }) };
      }) ? 1 : 0;
    }
    return written;
  }
  // The GML source save, shared by the positioning draft and the direct session API: every check runs before the
  // first write, then the source, its evidence and the chosen capture times are written. The capture rows are
  // re-planned here and must match the reviewed plan's signature. No publication and no review bookkeeping.
  function attachGmlSourceCore(layerId, review, captureDecision = null, capturePlanSignature = null) {
    const layer = layers.get(layerId);
    // Any position source other than GMI (GML, or a registered future adapter) attaches its entries as candidates.
    if (!layer || !review?.source || review.source.kind === 'gmi') return failed('source-changed');
    if (review.recheck && !layer.spatialSources.includes(review.source)) return failed('source-removed');
    if (!review.recheck && layer.spatialSources.some((source) => source.fingerprint === review.source.fingerprint)) return failed('duplicate-source');
    try {
      for (const match of matchPhotoReferences(review.source.entries, assetPhotos(layer.photoIds)).matches) {
        if (match.status !== 'matched') continue;
        const entry = review.source.entries.find((item) => item.id === match.entryId);
        createPhotoCandidate({ ...entry, id: `${review.source.id}:${entry.id}`, kind: 'gml' });
      }
    } catch { return failed('invalid-source'); }
    let rows = [];
    if (capturePlanSignature) {
      const live = planGmlCaptureTimeReconciliation(assetPhotos(layer.photoIds), review.source);
      if (gmlCapturePlanSignature(live) !== capturePlanSignature) return failed('review-changed');
      rows = selectedGmlCaptureRows(live, captureDecision || undefined);
    } else if (gmlCaptureDecisionWrites(captureDecision)) return failed('review-changed');
    const source = attachSource(review.source, layer.photoIds);
    const existing = layer.spatialSources.some((item) => item.id === source.id);
    layers.set(layerId, Object.freeze({ ...layer, spatialSources: Object.freeze(existing
      ? layer.spatialSources.map((item) => item.id === source.id ? source : item) : [...layer.spatialSources, source]) }));
    return { ok: true, captureTimeCount: applyGmlCaptureTimeRows(rows, layer.photoIds, 'positioning-wizard') };
  }
  // Direct (non-wizard) GML save: the reviewed plan must still be the live one, then the core writes and one publication.
  function commitLayerSource(layerId, captureTime = null) {
    const layer = layers.get(layerId), review = sourceReviews.get(layerId);
    if (!layer || review?.state !== 'ready' || review.source.kind === 'gmi') return failed('source-changed');
    const { plan = null, ...decision } = captureTime || {};
    if (plan) {
      const guard = captureTimePlans.get(plan);
      if (!guard || guard.layerId !== layerId || guard.source !== review.source || guard.recheck !== review.recheck
        || guard.memberIds !== layer.photoIds || !sameCaptureStates(guard.states, captureStates(layer.photoIds))) return failed('review-changed');
    }
    const result = attachGmlSourceCore(layerId, review, captureTime ? decision : null, plan ? gmlCapturePlanSignature(plan) : null);
    if (!result.ok) return result;
    sourceReviews.delete(layerId);
    sourceRequests.set(layerId, (sourceRequests.get(layerId) || 0) + 1);
    publish(); return result;
  }

  // The GMI source save (new source, recheck or verified rebinding), shared by the draft and the direct API.
  function gmiAssociationsCore(layerId, review, associationLedger, occurrenceId = undefined) {
    const layer = layers.get(layerId);
    if (!layer || review?.source?.kind !== 'gmi') return failed('review-changed');
    const current = layer.spatialSources.find((source) => source.id === review.source.id);
    if (review.recheck && !current) return failed('source-removed');
    const loaded = review.loadedInput;
    if (loaded && !loaded.isLive(loaded.binding)) return failed('loaded-source-unavailable');
    if (review.recheck && current !== review.source) return failed('review-changed');
    if (review.rebinding) {
      const verified = verifiedGmiBinding(current, loaded.source, loaded.binding, loaded.isLive);
      if (verified.error) return failed(verified.error);
      replaceBoundGmiSource(layer, verified.source);
      return { ok: true, added: 0, updated: 0, objects: 0 };
    }
    const source = Object.freeze({ ...review.source, associationLedger });
    if (!current && matchingGmiSources(layer, source.fingerprint).length) return failed('duplicate-source');
    let plan;
    try { plan = planGmiAssociations(layer, source, associationLedger, occurrenceId); }
    catch { return failed('invalid-source'); }
    commitGmiPlan(plan);
    const objects = new Set([...plan.additions, ...plan.replacements.values()].map((record) => record.occurrence?.objectKey).filter(Boolean));
    return { ok: true, added: plan.additions.length, updated: plan.replacements.size, objects: objects.size };
  }
  function removeGmiSourceCore(layerId, sourceId) {
    const layer = layers.get(layerId);
    if (!layer?.spatialSources.some((source) => source.id === sourceId && source.kind === 'gmi')) return failed('source-removed');
    layers.set(layerId, Object.freeze({ ...layer,
      spatialSources: Object.freeze(layer.spatialSources.filter((source) => source.id !== sourceId)) }));
    return { ok: true };
  }
  // Explicitly selected source positions and their GML delivery default. Every request is checked against the state
  // the plan was made from before the first write.
  function acceptSourcePositionsCore(layerId, plan, requests) {
    const layer = layers.get(layerId);
    const seen = new Set(), changes = [];
    for (const request of requests) {
      const row = plan.rows.find((item) => item.photoId === request.photoId);
      const live = records.get(request.photoId);
      const candidate = row?.options.find((item) => item.id === request.candidateId);
      if (seen.has(request.photoId) || !live || !row || live.spatial.current !== row.current
        || !candidate || !live.spatial.candidates.includes(candidate)
        || candidate.status !== 'viable' || !isPhotoPosition(candidate.position)
        || (['gml', 'gmi'].includes(candidate.kind) && !layer.spatialSources.some((source) => source.kind === candidate.kind && source.id === candidate.sourceId)))
        return failed('review-changed');
      seen.add(request.photoId);
      changes.push({ photoId: request.photoId, position: candidate.position, includeUnlinked: candidate.kind === 'gml' || candidate.kind === 'exif' });
    }
    const effects = positionDeliveryEffects(layer, changes);
    const acceptedAt = Date.now();
    for (const request of requests) updateRecord(request.photoId, (live) => ({
      spatial: acceptPhotoCandidate(live.spatial, request.candidateId, 'explicit-candidate', acceptedAt),
    }));
    applyPositionDeliveryEffects(effects);
    return { ok: true, acceptedIds: [...seen], deliveryIds: deliveryEffectIds(effects), delivery: deliveryEffectSummary(effects) };
  }

  // B2: the positioning wizard's draft, owned by its workflow ticket. Ops are declarative and replayed in order on
  // copies of the live data; nothing accepted changes before commitSourceWorkflow. Closing the ticket discards it.
  const sourceWorkflowDrafts = new WeakMap();
  let draftOpSerial = 0;
  function draftOf(ticket) {
    let draft = sourceWorkflowDrafts.get(ticket);
    if (!draft) sourceWorkflowDrafts.set(ticket, draft = { ops: [], version: 0, view: null });
    return draft;
  }
  function runDraftOp(layerId, op) {
    if (op.kind === 'gml') return attachGmlSourceCore(layerId, op.review, op.captureDecision, op.capturePlanSignature);
    if (op.kind === 'gmi') return gmiAssociationsCore(layerId, op.review, op.associationLedger, op.occurrenceId);
    if (op.kind === 'remove-gmi') return removeGmiSourceCore(layerId, op.sourceId);
    return failed('unsupported-source');
  }
  function replayDraft(layerId, ops) {
    const outcomes = [];
    for (const op of ops) {
      const outcome = runDraftOp(layerId, op);
      if (!outcome.ok) return { ok: false, error: outcome.error, opId: op.id, outcomes };
      outcomes.push(Object.freeze({ id: op.id, ...outcome }));
    }
    return { ok: true, outcomes };
  }
  // The live identities a draft view was derived from: its layer, each member occurrence and asset, and their delivery state.
  function draftLiveKey(layerId) {
    const layer = layers.get(layerId);
    return [generation, layer, ...(layer?.photoIds || []).flatMap((id) => {
      const record = records.get(id);
      return [record, assets.get(record?.assetId), deliveryDecisions.get(id), deliveryChoiceIds.has(id)];
    })];
  }
  const sameIdentities = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);
  // The draft applied to copies of the current live data, re-derived only when the ops or those identities change.
  function draftView(ticket) {
    const draft = draftOf(ticket);
    // Survey-layer binding liveness can change without a photo map changing.
    const bindings = draft.ops.flatMap(({ review }) => {
      const loaded = review?.loadedInput;
      if (!loaded) return [];
      const retained = review.source.loadedBinding;
      return [loaded.isLive(loaded.binding), Boolean(retained && loaded.isLive(retained))];
    });
    const key = [...draftLiveKey(ticket.layerId), ...bindings];
    if (draft.view && draft.view.version === draft.version && sameIdentities(draft.view.key, key)) return draft.view;
    const live = { layers, records, assets, deliveryDecisions };
    const { result, state } = inDraft(() => replayDraft(ticket.layerId, draft.ops));
    // What every key the draft wrote held when the view was made; the commit swaps only these keys, and only if unchanged.
    const before = Object.fromEntries(ACCEPTED_MAPS.map((name) => [name,
      new Map([...state[name].touched].map((key) => [key, [live[name].has(key), live[name].get(key)]]))]));
    draft.view = Object.freeze({ version: draft.version, key, state, before, outcome: result });
    return draft.view;
  }
  const draftOpSummary = (op, outcome = null) => Object.freeze({ id: op.id, kind: op.kind, sourceKind: op.sourceKind, sourceId: op.sourceId,
    filename: op.filename, recheck: Boolean(op.review?.recheck), rebinding: op.review?.rebinding || null,
    captureDecision: op.captureDecision || null, captureTimeCount: outcome?.captureTimeCount || 0,
    added: outcome?.added || 0, updated: outcome?.updated || 0, objects: outcome?.objects || 0 });
  // GML direction evidence the draft brings that the automatic pass will adopt at publication (presentation count).
  function draftDirectionAdoptions(view, layerId) {
    return readDraft(view.state, () => (layers.get(layerId)?.photoIds || []).filter((id) => {
      const record = records.get(id), asset = assets.get(record.assetId);
      if (!view.state.assets.touched.has(record.assetId)) return false;
      const planned = planAutoDirection(record.direction, asset.directionEvidence, { exifPending: asset.spatial.exifRead.state === 'pending', acceptedAt: 0 });
      return Boolean(planned?.current?.basis?.evidenceId);
    }).length);
  }

  function commitGmiPlan(plan) {
    for (const [id, record] of plan.replacements) records.set(id, record);
    for (const record of plan.additions) records.set(record.id, record);
    layers.set(plan.layer.id, plan.layer);
  }

  function applyLoadedGmiImportCore(review, { captureTimeWrites = [], gmlCaptureRows = [] } = {}) {
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
    applyCaptureTimeWrites(captureTimeWrites, review.includedIds);
    if (positioning.source) applyGmlCaptureTimeRows(gmlCaptureRows, review.includedIds, 'import-wizard');
    return { ok: true, layer: layers.get(layer.id), sourceId: review.source.id };
  }

  function createLayerCore({ captureTimeWrites = [], gmlCaptureRows = [] } = {}) {
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
    applyCaptureTimeWrites(captureTimeWrites, importIds);
    if (attached) applyGmlCaptureTimeRows(gmlCaptureRows, importIds, 'import-wizard');
    layers.set(layer.id, layer);
    return layer;
  }

  function appendImportCore({ captureTimeWrites = [], gmlCaptureRows = [] } = {}) {
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
    applyCaptureTimeWrites(captureTimeWrites, policy.appendableIds);
    if (source) applyGmlCaptureTimeRows(gmlCaptureRows, policy.appendableIds, 'import-wizard');
    layers.set(layer.id, updated);
    return updated;
  }

  return {
    getSnapshot: () => snapshot,
    async beginLoadedGmiImport(args, targetLayerId = null) {
      if (!args.isLive(args.binding) || !this.beginImport(targetLayerId)) return false;
      return this.setDraftGmiSource(args);
    },
    clearDraftGmiSource() { loadedImport = null; publish(); },
    clearDraftPositioningGml() { gmlRequest++; positioning = EMPTY_PHOTO_SNAPSHOT.positioning; publish(); },
    async setDraftGmiSource({ binding = null, read, isLive = () => !binding, file }) {
      if (!isLive(binding)) return false;
      if (file) read = () => makeSource(file, 'gmi');
      const operation = { binding, isLive, state: 'pending', source: null, errorCode: null };
      loadedImport = operation;
      publish();
      try {
        const parsed = await read();
        if (loadedImport !== operation || !isLive(binding)) return false;
        operation.source = loadedGmiSource(parsed, binding, file);
        operation.state = 'ready';
        publish(); return true;
      } catch (error) {
        if (loadedImport !== operation) return false;
        operation.state = 'error'; operation.errorCode = error.code || 'loaded-source-unavailable';
        publish(); return false;
      }
    },
    previewImport({ loadedReview = null, placement }) {
      if (!importIds.length && !draftTargetLayerId) return null;
      if (loadedImport && (!loadedReview || loadedPlans.get(loadedReview)?.operation !== loadedImport)) return null;
      const target = draftTargetLayerId ? layers.get(draftTargetLayerId) : null;
      if (draftTargetLayerId && !target) return null;
      const incoming = loadedReview?.includedIds || appendPolicy()?.appendableIds || importIds;
      let photoIds = [...(target?.photoIds || []), ...incoming];
      let sources = [...(target?.spatialSources || [])];
      let projected = photoIds.map((id) => records.get(id));
      if (loadedReview) {
        const source = { ...loadedReview.source, associationLedger: loadedReview.associationLedger };
        const plan = planGmiAssociations(target ? { ...target, photoIds } : { id: 'draft', photoIds, spatialSources: [] }, source, loadedReview.associationLedger, (assetId, key) => `preview:${assetId}:${key}`);
        photoIds = plan.photoIds; sources = plan.layer.spatialSources;
        projected = photoIds.map((id) => plan.replacements.get(id) || records.get(id) || plan.additions.find((photo) => photo.id === id));
      }
      if (positioning.source) {
        const source = positioning.source;
        const matches = matchPhotoReferences(source.entries, assetPhotos(incoming)).matches;
        projected = projected.map((photo) => {
          const candidates = matches.filter((match) => match.status === 'matched' && match.photoId === photo.assetId).map((match) => {
            const entry = source.entries.find((item) => item.id === match.entryId);
            return createPhotoCandidate({ ...entry, id: `${source.id}:${entry.id}`, kind: 'gml', sourceId: source.id, sourceEntryId: entry.id });
          });
          return candidates.length ? { ...photo, spatial: { ...photo.spatial, candidates: [...photo.spatial.candidates, ...candidates] } } : photo;
        });
        sources = [...sources, source];
      }
      const plan = planPhotoSourcePositions(projected, sources);
      const included = new Set(incoming);
      const skipped = new Set(appendPolicy()?.skippedIds);
      const excludedPhotos = importIds.filter((id) => !included.has(id)).map((id) => ({ ...records.get(id),
        importExclusionReason: skipped.has(id) ? 'Finnes allerede i fotolaget og hoppes over.' : 'Ikke nevnt i GMI-filen.' }));
      const rows = previewImportPlacement({ plan, placement, gmiReview: loadedReview, excludedPhotos });
      const preview = { rows, outcome: summarizeImportOutcome(rows, loadedReview), captureSuggestions: draftCaptureSuggestions(incoming),
        gmlCaptureTimes: draftGmlCapturePlan(incoming) };
      importPreviews.set(preview, { draftToken, ids: [...importIds], positioning, loadedImport, loadedReview, target, eligible: [...incoming],
        records: [...(target?.photoIds || []), ...importIds].map((id) => [id, records.get(id).spatial]), placement: JSON.stringify(placement),
        capture: captureIdentity(incoming), positions: importPlacementPlan(plan, placement).signature });
      return preview;
    },
    completeImport({ loadedReview = null, placement, preview, captureSuggestions = null, gmlCaptureTime = null }) {
      const guard = importPreviews.get(preview);
      const incoming = loadedReview?.includedIds || appendPolicy()?.appendableIds || importIds;
      if (!guard || guard.draftToken !== draftToken || guard.positioning !== positioning || guard.loadedImport !== loadedImport || guard.loadedReview !== loadedReview
        || guard.target !== (layers.get(draftTargetLayerId) || null) || guard.placement !== JSON.stringify(placement)
        || !sameIdentities(guard.eligible, incoming)
        || guard.ids.length !== importIds.length || guard.ids.some((id, index) => id !== importIds[index])
        || guard.records.some(([id, spatial]) => records.get(id)?.spatial !== spatial)
        || captureIdentity(incoming).some(([id, metadata, evidence], index) => guard.capture[index]?.[0] !== id
          || guard.capture[index][1] !== metadata || guard.capture[index][2] !== evidence)) return { ok: false, error: 'review-changed' };
      const capturing = Boolean(captureSuggestions?.complete || captureSuggestions?.dateOnly) || gmlCaptureDecisionWrites(gmlCaptureTime);
      if ((placement.kind !== 'none' || capturing) && importIds.some((id) => records.get(id).spatial.exifRead.state === 'pending')) return { ok: false, error: 'pending-exif' };
      // Re-plan against live assets; the approved set must be the one the review showed.
      let captureTimeWrites = [];
      if (captureSuggestions?.complete || captureSuggestions?.dateOnly) {
        const plan = draftCaptureSuggestions(incoming);
        if (JSON.stringify(plan) !== JSON.stringify(preview.captureSuggestions)) return { ok: false, error: 'review-changed' };
        captureTimeWrites = selectedFilenameCaptureWrites(plan, captureSuggestions);
      }
      // The GML choices are re-planned the same way. Filename and GML candidates are disjoint by construction; an
      // overlap would mean two competing writes to one asset, so the commit refuses rather than picking one.
      let gmlCaptureRows = [];
      if (gmlCaptureDecisionWrites(gmlCaptureTime)) {
        const plan = draftGmlCapturePlan(incoming);
        if (!plan || gmlCapturePlanSignature(plan) !== gmlCapturePlanSignature(preview.gmlCaptureTimes)) return { ok: false, error: 'review-changed' };
        gmlCaptureRows = selectedGmlCaptureRows(plan, gmlCaptureTime);
        const filenameIds = new Set(captureTimeWrites.map(([assetId]) => assetId));
        if (gmlCaptureRows.some((row) => filenameIds.has(row.assetId))) return { ok: false, error: 'review-changed' };
      }
      const appended = Boolean(draftTargetLayerId);
      const selected = new Set(incoming);
      const discarded = importIds.filter((id) => !selected.has(id));
      let planned;
      try {
        planned = inDraft(() => {
          const choices = { captureTimeWrites, gmlCaptureRows };
          const result = loadedImport ? applyLoadedGmiImportCore(loadedReview, choices)
            : { ok: true, layer: appended ? appendImportCore(choices) : createLayerCore(choices) };
          if (!result.ok || !result.layer) return failed(result.error || 'import-refused');
          const { id, photoIds, spatialSources } = result.layer;
          const plan = planPhotoSourcePositions(photoIds.map((photoId) => records.get(photoId)), spatialSources);
          const { requests, signature } = importPlacementPlan(plan, placement);
          if (signature !== guard.positions) return failed('placement-changed');
          if (requests.length) {
            const applied = acceptSourcePositionsCore(id, plan, requests);
            if (!applied.ok) return failed('placement-changed');
          }
          const removed = discarded.length ? detachRecords(discarded) : null;
          autoAcceptMetadata(id);
          refreshLayerCounts(layers.get(id));
          const groups = Map.groupBy(photoIds.map((photoId) => records.get(photoId)), (photo) => photo.assetId);
          const placed = [...groups.values()].filter((group) => group.every((photo) => photo.spatial.current)).length;
          return { ok: true, id, removed, outcome: { total: groups.size, placed, unplaced: groups.size - placed } };
        });
      } catch { return commitFailed(); }
      if (!planned.result.ok) return planned.result;
      const committed = commitDraftMaps(planned.state);
      if (!committed.ok) return committed;
      const { id, outcome, removed } = planned.result;
      // Draft files and their browser resources stay available until all accepted writes have succeeded.
      transferDraft();
      loadedPlans.delete(loadedReview);
      if (removed) releaseResources(discarded, removed);
      publish();
      return { ok: true, append: appended, addedCount: incoming.length, layer: layers.get(id), outcome };
    },
    setLoadedGmiTarget(layerId = null) {
      if (!loadedImport || (layerId && !layers.has(layerId))) return false;
      draftTargetLayerId = layerId; appendOverrideIds.clear(); publish(); return true;
    },
    associateLoadedGmiSource(loaded, binding, isLive) {
      const matches = [...layers.values()].flatMap((layer) => matchingGmiSources(layer, loaded.fingerprint).map((source) => ({ layer, source })));
      if (matches.length !== 1) return false;
      const [{ layer, source }] = matches;
      const verified = verifiedGmiBinding(source, loaded, binding, isLive);
      if (verified.error || verified.source === source) return false;
      replaceBoundGmiSource(layer, verified.source);
      publish(); return true;
    },
    reconcileLoadedGmiBindings(isLive) {
      if (loadedImport?.binding && !isLive(loadedImport.binding)) {
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
      const matches = matchingGmiSources(target, loadedImport.source.fingerprint);
      if (matches.length > 1) return Object.freeze({ error: 'source-association-ambiguous' });
      const existing = matches[0];
      const verified = existing && loadedImport.binding
        ? verifiedGmiBinding(existing, loadedImport.source, loadedImport.binding, loadedImport.isLive)
        : { source: existing || loadedImport.source };
      if (verified.error) return Object.freeze({ error: verified.error });
      const { source } = verified;
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
    applyLoadedGmiImport(review, choices) {
      const result = applyLoadedGmiImportCore(review, choices);
      if (!result.ok) return result;
      release(importIds.filter((id) => !review.includedIds.includes(id)));
      transferDraft(); loadedPlans.delete(review); publish();
      return { ...result, layer: layers.get(result.layer.id) };
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
    // B2: «Ta med kilden»/«Ta med kilde og koblinger». Validated exactly as the final save will be (the whole draft is
    // replayed with this change on copies), then recorded in the draft. Accepted data is not changed.
    stageSourceWorkflowSource(ticket, expectedReview, { captureTime = null } = {}) {
      if (!sourceWorkflowIsLive(ticket)) return failed('membership-changed');
      const review = sourceReviews.get(ticket.layerId);
      if (!review || review.state !== 'ready' || review.source !== expectedReview?.source
        || review.recheck !== expectedReview.recheck || review.loadedInput !== expectedReview.loadedInput) return failed('source-changed');
      if (!['gml', 'gmi'].includes(review.source.kind)) return failed('unsupported-source');
      const draft = draftOf(ticket);
      if (draft.ops.some((op) => op.sourceId === review.source.id || (op.kind !== 'remove-gmi' && op.fingerprint === review.source.fingerprint)))
        return failed('source-staged');
      let op;
      if (review.source.kind === 'gml') {
        const { plan = null, ...decision } = captureTime || {};
        const writes = gmlCaptureDecisionWrites(decision);
        if (plan || writes) {
          const guard = captureTimePlans.get(plan);
          if (!guard || guard.layerId !== ticket.layerId || guard.source !== review.source || guard.recheck !== review.recheck
            || guard.view !== draftView(ticket)) return failed('review-changed');
        }
        op = { kind: 'gml', review: Object.freeze({ source: review.source, recheck: review.recheck }),
          captureDecision: writes ? Object.freeze({ complete: Boolean(decision.complete), partial: Boolean(decision.partial), conflicts: decision.conflicts === 'gml' ? 'gml' : 'keep' }) : null,
          capturePlanSignature: plan ? gmlCapturePlanSignature(plan) : null };
      } else {
        if (expectedReview.associationLedger !== review.associationLedger) return failed('review-changed');
        const occurrenceIds = new Map();
        op = { kind: 'gmi', review: Object.freeze({ source: review.source, recheck: review.recheck, loadedInput: review.loadedInput, rebinding: review.rebinding || null }),
          associationLedger: review.associationLedger,
          // Stable across replays, so the reviewed positions keep naming the same new occurrences.
          occurrenceId: (_assetId, key) => { if (!occurrenceIds.has(key)) occurrenceIds.set(key, createId()); return occurrenceIds.get(key); } };
      }
      op = Object.freeze({ ...op, id: `op-${++draftOpSerial}`, sourceId: review.source.id, fingerprint: review.source.fingerprint,
        filename: review.source.filename, sourceKind: review.source.kind });
      const trial = inDraft(() => replayDraft(ticket.layerId, [...draft.ops, op])).result;
      if (!trial.ok) return failed(trial.error);
      draft.ops = [...draft.ops, op]; draft.version++;
      sourceReviews.delete(ticket.layerId);
      sourceRequests.set(ticket.layerId, (sourceRequests.get(ticket.layerId) || 0) + 1);
      publish();
      return { ok: true, opId: op.id, captureTimeCount: trial.outcomes.at(-1).captureTimeCount || 0 };
    },
    // «Fjern GMI-kilde» inside the wizard: a source only staged in this draft is simply taken out again; a saved one is
    // marked for removal when the changes are saved.
    stageSourceWorkflowRemoval(ticket, sourceId) {
      if (!sourceWorkflowIsLive(ticket) || sourceReviews.has(ticket.layerId)) return failed('review-changed');
      const draft = draftOf(ticket);
      const staged = draft.ops.find((op) => op.sourceId === sourceId);
      if (staged && staged.kind !== 'remove-gmi' && !staged.review.recheck) return this.unstageSourceWorkflowOp(ticket, staged.id);
      if (staged?.kind === 'remove-gmi') return { ok: true, opId: staged.id };
      const source = layers.get(ticket.layerId).spatialSources.find((item) => item.id === sourceId && item.kind === 'gmi');
      if (!source) return failed('source-removed');
      const op = Object.freeze({ kind: 'remove-gmi', id: `op-${++draftOpSerial}`, sourceId, fingerprint: source.fingerprint,
        filename: source.filename, sourceKind: 'gmi' });
      const ops = [...draft.ops.filter((item) => item !== staged), op];
      const trial = inDraft(() => replayDraft(ticket.layerId, ops)).result;
      if (!trial.ok) return failed(trial.error);
      draft.ops = ops; draft.version++;
      publish();
      return { ok: true, opId: op.id };
    },
    unstageSourceWorkflowOp(ticket, opId) {
      if (!sourceWorkflowIsLive(ticket)) return failed('membership-changed');
      const draft = draftOf(ticket);
      const ops = draft.ops.filter((op) => op.id !== opId);
      if (ops.length === draft.ops.length) return failed('review-changed');
      draft.ops = ops; draft.version++;
      publish();
      return { ok: true };
    },
    // What the draft would change, from the current live data. Presentation; nothing is written.
    reviewSourceWorkflowDraft(ticket) {
      if (!sourceWorkflowIsLive(ticket)) return null;
      const draft = draftOf(ticket), view = draftView(ticket);
      const outcomes = new Map((view.outcome.outcomes || []).map((outcome) => [outcome.id, outcome]));
      const live = layers.get(ticket.layerId), staged = view.state.layers.get(ticket.layerId);
      return Object.freeze({ version: draft.version, ok: view.outcome.ok, error: view.outcome.error || null, failedOpId: view.outcome.opId || null,
        ops: Object.freeze(draft.ops.map((op) => draftOpSummary(op, outcomes.get(op.id)))),
        evidenceSignature: view.outcome.ok ? photoSourceEvidenceSignature(staged.photoIds.map((id) => view.state.records.get(id))) : null,
        occurrencesAdded: view.outcome.ok ? staged.photoIds.length - live.photoIds.length : 0,
        captureTimes: [...outcomes.values()].reduce((sum, outcome) => sum + (outcome.captureTimeCount || 0), 0),
        directions: view.outcome.ok ? draftDirectionAdoptions(view, ticket.layerId) : 0,
        sources: Object.freeze(view.outcome.ok ? staged.spatialSources : live.spatialSources) });
    },
    // The same review for the layer's open workflow, for presentation code that holds no ticket.
    reviewLayerSourceDraft(layerId) {
      const ticket = sourceWorkflows.get(layerId);
      return ticket ? this.reviewSourceWorkflowDraft(ticket) : null;
    },
    // The GML capture-time proposal for the source under review, against the wizard's draft when one is open (so an
    // earlier staged source is taken into account). Registered for the stage guard; pure.
    planLayerSourceCaptureTimes(layerId) {
      const layer = layers.get(layerId), review = sourceReviews.get(layerId);
      if (!layer || review?.state !== 'ready' || review.source?.kind !== 'gml') return null;
      const ticket = sourceWorkflows.get(layerId);
      const view = sourceWorkflowIsLive(ticket) ? draftView(ticket) : null;
      if (view && !view.outcome.ok) return null;
      const plan = view ? readDraft(view.state, () => planGmlCaptureTimeReconciliation(assetPhotos(layers.get(layerId).photoIds), review.source))
        : planGmlCaptureTimeReconciliation(assetPhotos(layer.photoIds), review.source);
      captureTimePlans.set(plan, { layerId, source: review.source, recheck: review.recheck, memberIds: layer.photoIds,
        states: captureStates(layer.photoIds), view });
      return plan;
    },
    // Positions offered from the draft view: staged sources and new occurrences included, removed sources excluded.
    reviewSourceWorkflowPositions(ticket) {
      if (!sourceWorkflowIsLive(ticket) || sourceReviews.has(ticket.layerId)) return null;
      const view = draftView(ticket);
      if (!view.outcome.ok) return null;
      const plan = readDraft(view.state, () => {
        const layer = layers.get(ticket.layerId);
        return planPhotoSourcePositions(layer.photoIds.map((id) => records.get(id)), layer.spatialSources);
      });
      // Any change to the sources the plan was made from makes it stale, as before.
      workflowReviews.set(plan, { ticket, view, sources: view.state.layers.get(ticket.layerId).spatialSources });
      return plan;
    },
    // B2/B2a: the wizard's single save. The complete next state (draft and selected positions) is planned on copies;
    // then every key it changes is checked against what the review saw, swapped in with rollback on any failure,
    // and published once. The receipt states what was actually saved.
    commitSourceWorkflow(ticket, { plan = null, requests = [], version = null } = {}) {
      if (!sourceWorkflowIsLive(ticket) || sourceReviews.has(ticket.layerId)) return failed('review-changed');
      const draft = draftOf(ticket);
      if (version !== null && version !== draft.version) return failed('review-changed');
      const reviewed = workflowReviews.get(plan);
      if ((plan || requests.length) && reviewed?.ticket !== ticket) return failed('review-changed');
      if (!draft.ops.length && !requests.length) return failed('invalid-selection');
      const view = draftView(ticket), layerId = ticket.layerId;
      if (!view.outcome.ok) return failed(view.outcome.error);
      if (reviewed && ((draft.ops.length && reviewed.view !== view)
        || reviewed.sources !== view.state.layers.get(layerId).spatialSources)) return failed('review-changed');
      let planned;
      try {
        planned = inDraft(() => {
          const result = requests.length ? acceptSourcePositionsCore(layerId, plan, requests)
            : { ok: true, acceptedIds: [], deliveryIds: [], delivery: null };
          if (result.ok) {
            autoAcceptMetadata(layerId);
            refreshLayerCounts(layers.get(layerId));
          }
          return result;
        }, view.state);
      } catch { return failed('review-changed'); }
      if (!planned.result.ok) return planned.result;
      const previous = layers.get(layerId);
      const directionsBefore = new Map(previous.photoIds.map((id) => [id, records.get(id)?.direction.current]));
      const saved = commitDraftMaps(planned.state, view.state, view.before);
      if (!saved.ok) return saved;
      const committed = layers.get(layerId);
      if (workflowMembers.get(ticket) === previous.photoIds) workflowMembers.set(ticket, committed.photoIds);
      const outcomes = new Map(view.outcome.outcomes.map((outcome) => [outcome.id, outcome]));
      const ops = draft.ops.map((op) => draftOpSummary(op, outcomes.get(op.id)));
      draft.ops = []; draft.version++; draft.view = null;
      workflowReviews.delete(plan);
      sourceRequests.set(layerId, (sourceRequests.get(layerId) || 0) + 1);
      publish();
      const actions = plan && requests.length ? selectedPhotoSourcePositions(plan, Object.fromEntries(requests.map((request) => [request.photoId, request.candidateId]))) : [];
      const count = (action) => actions.filter((row) => row.action === action).length;
      const receipt = Object.freeze({
        added: Object.freeze(ops.filter((op) => op.kind !== 'remove-gmi' && !op.recheck)),
        rechecked: Object.freeze(ops.filter((op) => op.kind !== 'remove-gmi' && op.recheck && !op.rebinding)),
        rebound: Object.freeze(ops.filter((op) => op.kind === 'gmi' && op.rebinding)),
        removed: Object.freeze(ops.filter((op) => op.kind === 'remove-gmi')),
        occurrencesAdded: committed.photoIds.length - previous.photoIds.length,
        captureTimes: ops.reduce((sum, op) => sum + op.captureTimeCount, 0),
        directions: committed.photoIds.filter((id) => directionsBefore.has(id) && records.get(id)?.direction.current !== directionsBefore.get(id)
          && records.get(id)?.direction.current?.basis?.evidenceId).length,
        placed: count('place'), moved: count('move'), same: count('same'),
        gmlDelivery: planned.result.delivery?.gml || 0,
        gmiDelivery: planned.result.delivery?.gmi || 0,
        deliveryKeptExplicit: planned.result.delivery?.keptExplicit || 0,
        deliveryKeptUnavailable: planned.result.delivery?.keptUnavailable || 0,
      });
      return { ok: true, receipt, acceptedIds: planned.result.acceptedIds, deliveryIds: planned.result.deliveryIds, delivery: planned.result.delivery };
    },
    // B1.1: Kontroll's read-only preview of the delivery consequences of the selected positions. It runs the same
    // planning core as commitSourceWorkflow on draft copies, so Kontroll and the receipt state the same rule; nothing
    // accepted changes. Null when there is nothing to preview or the review is no longer current.
    previewSourceWorkflowDelivery(ticket, { plan = null, requests = [] } = {}) {
      if (!requests.length || !sourceWorkflowIsLive(ticket) || sourceReviews.has(ticket.layerId)
        || workflowReviews.get(plan)?.ticket !== ticket) return null;
      const view = draftView(ticket);
      if (!view.outcome.ok) return null;
      try {
        const { result } = inDraft(() => acceptSourcePositionsCore(ticket.layerId, plan, requests), view.state);
        return result.ok ? result.delivery : null;
      } catch { return null; }
    },
    // Positions only, with no staged sources: the same atomic commit.
    applySourceWorkflowPositions(ticket, plan, requests) {
      if (!sourceWorkflowIsLive(ticket) || workflowReviews.get(plan)?.ticket !== ticket || sourceReviews.has(ticket.layerId)
        || sourceWorkflowDrafts.get(ticket)?.ops.length) return failed('review-changed');
      if (!requests?.length) return failed('invalid-selection');
      const result = this.commitSourceWorkflow(ticket, { plan, requests });
      return result.ok ? { ok: true, acceptedIds: result.acceptedIds, deliveryIds: result.deliveryIds, delivery: result.delivery } : result;
    },
    beginPhotoEdits(layerId) {
      const layer = layers.get(layerId);
      if (!layer?.photoIds.length) return null;
      const baseline = Object.freeze(Object.fromEntries(layer.photoIds.map((id) => [id, Object.freeze({
        current: records.get(id).spatial.current, direction: records.get(id).direction.current,
      })])));
      const ticket = Object.freeze({ id: `photo-edit-${++editSerial}`, layerId, generation, baseline });
      // A newer session for the same layer supersedes the previous ticket.
      editSessions.set(layerId, ticket);
      return ticket;
    },
    photoEditsAreLive,
    endPhotoEdits(ticket) {
      if (!ticket || editSessions.get(ticket.layerId) !== ticket) return;
      editSessions.delete(ticket.layerId);
      if (autoAcceptMetadata()) publish();
    },
    // Validate every staged change before any write, then commit and publish once.
    // Conflicts are detected by identity, like the source workflow; nothing is ever partially applied.
    applyPhotoEdits(ticket, changes) {
      if (!photoEditsAreLive(ticket)) return { ok: false, error: 'session-ended' };
      if (!Array.isArray(changes)) return { ok: false, error: 'invalid-change' };
      const layer = layers.get(ticket.layerId);
      const staleIds = [], seen = new Set(), writes = [];
      for (const change of changes) {
        const { photoId } = change || {};
        const hasPosition = change?.position !== undefined, hasDegrees = change?.degrees !== undefined && change?.degrees !== null;
        if (!photoId || seen.has(photoId) || (!hasPosition && !hasDegrees)) return { ok: false, error: 'invalid-change' };
        seen.add(photoId);
        if (hasPosition && !isPhotoPosition(change.position)) return { ok: false, error: 'invalid-change' };
        const degrees = hasDegrees ? normalizePhotoDirection(change.degrees) : null;
        if (hasDegrees && degrees === null) return { ok: false, error: 'invalid-change' };
        const baseline = ticket.baseline[photoId], live = records.get(photoId);
        if (!baseline || !live || !layer.photoIds.includes(photoId) || live.spatial.current !== baseline.current
          || live.direction.current !== baseline.direction) { staleIds.push(photoId); continue; }
        writes.push({ photoId, position: hasPosition ? change.position : null, degrees });
      }
      if (staleIds.length) return { ok: false, error: 'edit-conflict', staleIds };
      // A move away from the originating GMI point turns an untouched GMI default into GML, in the same commit, and a
      // move back restores an automatic transfer (B1.1, the same rule as the positioning wizard). Rotation alone never
      // does; the occurrence (GMI object relationship) and the GMI file are left as they are.
      const effects = positionDeliveryEffects(layer, writes.filter((write) => write.position)
        .map(({ photoId, position }) => ({ photoId, position })));
      const acceptedAt = Date.now();
      for (const { photoId, position, degrees } of writes) updateRecord(photoId, (live) => ({
        ...(position ? { spatial: acceptManualPhotoPosition(live.spatial, position, acceptedAt) } : {}),
        ...(degrees !== null ? { direction: acceptManualPhotoDirection(degrees, acceptedAt) } : {}),
      }));
      applyPositionDeliveryEffects(effects);
      editSessions.delete(ticket.layerId);
      if (autoAcceptMetadata() || writes.length) publish();
      return { ok: true, changedIds: writes.map((write) => write.photoId), transferIds: effects.transfer, restoredIds: effects.restore,
        delivery: deliveryEffectSummary(effects) };
    },
    // Owner-scoped, deduplicated asset writes. Stale occurrences are ignored;
    // invalid values and stale evidence fail before any write.
    setCaptureMetadata(layerId, photoIds, field, input, { evidenceId = null, estimated = false } = {}) {
      if (!['captureTime', 'photographer'].includes(field)) return { ok: false, error: 'invalid-field', assetIds: [] };
      if (estimated && (field !== 'captureTime' || evidenceId || !estimatedCaptureTime(input))) return { ok: false, error: 'invalid-value', assetIds: [] };
      const members = layerId ? layers.get(layerId)?.photoIds || [] : importIds;
      const ids = assetIds(photoIds.filter((id) => members.includes(id)));
      const changes = [];
      for (const assetId of ids) {
        const asset = assets.get(assetId);
        const evidence = evidenceId ? asset.metadataEvidence.find((item) => item.id === evidenceId && item.field === field) : null;
        const value = evidenceId ? evidence?.value : input === null ? null
          : field === 'captureTime' ? estimated ? estimatedCaptureTime(input) : normalizeCaptureTime(input) : normalizePhotographer(input);
        if ((evidenceId && !value) || (input !== null && !evidenceId && !value)) return { ok: false, error: 'invalid-value', assetIds: [] };
        const accepted = value === null ? null : immutable({ value, provenance: evidence
          ? { kind: evidence.kind, evidenceId: evidence.id, sourceId: evidence.sourceId || null,
            sourceFilename: evidence.sourceFilename || null, sourceEntryId: evidence.sourceEntryId || null, tag: evidence.tag || null, raw: evidence.raw }
          : { kind: 'manual', ...(estimated ? { estimated: true } : {}) }, acceptedAt: Date.now() });
        changes.push([assetId, accepted]);
      }
      // Removing a value is a decision too, so it is remembered: automatic acceptance must not bring it back.
      const clearedFlag = `${field}Cleared`;
      for (const [assetId, accepted] of changes) updateAsset(assetId, (asset) => {
        const { [clearedFlag]: _cleared, ...metadata } = asset.captureMetadata;
        return { captureMetadata: Object.freeze({ ...metadata, [field]: accepted, ...(accepted === null ? { [clearedFlag]: true } : {}) }) };
      });
      if (changes.length) publish();
      return { ok: true, assetIds: ids };
    },
    fillMissingPhotoValues(layerId, field, input, photoIds = null, { estimated = false, expectedEstimate = null } = {}) {
      if (!MANUAL_FILL_FIELDS.includes(field)) return { ok: false, error: 'invalid-field' };
      if (estimated && field !== 'captureTime') return { ok: false, error: 'invalid-field' };
      const members = layers.get(layerId)?.photoIds || [];
      const photos = members.map((id) => {
        const record = records.get(id), asset = assets.get(record.assetId);
        return { ...record, captureMetadata: asset.captureMetadata, metadataEvidence: asset.metadataEvidence };
      });
      // C3: an estimated date reaches only photos with no date evidence in any source and no removal by the user;
      // photos with usable but unaccepted source dates are completed from that evidence instead.
      const estimate = estimated ? photoEstimatedDateModel(photos, { today: today() }) : null;
      if (estimate && expectedEstimate !== null && estimatedDateReviewSignature(estimate) !== expectedEstimate) return failed('review-changed');
      const estimateTargets = estimate ? new Set(estimate.targetIds) : null;
      const plan = planManualPhotoFill(photos, field, (photoIds ?? members).filter((id) => !estimateTargets || estimateTargets.has(id)));
      const value = estimated ? estimatedCaptureTime(input) : normalizeManualPhotoFill(field, input);
      if (value === null) return { ok: false, error: 'invalid-value', ...plan, counts: { ...plan.counts, adopted: 0, invalidInput: 1 } };
      const acceptedAt = Date.now();
      const undoEntries = [];
      for (const target of plan.targets) {
        if (field === 'direction') records.set(target.photoId, { ...records.get(target.photoId),
          direction: acceptManualPhotoDirection(value, acceptedAt, { mode: 'bulk' }) });
        else {
          const asset = assets.get(target.assetId);
          const before = asset.captureMetadata;
          const { [`${field}Cleared`]: _cleared, ...metadata } = before;
          assets.set(target.assetId, { ...asset, captureMetadata: Object.freeze({ ...metadata, [field]: immutable({
            value, provenance: { kind: 'manual', mode: 'bulk', ...(estimated ? { estimated: true } : {}) }, acceptedAt,
          }) }) });
          if (estimated) undoEntries.push({ assetId: target.assetId, before, after: assets.get(target.assetId).captureMetadata.captureTime });
        }
      }
      const undoToken = undoEntries.length ? Object.freeze({}) : null;
      if (undoToken) captureTimeUndos.set(undoToken, { layerId, generation, entries: undoEntries });
      if (plan.targets.length) publish();
      return { ok: true, ...plan, ...(estimated ? { undoToken } : {}), counts: { ...plan.counts, adopted: plan.targets.length, invalidInput: 0 } };
    },
    // M5 (C-2): one explicit batch step of the Opptakstid task. The rows are re-planned from the live layer and must be
    // exactly the reviewed ones; every value is prepared before the first write, written in one pass and published
    // once. Accepted and removed values are never written. The undo restores each value if it is unchanged since.
    completeCaptureTimes(layerId, { step, groups = [], expected = null } = {}) {
      const layer = layers.get(layerId);
      if (!layer || !['source', 'filename', 'technical'].includes(step)) return failed('invalid-field');
      const photos = this.getLayerPhotos(layerId);
      const rows = selectedCaptureCompletionRows(planCaptureCompletion(photos, { today: today() }), { step, groups });
      if (!rows.length) return failed('nothing-selected');
      if (expected !== null && captureCompletionSignature(rows) !== expected) return failed('review-changed');
      const acceptedAt = Date.now();
      const writes = rows.map((item) => {
        const asset = assets.get(item.assetId), before = asset.captureMetadata;
        const protectedValue = step === 'technical' ? before.captureTime?.value?.iso !== item.provenance.technical.from.iso
          : Boolean(before.captureTime || before.captureTimeCleared);
        if (protectedValue) return null;
        const captureTime = immutable({ value: item.value, provenance: item.provenance, acceptedAt });
        return { assetId: item.assetId, asset, before, next: { ...asset, captureMetadata: Object.freeze({ ...before, captureTime }) } };
      });
      if (writes.some((write) => !write)) return failed('review-changed');
      for (const write of writes) assets.set(write.assetId, write.next);
      const undoToken = Object.freeze({});
      captureTimeUndos.set(undoToken, { layerId, generation, entries: writes.map((write) => ({ assetId: write.assetId, before: write.before,
        after: assets.get(write.assetId).captureMetadata.captureTime })) });
      publish();
      return { ok: true, count: writes.length, undoToken,
        counts: Object.fromEntries(['complete', 'minute', 'date', 'noon', 'seconds'].map((key) => [key, rows.filter((item) => item.group === key || item.kind === key).length])),
        // C1.2: where the written values came from (for a technical step, the completed value's original source).
        kinds: Object.fromEntries([...Map.groupBy(rows, (item) => item.provenance?.kind || 'unknown')].map(([kind, items]) => [kind, items.length])) };
    },
    undoCaptureTimeFill(token) {
      const undo = token && captureTimeUndos.get(token);
      if (!undo || undo.generation !== generation || !layers.has(undo.layerId)) return { ok: false, restored: 0, skipped: 0 };
      captureTimeUndos.delete(token);
      const members = new Set(assetIds(layers.get(undo.layerId).photoIds));
      let restored = 0, skipped = 0;
      for (const { assetId, before, after } of undo.entries) {
        const asset = assets.get(assetId);
        // An individual adjustment made later must survive Undo. Other metadata is also left alone.
        if (!members.has(assetId) || asset?.captureMetadata.captureTime !== after) { skipped++; continue; }
        const { captureTimeCleared: _cleared, ...metadata } = asset.captureMetadata;
        assets.set(assetId, { ...asset, captureMetadata: Object.freeze({ ...metadata, captureTime: before.captureTime,
          ...(before.captureTimeCleared ? { captureTimeCleared: true } : {}) }) });
        restored++;
      }
      if (restored) publish();
      return { ok: true, restored, skipped };
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
          assets.set(target.assetId, { ...asset, captureMetadata: Object.freeze({ ...asset.captureMetadata, [field]: immutable({
            value: evidence.value, provenance: evidenceProvenance(evidence, target.agreeingEvidence), acceptedAt,
          }) }) });
        }
      }
      if (plan.targets.length) publish();
      return { ok: true, ...plan, counts: { ...plan.counts, adopted: plan.targets.length } };
    },
    // Combined delivery (M8). Explicit, atomic and owner-scoped: every id is validated before any write, a repeated
    // value is a no-op, and nothing else (positions, directions, metadata, sources, hyperlinks) is touched.
    setPhotoDeliveryExclusion(layerId, photoIds, options = {}) {
      const layer = layers.get(layerId);
      const delivery = layer ? layerDelivery(layer) : null;
      if (options.expectedStateKey && options.expectedStateKey !== delivery?.stateKey) return {
        ok: false, error: 'stale-plan', changedIds: [], blocked: [{ reason: 'stale-plan', text: 'Leveringsvalgene er endret. Velg handlingen på nytt.' }] };
      const plan = planPhotoExclusion(delivery, layer, photoIds, options);
      if (!plan.ok) return { ...plan, error: 'exclusion-blocked', changedIds: [] };
      // All linked/unlinked writes have been validated together. Never call the two individual
      // actions here: each would publish separately and could leave a half-applied photograph.
      for (const { photoId, decision } of plan.writes) {
        if (decision) deliveryDecisions.set(photoId, Object.freeze(decision));
        else deliveryDecisions.delete(photoId);
      }
      if (markDeliveryChoices(plan.writes.map((write) => write.photoId)) || plan.writes.length) publish();
      return { ...plan, changedIds: plan.writes.map((write) => write.photoId) };
    },
    setDeliveryIntent(layerId, photoIds, intent) {
      const fail = (error, invalidIds = []) => ({ ok: false, error, invalidIds, changedIds: [] });
      if (!Object.values(PHOTO_DELIVERY_INTENTS).includes(intent)) return fail('invalid-intent');
      const layer = layers.get(layerId);
      if (!layer) return fail('layer-not-found');
      if (!Array.isArray(photoIds) || !photoIds.length || new Set(photoIds).size !== photoIds.length) return fail('invalid-selection');
      const stale = photoIds.filter((id) => !layer.photoIds.includes(id) || !records.has(id));
      if (stale.length) return fail('stale-occurrence', stale);
      const unlinked = photoIds.filter((id) => !records.get(id).occurrence);
      if (unlinked.length) return fail('not-gmi-linked', unlinked);
      const entries = photoIds.map((id) => photoDeliveryEntry(layer, records.get(id), deliveryDecisions.get(id) || null));
      if ([PHOTO_DELIVERY_INTENTS.TRANSFER, PHOTO_DELIVERY_INTENTS.EXCLUDE].includes(intent)) {
        const unavailable = entries.filter((entry) => !entry.canTransfer).map((entry) => entry.photoId);
        if (unavailable.length) return fail('association-unavailable', unavailable);
      }
      const changed = entries.filter((entry) => entry.status !== intent).map((entry) => entry.photoId);
      for (const id of changed) {
        if (intent === PHOTO_DELIVERY_INTENTS.KEEP_LINK) deliveryDecisions.delete(id);
        else deliveryDecisions.set(id, Object.freeze({ kind: 'gmi', occurrenceKey: records.get(id).occurrence.key, intent }));
      }
      if (markDeliveryChoices(photoIds) || changed.length) publish();
      return { ok: true, changedIds: changed, unchangedIds: photoIds.filter((id) => !changed.includes(id)) };
    },
    setCombinedDeliveryInclusion(layerId, photoIds, include) {
      const fail = (error, invalidIds = []) => ({ ok: false, error, invalidIds, changedIds: [] });
      if (typeof include !== 'boolean') return fail('invalid-inclusion');
      const layer = layers.get(layerId);
      if (!layer) return fail('layer-not-found');
      if (!Array.isArray(photoIds) || !photoIds.length || new Set(photoIds).size !== photoIds.length) return fail('invalid-selection');
      const stale = photoIds.filter((id) => !layer.photoIds.includes(id) || !records.has(id));
      if (stale.length) return fail('stale-occurrence', stale);
      const linked = photoIds.filter((id) => records.get(id).occurrence);
      if (linked.length) return fail('gmi-linked-occurrence', linked);
      const entries = photoIds.map((id) => photoDeliveryEntry(layer, records.get(id), deliveryDecisions.get(id) || null));
      // A photo linked from a GMI object without a FOTO occurrence (line) keeps its link; it cannot also be
      // included as an unlinked photo. Clearing a stale inclusion is always allowed.
      const withoutOccurrence = entries.filter((entry) => entry.linkedWithoutOccurrence).map((entry) => entry.photoId);
      if (include && withoutOccurrence.length) return fail('linked-without-occurrence', withoutOccurrence);
      const target = include ? 'include' : 'not-selected';
      const changed = entries.filter((entry) => (include ? entry.status !== target
        : entry.status === 'include' || (entry.status === 'review' && (deliveryDecisions.get(entry.photoId)?.kind === 'unlinked' || entry.reason === 'link-removed')))).map((entry) => entry.photoId);
      for (const id of changed) {
        if (include) deliveryDecisions.set(id, Object.freeze({ kind: 'unlinked', include: true }));
        else deliveryDecisions.delete(id);
      }
      if (markDeliveryChoices(photoIds) || changed.length) publish();
      return { ok: true, changedIds: changed, unchangedIds: photoIds.filter((id) => !changed.includes(id)) };
    },
    // Read-only: per-occurrence delivery state and counts for the workspace.
    getLayerDelivery(layerId) {
      const layer = layers.get(layerId);
      return layer ? layerDelivery(layer) : null;
    },
    // Read-only, deterministic snapshot for the combined delivery planner (M9).
    getPhotoDeliverySnapshot(layerId) {
      const layer = layers.get(layerId);
      return layer ? buildPhotoDeliverySnapshot(layer, records, deliveryDecisions, { generation }) : null;
    },
    isPhotoDeliverySnapshotCurrent(deliverySnapshot) {
      const layer = deliverySnapshot && layers.get(deliverySnapshot.layerId);
      return Boolean(layer) && buildPhotoDeliverySnapshot(layer, records, deliveryDecisions, { generation }).stateKey === deliverySnapshot.stateKey;
    },
    getFile: fileFor,
    getAssetFile: (assetId) => assets.get(assetId)?.file || null,
    // Resolves to a URL owned by the session, or null: callers keep showing the thumbnail until then.
    async requestDisplayPreview(assetId, options) {
      const asset = assets.get(assetId);
      if (asset?.preview.state !== 'ready') return null;
      // Originals no bigger than the thumbnail have nothing more to offer.
      if (Math.max(asset.dimensions?.width || 0, asset.dimensions?.height || 0) <= THUMBNAIL_MAX_EDGE) return asset.preview.thumbnailUrl;
      return displayPreviews.request(assetId, asset.file, options);
    },
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
    // input: a File, or { binding, read, isLive } for a GMI layer already loaded in the app (same as import).
    async stageLayerSource(layerId, input, kind = 'gml') {
      if (!layers.has(layerId)) return false;
      const ownerGeneration = generation;
      const request = (sourceRequests.get(layerId) || 0) + 1;
      sourceRequests.set(layerId, request);
      const previous = sourceReviews.get(layerId);
      sourceReviews.set(layerId, Object.freeze({ ...previous, state: 'pending', errorCode: null }));
      publish();
      try {
        let source, loadedInput;
        if (typeof input?.read === 'function') {
          const { binding, isLive } = input;
          if (!binding?.layerId || !binding.inputId || !binding.datasetRevision || !isLive?.(binding))
            throw Object.assign(new Error('loaded-source-unavailable'), { code: 'loaded-source-unavailable' });
          const parsed = await input.read();
          if (!isLive(binding)) throw Object.assign(new Error('loaded-source-unavailable'), { code: 'loaded-source-unavailable' });
          loadedInput = Object.freeze({ source: parsed, binding, isLive });
          source = loadedGmiSource(parsed, binding);
        } else source = await makeSource(input, kind);
        if (generation !== ownerGeneration || !layers.has(layerId) || sourceRequests.get(layerId) !== request) return false;
        const layer = layers.get(layerId);
        const attached = layer.spatialSources.find((item) => item.kind === source.kind && item.fingerprint === source.fingerprint);
        if (loadedInput && attached) {
          if (matchingGmiSources(layer, source.fingerprint).length !== 1)
            throw Object.assign(new Error('source-association-ambiguous'), { code: 'source-association-ambiguous' });
          const verified = verifiedGmiBinding(attached, loadedInput.source, loadedInput.binding, loadedInput.isLive);
          if (verified.error) throw Object.assign(new Error(verified.error), { code: verified.error });
          sourceReviews.set(layerId, Object.freeze({ state: 'ready', source: attached, errorCode: null, recheck: true,
            loadedInput, rebinding: verified.source !== attached ? verified.source.loadedBinding : null }));
          publish(); return true;
        }
        if (attached) {
          throw Object.assign(new Error('duplicate-source'), { code: 'duplicate-source', attachedSourceId: attached.id });
        }
        sourceReviews.set(layerId, Object.freeze({ state: 'ready', source, errorCode: null, recheck: false, loadedInput }));
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
    applyLayerSource(layerId, { captureTime = null } = {}) {
      return commitLayerSource(layerId, captureTime).ok;
    },
    // Checkpoint A: source, asset associations and point occurrences, never current.
    // Construct the entire change before publishing any occurrence/source writes.
    applyGmiAssociations(layerId, { confirmed = false, sourceId, memberIds, associationLedger } = {}) {
      const layer = layers.get(layerId), review = sourceReviews.get(layerId);
      if (!confirmed || !layer || review?.state !== 'ready' || review.source?.kind !== 'gmi'
        || review.source.id !== sourceId || review.associationLedger !== associationLedger
        || !memberIds || memberIds.length !== layer.photoIds.length
        || memberIds.some((id, index) => id !== layer.photoIds[index])) return failed('review-changed');
      const result = gmiAssociationsCore(layerId, review, associationLedger);
      if (!result.ok) return result;
      const photoIds = layers.get(layerId).photoIds;
      const workflow = sourceWorkflows.get(layerId);
      if (workflow && workflowMembers.get(workflow) === layer.photoIds) workflowMembers.set(workflow, photoIds);
      sourceReviews.delete(layerId);
      sourceRequests.set(layerId, (sourceRequests.get(layerId) || 0) + 1);
      publish(); return { ok: true };
    },
    removeGmiSource(layerId, sourceId, { confirmed = false } = {}) {
      if (!confirmed || !removeGmiSourceCore(layerId, sourceId).ok) return false;
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
      const seen = new Set(), changes = [];
      for (const request of requests) {
        const live = records.get(request.photoId);
        if (!layer.photoIds.includes(request.photoId) || seen.has(request.photoId)
          || !live || live.spatial.current !== request.expectedCurrent) return fail('review-changed');
        const candidate = kind === 'gml' ? proposed.get(live.assetId)
          : live.spatial.candidates.find((item) => item.id === request.candidateId && item.kind === 'exif');
        if (candidate?.id !== request.candidateId || candidate?.status !== 'viable' || !isPhotoPosition(candidate.position)) return fail('review-changed');
        seen.add(request.photoId);
        changes.push({ photoId: request.photoId, position: candidate.position, includeUnlinked: true });
      }
      const effects = positionDeliveryEffects(layer, changes);
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
      applyPositionDeliveryEffects(effects);
      publish();
      return { ok: true, acceptedIds: [...seen], deliveryIds: deliveryEffectIds(effects), delivery: deliveryEffectSummary(effects) };
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
          dimensions: null, captureMetadata: emptyCaptureMetadata(), metadataEvidence: immutable([]), directionEvidence: immutable([]),
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
    createLayer(choices) {
      const layer = createLayerCore(choices);
      if (!layer) return null;
      transferDraft(); publish();
      return layer;
    },
    appendImport(choices) {
      const skipped = appendPolicy()?.skippedIds;
      const layer = appendImportCore(choices);
      if (!layer) return null;
      release(skipped); transferDraft(); publish();
      return layers.get(layer.id);
    },
    setLayerVisibility(id, visible) {
      const layer = layers.get(id);
      if (!layer || layer.visible === visible) return;
      layers.set(id, Object.freeze({ ...layer, visible }));
      publish();
    },
    setAllLayersVisible(visible) {
      for (const [id, layer] of layers) {
        layers.set(id, Object.freeze({ ...layer, visible }));
      }
      publish();
    },
    deleteLayer(id) {
      const layer = layers.get(id);
      if (!layer) return;
      layers.delete(id);
      sourceWorkflows.delete(id);
      editSessions.delete(id);
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
      editSessions.clear();
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
