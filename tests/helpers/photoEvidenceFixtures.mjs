import assert from 'node:assert/strict';
import { parse } from 'exifr/dist/full.esm.mjs';
import { DOMParser } from '@xmldom/xmldom';
import { createPhotoSession } from '../../src/lib/photos/photoSession.mjs';
import { readExifGps } from '../../src/lib/photos/exifGps.mjs';
import { parseTerrainPhotoGml } from '../../src/lib/photos/terrainPhotoGml.mjs';
import { parseNodeXml } from '../../src/lib/gemini-wfs/nodeXmlParser.mjs';

export const tick = () => new Promise((resolve) => setImmediate(resolve));
// Real exifr and the real GML parser. Only byte delivery and the XML DOM differ from a browser.
export const readRealExif = (file) => readExifGps(file, { parse: (blob, options) => blob.arrayBuffer().then((buffer) => parse(buffer, options)) });
export const parseRealGml = async (file) => parseTerrainPhotoGml(await file.text(), { parseXml: parseNodeXml });

export function evidenceSession(options = {}) {
  let id = 0;
  return createPhotoSession({ createId: () => `evidence-${++id}`, yieldJob: tick, extractGps: readRealExif, parseGml: parseRealGml,
    createThumbnail: async () => ({ thumbnailBlob: new Blob(['preview']), dimensions: { width: 1, height: 1 } }),
    urls: { createObjectURL: () => `blob:${++id}`, revokeObjectURL() {} }, ...options });
}

export async function settleExif(session, layerId) {
  for (let turn = 0; turn < 200000; turn++) {
    if (session.getLayerPhotos(layerId).every((photo) => photo.spatial.exifRead.state !== 'pending')) return;
    await tick();
  }
  assert.fail('EXIF did not finish');
}

export const placeAll = (session, layerId, photoIds, degrees = null) => assert(session.applyPhotoEdits(session.beginPhotoEdits(layerId),
  photoIds.map((photoId, index) => ({ photoId, position: { crs: 'EPSG:4326', longitude: 10.43555 + index * .001, latitude: 59.2251222222 },
    ...(degrees === null ? {} : { degrees }) }))).ok);

export async function attachGml(session, layerId, file) {
  assert(await session.stageLayerSource(layerId, file));
  assert(session.applyLayerSource(layerId));
}

// Accepts the viable GML position of every photo, the explicit per-candidate route.
export function acceptGmlPositions(session, layerId) {
  const requests = session.getLayerPhotos(layerId).map((photo) => ({ photoId: photo.id,
    candidateId: photo.spatial.candidates.find((candidate) => candidate.kind === 'gml' && candidate.status === 'viable')?.id }));
  return session.acceptCandidates(layerId, requests);
}

// fotolink filename -> exported time, or null when the element is absent.
export function exportedTimes(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return new Map([...doc.getElementsByTagNameNS('*', 'Skråfoto')].map((feature) => [
    feature.getElementsByTagNameNS('*', 'fotolink')[0].textContent.split(/[\\/]/).at(-1),
    feature.getElementsByTagNameNS('*', 'fotograferingstidspunkt')[0]?.textContent ?? null,
  ]));
}

// DateTimeOriginal read straight from the raw tag, independently of normalizeCaptureTime.
export const exifClockToSecond = (photo) => {
  const tag = photo.metadataEvidence.find((item) => item.kind === 'exif' && item.field === 'captureTime')?.raw?.DateTimeOriginal;
  return typeof tag === 'string' ? tag.trim().replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T') : null;
};
