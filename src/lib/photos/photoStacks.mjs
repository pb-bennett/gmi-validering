import { isPhotoPosition } from './photoSpatial.mjs';

// Photos that share exactly the same accepted coordinates form one stack. Never a distance threshold:
// repeated GMI references produce identical positions, and nearby-but-distinct photos stay separate.
export const photoStackKey = (position) => isPhotoPosition(position) ? `${position.latitude}|${position.longitude}` : null;

export function groupPhotoStacks(photos) {
  const stacks = new Map();
  for (const photo of photos) {
    const key = photoStackKey(photo?.spatial?.current?.position);
    if (!key) continue;
    if (!stacks.has(key)) stacks.set(key, []);
    stacks.get(key).push(photo);
  }
  return stacks;
}

// Members of the selected photo's stack in the given order (the photo itself included).
export function photoStackMembers(photos, photo) {
  const key = photoStackKey(photo?.spatial?.current?.position);
  return key ? photos.filter((item) => photoStackKey(item.spatial?.current?.position) === key) : [];
}

// One occurrence per asset at the photo's exact position; the photo's own occurrence represents its asset.
export function photoSameLocationAssets(photos, photo) {
  const members = photoStackMembers(photos, photo);
  const byAsset = new Map();
  for (const member of members) {
    const assetId = member.assetId || member.id;
    if (member.id === photo.id || !byAsset.has(assetId)) byAsset.set(assetId, member);
  }
  return [...byAsset.values()];
}

// Unique assets in the given (sorted) occurrence order; the first occurrence represents the asset.
export function photoAssetSequence(photos) {
  const seen = new Set(), sequence = [];
  for (const photo of photos) {
    const assetId = photo.assetId || photo.id;
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    sequence.push(photo);
  }
  return sequence;
}

// Layer-wide previous/next over unique assets; no wrapping at the ends.
export function photoAssetNavigation(sequence, assetId) {
  const index = sequence.findIndex((photo) => (photo.assetId || photo.id) === assetId);
  return { index, total: sequence.length,
    previous: index > 0 ? sequence[index - 1] : null,
    next: index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : null };
}
