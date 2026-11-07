import assert from 'node:assert/strict';
import test from 'node:test';
import { assertGeminiConventions } from './helpers/geminiPhotoConventions.mjs';
import { acceptGmlPositions, attachGml, evidenceSession, exportedTimes, placeAll, settleExif } from './helpers/photoEvidenceFixtures.mjs';
import { syntheticContext } from './helpers/photoExportFixtures.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';

// Real bytes -> real exifr -> evidence -> automatic acceptance -> plan -> XML. Nothing is set by hand except
// position and direction, so the exported time can only have come from the JPEG or the GML.
const jpeg = (name, options) => new File([gpsJpeg({ noLocation: true, captureTime: '2026:05:12 14:33:02', ...options })], name, { type: 'image/jpeg' });
const planFor = (session, layerId, profile) => buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), { profile, crs: 'EPSG:25832', context: syntheticContext });
const xmlFor = async (session, layerId, profile) => {
  const plan = await planFor(session, layerId, profile);
  assert.deepEqual(plan.errors, []);
  return serializePhotoExport(plan);
};
async function adoptedLayer(photo) {
  const session = evidenceSession();
  const ids = session.importFiles([photo]).acceptedIds, layer = session.createLayer();
  await settleExif(session, layer.id);
  placeAll(session, layer.id, ids, 90);
  return { session, layerId: layer.id, ids };
}

for (const [name, tags, gemini, canonical] of [
  ['whole seconds', {}, '2026-05-12T14:33:02', '2026-05-12T14:33:02'],
  ['subseconds', { subsecond: '012' }, '2026-05-12T14:33:02', '2026-05-12T14:33:02.012'],
  ['offset', { offsetTime: '+02:00' }, '2026-05-12T14:33:02', '2026-05-12T14:33:02+02:00'],
  ['subseconds and offset', { subsecond: '5', offsetTime: '+02:00' }, '2026-05-12T14:33:02', '2026-05-12T14:33:02.5+02:00'],
]) test(`EXIF ${name} reach every profile's XML automatically`, async () => {
  const { session, layerId, ids } = await adoptedLayer(jpeg('a.jpg', tags));
  try {
    const xml = await xmlFor(session, layerId, 'gemini-legacy2019');
    assertGeminiConventions(xml);
    assert.deepEqual([...exportedTimes(xml).entries()], [['a.jpg', gemini]]);
    for (const profile of ['legacy2019', 'asbuilt52']) assert.deepEqual([...exportedTimes(await xmlFor(session, layerId, profile)).values()], [canonical]);
    const accepted = session.getPhoto(ids[0]).captureMetadata.captureTime;
    assert.equal(accepted.value.iso, canonical);
    assert.equal(accepted.provenance.kind, 'exif'); assert.equal(accepted.provenance.tag, 'DateTimeOriginal');
    assert.equal(accepted.provenance.raw.DateTimeOriginal, '2026:05:12 14:33:02');
  } finally { session.clear(); }
});

test('EXIF date-only evidence is not adopted and never reaches XML with invented time', async () => {
  const { session, layerId } = await adoptedLayer(jpeg('a.jpg', { captureTime: '2026-05-12' }));
  try {
    assert.equal(session.adoptSourceEvidence(layerId, 'captureTime', 'exif').counts.insufficientPrecision, 1);
    assert.deepEqual([...exportedTimes(await xmlFor(session, layerId, 'gemini-legacy2019')).values()], [null]);
  } finally { session.clear(); }
});

const gml = (features) => new File([`<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="urn:ogc:def:crs:EPSG::5972"/></gml:boundedBy>${features.map(({ name, time }, index) => `<gml:featureMember><app:Skråfoto gml:id="f${index}"><gml:name>${name}</gml:name><app:fotograferingspunkt><gml:Point gml:id="p${index}" srsDimension="3"><gml:pos srsDimension="3">${581930 + index * 20} 6566000 0</gml:pos></gml:Point></app:fotograferingspunkt><app:fotolink>Attachments\\${name}</app:fotolink>${time ? `<app:fotograferingstidspunkt>${time}</app:fotograferingstidspunkt>` : ''}</app:Skråfoto></gml:featureMember>`).join('')}</gml:FeatureCollection>`], 'synthetic.gml');

test('agreeing EXIF and GML: GML is used, both provenances stay, and the XML has the one time', async () => {
  const session = evidenceSession();
  try {
    const ids = session.importFiles([jpeg('a.jpg')]).acceptedIds, layer = session.createLayer();
    await settleExif(session, layer.id);
    await attachGml(session, layer.id, gml([{ name: 'a.jpg', time: '2026-05-12T14:33:02' }]));
    assert.deepEqual(acceptGmlPositions(session, layer.id), ids);
    const accepted = session.getPhoto(ids[0]).captureMetadata.captureTime;
    assert.equal(accepted.provenance.kind, 'gml');
    assert.deepEqual(accepted.provenance.evidence.map((item) => item.kind).sort(), ['exif', 'gml']);
    assert.deepEqual([...exportedTimes(await xmlFor(session, layer.id, 'gemini-legacy2019')).values()], ['2026-05-12T14:33:02']);
  } finally { session.clear(); }
});
