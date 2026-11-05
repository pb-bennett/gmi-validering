import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { exportFixture, syntheticContext } from './helpers/photoExportFixtures.mjs';
import { assertGeminiConventions, elements, uuidV4 } from './helpers/geminiPhotoConventions.mjs';
import { GEMINI_GOLDEN_CASES, geminiGoldenFixture, normalizeGeminiIdentifiers, readGeminiGolden } from './helpers/photoExportGolden.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { buildPhotoExportPackage } from '../src/lib/photos/export/photoExportPackage.mjs';
import { PHOTO_EXPORT_PROFILES } from '../src/lib/photos/export/exportContract.mjs';

const gemini = { profile: 'gemini-legacy2019' };

// The Gemini output is frozen because an unmodified package imported into Gemini VA/GeoFoto.
// A failure here means the accepted bytes moved, not that the golden file needs refreshing.
for (const name of Object.keys(GEMINI_GOLDEN_CASES)) test(`Gemini golden: ${name} is byte-identical once UUIDs are normalized`, async () => {
  const f = await geminiGoldenFixture(name);
  try {
    const plan = await f.plan(gemini);
    assert.deepEqual(plan.errors, []);
    const xml = serializePhotoExport(plan);
    assertGeminiConventions(xml);
    assert.equal(normalizeGeminiIdentifiers(xml), await readGeminiGolden(name));
  } finally { f.session.clear(); }
});

test('Gemini golden: fresh plans change identifiers only', async () => {
  const f = await geminiGoldenFixture('time-seconds');
  try {
    const [first, second] = [serializePhotoExport(await f.plan(gemini)), serializePhotoExport(await f.plan(gemini))];
    assert.notEqual(first, second);
    assert.equal(normalizeGeminiIdentifiers(first), normalizeGeminiIdentifiers(second));
  } finally { f.session.clear(); }
});

test('Gemini identifiers stay UUIDv4 with separate collection, feature and Point IDs', async () => {
  const f = await geminiGoldenFixture('time-fraction-offset-repeated');
  try {
    const plan = await f.plan(gemini), { doc, photos } = assertGeminiConventions(serializePhotoExport(plan));
    const issued = [plan.collectionId, ...plan.occurrences.flatMap((row) => [row.featureId, row.geometryId])];
    assert.equal(new Set(issued).size, 1 + 2 * plan.occurrences.length);
    for (const id of issued) assert.match(id.slice(2), uuidV4);
    assert.equal(doc.documentElement.getAttribute('gml:id'), plan.collectionId);
    for (const [index, photo] of photos.entries()) {
      assert.equal(photo.getAttribute('gml:id'), plan.occurrences[index].featureId);
      assert.equal(photo.getElementsByTagNameNS('*', 'lokalId')[0].textContent, plan.occurrences[index].guid);
    }
  } finally { f.session.clear(); }
});

test('Gemini document head, namespace, geometry and optional time keep the accepted structure', async () => {
  const f = await geminiGoldenFixture('time-seconds');
  try {
    const plan = await f.plan(gemini), xml = serializePhotoExport(plan);
    assert(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n')); assert(!xml.includes('\r'));
    assert.deepEqual([...assertGeminiConventions(xml).doc.documentElement.attributes].map((attribute) => attribute.name),
      ['xmlns:gml', 'gml:id', 'xmlns:app', 'xmlns:xlink', 'xmlns:xsi', 'xsi:schemaLocation']);
    assert(xml.includes('xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"'));
    assert.equal(plan.crs, 'EPSG:5972');
    assert.deepEqual(plan.occurrences.map((row) => row.point.z), ['0.000000', '0.000000']);
    assert(!xml.includes('fotoinformasjon'));
  } finally { f.session.clear(); }
  const missing = await geminiGoldenFixture('time-missing');
  try {
    const { photos } = assertGeminiConventions(serializePhotoExport(await missing.plan(gemini)));
    assert.deepEqual(elements(photos[0]).map((node) => node.localName), ['name', 'fotograferingspunkt', 'fotolink', 'retningsvektor', 'identifikasjon']);
  } finally { missing.session.clear(); }
});

test('Gemini package keeps photos.gml at the root, Attachments paths and original bytes', async () => {
  const f = await geminiGoldenFixture('unicode-collision');
  try {
    const plan = await f.plan(gemini), xml = serializePhotoExport(plan);
    const zip = unzipSync(new Uint8Array(await (await buildPhotoExportPackage(plan)).arrayBuffer()));
    assert.deepEqual(Object.keys(zip), ['photos.gml', ...plan.attachments.map((attachment) => attachment.path)]);
    assert.equal(strFromU8(zip['photos.gml']), xml);
    for (const attachment of plan.attachments) {
      assert(attachment.path.startsWith('Attachments/'));
      assert(xml.includes(`<app:fotolink>Attachments\\${attachment.filename}</app:fotolink>`));
      assert.deepEqual(zip[attachment.path], new Uint8Array(await plan.assets.find((asset) => asset.assetId === attachment.assetId).file.arrayBuffer()));
    }
  } finally { f.session.clear(); }
});

test('profile set and Gemini capture-time policy are unchanged', async () => {
  assert.deepEqual(Object.keys(PHOTO_EXPORT_PROFILES).sort(), ['asbuilt52', 'gemini-legacy2019', 'legacy2019']);
  const f = await exportFixture({ time: null, photographer: null });
  try {
    const plan = await f.plan(gemini);
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.counts.missingTimestampCount, 1);
  } finally { f.session.clear(); }
});

// Codes and owners per scenario; M2 extends this into the readiness/plan parity matrix.
// Messages are left out on purpose: M2 rewords direction-required without changing its code.
const asset = 'export-1', occurrence = 'export-1';
const PLAN_ERRORS = [
  ['complete', {}, { gemini: [], legacy: [], asbuilt: [] }],
  ['no capture time', { time: null }, { gemini: [], legacy: [['capture-time-required', asset]], asbuilt: [['capture-time-required', asset]] }],
  ['date-only time', { time: '2026-05-12' }, { gemini: [], legacy: [['capture-time-precision', asset]], asbuilt: [['capture-time-precision', asset]] }],
  ['minute time', { time: '2026-05-12T14:33' }, { gemini: [], legacy: [['capture-time-precision', asset]], asbuilt: [['capture-time-precision', asset]] }],
  ['fraction and offset', { time: '2026-05-12T14:33:02.123+02:00' }, { gemini: [], legacy: [], asbuilt: [] }],
  ['UTC time', { time: '2026-05-12T12:33:02Z' }, { gemini: [], legacy: [], asbuilt: [] }],
  ['no direction', { direction: null }, { gemini: [['direction-required', null, occurrence]], legacy: [['direction-required', null, occurrence]], asbuilt: [] }],
  ['explicit north', { direction: 0 }, { gemini: [], legacy: [], asbuilt: [] }],
  ['no time and no direction', { time: null, direction: null }, {
    gemini: [['direction-required', null, occurrence]],
    legacy: [['capture-time-required', asset], ['direction-required', null, occurrence]],
    asbuilt: [['capture-time-required', asset]] }],
  ['nothing placed', { unplaced: true }, { gemini: [['no-placed-photos']], legacy: [['no-placed-photos']], asbuilt: [['no-placed-photos']] }],
];
const PROFILES = { gemini: 'gemini-legacy2019', legacy: 'legacy2019', asbuilt: 'asbuilt52' };
const errorKeys = (plan) => plan.errors.map(({ code, assetId, occurrenceId }) => [code, assetId ?? null, occurrenceId ?? null]);
const expectedKeys = (rows) => rows.map(([code, assetId = null, occurrenceId = null]) => [code, assetId, occurrenceId]);

for (const [name, options, expected] of PLAN_ERRORS) test(`export plan errors: ${name}`, async () => {
  const f = await exportFixture(options);
  try {
    for (const [key, profile] of Object.entries(PROFILES)) assert.deepEqual(errorKeys(await f.plan({ profile })), expectedKeys(expected[key]), key);
  } finally { f.session.clear(); }
});

test('export plan errors: incomplete AsBuilt context and XML-invalid Legacy photographer stay profile-specific', async () => {
  const f = await exportFixture({ photographer: 'Synthetic\u0001Artist' });
  try {
    const context = { ...syntheticContext, projectName: '' };
    assert.deepEqual((await f.plan({ profile: 'asbuilt52', context })).errors.map((error) => error.code), ['invalid-context']);
    assert.deepEqual((await f.plan({ profile: 'legacy2019' })).errors.map((error) => error.code), ['invalid-xml-text']);
    assert.deepEqual((await f.plan(gemini)).errors, []);
  } finally { f.session.clear(); }
});
