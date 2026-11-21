// Batch 1B.2A/1B.2B: the real owners of a «Flytt til punktobjekt» transfer (Rettinger session registry, FOTO session,
// loaded-GMI sources), shared by the transaction and integration suites. Synthetic data only: every name, filename,
// signature and GUID is fabricated; the grammar follows the observed delivered S_HYPERLINK shapes.
import assert from 'node:assert/strict';
import { exportFixture } from './photoExportFixtures.mjs';
import { latin1Bytes } from './gmiHyperlinkRemovalFixtures.mjs';
import { saveStagedSource } from './photoSourceDraft.mjs';
import { GMIParser } from '../../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../../src/lib/parsing/gmiDecoding.js';
import { createGmiPhotoSource } from '../../src/lib/photos/gmiPhotoSource.mjs';
import { createLoadedGmiSources } from '../../src/lib/photos/loadedGmiSource.mjs';
import { createGmiEditSessions, createGmiObjectCorrection } from '../../src/lib/gmi-edit/index.mjs';
import { commitPhotoHyperlinkTransfer, photoHyperlinkTransferBasis } from '../../src/lib/photos/photoHyperlinkTransfer.mjs';

export const DATE = new Date('2026-11-21T10:00:00Z');
export const POINT_FIELDS = ['S_FCODE', 'Type', 'AnleggsID', 'S_HYPERLINK', 'Merknad', 'Kumform'];
export const guidOf = (n) => `5ec0e000-0000-4000-8000-1b2a${String(n).padStart(8, '0')}`;
export const w = (n, name, sign = null) => `h:${n}(link:"Attachments\\${name}"${sign ? ` sign:"${sign}"` : ''})`;
export const cell = (...wrappers) => wrappers.map((wrapper) => `${wrapper} `).join('');

/** points: { number, fcode, hyperlink, xyz? } in EPSG:25832. */
export function gmiText(points) {
  const extent = '_EXTENT 581900 6565900 582100 6566100 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!';
  const out = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', extent,
    'COSYS_EPSG 25832', 'COSYSVER_EPSG 5941', 'PRODUCER Syntetisk testprodusent', '[P_]', extent, `_FIELDNAMES ${POINT_FIELDS.join(';')};`, '[+P_]'];
  points.forEach((point, index) => {
    out.push(`:P ${point.number}`, `_FIELDVALUES ${point.fcode};Kum;SYNT-R${index + 1};${point.hyperlink ?? ''};Punkt ${index + 1};S;`,
      `GUID ${guidOf(point.number)}`, '/XYZ', point.xyz ?? `${581940 + index * 7}.000 ${6566000 + index * 7}.000 ${100 + index}.250`);
  });
  out.push('[END]');
  return `${out.join('\r\n')}\r\n`;
}

/** The real owners: FOTO session with a layer, a loaded survey layer, its Rettinger registry and the live-bound FOTO GMI source. */
export async function transferFixture(points, { names, placeAtGmi = false } = {}) {
  const f = await exportFixture({ names, unplaced: true });
  const bytes = latin1Bytes(gmiText(points));
  const file = new File([bytes], 'transfer.gmi');
  const parser = new GMIParser(decodeGmiBytes(bytes)), data = parser.toObject();
  const layers = { survey: { id: 'survey', type: 'GMI', file: { name: file.name, format: 'GMI' }, data } };
  const sources = createLoadedGmiSources({ getLayer: (id) => layers[id] });
  sources.register('survey', data, file, createGmiPhotoSource(parser));
  const publications = [];
  const faults = { commit: null };
  const registry = createGmiEditSessions({ sources, getLayer: (id) => layers[id], onChange: (layerId, status) => publications.push(status),
    commitFault: (stage) => faults.commit?.(stage) });
  const opened = await registry.open('survey');
  assert(opened.ok, opened.code);
  const handle = opened.handle;
  const ticket = f.session.beginSourceWorkflow(f.layerId);
  const sourceTicket = sources.begin('survey');
  assert(await f.session.stageLayerSource(f.layerId, { binding: sourceTicket.binding,
    read: () => sources.read(sourceTicket), isLive: () => sources.isLive(sourceTicket.binding) }, 'gmi'));
  assert(saveStagedSource(f.session, ticket, f.session.getSnapshot().sourceReviews[f.layerId]).ok);
  f.session.endSourceWorkflow(ticket);
  const photos = () => f.session.getLayerPhotos(f.layerId);
  if (placeAtGmi) {
    const requests = photos().filter((photo) => photo.occurrence).map((photo) => ({ photoId: photo.id, candidateId: `gmi-position:${photo.occurrence.key}` }));
    assert.equal(f.session.acceptCandidates(f.layerId, requests).length, requests.length);
  }
  const owners = { registry, handle, photoSession: f.session, photoLayerId: f.layerId };
  const source = () => f.session.getLayer(f.layerId).spatialSources.find((item) => item.kind === 'gmi');
  const object = (number) => Object.values(source().objectsByKey).find((item) => item.parserId === number);
  const assetOf = (filename) => photos().find((photo) => photo.originalFilename === filename).assetId;
  /** The explicit decision: the photo `filename` on object `from` moves to object `to`. */
  const move = (from, filename, to, extra = {}) => {
    const src = source(), sourceObject = object(from), recipient = object(to);
    const assetId = assetOf(filename);
    const edge = Object.values(src.associationLedger.associationsById).find((item) => item.objectKey === sourceObject.objectKey && item.photoId === assetId);
    return { decisionKey: `decision-${from}-${filename}`, sourceFingerprint: src.fingerprint, sourceId: src.id, sourceObjectKey: sourceObject.objectKey,
      assetId, referenceIds: edge ? [...edge.referenceIds] : [],
      recipient: { objectKey: recipient.objectKey, scope: 'point', sourceIndex: recipient.sourceIndex, parserId: recipient.parserId, guid: recipient.guid }, ...extra };
  };
  const basis = () => { const result = photoHyperlinkTransferBasis(owners); assert(result.ok, result.code); return result.basis; };
  const commit = (transfers, options = {}) => commitPhotoHyperlinkTransfer({ ...owners, transfers, expected: options.expected ?? basis(), now: () => DATE, ...options });
  const history = () => registry.getSession(handle).session;
  const proposedLinks = () => { const proposed = registry.proposed(handle); assert(proposed.ok, JSON.stringify(proposed.rejections)); return proposed.dataset.points.map((point) => point.attributes.S_HYPERLINK ?? ''); };
  const stageField = (sourceIndex, value) => {
    const built = createGmiObjectCorrection(history(), { scope: 'point', sourceIndex, values: { Merknad: value }, mode: 'overwrite', label: 'Syntetisk retting' });
    assert(built.ok, JSON.stringify(built.rejections)); assert(registry.stage(handle, built.changeSet).ok);
  };
  /** FOTO accepted state as the owners expose it (records, delivery, sources), for unchanged-state assertions. */
  const fotoState = () => JSON.stringify({ photos: photos().map(({ id, assetId, occurrence, spatial, direction, captureMetadata, metadataEvidence, originalFilename }) =>
    ({ id, assetId, occurrence: occurrence ? { key: occurrence.key, objectKey: occurrence.objectKey, referenceIds: occurrence.referenceIds } : null,
      spatial, direction, captureMetadata, metadataEvidence, originalFilename })),
  delivery: f.session.getPhotoDeliverySnapshot(f.layerId).stateKey, layer: f.session.getLayer(f.layerId).photoIds,
  sources: f.session.getLayer(f.layerId).spatialSources.map((item) => [item.id, item.fingerprint, item.loadedBinding?.live]) });
  return { ...f, bytes, file, registry, handle, owners, sources, layers, publications, faults, photos, source, object, assetOf, move, basis, commit, history, proposedLinks, stageField, fotoState };
}

export const LOK_SLU = () => transferFixture([
  { number: 293, fcode: 'LOK', hyperlink: cell(w(1, 'SYNT_LOK_A.png', 'Feltmåler A'), w(2, 'SYNT_LOK_B.png', 'Feltmåler A'), w(3, 'SYNT_LOK_C.png')), xyz: '581950.000 6566010.000 101.250' },
  { number: 108, fcode: 'SLU', hyperlink: cell(w(1, 'SYNT_SLU_1.png', 'Feltmåler B')), xyz: '581950.100 6566010.150 100.900' },
  { number: 12, fcode: 'KUM', hyperlink: cell(w(1, 'SYNT_KUM_1.png')), xyz: '581964.000 6566024.000 99.000' },
], { names: ['SYNT_LOK_A.png', 'SYNT_LOK_B.png', 'SYNT_LOK_C.png', 'SYNT_SLU_1.png', 'SYNT_KUM_1.png'] });

export const codesOf = (result) => [...new Set((result.blockers || []).map((entry) => entry.code))].sort();
