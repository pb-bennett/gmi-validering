import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { exportFixture, syntheticContext } from './helpers/photoExportFixtures.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { ASBUILT_CODES, EXPORT_CONTEXT_FIELDS } from '../src/lib/photos/export/exportContract.mjs';

const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
const local = (node) => [...node.childNodes].filter((child) => child.nodeType === 1).map((child) => child.localName);
const feature = (doc) => doc.getElementsByTagNameNS('*', 'Skråfoto')[0];
const text = (doc, tag) => doc.getElementsByTagNameNS('*', tag)[0]?.textContent;

for (const profile of ['legacy2019', 'asbuilt52']) for (const crs of ['EPSG:25832', 'EPSG:25833']) test(`${profile}/${crs}: exact sequence, deterministic IDs/XML, XY Easting Northing and shared attachment`, async () => {
  const f = await exportFixture({ repeated: true });
  try {
    const plan = await f.plan({ profile, crs }); assert.deepEqual(plan.errors, []);
    const xml = serializePhotoExport(plan), doc = parse(xml), node = feature(doc);
    assert.equal(xml, serializePhotoExport(await f.plan({ profile, crs })));
    assert(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')); assert(!xml.includes('\r'));
    const legacy = profile === 'legacy2019';
    assert.equal(node.namespaceURI, legacy ? 'http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101' : 'https://skjema.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Asbuilt/5.2');
    assert.deepEqual(local(node), legacy
      ? ['fotograferingspunkt', 'fotolink', 'retningsvektor', 'identifikasjon', 'fotograferingstidspunkt', 'fotoinformasjon']
      : ['datafangstdato', 'datasett_navn', 'identifikasjon', 'kvalitet', 'prosjektnavn', 'stedfestingsårsak', 'stedfestingsforhold', 'fotograferingspunkt', 'fotograferingstidspunkt', 'fotolink', 'retningsvektor']);
    assert.deepEqual(local(doc.getElementsByTagNameNS('*', legacy ? 'Retning' : 'Retningsvektor')[0]), legacy ? ['retningsverdi', 'retningsenhet', 'retningsreferanse'] : ['retningsenhet', 'retningsreferanse', 'retningsverdi']);
    assert.equal(text(doc, 'retningsverdi'), '0'); assert.equal(text(doc, 'retningsenhet'), '1'); assert.equal(text(doc, 'retningsreferanse'), '1');
    assert.equal(doc.getElementsByTagNameNS('*', 'Skråfoto').length, 2);
    const links = [...doc.getElementsByTagNameNS('*', 'fotolink')].map((link) => link.textContent);
    assert.equal(new Set(links).size, 1); assert.equal(links[0], 'Attachments/Grøft æ image.png');
    const ids = [...doc.getElementsByTagName('*')].map((n) => n.getAttribute('gml:id')).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length);
    for (const n of doc.getElementsByTagNameNS('*', 'Point')) { assert.equal(n.getAttribute('srsDimension'), '2'); assert.equal(n.getAttribute('srsName'), `urn:ogc:def:crs:EPSG::${crs.slice(5)}`); }
    const coordinates = text(doc, 'pos').split(' ').map(Number); assert.equal(coordinates.length, 2);
    assert(coordinates[0] > 100000 && coordinates[0] < 900000); assert(coordinates[1] > 6500000);
    if (crs === 'EPSG:25832') { assert(Math.abs(coordinates[0] - 581932.579) < .001); assert(Math.abs(coordinates[1] - 6566001.892) < .001); }
    assert.equal(text(doc, legacy ? 'lokalId' : 'guid'), plan.occurrences[0].guid);
    assert.match(plan.occurrences[0].guid, /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    if (legacy) { assert.equal(text(doc, 'fotograf'), 'Synthetic & <Artist>'); assert(xml.includes('&amp; &lt;Artist&gt;')); }
    else {
      assert.equal(doc.getElementsByTagNameNS('*', 'fotoinformasjon').length, 0);
      assert.equal(text(doc, 'datasett_navn'), syntheticContext.datasetName); assert.equal(text(doc, 'prosjektnavn'), syntheticContext.projectName);
      assert.deepEqual(local(doc.getElementsByTagNameNS('*', 'Posisjonskvalitet')[0]), ['målemetode', 'målemetodeHøyde']);
      assert(plan.warnings.some((item) => item.code === 'photographer-omitted'));
      assert.equal(doc.getElementsByTagNameNS('*', 'foto').length, 0); assert.equal(doc.getElementsByTagNameNS('*', 'link_referanse').length, 0);
    }
  } finally { f.session.clear(); }
});
for (const time of ['2026-05-12T14:33:02', '2026-05-12T14:33:02.123456789+02:00', '2026-05-12T14:33:02Z']) test(`accepted dateTime preserved without invented timezone: ${time}`, async () => {
  const f = await exportFixture({ time });
  try { for (const profile of ['legacy2019', 'asbuilt52']) assert.equal(text(parse(serializePhotoExport(await f.plan({ profile }))), 'fotograferingstidspunkt'), time); }
  finally { f.session.clear(); }
});
for (const time of [null, '2026-05-12', '2026-05-12T14:33']) test(`insufficient capture time blocks both profiles: ${time}`, async () => {
  const f = await exportFixture({ time });
  try { for (const profile of ['legacy2019', 'asbuilt52']) { const p = await f.plan({ profile }); assert(p.errors.some((item) => item.code === 'capture-time-required')); assert.throws(() => serializePhotoExport(p)); } }
  finally { f.session.clear(); }
});
test('unknown direction blocks legacy; modern omits it, unknown photographer omits legacy info', async () => {
  const f = await exportFixture({ direction: null, photographer: null });
  try {
    const legacy = await f.plan(); assert(legacy.errors.some((item) => item.code === 'direction-required')); assert.throws(() => serializePhotoExport(legacy));
    const xml = serializePhotoExport(await f.plan({ profile: 'asbuilt52' })); assert(!xml.includes('retningsvektor')); assert(!xml.includes('fotoinformasjon'));
    f.session.applyDirectionEdit(f.session.beginDirectionEdit(f.layerId, f.ids[0]), 90);
    assert(!serializePhotoExport(await f.plan()).includes('fotoinformasjon'));
  } finally { f.session.clear(); }
});
test('every required modern context field validates; blank/invalid dates/arbitrary codes and XML controls block', async () => {
  const f = await exportFixture();
  try {
    for (const { key } of EXPORT_CONTEXT_FIELDS) { const p = await f.plan({ profile: 'asbuilt52', context: { ...syntheticContext, [key]: '' } }); assert(p.errors.some((item) => item.field === key)); }
    for (const [key, value] of [['surveyDate', '2026-02-30'], ['datasetName', '\u0000'], ['horizontalMethod', '0000'], ['verticalMethod', 'other: arbitrary'], ['surveyReason', 'fake'], ['surveyConditions', 'fake']]) {
      const p = await f.plan({ profile: 'asbuilt52', context: { ...syntheticContext, [key]: value } }); assert(p.errors.some((item) => item.field === key)); assert.throws(() => serializePhotoExport(p));
    }
    assert.deepEqual(Object.values(ASBUILT_CODES).map((rows) => rows.length), [69, 35, 6, 14]);
    assert.throws(() => serializePhotoExport({ errors: [] }));
  } finally { f.session.clear(); }
});
test('all four accepted cardinal bearings remain exact; invalid XML photographer blocks only when serialized', async () => {
  const f = await exportFixture();
  try {
    for (const degrees of [0, 90, 180, 270]) {
      f.session.applyDirectionEdit(f.session.beginDirectionEdit(f.layerId, f.ids[0]), degrees);
      for (const profile of ['legacy2019', 'asbuilt52']) assert.equal(text(parse(serializePhotoExport(await f.plan({ profile }))), 'retningsverdi'), String(degrees));
    }
    f.session.setCaptureMetadata(f.layerId, f.ids, 'photographer', 'Invalid\u0000XML');
    assert((await f.plan()).errors.some((item) => item.code === 'invalid-xml-text'));
    const modern = await f.plan({ profile: 'asbuilt52' }); assert.deepEqual(modern.errors, []);
    assert(!serializePhotoExport(modern).includes('fotoinformasjon'));
  } finally { f.session.clear(); }
});
