import { buildGmiFieldExport, getGmiExportBytes } from '../gmi-edit/exportGmi.mjs';
import { planGmiHyperlinkRemoval, applyGmiHyperlinkRemoval } from '../gmi-edit/hyperlinkRemoval.mjs';
import { gmiSourceIntact } from '../gmi-edit/sourceDocument.mjs';
import { getGmiDocumentDataset } from '../gmi-edit/proposed.mjs';
import { diffGmiDatasets } from '../gmi-edit/diff.mjs';
import { capturePhotoExportSnapshot, buildPhotoExportPlan, assertExportablePlan } from '../photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../photos/export/photoExportXml.mjs';
import { photoExportNames } from '../photos/export/photoExportNaming.mjs';
import { digestHex, compareExportKeys } from '../photos/export/attachmentNames.mjs';
import { freezeExportData } from '../photos/export/exportContract.mjs';
import { planDeliveryAttachments } from './deliveryAttachments.mjs';
import { validateDeliveryGml } from './deliveryGml.mjs';

export const DELIVERY_MODES = Object.freeze({ GMI_ONLY: 'gmi-only', PHOTOS_ONLY: 'photos-only', SPLIT: 'split', COMBINED: 'combined' });
const snapshots = new WeakMap(), plans = new WeakMap();
export class DeliveryError extends Error {
  constructor(code) { super(`Leveransen kan ikke lages (${code}). Lag og kontroller en ny forhåndsvisning.`); this.code = code; }
}
const requireOk = (result) => { if (!result.ok) throw new DeliveryError(result.code || 'verification-failed'); return result; };

/** Capture canonical owners, without staging edits or changing FOTO intent.
 * registry/handle are the existing M3 service and its opaque handle. Split with
 * pending corrections requires includeFieldChanges:false as an explicit choice.
 */
export function captureDeliverySnapshot({ mode = 'combined', registry, handle, photoSession, photoLayerId, includeFieldChanges } = {}) {
  if (!Object.values(DELIVERY_MODES).includes(mode)) throw new DeliveryError('invalid-mode');
  const hasGmi = mode !== 'photos-only', hasPhotos = mode !== 'gmi-only';
  const gmi = hasGmi ? requireOk(registry.resolve(handle)) : null;
  const photo = hasPhotos ? capturePhotoExportSnapshot(photoSession, photoLayerId) : null;
  const intent = hasPhotos && hasGmi ? photoSession.getPhotoDeliverySnapshot(photoLayerId) : null;
  const layer = hasPhotos ? photoSession.getLayer(photoLayerId) : null;
  const source = intent ? layer.spatialSources.find((item) => item.kind === 'gmi' && item.fingerprint === gmi.document.fingerprint
    && item.loadedBinding?.layerId === handle.layerId && item.loadedBinding?.inputId === handle.inputId && item.loadedBinding.live !== false) : null;
  const isLive = () => {
    if (gmi) {
      const current = registry.resolve(handle);
      if (!current.ok || current.session !== gmi.session || current.document !== gmi.document || !gmiSourceIntact(gmi.document)) return false;
    }
    return (!photo || photo.isLive()) && (!intent || photoSession.isPhotoDeliverySnapshotCurrent(intent));
  };
  const snapshot = Object.freeze({ kind: 'delivery-snapshot', mode, photo, intent, source,
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
  const naming = { ...photoExportNames({ date, label: configuration.label }), gmiFilename: null };
  naming.gmiFilename = `${naming.basename}.gmi`;
  try {
    if (!snapshot.isLive()) throw new DeliveryError('stale-plan');
    const { registry, handle, gmi } = basis;
    const photoOptions = { ...configuration, profile: configuration.profile ?? 'gemini-legacy2019' };
    if (snapshot.mode === 'gmi-only') {
      const exported = requireOk(await buildGmiFieldExport(registry, handle, { date, label: configuration.label }));
      gmiBytes = getGmiExportBytes(exported); gmiSummary = exported.summary;
    } else if (snapshot.mode === 'photos-only') {
      // Mode B deliberately ignores M8 intent, preserving standalone scope and names.
      photoPlan = await buildPhotoExportPlan(snapshot.photo, photoOptions, { now: () => date });
      errors.push(...photoPlan.errors); warnings.push(...photoPlan.warnings);
      assets = photoPlan.assets; attachments = photoPlan.attachments;
    } else {
      if (!snapshot.source) throw new DeliveryError('loaded-gmi-binding-required');
      if (snapshot.mode === 'split' && gmi.session.changeSets.length && !basis.explicitExclusion) throw new DeliveryError('field-exclusion-required');
      for (const code of snapshot.intent.readiness.issues) error(code);
      if (snapshot.intent.transfers.some((item) => item.sourceId !== snapshot.source.id || item.sourceFingerprint !== snapshot.source.fingerprint)) error('foreign-transfer-source');
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
            authorization: { selectionKeys: removal.selections.map((item) => item.selectionKey) } });
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
  const plan = freezeExportData({ kind: 'delivery-plan', mode: snapshot.mode, status: errors.length ? 'blocked' : 'ready', naming,
    filename: snapshot.mode === 'gmi-only' ? naming.gmiFilename : naming.zipFilename,
    mimeType: snapshot.mode === 'gmi-only' ? 'application/octet-stream' : 'application/zip',
    errors, warnings, attachments, photoPlan, gmiSummary: errors.length ? null : gmiSummary, gmiFingerprint: errors.length ? null : gmiFingerprint,
    counts: { features: photoPlan?.occurrences.length ?? 0, attachments: attachments.length,
      transferredOccurrences: snapshot.intent?.transfers.length ?? 0,
      excludedAssets: snapshot.photo ? snapshot.photo.assets.filter((asset) => !attachments.some((item) => item.assetId === asset.assetId)).length : 0 },
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
