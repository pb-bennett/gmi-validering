import assert from 'node:assert/strict';
import test from 'node:test';
import { exifDirectionEvidence, gmlDirectionEvidence } from '../src/lib/photos/photoDirection.mjs';
import { evidenceEligibility, planEvidenceAdoption } from '../src/lib/photos/photoEvidenceAdoption.mjs';
import { photoDirectionEvidenceText, photoDirectionSourceLabel } from '../src/lib/photos/photoPresentation.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { evidenceSession, parseRealGml, settleExif, tick } from './helpers/photoEvidenceFixtures.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';

const source = { id: 'source', filename: 'directions.gml' };
const entry = (valueText, unitText = '1', referenceText = '1') => ({ id: 'entry-1', raw: { direction: { valueText, unitText, referenceText } } });
const read = (...args) => gmlDirectionEvidence(source, entry(...args))[0];

for (const [text, status, value] of [
  ['90.5', 'usable', 90.5], ['359.875', 'usable', 359.875], [' 45 ', 'usable', 45], ['0.001', 'usable', .001],
  ['0', 'usable', 0], ['0.000000', 'usable', 0], ['360', 'usable', 0],
  ['360.5', 'invalid', null], ['-1', 'invalid', null], ['-0', 'invalid', null], ['', 'invalid', null], ['   ', 'invalid', null],
  ['abc', 'invalid', null], ['1e2', 'invalid', null], ['0x10', 'invalid', null], ['45,5', 'invalid', null], [null, 'invalid', null],
]) test(`GML direction value ${JSON.stringify(text)} is ${status}`, () => {
  const item = read(text);
  assert.equal(item.status, status); assert.equal(item.value, value);
  assert.deepEqual(item.raw, { valueText: text, unitText: '1', referenceText: '1' });
});

test('only verified unit 1 and reference 1 are usable; nothing is converted, and raw text and source stay', () => {
  for (const args of [['45', '2', '1'], ['45', '1', '2'], ['45', 'grader', 'nord'], ['45', null, '1'], ['45', '1', null], ['0', 'grader', 'nord']]) {
    const item = read(...args);
    assert.equal(item.status, 'unsupported-reference'); assert.equal(item.value, null);
    assert.deepEqual(item.raw, { valueText: args[0], unitText: args[1], referenceText: args[2] });
  }
  assert.equal(read('abc', 'grader', 'nord').status, 'invalid');
  assert.equal(read('45', ' 1 ', ' 1 ').status, 'usable');
  const item = read('45');
  assert.deepEqual([item.id, item.field, item.kind, item.sourceId, item.sourceFilename, item.sourceEntryId],
    ['source:entry-1:direction', 'direction', 'gml', 'source', 'directions.gml', 'entry-1']);
});

test('an absent direction gives no evidence, so absence never turns into 0°', () => {
  assert.deepEqual(gmlDirectionEvidence(source, { id: 'e', raw: { direction: { valueText: null, unitText: null, referenceText: null } } }), []);
  assert.deepEqual(gmlDirectionEvidence(source, { id: 'e', raw: {} }), []);
  assert.deepEqual(gmlDirectionEvidence(source, { id: 'e' }), []);
});

const evidence = (item) => ({ id: 'p', assetId: 'a', direction: { current: null }, directionEvidence: item });
const gml = (...args) => gmlDirectionEvidence(source, entry(...args))[0];
const exif = (degrees, ref = 'T') => exifDirectionEvidence({ GPSImgDirection: degrees, GPSImgDirectionRef: ref })[0];

test('GML 0° is ordinary evidence: eligible, and it speaks against a different heading like any other value', () => {
  const photo = evidence([gml('0')]);
  const result = evidenceEligibility(photo, 'direction', 'gml');
  assert.equal(result.status, 'eligible'); assert.equal(result.evidence.value, 0);
  assert.equal(planEvidenceAdoption([photo], 'direction', 'gml').counts.eligible, 1);
  assert.equal(evidenceEligibility(evidence([exif(45), gml('0')]), 'direction', 'exif').status, 'conflicting');
  assert.equal(evidenceEligibility(evidence([exif(0), gml('0')]), 'direction', 'gml').status, 'eligible');
});

test('EXIF north with a true reference is ordinary evidence, and it conflicts with a real GML heading', () => {
  const north = exif(0);
  assert.equal(north.status, 'usable');
  assert.equal(evidenceEligibility(evidence([north]), 'direction', 'exif').status, 'eligible');
  assert.equal(evidenceEligibility(evidence([north, gml('90')]), 'direction', 'exif').status, 'conflicting');
  assert.equal(evidenceEligibility(evidence([north, gml('0')]), 'direction', 'exif').status, 'eligible');
});

test('non-zero GML directions adopt like any source: agreement, conflict, unsupported and invalid', () => {
  assert.equal(evidenceEligibility(evidence([exif(45), gml('45')]), 'direction', 'gml').status, 'eligible');
  assert.equal(evidenceEligibility(evidence([exif(45), gml('46')]), 'direction', 'gml').status, 'conflicting');
  assert.equal(evidenceEligibility(evidence([gml('45', 'grader', 'nord')]), 'direction', 'gml').status, 'unsupportedReference');
  assert.equal(evidenceEligibility(evidence([gml('abc')]), 'direction', 'gml').status, 'unusable');
  assert.equal(evidenceEligibility(evidence([gml('45', 'grader', 'nord')]), 'direction', 'exif').status, 'missing');
});

test('inspector text names the source, and GML 0° reads like any other heading', () => {
  assert.equal(photoDirectionEvidenceText(gml('45.5')), 'GML · directions.gml: 45.5° fra geografisk nord');
  assert.equal(photoDirectionEvidenceText(exif(45)), 'EXIF: 45° fra geografisk nord');
  assert.equal(photoDirectionEvidenceText(gml('0')), 'GML · directions.gml: 0° fra geografisk nord');
  assert.equal(photoDirectionEvidenceText(gml('45', 'grader', 'nord')), 'GML · directions.gml: Ukjent enhet eller referanse; krever gjennomgang.');
  assert.equal(photoDirectionEvidenceText(exif(45, 'M')), 'EXIF: Ukjent eller magnetisk referanse; krever gjennomgang.');
  assert.match(photoDirectionEvidenceText(gml('abc')), /Ugyldig retningsverdi/);
  assert.equal(photoDirectionSourceLabel({ basis: { kind: 'gml', sourceFilename: 'directions.gml' } }), 'GML · directions.gml');
});

const document = (features) => new File([`<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="urn:ogc:def:crs:EPSG::5972"/></gml:boundedBy>${features.map(({ name, direction }, index) => `<gml:featureMember><app:Skråfoto gml:id="f${index}"><gml:name>${name}</gml:name><app:fotograferingspunkt><gml:Point gml:id="p${index}" srsDimension="3"><gml:pos srsDimension="3">${581930 + index * 20} 6566000 0</gml:pos></gml:Point></app:fotograferingspunkt><app:fotolink>Attachments\\${name}</app:fotolink>${direction === null ? '' : `<app:retningsvektor><app:Retning><app:retningsverdi>${direction}</app:retningsverdi><app:retningsenhet>1</app:retningsenhet><app:retningsreferanse>1</app:retningsreferanse></app:Retning></app:retningsvektor>`}</app:Skråfoto></gml:featureMember>`).join('')}</gml:FeatureCollection>`], 'directions.gml');
const jpeg = (name, options) => new File([gpsJpeg({ noLocation: true, ...options })], name, { type: 'image/jpeg' });
const attach = async (session, layerId, file) => { assert(await session.stageLayerSource(layerId, file)); assert(session.applyLayerSource(layerId)); };
const place = (session, layerId) => session.acceptCandidates(layerId, session.getLayerPhotos(layerId).map((photo) => ({ photoId: photo.id,
  candidateId: photo.spatial.candidates.find((candidate) => candidate.kind === 'gml')?.id })));
const plan = (session, layerId, profile = 'gemini-legacy2019') => buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), { profile, crs: 'EPSG:25832' });

test('session: the real parser feeds GML direction evidence, and each occurrence gets its direction automatically', async () => {
  const session = evidenceSession();
  try {
    session.importFiles([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')]);
    const layer = session.createLayer();
    await settleExif(session, layer.id);
    await attach(session, layer.id, document([{ name: 'a.jpg', direction: '45.5' }, { name: 'b.jpg', direction: '0' }, { name: 'c.jpg', direction: null }]));
    const [a, b, c] = session.getLayerPhotos(layer.id);
    assert.deepEqual([a, b, c].map((photo) => photo.directionEvidence.map((item) => [item.status, item.value])), [[['usable', 45.5]], [['usable', 0]], []]);
    assert.deepEqual(a.directionEvidence[0].raw, { valueText: '45.5', unitText: '1', referenceText: '1' });
    assert.equal(a.directionEvidence[0].sourceFilename, 'directions.gml');
    assert.deepEqual([a, b, c].map((photo) => [photo.direction.current.degrees, photo.direction.current.basis.kind]), [[45.5, 'gml'], [0, 'gml'], [0, 'default']]);
  } finally { session.clear(); }
});

test('session: GML evidence attached first survives EXIF finishing later, success or failure', async () => {
  for (const finish of [
    (resolve) => resolve({ state: 'no-gps', errorCode: null, candidate: null, directionEvidence: exifDirectionEvidence({ GPSImgDirection: 90, GPSImgDirectionRef: 'T' }) }),
    (resolve, reject) => reject(new Error('unreadable')),
  ]) {
    let release;
    const session = evidenceSession({ extractGps: () => new Promise((resolve, reject) => { release = () => finish(resolve, reject); }) });
    try {
      const ids = session.importFiles([jpeg('a.jpg')]).acceptedIds, layer = session.createLayer();
      await attach(session, layer.id, document([{ name: 'a.jpg', direction: '45.5' }]));
      assert.deepEqual(session.getPhoto(ids[0]).directionEvidence.map((item) => item.kind), ['gml']);
      while (!release) await tick();
      release();
      await settleExif(session, layer.id);
      assert(session.getPhoto(ids[0]).directionEvidence.some((item) => item.kind === 'gml' && item.value === 45.5));
    } finally { session.clear(); }
  }
});

test('session: rechecking the same source adds no duplicate evidence', async () => {
  const session = evidenceSession();
  try {
    const ids = session.importFiles([jpeg('a.jpg')]).acceptedIds, layer = session.createLayer();
    await settleExif(session, layer.id);
    await attach(session, layer.id, document([{ name: 'a.jpg', direction: '45.5' }]));
    assert(session.recheckLayerSource(layer.id, session.getLayer(layer.id).spatialSources[0].id));
    assert(session.applyLayerSource(layer.id));
    assert.equal(session.getPhoto(ids[0]).directionEvidence.length, 1);
  } finally { session.clear(); }
});

test('session: GML direction reaches Gemini XML on its own, with source provenance and full source precision', async () => {
  const session = evidenceSession();
  try {
    const ids = session.importFiles([jpeg('a.jpg')]).acceptedIds, layer = session.createLayer();
    await settleExif(session, layer.id);
    await attach(session, layer.id, document([{ name: 'a.jpg', direction: '45.5' }]));
    place(session, layer.id);
    const { degrees, basis, acceptance } = session.getPhoto(ids[0]).direction.current;
    assert.equal(degrees, 45.5); assert.equal(acceptance, 'auto');
    assert.deepEqual([basis.kind, basis.sourceFilename, basis.sourceEntryId, basis.raw.valueText], ['gml', 'directions.gml', 'entry-1', '45.5']);
    const result = await plan(session, layer.id);
    assert.deepEqual(result.errors, []);
    assert(serializePhotoExport(result).includes('<app:retningsverdi>45.5</app:retningsverdi>'));
  } finally { session.clear(); }
});

test('session: GML 0° is accepted as an ordinary direction and stays apart from a default in provenance', async () => {
  const session = evidenceSession();
  try {
    const ids = session.importFiles([jpeg('a.jpg')]).acceptedIds, layer = session.createLayer();
    await settleExif(session, layer.id);
    assert.equal(session.getPhoto(ids[0]).direction.current.basis.kind, 'default');
    await attach(session, layer.id, document([{ name: 'a.jpg', direction: '0' }]));
    place(session, layer.id);
    const { degrees, basis } = session.getPhoto(ids[0]).direction.current;
    assert.equal(degrees, 0); assert.equal(basis.kind, 'gml'); assert.equal(basis.raw.valueText, '0');
    assert(serializePhotoExport(await plan(session, layer.id)).includes('<app:retningsverdi>0</app:retningsverdi>'));
  } finally { session.clear(); }
});

test('session: GML 0° stays authoritative beside a different EXIF heading, and the EXIF value is kept as evidence', async () => {
  const session = evidenceSession();
  try {
    const ids = session.importFiles([jpeg('a.jpg', { direction: 90, directionRef: 'T' })]).acceptedIds, layer = session.createLayer();
    await settleExif(session, layer.id);
    assert.equal(session.getPhoto(ids[0]).direction.current.degrees, 90, 'EXIF is used until a GML value arrives');
    await attach(session, layer.id, document([{ name: 'a.jpg', direction: '0' }]));
    assert.deepEqual(session.getPhoto(ids[0]).directionEvidence.map((item) => item.kind).sort(), ['exif', 'gml']);
    assert.equal(session.getPhoto(ids[0]).direction.current.degrees, 0);
    assert.equal(session.getPhoto(ids[0]).direction.current.basis.kind, 'gml');
  } finally { session.clear(); }
});

test('the parser output stays unchanged for sources without direction evidence', async () => {
  const parsed = await parseRealGml(document([{ name: 'a.jpg', direction: null }]));
  assert.deepEqual(parsed.entries[0].raw.direction, { valueText: null, unitText: null, referenceText: null });
});
