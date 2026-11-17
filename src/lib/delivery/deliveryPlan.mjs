import { buildGmiFieldExport, getGmiExportBytes } from '../gmi-edit/exportGmi.mjs';
import { planGmiHyperlinkRemoval, applyGmiHyperlinkRemoval } from '../gmi-edit/hyperlinkRemoval.mjs';
import { gmiSourceIntact } from '../gmi-edit/sourceDocument.mjs';
import { getGmiDocumentDataset } from '../gmi-edit/proposed.mjs';
import { diffGmiDatasets } from '../gmi-edit/diff.mjs';
import { capturePhotoExportSnapshot, buildPhotoExportPlan, assertExportablePlan } from '../photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../photos/export/photoExportXml.mjs';
import { photoExportNames, exportFilenameOptions, ExportFilenameError } from '../photos/export/photoExportNaming.mjs';
import { digestHex, compareExportKeys } from '../photos/export/attachmentNames.mjs';
import { freezeExportData } from '../photos/export/exportContract.mjs';
import { describeGmiObject } from '../gmiEditView.mjs';
import { planDeliveryAttachments } from './deliveryAttachments.mjs';
import { validateDeliveryGml } from './deliveryGml.mjs';

export const DELIVERY_MODES = Object.freeze({ GMI_ONLY: 'gmi-only', PHOTOS_ONLY: 'photos-only', SPLIT: 'split', COMBINED: 'combined' });
const snapshots = new WeakMap(), plans = new WeakMap();
export class DeliveryError extends Error {
  constructor(code) { super(`Leveransen kan ikke lages (${code}). Lag og kontroller en ny forhåndsvisning.`); this.code = code; }
}
const requireOk = (result) => { if (!result.ok) throw new DeliveryError(result.code || 'verification-failed'); return result; };

const deliveryObjectLabel = (source, key) => {
  const object = source?.objectsByKey[key];
  return object ? `${describeGmiObject(object.geometryScope, object.sourceIndex, object.parserId)}${object.guid ? ` (GUID ${object.guid})` : ''}` : null;
};

/** Add occurrence context outside M7; never change its diagnostic or authorization contract. */
function deliveryDiagnosticContext(snapshot, item) {
  const intent = snapshot.intent;
  const candidates = intent ? [...intent.transfers, ...intent.exclusions, ...intent.retained, ...intent.included, ...intent.unresolved, ...intent.linksWithoutOccurrence] : [];
  const reference = snapshot.source?.references.find((ref) => ref.id === item.referenceId);
  const entry = candidates.find((row) => (item.selectionKey && row.occurrenceKey === item.selectionKey)
    || (item.photoId && row.photoId === item.photoId) || (item.referenceId && row.referenceIds?.includes(item.referenceId)));
  const assetId = item.assetId ?? entry?.assetId;
  const asset = snapshot.photo?.assets.find((row) => row.assetId === assetId);
  const objectKey = item.objectKey ?? entry?.objectKey ?? reference?.objectKey;
  return { ...item, ...(entry?.photoId ? { photoId: entry.photoId } : {}), ...(assetId ? { assetId } : {}),
    ...(asset ? { filename: asset.originalFilename } : reference?.filename ? { filename: reference.filename } : {}),
    ...(objectKey ? { objectKey, objectLabel: deliveryObjectLabel(snapshot.source, objectKey) } : {}) };
}

/** Derived facts about the reviewed artifact, not a second decision owner. Removal purposes
 * are counted from M7's reference-level result only after the entire plan has verified. */
function deliveryPhotoAccounting(snapshot, removal, attachments, photoPlan, errors) {
  const coordinated = ['combined', 'split'].includes(snapshot.mode), ready = errors.length === 0;
  const intent = snapshot.intent, source = snapshot.source;
  const removed = ready && coordinated ? removal?.cells.flatMap((cell) => cell.removedReferences) || [] : [];
  const removedIds = new Set(removed.map((ref) => ref.referenceId));
  const used = new Set(attachments.map((entry) => entry.assetId));
  const edges = Object.values(source?.associationLedger?.associationsById || {});
  const retainedEdges = edges.filter((edge) => edge.referenceIds.some((id) => !removedIds.has(id)));
  const filename = (id) => snapshot.photo?.assets.find((asset) => asset.assetId === id)?.originalFilename ?? '';
  const rows = (items) => (items || []).map((item) => ({ photoId: item.photoId, assetId: item.assetId,
    filename: filename(item.assetId), objectKey: item.objectKey, objectLabel: deliveryObjectLabel(source, item.objectKey) ?? item.objectLabel,
    referenceCount: item.referenceIds.length,
    removedReferences: removed.filter((ref) => ref.selectionKey === item.occurrenceKey).length,
    deliveredElsewhere: ready && used.has(item.assetId),
    remaining: ready ? [...new Set([
      ...retainedEdges.filter((edge) => edge.photoId === item.assetId).map((edge) => `${deliveryObjectLabel(source, edge.objectKey)} (GMI)`),
      ...[...(intent?.transfers || []), ...(intent?.included || [])].filter((row) => row.assetId === item.assetId)
        .map((row) => `${deliveryObjectLabel(source, row.objectKey) || 'Plassering uten GMI-objekt'} (GML)`),
    ])] : [],
  }));
  const transfers = rows(intent?.transfers), exclusions = rows(intent?.exclusions);
  const excludedIds = new Set(exclusions.map((row) => row.assetId));
  const blocked = new Set(errors.map((item) => deliveryDiagnosticContext(snapshot, item)).map((item) =>
    item.photoId ?? item.selectionKey ?? item.objectKey ?? item.referenceId).filter(Boolean));
  const ignored = (snapshot.deliveryChoices?.exclusions.length || 0)
    + (snapshot.deliveryChoices?.unresolved.filter((item) => item.decision === 'exclude').length || 0);
  return {
    details: { applied: coordinated && ready, transfers, exclusions, ignoredExclusions: coordinated ? 0 : ignored },
    counts: {
      includedAssets: used.size,
      gmiPlacements: snapshot.mode === 'photos-only' ? 0 : source && ready ? retainedEdges.length : null,
      gmlPlacements: photoPlan?.occurrences.length ?? 0,
      retainedReferences: snapshot.mode === 'photos-only' ? 0 : source && ready ? source.references.filter((ref) => ref.targetValid && !removedIds.has(ref.id)).length : null,
      transferredReferences: transfers.reduce((sum, row) => sum + row.removedReferences, 0),
      excludedReferences: exclusions.reduce((sum, row) => sum + row.removedReferences, 0),
      excludedOccurrences: exclusions.length,
      excludedEntirelyAssets: ready ? [...excludedIds].filter((id) => !used.has(id)).length : 0,
      partialAssets: ready ? [...excludedIds].filter((id) => used.has(id)).length : 0,
      notNeededAssets: ready && coordinated ? snapshot.photo.assets.filter((asset) => !used.has(asset.assetId) && !excludedIds.has(asset.assetId)).length : 0,
      unresolvedOccurrences: intent?.unresolved.length ?? 0,
      blockedOccurrences: blocked.size,
    },
  };
}

/** Capture canonical owners, without staging edits or changing FOTO intent.
 * registry/handle are the existing M3 service and its opaque handle. Split with
 * pending corrections requires includeFieldChanges:false as an explicit choice.
 */
export function captureDeliverySnapshot({ mode = 'combined', registry, handle, photoSession, photoLayerId, includeFieldChanges } = {}) {
  if (!Object.values(DELIVERY_MODES).includes(mode)) throw new DeliveryError('invalid-mode');
  const hasGmi = mode !== 'photos-only', hasPhotos = mode !== 'gmi-only';
  const gmi = hasGmi ? requireOk(registry.resolve(handle)) : null;
  const photo = hasPhotos ? capturePhotoExportSnapshot(photoSession, photoLayerId) : null;
  const deliveryChoices = photoLayerId ? photoSession?.getPhotoDeliverySnapshot(photoLayerId) ?? null : null;
  const intent = hasPhotos && hasGmi ? deliveryChoices : null;
  const layer = deliveryChoices ? photoSession.getLayer(photoLayerId) : null;
  const source = hasGmi && deliveryChoices ? layer.spatialSources.find((item) => item.kind === 'gmi' && item.fingerprint === gmi.document.fingerprint
    && item.loadedBinding?.layerId === handle.layerId && item.loadedBinding?.inputId === handle.inputId && item.loadedBinding.live !== false) : null;
  const isLive = () => {
    if (gmi) {
      const current = registry.resolve(handle);
      if (!current.ok || current.session !== gmi.session || current.document !== gmi.document || !gmiSourceIntact(gmi.document)) return false;
    }
    return (!photo || photo.isLive()) && (!deliveryChoices || photoSession.isPhotoDeliverySnapshotCurrent(deliveryChoices));
  };
  const snapshot = Object.freeze({ kind: 'delivery-snapshot', mode, photo, intent, source, deliveryChoices,
    sourceFingerprint: gmi?.document.fingerprint ?? null, includeFieldChanges: mode !== 'split', isLive });
  snapshots.set(snapshot, { registry, handle, gmi, effectiveKey: gmi ? registry.effectiveKey(handle).effectiveKey : null,
    explicitExclusion: includeFieldChanges === false });
  return snapshot;
}

/** Opaque, reviewable result. Blocked plans never expose revised GMI bytes. */
export async function buildDeliveryPlan(snapshot, configuration = {}, { now = () => new Date(), validateGml = () => true } = {}) {
  const basis = snapshots.get(snapshot);
  if (!basis) throw new DeliveryError('invalid-snapshot');
  const errors = [], warnings = [], date = now();
  const error = (code, detail = {}) => errors.push({ code, ...detail });
  let gmiBytes = null, gmiFingerprint = null, gmiSummary = null, removal = null, photoPlan = null, xml = null, attachments = [], assets = [];
  // One clock read and one set of filename choices name every artifact; an unusable name fails closed here.
  const filename = exportFilenameOptions(configuration);
  let names;
  try { names = photoExportNames({ date, ...filename }); }
  catch (failure) { throw failure instanceof ExportFilenameError ? new DeliveryError(failure.code) : failure; }
  const naming = { ...names, gmiFilename: `${names.basename}.gmi` };
  try {
    if (!snapshot.isLive()) throw new DeliveryError('stale-plan');
    const { registry, handle, gmi } = basis;
    const photoOptions = { ...configuration, profile: configuration.profile ?? 'gemini-legacy2019' };
    if (snapshot.mode === 'gmi-only') {
      const exported = requireOk(await buildGmiFieldExport(registry, handle, { date, ...filename }));
      gmiBytes = getGmiExportBytes(exported); gmiSummary = exported.summary;
    } else if (snapshot.mode === 'photos-only') {
      // Mode B deliberately ignores M8 intent, preserving standalone scope and names.
      photoPlan = await buildPhotoExportPlan(snapshot.photo, photoOptions, { now: () => date });
      errors.push(...photoPlan.errors); warnings.push(...photoPlan.warnings);
      assets = photoPlan.assets; attachments = photoPlan.attachments;
    } else {
      if (!snapshot.source) throw new DeliveryError('loaded-gmi-binding-required');
      if (snapshot.mode === 'split' && gmi.session.changeSets.length && !basis.explicitExclusion) throw new DeliveryError('field-exclusion-required');
      for (const code of snapshot.intent.readiness.issues) {
        if (code === 'unresolved-decisions') for (const item of snapshot.intent.unresolved) error(code, item);
        else error(code);
      }
      if (snapshot.intent.transfers.some((item) => item.sourceId !== snapshot.source.id || item.sourceFingerprint !== snapshot.source.fingerprint)) error('foreign-transfer-source');
      for (const item of snapshot.intent.exclusions) if (item.sourceId !== snapshot.source.id || item.sourceFingerprint !== snapshot.source.fingerprint) error('foreign-exclusion-source', item);
      const session = snapshot.includeFieldChanges ? gmi.session : undefined;
      removal = planGmiHyperlinkRemoval(gmi.document, { photoSource: snapshot.source, selections: snapshot.intent.removalSelections,
        session, acceptedAssetIds: snapshot.photo.assets.map((asset) => asset.assetId) });
      errors.push(...removal.blockers); warnings.push(...removal.warnings);
      if (!errors.length) {
        const selected = [...snapshot.intent.transfers, ...snapshot.intent.included];
        const selectedIds = selected.map((item) => item.photoId);
        const selectedAssets = [...new Set(selected.map((item) => item.assetId))].sort(compareExportKeys);
        const shared = await planDeliveryAttachments(snapshot.source, removal, snapshot.photo.assets, selectedAssets);
        errors.push(...shared.errors); warnings.push(...shared.warnings); attachments = shared.attachments;
        if (selected.length) {
          photoPlan = await buildPhotoExportPlan(snapshot.photo, photoOptions, { now: () => date,
            occurrenceIds: selectedIds, attachments: shared.gmlAttachments });
          errors.push(...photoPlan.errors); warnings.push(...photoPlan.warnings);
          // Standalone may exclude an unplaced row; coordinated delivery must never do so.
          for (const item of selected) {
            if (photoPlan.occurrences.filter((row) => row.occurrenceId === item.photoId && row.assetId === item.assetId).length !== 1) error('selected-photo-not-exported', { photoId: item.photoId });
          }
          if (photoPlan.occurrences.length !== selected.length) error('photo-record-count-mismatch');
        }
        const usedAssets = new Set(attachments.map((item) => item.assetId));
        assets = snapshot.photo.assets.filter((asset) => usedAssets.has(asset.assetId)).map((asset) => ({ ...asset }));
        // Includes files retained only in the GMI, not just the GML's originals.
        for (const asset of assets) {
          if (!asset.file?.size || typeof asset.file.arrayBuffer !== 'function') { error('missing-attachment', { assetId: asset.assetId }); continue; }
          try {
            const bytes = new Uint8Array(await asset.file.arrayBuffer());
            if (bytes.length !== asset.file.size) error('attachment-size-mismatch', { assetId: asset.assetId });
            asset.checksum = await digestHex(bytes);
          }
          catch { error('unreadable-attachment', { assetId: asset.assetId }); }
          const photoAsset = photoPlan?.assets.find((item) => item.assetId === asset.assetId);
          if (photoAsset && asset.checksum !== photoAsset.checksum) error('attachment-changed', { assetId: asset.assetId });
        }
        // GML serialization and record validation precede M7 authorization.
        if (!errors.length && photoPlan) {
          xml = serializePhotoExport(photoPlan);
          // An optional additional validator can impose stricter recipient checks;
          // it cannot bypass the built-in XML and record-integrity validation.
          if (!validateDeliveryGml(xml, photoPlan) || await validateGml(xml, photoPlan) !== true) error('invalid-gml');
        }
        if (!errors.length) {
          requireOk(await registry.verifySource(handle));
          if (!snapshot.isLive()) throw new DeliveryError('stale-plan');
          const result = applyGmiHyperlinkRemoval(removal, { session,
            authorization: { selectionKeys: snapshot.intent.removalSelections.map((item) => item.key) } });
          if (!result.ok) errors.push(...result.rejections);
          else {
            gmiBytes = result.bytes;
            gmiSummary = { fieldEditCount: result.fieldEditCount, removalCounts: result.counts, verification: result.verification,
              diff: diffGmiDatasets(getGmiDocumentDataset(gmi.document), getGmiDocumentDataset(result.document)),
              changeSets: snapshot.includeFieldChanges ? gmi.session.changeSets.map((item) => ({ id: item.id, label: item.label })) : [] };
          }
        }
      }
    }
    if (!errors.length && photoPlan && xml === null) {
      xml = serializePhotoExport(photoPlan);
      if (!validateDeliveryGml(xml, photoPlan) || await validateGml(xml, photoPlan) !== true) error('invalid-gml');
    }
    if (!errors.length && gmiBytes) gmiFingerprint = `sha256:${await digestHex(gmiBytes)}`;
    if (!snapshot.isLive()) error('stale-plan');
  } catch (failure) {
    // Diagnostics never copy file contents or raw parser/provider messages.
    error(failure instanceof DeliveryError ? failure.code : 'delivery-generation-failed');
  }
  const accounting = deliveryPhotoAccounting(snapshot, removal, attachments, photoPlan, errors);
  const plan = freezeExportData({ kind: 'delivery-plan', mode: snapshot.mode, status: errors.length ? 'blocked' : 'ready', naming,
    filename: snapshot.mode === 'gmi-only' ? naming.gmiFilename : naming.zipFilename,
    mimeType: snapshot.mode === 'gmi-only' ? 'application/octet-stream' : 'application/zip',
    errors: errors.map((item) => deliveryDiagnosticContext(snapshot, item)), warnings: warnings.map((item) => deliveryDiagnosticContext(snapshot, item)), attachments, photoPlan,
    photoDelivery: accounting.details, gmiSummary: errors.length ? null : gmiSummary, gmiFingerprint: errors.length ? null : gmiFingerprint,
    counts: { features: photoPlan?.occurrences.length ?? 0, attachments: attachments.length,
      transferredOccurrences: snapshot.intent?.transfers.length ?? 0,
      ...accounting.counts },
    isLive: snapshot.isLive });
  plans.set(plan, { snapshot, basis, gmiBytes: errors.length || !gmiBytes ? null : Uint8Array.from(gmiBytes), xml: errors.length ? null : xml, assets });
  return plan;
}

export function assertDeliveryPlan(plan) {
  const state = plans.get(plan);
  if (!state || plan.status !== 'ready') throw new DeliveryError('blocked-plan');
  if (!plan.isLive()) throw new DeliveryError('stale-plan');
  if (plan.photoPlan) assertExportablePlan(plan.photoPlan);
}

export function getDeliveryGmiBytes(plan) {
  assertDeliveryPlan(plan);
  const state = plans.get(plan);
  return state.gmiBytes ? Uint8Array.from(state.gmiBytes) : null;
}

export function getDeliveryGml(plan) { assertDeliveryPlan(plan); return plans.get(plan).xml; }

/** Caller attests that the actual browser download has started. Planning and
 * packaging never call this. Split/FOTO deliveries cannot clear field guards.
 */
export function recordDeliveryDownload(plan) {
  assertDeliveryPlan(plan);
  const { basis } = plans.get(plan);
  if (!['gmi-only', 'combined'].includes(plan.mode)) return Object.freeze({ ok: true, recorded: false });
  return basis.registry.markDownloaded(basis.handle, basis.effectiveKey);
}

// Package service access remains internal; callers get copies through the API above.
export async function verifyDeliverySources(plan) {
  assertDeliveryPlan(plan);
  const state = plans.get(plan);
  if (state.basis.gmi) requireOk(await state.basis.registry.verifySource(state.basis.handle));
  assertDeliveryPlan(plan);
}

export async function readDeliveryAttachment(plan, assetId) {
  assertDeliveryPlan(plan);
  const state = plans.get(plan), asset = state.assets.find((item) => item.assetId === assetId);
  let bytes;
  try { bytes = new Uint8Array(await asset.file.arrayBuffer()); }
  catch { throw new DeliveryError('unreadable-attachment'); }
  if (await digestHex(bytes) !== asset.checksum) throw new DeliveryError('attachment-changed');
  assertDeliveryPlan(plan);
  return bytes;
}
