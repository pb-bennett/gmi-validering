import assert from 'node:assert/strict';
import { exportFixture, syntheticContext } from './photoExportFixtures.mjs';
import { buildGmiText, latin1Bytes } from './gmiHyperlinkRemovalFixtures.mjs';
import { GMIParser } from '../../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../../src/lib/parsing/gmiDecoding.js';
import { createGmiPhotoSource } from '../../src/lib/photos/gmiPhotoSource.mjs';
import { createLoadedGmiSources } from '../../src/lib/photos/loadedGmiSource.mjs';
import { createGmiEditSessions, createGmiObjectCorrection } from '../../src/lib/gmi-edit/index.mjs';
import { captureDeliverySnapshot, buildDeliveryPlan } from '../../src/lib/delivery/index.mjs';

export const DATE = new Date('2026-11-13T11:12:13Z');
export async function deliveryFixture({ names = ['shared.png', 'only.png'],
  points = [{ hyperlink: 'h:1(link:"Attachments\\shared.png") ' }, { hyperlink: 'h:1(link:"Attachments\\shared.png") ' }],
  lines = [], ...options } = {}) {
  const f = await exportFixture({ names, ...options });
  const bytes = latin1Bytes(buildGmiText({ points, lines }));
  const file = new File([bytes], 'synthetic.gmi');
  const parser = new GMIParser(decodeGmiBytes(bytes)), data = parser.toObject();
  const layers = { survey: { id: 'survey', type: 'GMI', file: { name: file.name, format: 'GMI' }, data } };
  const sources = createLoadedGmiSources({ getLayer: (id) => layers[id] });
  sources.register('survey', data, file, createGmiPhotoSource(parser));
  const registry = createGmiEditSessions({ sources, getLayer: (id) => layers[id] });
  const opened = await registry.open('survey'); assert(opened.ok);
  const handle = opened.handle;
  const ticket = f.session.beginSourceWorkflow(f.layerId);
  const sourceTicket = sources.begin('survey');
  assert(await f.session.stageLayerSource(f.layerId, { binding: sourceTicket.binding,
    read: () => sources.read(sourceTicket), isLive: () => sources.isLive(sourceTicket.binding) }, 'gmi'));
  assert(f.session.saveSourceWorkflowSource(ticket, f.session.getSnapshot().sourceReviews[f.layerId]).ok);
  f.session.endSourceWorkflow(ticket);
  const photos = () => f.session.getLayerPhotos(f.layerId);
  // Source association can create additional occurrences. Accept each synthetic
  // placement explicitly, just as the established export fixture does.
  if (!options.unplaced) for (const [index, photo] of photos().entries()) {
    assert(f.session.applyPhotoEdits(f.session.beginPhotoEdits(f.layerId), [{ photoId: photo.id,
      position: { crs: 'EPSG:4326', longitude: 10.43555 + index * .001, latitude: 59.22512 } }]).ok);
    if (options.direction !== null) assert(f.session.applyPhotoEdits(f.session.beginPhotoEdits(f.layerId), [{ photoId: photo.id, degrees: options.direction ?? 0 }]).ok);
  }
  const transfer = (index = 0) => {
    const photo = photos().filter((item) => item.occurrence)[index];
    assert(f.session.setDeliveryIntent(f.layerId, [photo.id], 'transfer').ok); return photo;
  };
  const stage = () => {
    const session = registry.getSession(handle).session;
    const result = createGmiObjectCorrection(session, { scope: 'point', sourceIndex: 0,
      values: { Merknad: 'Corrected synthetic note' }, mode: 'overwrite', label: 'Synthetic correction' });
    assert(result.ok); assert(registry.stage(handle, result.changeSet).ok);
  };
  const capture = (mode = 'combined', extra = {}) => captureDeliverySnapshot({ mode, registry, handle,
    photoSession: f.session, photoLayerId: f.layerId, ...extra });
  const plan = (mode = 'combined', configuration = {}, extra = {}) => buildDeliveryPlan(capture(mode, extra),
    { profile: 'gemini-legacy2019', crs: 'EPSG:25832', context: syntheticContext, ...configuration }, { now: () => DATE });
  return { ...f, bytes, file, registry, handle, layers, sources, photos, transfer, stage, capture, plan };
}
