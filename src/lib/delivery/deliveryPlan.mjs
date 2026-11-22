import { buildGmiFieldExport, getGmiExportBytes } from '../gmi-edit/exportGmi.mjs';
import { planGmiHyperlinkRemoval, applyGmiHyperlinkRemoval } from '../gmi-edit/hyperlinkRemoval.mjs';
import { computeGmiSourceFingerprint, createGmiSourceDocument, gmiSourceIntact } from '../gmi-edit/sourceDocument.mjs';
import { activeGmiHyperlinkTransferSet, isGmiHyperlinkTransferSet } from '../gmi-edit/session.mjs';
import { applyGmiDeliveryComposition, planGmiDeliveryComposition } from '../gmi-edit/deliveryComposition.mjs';
import { photoHyperlinkTransferViews } from '../photos/photoHyperlinkTransferScope.mjs';
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
import { deriveRevisionPhotoSource, verifyRevisionAssociations } from './deliveryRevision.mjs';

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
function deliveryPhotoAccounting(snapshot, removal, attachments, photoPlan, errors, transfer = null) {
  const coordinated = ['combined', 'split'].includes(snapshot.mode), ready = errors.length === 0;
  const intent = snapshot.intent, source = snapshot.source;
  const removed = ready && coordinated ? removal?.cells.flatMap((cell) => cell.removedReferences) || [] : [];
  const removedIds = new Set(removed.map((ref) => ref.referenceId));
  const used = new Set(attachments.map((entry) => entry.assetId));
  // Batch 1B.3A: with a hyperlink transfer, the exported GMI's own re-derived ledger says where links remain.
  const revised = ready ? transfer?.revisedSource ?? null : null;
  const edges = Object.values((revised || source)?.associationLedger?.associationsById || {});
  const retainedEdges = revised ? edges : edges.filter((edge) => edge.referenceIds.some((id) => !removedIds.has(id)));
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
  const hyperlinkTransfers = (transfer?.transferSet.transfers || []).map((item) => ({ transferKey: item.transferKey, assetId: item.assetId,
    filename: filename(item.assetId) || transfer.assets?.find((asset) => asset.assetId === item.assetId)?.originalFilename || '',
    fromObjectKey: item.fromObjectKey, toObjectKey: item.toObjectKey,
    fromLabel: deliveryObjectLabel(transfer.source, item.fromObjectKey), toLabel: deliveryObjectLabel(transfer.source, item.toObjectKey),
    referenceCount: item.referenceIds.length, inGml: Boolean(photoPlan?.occurrences.some((row) => row.hyperlinkTransferKey === item.transferKey)),
    withheld: Boolean(transfer.withheld?.has(item.transferKey)) }));
  const excludedIds = new Set(exclusions.map((row) => row.assetId));
  const blocked = new Set(errors.map((item) => deliveryDiagnosticContext(snapshot, item)).map((item) =>
    item.photoId ?? item.selectionKey ?? item.objectKey ?? item.referenceId).filter(Boolean));
  const ignored = (snapshot.deliveryChoices?.exclusions.length || 0)
    + (snapshot.deliveryChoices?.unresolved.filter((item) => item.decision === 'exclude').length || 0);
  return {
    details: { applied: coordinated && ready, transfers, exclusions, ignoredExclusions: coordinated ? 0 : ignored,
      hyperlinkTransfers, hyperlinkTransfersApplied: Boolean(transfer) && ready },
    counts: {
      includedAssets: used.size,
      gmiPlacements: snapshot.mode === 'photos-only' ? 0 : source && ready ? retainedEdges.length : null,
      gmlPlacements: photoPlan?.occurrences.length ?? 0,
      retainedReferences: snapshot.mode === 'photos-only' ? 0 : revised ? revised.references.filter((ref) => ref.targetValid).length
        : source && ready ? source.references.filter((ref) => ref.targetValid && !removedIds.has(ref.id)).length : null,
      // Batch 1B.3A: transfers count photographs (unique assets), FOTO occurrences and hyperlink references apart.
      hyperlinkTransfers: hyperlinkTransfers.length,
      hyperlinkTransferAssets: new Set(hyperlinkTransfers.map((row) => row.assetId)).size,
      movedReferences: hyperlinkTransfers.reduce((sum, row) => sum + row.referenceCount, 0),
      // Kun GML med bilder: moved photographs placed in GML, and those left out because their pre-transfer record was unplaced.
      hyperlinkTransferGmlAssets: new Set(hyperlinkTransfers.filter((row) => row.inGml).map((row) => row.assetId)).size,
      hyperlinkTransferWithheldAssets: new Set(hyperlinkTransfers.filter((row) => row.withheld).map((row) => row.assetId)).size,
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

/** The active hyperlink transfers a delivery depends on: the delivery GMI's own
 * session, and any session bound to the photo layer's GMI source (the Batch
 * 1B.2A discovery). Batch 1B.3A composes them instead of refusing every mode. */
function deliveryHyperlinkTransfers({ registry, handle, photoSession, photoLayerId }) {
  if (!registry || typeof registry.resolve !== 'function') return [];
  const handles = handle ? [handle] : [];
  const layer = photoLayerId ? photoSession?.getLayer?.(photoLayerId) : null;
  for (const source of layer?.spatialSources || []) {
    if (source.kind !== 'gmi' || !source.loadedBinding?.layerId) continue;
    const bound = registry.getHandle?.(source.loadedBinding.layerId);
    if (bound) handles.push(bound);
  }
  const found = new Map();
  for (const item of handles) {
    const resolved = registry.resolve(item);
    const transferSet = resolved.ok ? activeGmiHyperlinkTransferSet(resolved.session) : null;
    if (transferSet && !found.has(transferSet)) found.set(transferSet, Object.freeze({ handle: item, session: resolved.session, transferSet }));
  }
  return [...found.values()];
}
// Any transfer committed, undone, redone or replaced after capture changes this and invalidates every mode.
const transferSignature = (entries) => JSON.stringify(entries.map((entry) => [entry.handle.layerId, entry.transferSet.id, entry.session.stateKey]));

/** The verified FOTO view of a transfer, or a fail-closed DeliveryError: no export composes a transfer whose FOTO
 * record no longer matches FOTO (conflict), does not verify (invalid) or cannot be read (unavailable). */
function verifiedTransferView(entry, { registry, photoSession }) {
  const layerId = entry.transferSet.photo?.layerId;
  if (!photoSession || typeof photoSession.getLayer !== 'function' || !layerId) throw new DeliveryError('hyperlink-transfer-photo-unverified');
  const views = photoHyperlinkTransferViews({ registry, photoSession, photoLayerId: layerId });
  // Views pair one-to-one with scope entries. Match the entry by identity: transfer set ids are per-session counters, so
  // two GMI sessions bound to one photo layer can both hold a set with the same id.
  const index = views ? views.scope.entries.findIndex((item) => item.transferSet === entry.transferSet) : -1;
  const view = index >= 0 ? views.views[index] : null;
  if (view?.status !== 'current' || !view.planning || view.planKey !== entry.transferSet.planKey) throw new DeliveryError('hyperlink-transfer-photo-unverified');
  return view;
}

/** Photos as the proposed transfer view places them: a moved occurrence belongs to its recipient, at the recipient's
 * GMI position, with the transfer's provenance. Accepted FOTO records are not changed; other rows are the same objects.
 * `withhold` (an occurrence id set) keeps those rows exactly as accepted: Kun GML med bilder places a moved occurrence
 * that was unplaced before the transfer only after the user's explicit confirmation for that delivery. */
function proposedPhotoSnapshot(photo, view, { withhold = new Set() } = {}) {
  const moved = new Map((view?.occurrences || []).filter((entry) => !withhold.has(entry.photoId)).map((entry) => [entry.photoId, entry]));
  if (!photo || !moved.size || !photo.occurrences.some((row) => moved.has(row.occurrenceId))) return photo;
  const objects = view.proposedSource?.objectsByKey || {};
  const occurrences = photo.occurrences.map((row) => {
    const entry = moved.get(row.occurrenceId);
    if (!entry) return row;
    const basis = { kind: 'hyperlink-transfer', transferKey: entry.transferKey };
    const current = { position: entry.proposedPosition, basis, acceptance: 'user-approved-hyperlink-transfer',
      acceptedAt: entry.provenance?.approvedAt ?? null, origin: 'gmi', provenance: entry.provenance };
    return { ...row, current, hyperlinkTransferKey: entry.transferKey,
      sourceContext: row.sourceContext ? { ...row.sourceContext, key: entry.toOccurrenceKey, objectKey: entry.toObjectKey,
        object: objects[entry.toObjectKey] ?? null, referenceIds: entry.outputReferenceIds } : row.sourceContext,
      positionProvenance: { basis, acceptance: current.acceptance, acceptedAt: current.acceptedAt, source: null, hyperlinkTransfer: entry.provenance },
      associations: row.associations.map((link) => (link.object?.objectKey === entry.fromObjectKey
        ? { ...link, object: objects[entry.toObjectKey] ?? link.object } : link)) };
  });
  return freezeExportData({ ...photo, occurrences, isLive: photo.isLive });
}

/** Moved occurrences of `view` whose accepted FOTO record (the frozen export snapshot) has no position. */
const unplacedTransferRows = (photo, view) => (view?.occurrences || []).filter((entry) =>
  photo?.occurrences.some((row) => row.occurrenceId === entry.photoId && !row.current));

/** Batch 1B.3A refinement: the Kun GML med bilder inclusion decision for moved photographs that were unplaced before the
 * transfer. Read-only; null when there is nothing to decide. `key` changes with any transfer commit, undo, redo or
 * replacement, so a confirmation never carries over to another transfer state. Every other mode ignores it. */
export function deliveryTransferredUnplaced({ registry, photoSession, photoLayerId } = {}) {
  if (!photoLayerId || typeof photoSession?.getLayer !== 'function') return null;
  const scope = { registry, handle: undefined, photoSession, photoLayerId };
  const found = deliveryHyperlinkTransfers(scope);
  if (found.length !== 1) return null;
  let view;
  try { view = verifiedTransferView(found[0], scope); } catch { return null; }
  if (view.planning.photoLayerId !== photoLayerId) return null;
  const photo = capturePhotoExportSnapshot(photoSession, photoLayerId);
  const rows = unplacedTransferRows(photo, view);
  if (!rows.length) return null;
  return Object.freeze({ key: transferSignature(found), occurrences: rows.length, assets: new Set(rows.map((entry) => entry.assetId)).size });
}

/** Capture canonical owners, without staging edits or changing FOTO intent.
 * registry/handle are the existing M3 service and its opaque handle. Split with
 * pending corrections requires includeFieldChanges:false as an explicit choice.
 * Kun GML med bilder places a moved photograph that was unplaced before the transfer
 * only with includeTransferredUnplaced:true; otherwise it stays unplaced and is reported.
 */
export function captureDeliverySnapshot({ mode = 'combined', registry, handle, photoSession, photoLayerId, includeFieldChanges, includeTransferredUnplaced } = {}) {
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
    // A transfer committed, undone or redone after capture invalidates every mode, including GML-only packages.
    if (transferSignature(deliveryHyperlinkTransfers({ registry, handle, photoSession, photoLayerId })) !== transfers) return false;
    return (!photo || photo.isLive()) && (!deliveryChoices || photoSession.isPhotoDeliverySnapshotCurrent(deliveryChoices));
  };
  const transfers = transferSignature(deliveryHyperlinkTransfers({ registry, handle, photoSession, photoLayerId }));
  const snapshot = Object.freeze({ kind: 'delivery-snapshot', mode, photo, intent, source, deliveryChoices,
    sourceFingerprint: gmi?.document.fingerprint ?? null, includeFieldChanges: mode !== 'split', isLive });
  snapshots.set(snapshot, { registry, handle, gmi, effectiveKey: gmi ? registry.effectiveKey(handle).effectiveKey : null,
    explicitExclusion: includeFieldChanges === false, transferredUnplacedConfirmed: mode === 'photos-only' && includeTransferredUnplaced === true,
    transferScope: { registry, handle, photoSession, photoLayerId } });
  return snapshot;
}

/** Batch 1B.3A: the revised GMI's own FOTO evidence, re-derived from the exported bytes, checked against the
 * intended association ledger (original - delivery removals - moved groups + moved groups on their recipients). */
async function checkRevisedGmi(bytes, document, { originalSource, transfers, removals, assets }) {
  const fingerprint = await computeGmiSourceFingerprint(bytes);
  const revisedSource = deriveRevisionPhotoSource(document ?? createGmiSourceDocument(bytes), { sourceId: `${originalSource.id}:revision`, fingerprint, assets });
  return { revisedSource, checked: verifyRevisionAssociations({ originalSource, revisedSource, transfers, removals }) };
}
const transferSummary = (entry, checked, extra = {}) => Object.freeze({ transferSetId: entry.transferSet.id, transfers: entry.transferSet.transfers.length,
  movedReferences: entry.transferSet.transfers.reduce((sum, item) => sum + item.referenceIds.length, 0), ...extra,
  occurrenceMapping: checked.occurrenceMapping });

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
  let transferState = null;
  try {
    const { registry, handle, gmi } = basis;
    // Batch 1B.3A: an active hyperlink transfer is composed into the export, never ignored. Its FOTO record must
    // verify against FOTO first; every refusal below is fail-closed with a precise code.
    // A GMI delivery carries its own session's transfer. A transfer in another GMI bound to the same photo layer does not
    // change a standalone GMI, but a coordinated package cannot honour it, so that combination is refused.
    const found = deliveryHyperlinkTransfers(basis.transferScope);
    const own = gmi ? found.filter((entry) => entry.session === gmi.session) : found;
    if (gmi && snapshot.mode !== 'gmi-only' && own.length !== found.length) throw new DeliveryError('hyperlink-transfer-other-gmi');
    // `found` holds one entry per GMI session (a session's active transfer set is cumulative: every photograph decision
    // in it is composed together, however many). `own` therefore exceeds one only for Kun GML med bilder, when two or
    // more GMI sources bound to the photo layer each hold an active transfer; that combination stays refused.
    if (own.length > 1) throw new DeliveryError('hyperlink-transfer-multiple');
    const transferEntry = own[0] ?? null;
    const transferView = transferEntry ? verifiedTransferView(transferEntry, basis.transferScope) : null;
    if (transferEntry) transferState = { transferSet: transferEntry.transferSet, source: transferView.planning.photoSource, assets: transferView.planning.assets, revisedSource: null };
    if (!snapshot.isLive()) throw new DeliveryError('stale-plan');
    const photoOptions = { ...configuration, profile: configuration.profile ?? 'gemini-legacy2019' };
    // Photos as the proposed transfer places them; only the transfer's own FOTO layer is affected.
    const ownLayer = Boolean(transferView) && transferView.planning.photoLayerId === basis.transferScope.photoLayerId;
    // Kun GML med bilder: a moved occurrence that was unplaced before the transfer gets the recipient's GMI position only
    // with the explicit confirmation captured for this delivery. Without it, the accepted (unplaced) record is exported as
    // before, so the standalone rule leaves it out, and a warning names it. Other modes keep moved photographs in GMI.
    const withheld = ownLayer && snapshot.mode === 'photos-only' && !basis.transferredUnplacedConfirmed ? unplacedTransferRows(snapshot.photo, transferView) : [];
    const photoBasis = ownLayer ? proposedPhotoSnapshot(snapshot.photo, transferView, { withhold: new Set(withheld.map((entry) => entry.photoId)) }) : snapshot.photo;
    if (snapshot.mode === 'photos-only' && !ownLayer) transferState = null;
    if (transferState) transferState.withheld = new Set(withheld.map((entry) => entry.transferKey));
    for (const entry of withheld) warnings.push({ code: 'hyperlink-transfer-unplaced-withheld', occurrenceId: entry.photoId, assetId: entry.assetId, transferKey: entry.transferKey });
    if (snapshot.mode === 'gmi-only') {
      if (transferEntry) {
        // The committed transfer must still plan identically under the current FOTO facts.
        const check = planGmiDeliveryComposition(gmi.session, { photoSource: transferView.planning.photoSource, photoState: transferView.planning.photoState, removals: [] });
        if (!check.ok) errors.push(...check.blockers);
        else warnings.push(...check.warnings);
      }
      if (!errors.length) {
        const attestation = transferEntry ? { hyperlinkTransfer: { transferSetId: transferEntry.transferSet.id, planKey: transferEntry.transferSet.planKey } } : {};
        const exported = requireOk(await buildGmiFieldExport(registry, handle, { date, ...filename, ...attestation }));
        gmiBytes = getGmiExportBytes(exported); gmiSummary = exported.summary;
        if (transferEntry) {
          const { revisedSource, checked } = await checkRevisedGmi(gmiBytes, null, { originalSource: transferView.planning.photoSource,
            transfers: transferEntry.transferSet.transfers, removals: [], assets: transferView.planning.assets });
          if (!checked.ok) error('revised-gmi-association-mismatch', { detail: checked.failures.map((item) => item.code).join(',') });
          transferState.revisedSource = revisedSource;
          gmiSummary = Object.freeze({ ...gmiSummary, hyperlinkTransfer: transferSummary(transferEntry, checked, gmiSummary.hyperlinkTransfer || {}) });
        }
      }
    } else if (snapshot.mode === 'photos-only') {
      // Mode B deliberately ignores M8 intent, preserving standalone scope and names. Batch 1B.3A: a moved
      // occurrence is placed as the proposed transfer view places it (recipient, recipient's GMI position);
      // a previously unplaced one only after the explicit confirmation (see `withheld` above).
      photoPlan = await buildPhotoExportPlan(photoBasis, photoOptions, { now: () => date });
      errors.push(...photoPlan.errors); warnings.push(...photoPlan.warnings);
      assets = photoPlan.assets; attachments = photoPlan.attachments;
    } else {
      if (!snapshot.source) throw new DeliveryError('loaded-gmi-binding-required');
      // A transfer entry is not a field correction: split needs the explicit exclusion only for field corrections.
      if (snapshot.mode === 'split' && gmi.session.changeSets.some((entry) => !isGmiHyperlinkTransferSet(entry)) && !basis.explicitExclusion) throw new DeliveryError('field-exclusion-required');
      for (const code of snapshot.intent.readiness.issues) {
        if (code === 'unresolved-decisions') for (const item of snapshot.intent.unresolved) error(code, item);
        else error(code);
      }
      if (snapshot.intent.transfers.some((item) => item.sourceId !== snapshot.source.id || item.sourceFingerprint !== snapshot.source.fingerprint)) error('foreign-transfer-source');
      for (const item of snapshot.intent.exclusions) if (item.sourceId !== snapshot.source.id || item.sourceFingerprint !== snapshot.source.fingerprint) error('foreign-exclusion-source', item);
      const session = snapshot.includeFieldChanges ? gmi.session : undefined;
      let composition = null;
      if (transferEntry) {
        // One plan against the original: field edits (unless split), the transfer and the M7 delivery removals.
        const planning = transferView.planning;
        if (!ownLayer || planning.photoSource.id !== snapshot.source.id || planning.photoSource.fingerprint !== snapshot.source.fingerprint) {
          throw new DeliveryError('hyperlink-transfer-other-photo-layer');
        }
        composition = planGmiDeliveryComposition(gmi.session, { photoSource: planning.photoSource, photoState: planning.photoState,
          removals: snapshot.intent.removalSelections, includeFieldChanges: snapshot.includeFieldChanges,
          acceptedAssetIds: snapshot.photo.assets.map((asset) => asset.assetId) });
        if (!composition.ok) errors.push(...composition.blockers);
        else warnings.push(...composition.warnings);
        // Delivery removals only: moved references stay in the GMI (on their recipient, same path).
        removal = composition.ok ? { cells: composition.cells.map((cell) => ({ objectKey: cell.objectKey, removedReferences: cell.deliveryRemovedReferences || [] })) } : null;
      } else {
        removal = planGmiHyperlinkRemoval(gmi.document, { photoSource: snapshot.source, selections: snapshot.intent.removalSelections,
          session, acceptedAssetIds: snapshot.photo.assets.map((asset) => asset.assetId) });
        errors.push(...removal.blockers); warnings.push(...removal.warnings);
      }
      if (!errors.length) {
        const selected = [...snapshot.intent.transfers, ...snapshot.intent.included];
        const selectedIds = selected.map((item) => item.photoId);
        const selectedAssets = [...new Set(selected.map((item) => item.assetId))].sort(compareExportKeys);
        const shared = await planDeliveryAttachments(snapshot.source, removal, snapshot.photo.assets, selectedAssets);
        errors.push(...shared.errors); warnings.push(...shared.warnings); attachments = shared.attachments;
        if (selected.length) {
          photoPlan = await buildPhotoExportPlan(photoBasis, photoOptions, { now: () => date,
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
          const authorization = { selectionKeys: snapshot.intent.removalSelections.map((item) => item.key) };
          const result = composition
            ? applyGmiDeliveryComposition(composition, { session: gmi.session,
              authorization: { transferKeys: composition.transferKeys, removalKeys: authorization.selectionKeys } })
            : applyGmiHyperlinkRemoval(removal, { session, authorization });
          if (!result.ok) errors.push(...result.rejections);
          else {
            let hyperlinkTransfer = null;
            if (composition) {
              // The revised GMI re-read as FOTO would read it: intended ledger, and every retained reference resolves
              // to exactly the packaged attachment it names.
              const { revisedSource, checked } = await checkRevisedGmi(result.bytes, result.document, { originalSource: snapshot.source,
                transfers: transferEntry.transferSet.transfers, removals: snapshot.intent.removalSelections, assets: snapshot.photo.assets });
              if (!checked.ok) error('revised-gmi-association-mismatch', { detail: checked.failures.map((item) => item.code).join(',') });
              const again = await planDeliveryAttachments(revisedSource, { cells: [] }, snapshot.photo.assets, selectedAssets);
              const shape = (list) => JSON.stringify(list.map((item) => [item.path, item.assetId, Boolean(item.retained)]));
              if (again.errors.length || shape(again.attachments) !== shape(attachments)) error('revised-gmi-attachment-mismatch');
              transferState.revisedSource = revisedSource;
              hyperlinkTransfer = transferSummary(transferEntry, checked, { cells: composition.counts.cells,
                deliveryRemovedReferences: composition.counts.deliveryRemovedReferences, verification: result.verification.composition });
            }
            gmiBytes = result.bytes;
            gmiSummary = { fieldEditCount: result.fieldEditCount, removalCounts: result.counts, verification: result.verification,
              diff: diffGmiDatasets(getGmiDocumentDataset(gmi.document), getGmiDocumentDataset(result.document)),
              changeSets: snapshot.includeFieldChanges ? gmi.session.changeSets.map((item) => ({ id: item.id, label: item.label }))
                : gmi.session.changeSets.filter((item) => isGmiHyperlinkTransferSet(item)).map((item) => ({ id: item.id, label: item.label })),
              hyperlinkTransfer };
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
  const accounting = deliveryPhotoAccounting(snapshot, removal, attachments, photoPlan, errors, transferState);
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
