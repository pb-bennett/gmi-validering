import { GMIParser } from '../parsing/gmiParser.js';
import { decodeGmiBytes } from '../parsing/gmiDecoding.js';
import { GMI_SOURCE_LEXEMES } from '../parsing/gmiLexicalEvidence.js';
import { extractHyperlinkOccurrences } from '../hyperlinkFilenames.mjs';
import { createPhotoReferenceResolver, photoReferenceKey } from './photoReferenceMatching.mjs';
import { immutable } from './photoSpatial.mjs';
import { classifyPhotoFile } from './imagePreview.mjs';

export const MAX_PHOTO_GMI_BYTES = 10 * 1024 * 1024;

// Exact bytes identify a revision. The insecure-context fallback is exact bytes,
// not a short/collision-prone hash or a filename/GUID approximation.
export async function parseGmiPhotoSource(file) {
  if (file.size > MAX_PHOTO_GMI_BYTES) throw Object.assign(new Error('gmi-too-large'), { code: 'gmi-too-large' });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let fingerprint;
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    fingerprint = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  } else fingerprint = `exact-bytes:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  let parser;
  try { parser = new GMIParser(decodeGmiBytes(bytes)); }
  catch { throw Object.assign(new Error('invalid-gmi'), { code: 'invalid-gmi' }); }
  if (parser.errors.length) throw Object.assign(new Error('invalid-gmi'), { code: 'invalid-gmi' });
  const collections = [['point', parser.points], ['line', parser.linesParsed]];
  const guidCounts = new Map();
  for (const [, objects] of collections) for (const object of objects) {
    if (object.guid) {
      const key = object.guid.toLowerCase();
      guidCounts.set(key, (guidCounts.get(key) || 0) + 1);
    }
  }
  const objectsByKey = {}, references = [], issues = parser.warnings.map((warning) => ({ code: 'parser-warning', warning }));
  for (const [geometryScope, objects] of collections) objects.forEach((object, sourceIndex) => {
    const attributes = object.attributes || {}, rawFields = attributes[GMI_SOURCE_LEXEMES] || {};
    const guidKey = object.guid?.toLowerCase();
    const objectKey = guidKey && guidCounts.get(guidKey) === 1 ? `guid:${guidKey}` : `${geometryScope}:${sourceIndex}`;
    const identityIssues = !guidKey ? ['missing-guid'] : guidCounts.get(guidKey) > 1 ? ['duplicate-guid'] : [];
    const hyperlinkRaw = rawFields.S_HYPERLINK ?? attributes.S_HYPERLINK ?? '';
    // Copy lexical evidence explicitly before immutable() drops symbol keys.
    objectsByKey[objectKey] = { objectKey, guid: object.guid || null, geometryScope, parserId: object.id,
      sourceIndex, attributes, rawFields, hyperlinkRaw, rawGeometry: object.coordinates, extent: object.extent,
      tema: attributes.S_FCODE ?? attributes.TEMA ?? null,
      temaEvidence: { S_FCODE: attributes.S_FCODE ?? null, TEMA: attributes.TEMA ?? null,
        rawS_FCODE: rawFields.S_FCODE ?? null, rawTEMA: rawFields.TEMA ?? null },
      type: attributes.Type ?? null,
      identifiers: Object.fromEntries(['AnleggsID', 'S_OBJID', 'PUNKT-NAVN', 'PUNKT-KODE']
        .filter((key) => attributes[key] !== null && attributes[key] !== undefined && attributes[key] !== '')
        .map((key) => [key, attributes[key]])), identityIssues };
    for (const code of identityIssues) issues.push({ code, objectKey });
    const extracted = extractHyperlinkOccurrences(hyperlinkRaw);
    for (const diagnostic of extracted.diagnostics) issues.push({ ...diagnostic, objectKey });
    for (const occurrence of extracted.occurrences) {
      const targetValid = occurrence.targetValid && classifyPhotoFile({ name: occurrence.filename }).candidate;
      const diagnostics = occurrence.targetValid && !targetValid ? ['non-image-target'] : occurrence.diagnostics;
      references.push({ ...occurrence, id: `${objectKey}:S_HYPERLINK:${occurrence.sourceIndex}:${occurrence.wrapperOrdinal}:${occurrence.memberOrdinal}`,
        objectKey, field: 'S_HYPERLINK', targetValid, diagnostics,
        comparison: photoReferenceKey(occurrence.referenceRaw) });
    }
  });
  return immutable({ kind: 'gmi', fingerprint, header: parser.header, objectsByKey, references, issues });
}

function ledgerFromResolutions(source, resolutions) {
  const edges = new Map(), byPhotoId = {}, byObjectKey = {}, byReferenceId = {};
  for (const resolution of resolutions) {
    byReferenceId[resolution.referenceId] = resolution;
    if (resolution.status !== 'confident') continue;
    const id = JSON.stringify([source.id, resolution.objectKey, resolution.photoId]);
    if (!edges.has(id)) edges.set(id, { id, sourceId: source.id, objectKey: resolution.objectKey,
      photoId: resolution.photoId, referenceIds: [], matchMethods: [] });
    const edge = edges.get(id);
    edge.referenceIds.push(resolution.referenceId);
    if (!edge.matchMethods.includes(resolution.method)) edge.matchMethods.push(resolution.method);
  }
  const associationsById = Object.fromEntries(edges);
  for (const edge of edges.values()) {
    edge.matchMethod = edge.matchMethods.length === 1 ? edge.matchMethods[0] : 'multiple-reference-methods';
    (byPhotoId[edge.photoId] ||= []).push(edge.id);
    (byObjectKey[edge.objectKey] ||= []).push(edge.id);
  }
  const statuses = resolutions.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {});
  return immutable({ resolutions, associationsById, reverseIndexes: { byPhotoId, byObjectKey, byReferenceId },
    summary: { objectCount: Object.keys(source.objectsByKey).length,
      referencingObjectCount: new Set(source.references.filter((ref) => ref.targetValid).map((ref) => ref.objectKey)).size,
      referenceCount: source.references.length, matchedReferenceCount: statuses.confident || 0,
      matchedPhotoCount: Object.keys(byPhotoId).length, associationCount: edges.size,
      unmatchedCount: statuses.unmatched || 0, ambiguousCount: statuses.ambiguous || 0, invalidCount: statuses.invalid || 0 } });
}

export function reviewGmiPhotoSource(source, photos) {
  const resolve = createPhotoReferenceResolver(photos, { barePathSuffix: false, skipUnsafePaths: true });
  const photosById = new Map(photos.map((photo) => [photo.id, photo]));
  const alive = new Set(photos.map((photo) => photo.id));
  const previous = source.associationLedger?.reverseIndexes.byReferenceId || {};
  const resolutions = source.references.map((reference) => {
    const base = { referenceId: reference.id, objectKey: reference.objectKey };
    if (!reference.targetValid) return { ...base, status: 'invalid', photoIds: [], reason: reference.diagnostics[0] };
    if (reference.comparison.unsafe) return { ...base, status: 'unmatched', photoIds: [], reason: 'unsafe-reference' };
    // Previously confirmed endpoints remain stable. An append/recheck cannot
    // silently switch a provenance edge to a different imported copy.
    const retained = previous[reference.id];
    if (retained?.status === 'confident' && alive.has(retained.photoId)) return retained;
    const [assets, resolvedMethod] = resolve(reference.comparison);
    let method = resolvedMethod;
    if (assets.length === 1 && !resolvedMethod.startsWith('case-insensitive-')) {
      const photo = photosById.get(assets[0].id);
      const original = resolvedMethod === 'exact-basename' ? photo.originalFilename : photo.sourceRelativePath;
      if (original !== original.normalize('NFC') || reference.referenceRaw !== reference.referenceRaw.normalize('NFC'))
        method = `nfc-${resolvedMethod.replace(/^exact-/, '')}`;
    }
    return { ...base, status: assets.length === 1 ? 'confident' : assets.length ? 'ambiguous' : 'unmatched',
      photoIds: assets.map((asset) => asset.id), ...(assets.length === 1 ? { photoId: assets[0].id } : {}), method,
      reason: assets.length > 1 ? 'duplicate-photo-reference' : assets.length ? null : 'no-owner-layer-photo' };
  });
  return ledgerFromResolutions(source, resolutions);
}

export function pruneGmiPhotoSource(source, remainingIds) {
  const alive = new Set(remainingIds);
  const resolutions = source.associationLedger.resolutions.map((row) => {
    if (row.status === 'confident' && !alive.has(row.photoId)) return { referenceId: row.referenceId,
      objectKey: row.objectKey, status: 'unmatched', photoIds: [], reason: 'photo-removed', method: row.method };
    // Removal never automatically accepts the last remaining ambiguous copy.
    return { ...row, photoIds: row.photoIds.filter((id) => alive.has(id)) };
  });
  return Object.freeze({ ...source, associationLedger: ledgerFromResolutions(source, resolutions) });
}

export function gmiObjectLabel(object) {
  const identifier = Object.entries(object.identifiers)[0];
  return identifier ? `${identifier[0]}: ${identifier[1]}` : `${object.geometryScope === 'line' ? 'Linje' : 'Punkt'} ${object.parserId}`;
}

export function gmiPhotoAssociations(layer, photoId) {
  if (!layer?.photoIds.includes(photoId)) return [];
  return layer.spatialSources.filter((source) => source.kind === 'gmi').flatMap((source) =>
    (source.associationLedger.reverseIndexes.byPhotoId[photoId] || []).map((id) => {
      const association = source.associationLedger.associationsById[id];
      return { association, sourceId: source.id, sourceFilename: source.filename,
        object: source.objectsByKey[association.objectKey] };
    }));
}
