'use client';

import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoAssetNavigation, photoSameLocationAssets } from '@/lib/photos/photoStacks.mjs';
import PhotoImageViewer from './PhotoImageViewer';

// Full-screen view of the selected workspace photo. Two separate navigations:
// - previous/next: every unique asset in the layer, in the list's sort order (not limited by the filter);
// - same location: the assets whose occurrences share the selected occurrence's exact coordinates.
// Selecting a photo here selects it in the workspace, so the list, inspector and map follow.
export default function PhotoWorkspaceViewer({ photo, photos, assetSequence, onSelect, onClose }) {
  const assetId = photo.assetId || photo.id;
  const position = photoAssetNavigation(assetSequence, assetId);
  const sameLocation = photoSameLocationAssets(photos, photo);
  // The inspector remounts per asset, so the original opener may be gone: return focus to the current one.
  const close = () => {
    onClose();
    requestAnimationFrame(() => document.querySelector('.photo-workspace-inspector .photo-preview-open')?.focus());
  };
  return <PhotoImageViewer photoKey={assetId} file={photoSession.getAssetFile(assetId)} filename={photo.originalFilename} dimensions={photo.dimensions}
    onClose={close}
    navigation={position.index >= 0 ? { ...position, onPrevious: () => position.previous && onSelect(position.previous.id),
      onNext: () => position.next && onSelect(position.next.id) } : null}
    sameLocation={{ items: sameLocation.map((item) => ({ id: item.id, filename: item.originalFilename, thumbnailUrl: item.preview?.thumbnailUrl || null,
      current: item.id === photo.id })), onSelect }} />;
}
