import { immutable } from './photoSpatial.mjs';

export function photoReferenceKey(value) {
  const original = String(value || '').trim().normalize('NFC').replaceAll('\\', '/');
  const remote = /^[a-z][a-z\d+.-]*:\/\//i.test(original) && !/^file:\/\//i.test(original);
  const path = original.replace(/\/+/g, '/');
  const segments = path.split('/').filter((part) => part && part !== '.');
  return { path: segments.join('/'), basename: segments.at(-1) || '', unsafe: remote || segments.includes('..') };
}

const fold = (value) => value.toLowerCase();
const suffix = (a, b) => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);

// Build the complete association graph before accepting any edge. No first wins.
export function matchPhotoReferences(entries, photos) {
  const assets = photos.map((photo) => ({
    id: photo.id, name: photoReferenceKey(photo.originalFilename).basename,
    relative: photo.sourceRelativePath ? photoReferenceKey(photo.sourceRelativePath).path : null,
  }));
  const refs = entries.map((entry) => ({ entry, key: photoReferenceKey(entry.reference ?? entry.raw?.fotolink) }));
  const graph = refs.map(({ entry, key }) => {
    let eligible = [], method = null;
    if (key.unsafe || !key.basename) return { entryId: entry.id, status: 'unmatched', photoIds: [], reason: key.unsafe ? 'unsafe-reference' : 'missing-reference' };
    const find = (reference) => {
      // Even exact spelling cannot hide a case/Unicode collision at the same path.
      let found = assets.filter((asset) => asset.relative && fold(asset.relative) === fold(reference.path));
      let via = found.length === 1 && found[0].relative === reference.path ? 'exact-relative-path' : 'case-insensitive-relative-path';
      if (!found.length) {
        found = assets.filter((asset) => asset.relative && suffix(fold(asset.relative), fold(reference.path)));
        via = found.length === 1 && suffix(found[0].relative, reference.path) ? 'relative-path-suffix' : 'case-insensitive-path-suffix';
      }
      if (!found.length) {
        // The whole folded bucket is checked before accepting exact spelling.
        const bucket = assets.filter((asset) => fold(asset.name) === fold(reference.basename));
        found = bucket;
        via = bucket.length === 1 && bucket[0].name === reference.basename ? 'exact-basename' : 'case-insensitive-basename';
      }
      return [found, via];
    };
    [eligible, method] = find(key);
    // Only an explicit file URI receives URI decoding. Literal percent/#/? stay literal.
    if (!eligible.length && /^file:\/\//i.test(String(entry.reference ?? entry.raw?.fotolink))) {
      try {
        if (/%(?:2f|5c)/i.test(key.path)) throw new Error('Encoded separator');
        const decoded = photoReferenceKey(decodeURIComponent(key.path));
        if (decoded.unsafe) throw new Error('Unsafe decoded reference');
        [eligible, method] = find(decoded);
        method = `uri-decoded-${method}`;
      } catch { return { entryId: entry.id, status: 'unmatched', photoIds: [], reason: 'invalid-uri-reference' }; }
    }
    return { entryId: entry.id, status: eligible.length === 1 ? 'matched' : eligible.length ? 'ambiguous' : 'unmatched', photoIds: eligible.map((asset) => asset.id), method, reason: eligible.length > 1 ? 'duplicate-photo-reference' : eligible.length ? null : 'no-photo' };
  });
  for (const edge of graph) {
    const reference = refs.find(({ entry }) => entry.id === edge.entryId).key;
    const duplicate = refs.filter(({ key }) => fold(key.path) === fold(reference.path)).length > 1;
    const contested = edge.photoIds.some((id) => graph.filter((other) => other.photoIds.includes(id)).length > 1);
    if (duplicate || contested) {
      edge.status = 'ambiguous'; edge.reason = 'duplicate-gml-reference';
    }
    if (edge.status === 'matched') edge.photoId = edge.photoIds[0];
  }
  const matchedIds = new Set(graph.filter((edge) => edge.status === 'matched').map((edge) => edge.photoId));
  return immutable({
    matches: graph,
    unmatchedPhotoIds: photos.filter((photo) => !matchedIds.has(photo.id)).map((photo) => photo.id),
    summary: {
      matchedCount: graph.filter((edge) => edge.status === 'matched').length,
      unmatchedCount: graph.filter((edge) => edge.status === 'unmatched').length,
      ambiguousCount: graph.filter((edge) => edge.status === 'ambiguous').length,
      viablePlacementCount: graph.filter((edge) => edge.status === 'matched' && entries.find((entry) => entry.id === edge.entryId).status === 'viable').length,
      invalidCount: entries.filter((entry) => entry.status !== 'viable').length,
    },
  });
}
