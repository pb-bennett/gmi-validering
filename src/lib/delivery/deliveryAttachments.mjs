import { compareExportKeys, foldAttachmentPath, isSafeAttachmentFilename, planAttachmentNames } from '../photos/export/attachmentNames.mjs';
import { classifyPhotoFile } from '../photos/imagePreview.mjs';
import { reviewGmiPhotoSource } from '../photos/gmiPhotoSource.mjs';

// Retained references are immutable constraints, never candidates for renaming.
export async function planDeliveryAttachments(source, removal, assets, selectedAssetIds) {
  const errors = [], warnings = [], entries = new Map(), byAsset = new Map();
  const removed = new Set(removal.cells.flatMap((cell) => cell.removedReferences.map((ref) => ref.referenceId)));
  const ledger = reviewGmiPhotoSource(source, assets.map((asset) => ({ ...asset, id: asset.assetId })));
  const addError = (code, referenceId, assetId) => errors.push({ code, referenceId, assetId });
  const safePath = (path) => !path.startsWith('/') && !path.includes(':')
    && path.split('/').every((part) => part !== '.' && part !== '..' && isSafeAttachmentFilename(part));
  for (const ref of source.references) {
    if (removed.has(ref.id) || !classifyPhotoFile({ name: ref.filename || '' }).candidate) continue;
    const resolution = ledger.reverseIndexes.byReferenceId[ref.id];
    const previous = source.associationLedger?.reverseIndexes.byReferenceId[ref.id];
    if (resolution?.status !== 'confident' || previous?.status !== 'confident' || resolution.photoId !== previous.photoId) {
      addError('retained-photo-unresolved', ref.id); continue;
    }
    const path = ref.referenceRaw.replaceAll('\\', '/'), assetId = resolution.photoId;
    if (!safePath(path)) { addError('unsafe-retained-path', ref.id, assetId); continue; }
    const key = foldAttachmentPath(path), existing = entries.get(key);
    // Case/NFC variants cannot both resolve exactly on all target file systems.
    if (existing && (existing.assetId !== assetId || existing.path !== path)) {
      addError('reserved-path-collision', ref.id, assetId); continue;
    }
    const attachment = { assetId, path, filename: path.split('/').at(-1), renamed: false, retained: true };
    entries.set(key, attachment);
    if (!byAsset.has(assetId)) byAsset.set(assetId, []);
    if (!byAsset.get(assetId).some((item) => item.path === path)) byAsset.get(assetId).push(attachment);
    if (!/^Attachments\//.test(path)) warnings.push({ code: 'retained-path-outside-attachments', referenceId: ref.id });
  }
  const gml = [], gmlOnly = [];
  for (const assetId of selectedAssetIds) {
    const retained = byAsset.get(assetId)?.sort((a, b) => compareExportKeys(a.path, b.path));
    if (retained) {
      const shared = retained.find((item) => /^Attachments\/[^/]+$/.test(item.path));
      if (!shared) addError('shared-path-not-gml-compatible', undefined, assetId);
      else gml.push(shared);
    } else {
      const asset = assets.find((item) => item.assetId === assetId);
      if (!asset) addError('selected-asset-missing', undefined, assetId);
      else gmlOnly.push(asset);
    }
  }
  // Reserve directory names too: a GML file must not occupy a retained folder.
  const reserved = [...entries.values()].filter((item) => /^Attachments\//i.test(item.path)).map((item) => item.path.split('/')[1]);
  for (const attachment of await planAttachmentNames(gmlOnly, { reserved })) {
    entries.set(foldAttachmentPath(attachment.path), attachment);
    gml.push(attachment);
  }
  const attachments = [...entries.values()].sort((a, b) => compareExportKeys(a.path, b.path));
  const keys = attachments.map((item) => foldAttachmentPath(item.path));
  if (keys.some((key, i) => keys.some((other, j) => i !== j && other.startsWith(`${key}/`)))) addError('attachment-path-conflict');
  return { attachments, gmlAttachments: gml, errors, warnings };
}
