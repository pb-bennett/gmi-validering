import assert from 'node:assert/strict';
import { evidenceSession, placeAll, settleExif } from './photoEvidenceFixtures.mjs';
import { gmiFile } from './gmiPhotoFixtures.mjs';
import { gpsJpeg } from './photoGpsFixtures.mjs';
import { photoExportReadiness } from '../../src/lib/photos/export/photoExportReadiness.mjs';
import { photoCompletionModel } from '../../src/lib/photos/photoCompletion.mjs';

export const NOW = Date.UTC(2026, 10, 5);
export const jpeg = (name, options = {}) => new File([gpsJpeg({ noLocation: true, ...options })], name, { type: 'image/jpeg' });

// A minimal Skråfoto GML. A feature without time or direction leaves the element out, as a real file would.
export const completionGmlText = (features) => `<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="urn:ogc:def:crs:EPSG::5972"/></gml:boundedBy>${features.map(({ name, time, direction }, index) => `<gml:featureMember><app:Skråfoto gml:id="f${index}"><gml:name>${name}</gml:name><app:fotograferingspunkt><gml:Point gml:id="p${index}" srsDimension="3"><gml:pos srsDimension="3">${581930 + index * 20} 6566000 0</gml:pos></gml:Point></app:fotograferingspunkt><app:fotolink>Attachments\\${name}</app:fotolink>${direction === undefined ? '' : `<app:retningsvektor><app:Retning><app:retningsverdi>${direction}</app:retningsverdi><app:retningsenhet>1</app:retningsenhet><app:retningsreferanse>1</app:retningsreferanse></app:Retning></app:retningsvektor>`}${time ? `<app:fotograferingstidspunkt>${time}</app:fotograferingstidspunkt>` : ''}</app:Skråfoto></gml:featureMember>`).join('')}</gml:FeatureCollection>`;
export const completionGml = (features, filename = 'kilde.gml') => new File([completionGmlText(features)], filename);

// Real bytes and the real GML parser, with every photo placed. `gml` lists the features to attach.
export async function completionLayer(files, { gml = null, place = true, options = {} } = {}) {
  const session = evidenceSession(options);
  const ids = session.importFiles(files).acceptedIds, layer = session.createLayer();
  await settleExif(session, layer.id);
  if (gml) {
    assert(await session.stageLayerSource(layer.id, completionGml(gml)));
    assert(session.applyLayerSource(layer.id));
  }
  if (place) placeAll(session, layer.id, ids);
  return { session, layerId: layer.id, ids };
}

// One original used at two placements, through the same GMI association route the app uses.
export async function sharedOriginalLayer(file) {
  const { session, layerId } = await completionLayer([file], { place: false });
  await session.stageLayerSource(layerId, gmiFile([{ hyperlink: `h:1(link:"${file.name}") ` }, { hyperlink: `h:1(link:"${file.name}") ` }]), 'gmi');
  const review = session.getSnapshot().sourceReviews[layerId];
  assert(session.applyGmiAssociations(layerId, { confirmed: true, sourceId: review.source.id, memberIds: review.memberIds, associationLedger: review.associationLedger }).ok);
  const ids = session.getLayer(layerId).photoIds;
  assert.equal(ids.length, 2);
  placeAll(session, layerId, ids);
  return { session, layerId, ids };
}

export function completionView(session, layerId, configuration = {}) {
  const photos = session.getLayerPhotos(layerId);
  const readiness = photoExportReadiness(photos, { profile: 'gemini-legacy2019', crs: 'EPSG:25832', now: NOW, ...configuration });
  return { photos, readiness, model: photoCompletionModel(photos, readiness) };
}
