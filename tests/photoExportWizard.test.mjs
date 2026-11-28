import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { completionLayer, jpeg, NOW, sharedOriginalLayer } from './helpers/photoCompletionFixtures.mjs';
import { evidenceSession, placeAll, readRealExif, settleExif, tick } from './helpers/photoEvidenceFixtures.mjs';
import { exportFixture, syntheticContext } from './helpers/photoExportFixtures.mjs';
import { normalizeCaptureTime } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { buildPhotoExportPackage } from '../src/lib/photos/export/photoExportPackage.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { PHOTO_EXPORT_IMPORT_EVIDENCE, PHOTO_EXPORT_PROFILE_METADATA, PHOTO_EXPORT_REQUIREMENTS } from '../src/lib/photos/export/photoExportRules.mjs';
import { photoCaptureTimeSchemaWarning, photoCompletionStatus, photoExportAwaitingSource, photoExportLevels, photoReadingNote, photosBeingRead } from '../src/lib/photos/photoCompletion.mjs';
import { DEFAULT_PHOTO_EXPORT_CONFIG, photoExportConfigFor, reconcilePhotoExportConfig, updatePhotoExportConfig } from '../src/lib/photos/photoExportConfig.mjs';
import { photoExportDeliveryModel, photoExportDeliveryReadiness } from '../src/lib/photos/photoExportWizard.mjs';

const GEMINI = { profile: 'gemini-legacy2019', crs: 'EPSG:25832', context: {} };
const LEGACY = { profile: 'legacy2019', crs: 'EPSG:25832', context: {} };
const ASBUILT = { profile: 'asbuilt52', crs: 'EPSG:25832', context: syntheticContext };
const PROFILES = [GEMINI, LEGACY, ASBUILT];

const position = { position: { crs: 'EPSG:4326', longitude: 10, latitude: 59 } };
const time = (iso) => ({ value: normalizeCaptureTime(iso), provenance: { kind: 'exif' } });
function photo(id, { assetId = id, placed = true, captureTime = '2026-05-12T14:33:02', degrees = 90, exifRead = 'no-gps' } = {}) {
  return { id, assetId, originalFilename: `${assetId}.jpg`, metadataEvidence: [], directionEvidence: [],
    captureMetadata: { captureTime: captureTime && time(captureTime), photographer: null }, direction: { current: degrees === null ? null : { degrees, basis: { kind: 'exif' } } },
    spatial: { current: placed ? position : null, exifRead: { state: exifRead } } };
}
const model = (photos, config = GEMINI, now = NOW) => photoExportDeliveryModel({ photos, readiness: photoExportDeliveryReadiness(photos, config, now) });

// One layer per state. Each profile is then asked about the same photos.
const LAYERS = {
  reading: [photo('a', { captureTime: null, degrees: null, exifRead: 'pending' })],
  noPlaced: [photo('a', { placed: false })],
  noTime: [photo('a', { captureTime: null })],
  check: [photo('a', { captureTime: '1999-05-12T14:33:02' })],
  complete: [photo('a')],
};
const FIX = 'Rett det som mangler for å gå videre.';
const STATES = [
  // layer, profile, state, heading, enabled, reason
  ['reading', GEMINI, 'reading', 'Leser bildedata …', false, '1 bilde er ikke ferdig lest. Kontrollen oppdateres av seg selv.'],
  ['reading', LEGACY, 'reading', 'Leser bildedata …', false, '1 bilde er ikke ferdig lest. Kontrollen oppdateres av seg selv.'],
  ['reading', ASBUILT, 'reading', 'Leser bildedata …', false, '1 bilde er ikke ferdig lest. Kontrollen oppdateres av seg selv.'],
  ['noPlaced', GEMINI, 'blocked', '1 må rettes før eksport', false, FIX],
  ['noPlaced', LEGACY, 'blocked', '1 må rettes før eksport', false, FIX],
  ['noPlaced', ASBUILT, 'blocked', '1 må rettes før eksport', false, FIX],
  ['noTime', GEMINI, 'schema-gap', 'Kan eksporteres, men følger ikke Skråfoto 2019-skjemaet', true, null],
  ['noTime', LEGACY, 'blocked', '1 må rettes før eksport', false, FIX],
  ['noTime', ASBUILT, 'blocked', '1 må rettes før eksport', false, FIX],
  ['check', GEMINI, 'recommendations', 'Kan eksporteres, men noe bør kontrolleres', true, null],
  ['check', LEGACY, 'recommendations', 'Kan eksporteres, men noe bør kontrolleres', true, null],
  ['check', ASBUILT, 'recommendations', 'Kan eksporteres, men noe bør kontrolleres', true, null],
  ['complete', GEMINI, 'ready', 'Ingen opplysninger mangler for dette målet', true, null],
  ['complete', LEGACY, 'ready', 'Ingen opplysninger mangler for dette målet', true, null],
  ['complete', ASBUILT, 'ready', 'Ingen opplysninger mangler for dette målet', true, null],
];

for (const [layer, config, state, heading, enabled, reason] of STATES) {
  test(`delivery model: ${layer} under ${config.profile} is ${state}`, () => {
    const result = model(LAYERS[layer], config);
    assert.equal(result.state, state);
    assert.equal(result.heading, heading);
    assert.deepEqual(result.advance, { enabled, reason });
  });
}

test('Gemini distinguishes missing capture time from accepted date-only and minute precision; Standard still blocks', () => {
  for (const captureTime of ['2026-05-12', '2026-05-12T14:33']) {
    const photos = [photo('a', { captureTime })];
    const readiness = photoExportDeliveryReadiness(photos, GEMINI, NOW);
    assert.deepEqual(model(photos).advance, { enabled: true, reason: null });
    assert.match(photoCaptureTimeSchemaWarning(readiness), /^1 bilde har opptaksdato, men mangler fullstendig klokkeslett/);
    assert.match(photoExportLevels(readiness)[1].text, /har opptaksdato, men mangler fullstendig klokkeslett/);
    assert.equal(model(photos, LEGACY).advance.enabled, false);
    assert.deepEqual(photoExportDeliveryReadiness(photos, LEGACY, NOW).blocking.map(({ code }) => code), ['capture-time-precision']);
  }
  const mixed = [photo('a', { captureTime: null }), photo('b', { captureTime: '2026-05-12' })];
  assert.match(photoCaptureTimeSchemaWarning(photoExportDeliveryReadiness(mixed, GEMINI, NOW)),
    /^Opptakstid mangler for 1 bilde, og 1 bilde har opptaksdato, men mangler fullstendig klokkeslett/);
});

test('delivery model: the headings are the ones the hub shows, so the two cannot disagree', () => {
  for (const [layer, config, state] of STATES.filter((row) => row[2] !== 'reading')) {
    const readiness = photoExportDeliveryReadiness(LAYERS[layer], config, NOW);
    assert.equal(model(LAYERS[layer], config).heading, photoCompletionStatus(readiness).text, state);
  }
});

test('reading comes before blocked: the false blocker from an unfinished read is never shown', () => {
  const photos = LAYERS.reading, readiness = photoExportDeliveryReadiness(photos, GEMINI, NOW);
  assert.equal(readiness.status, 'blocked', 'readiness on its own reports a blocker here');
  assert.deepEqual(readiness.blocking.map((item) => item.code), ['direction-required']);
  const result = photoExportDeliveryModel({ photos, readiness });
  assert.equal(result.state, 'reading');
  assert.deepEqual([result.blockers, result.checks, result.notes], [[], [], []]);
});

test('the shared status holds its answer while a placed photo is read, and only then', () => {
  assert.equal(photoExportAwaitingSource(photoExportDeliveryReadiness(LAYERS.reading, GEMINI, NOW)), true);
  assert.equal(photoExportAwaitingSource(photoExportDeliveryReadiness([photo('a')], GEMINI, NOW)), false);
  assert.equal(photoExportAwaitingSource(photoExportDeliveryReadiness([photo('a', { captureTime: null, degrees: null })], GEMINI, NOW)), false, 'a real blocker is still shown');
});

test('reading looks at the whole layer: an unplaced member still being read holds the wizard', () => {
  const photos = [photo('a'), photo('b', { placed: false, captureTime: null, degrees: null, exifRead: 'pending' })];
  const readiness = photoExportDeliveryReadiness(photos, GEMINI, NOW);
  assert.equal(readiness.status, 'ready', 'readiness counts placed photos only');
  assert.equal(photoExportDeliveryModel({ photos, readiness }).state, 'reading');
});

test('reading counts originals: two placements of one photo being read are one image', () => {
  const pending = { captureTime: null, degrees: null, exifRead: 'pending' };
  assert.match(model([photo('a', { ...pending }), photo('b', { ...pending, assetId: 'a' })]).advance.reason, /^1 bilde er/);
  assert.match(model([photo('a', { ...pending }), photo('b', { ...pending })]).advance.reason, /^2 bilder er/);
});

test('a real read holds the wizard, then releases it by itself, and a plan built during it goes stale', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const session = evidenceSession({ extractGps: (file) => gate.then(() => readRealExif(file)) });
  const ids = session.importFiles([jpeg('a.jpg'), jpeg('b.jpg')]).acceptedIds, layer = session.createLayer();
  placeAll(session, layer.id, ids);
  const view = () => { const photos = session.getLayerPhotos(layer.id); return { photos, readiness: photoExportDeliveryReadiness(photos, GEMINI, NOW) }; };

  assert.equal(view().readiness.status, 'blocked');
  assert.equal(photoExportDeliveryModel(view()).state, 'reading');
  assert.equal(photoExportDeliveryModel(view()).advance.reason, '2 bilder er ikke ferdig lest. Kontrollen oppdateres av seg selv.');
  const early = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layer.id), GEMINI);
  assert.equal(early.isLive(), true);

  release();
  await settleExif(session, layer.id);
  await tick();
  assert.equal(early.isLive(), false, 'this is why Neste waits for the read');
  const settled = photoExportDeliveryModel(view());
  assert.equal(settled.state, 'schema-gap');
  assert.deepEqual(settled.advance, { enabled: true, reason: null });
});

test('blockers are grouped, and AsBuilt without context is blocked rather than asked for here', () => {
  const blocked = model(LAYERS.complete, { ...ASBUILT, context: {} });
  assert.equal(blocked.state, 'blocked');
  assert.deepEqual(blocked.blockers.map(({ code, count }) => [code, count]), [['invalid-context', 7]]);
  assert.equal(blocked.heading, '7 må rettes før eksport');
  assert.deepEqual(model([photo('a', { captureTime: null }), photo('b', { captureTime: null })], LEGACY).blockers.map(({ code, count }) => [code, count]), [['capture-time-required', 2]]);
  assert.deepEqual(model(LAYERS.complete).blockers, []);
});

test('placements left out stay visible in every state that has them, and never read as a problem', () => {
  const left = (count) => [photo('a'), ...Array.from({ length: count }, (_, index) => photo(`u${index}`, { placed: false }))];
  assert.equal(model(left(0)).excludedText, null);
  assert.equal(model(left(1)).excludedText, '1 plassering mangler posisjon og blir ikke med.');
  assert.equal(model(left(3)).excludedText, '3 plasseringer mangler posisjon og blir ikke med.');
  assert.equal(model(left(3)).state, 'ready', 'ready can still leave placements out');
  assert.equal(model(LAYERS.noPlaced).excludedText, 'Ingen bilder er plassert ennå. Bare plasserte bilder kan eksporteres.');
  assert.equal(model([]).excludedText, 'Ingen bilder er plassert ennå. Bare plasserte bilder kan eksporteres.');
  assert.equal(model([]).state, 'blocked');
});

test('checks and notes arrive as text, with Norwegian singulars', () => {
  const { checks } = model(LAYERS.check);
  assert.deepEqual(checks, [{ code: 'capture-time-implausible', label: 'Usannsynlig dato', text: '1 bilde har en usannsynlig dato.' }]);
  assert.deepEqual(model(LAYERS.complete).notes.map((item) => item.code), ['compatibility-z']);
  assert.equal(model([photo('a', { placed: false }), photo('b')]).excludedText, '1 plassering mangler posisjon og blir ikke med.');
});

test('now reaches readiness, so a capture time in the future is flagged', () => {
  const future = [photo('a', { captureTime: '2099-05-12T14:33:02' })];
  const flagged = (result) => result.checks.some((item) => item.code === 'capture-time-implausible');
  assert.equal(flagged(model(future, GEMINI, NOW)), true);
  assert.equal(flagged(photoExportDeliveryModel({ photos: future, readiness: photoExportDeliveryReadiness(future, GEMINI) })), true, 'also when the caller gives no time');
  assert.equal(flagged(model(LAYERS.complete, GEMINI, NOW)), false);
});

test('the label has no part in readiness', () => {
  assert.deepEqual(photoExportDeliveryReadiness(LAYERS.noTime, { ...GEMINI, label: 'Torkopp PS' }, NOW), photoExportDeliveryReadiness(LAYERS.noTime, GEMINI, NOW));
});

test('the model is read-only', () => {
  const result = model(LAYERS.check);
  for (const item of [result, result.advance, result.checks, result.notes, result.blockers, result.checks[0]]) assert(Object.isFrozen(item));
});

// Against real plans

test('counts: a repeated photo is one image and two placements, and time is counted per image', async () => {
  const { session, layerId } = await sharedOriginalLayer(jpeg('shared.jpg'));
  const photos = session.getLayerPhotos(layerId), readiness = photoExportDeliveryReadiness(photos, GEMINI, NOW);
  const built = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), GEMINI);
  const { attachments, features, sharedAttachments } = built.counts;
  assert.deepEqual([attachments, features, sharedAttachments], [1, 2, 1]);
  assert.equal(attachments, readiness.counts.assets, 'the plan and readiness agree on the number of images');
  assert.equal(built.assets.reduce((bytes, asset) => bytes + asset.file.size, 0), session.getAssetFile(photos[0].assetId).size, 'a shared original is counted once');
  assert.match(photoCaptureTimeSchemaWarning(readiness), /^Opptakstid mangler for 1 bilde/);
  assert.equal(built.counts.missingTimestampCount, 2, 'the plan counts features, which is why it is not the number shown');
});

test('counts: a photo left out is in neither the images nor the size', async () => {
  const { session, layerId, ids } = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg')], { place: false });
  placeAll(session, layerId, [ids[0]]);
  const built = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), GEMINI);
  const { attachments, features, excluded } = built.counts;
  assert.equal(built.counts.uniqueImages, 2, 'the plan counts every image in the layer');
  assert.deepEqual([attachments, features, excluded], [1, 1, 1]);
  assert.equal(built.assets.reduce((bytes, asset) => bytes + asset.file.size, 0), session.getAssetFile(session.getPhoto(ids[0]).assetId).size);
});

test('the export plan flags renamed attachments and retains their original names', async () => {
  const fixture = await exportFixture({ names: ['grøft#1.png', 'plain.png'] });
  const built = await fixture.plan();
  const renamed = built.attachments.filter((item) => item.renamed);
  assert.equal(renamed.length, 1);
  const [attachment] = renamed;
  const asset = built.assets.find(({ assetId }) => assetId === attachment.assetId);
  assert.equal(asset.originalFilename, 'gr\u00f8ft#1.png');
  assert.equal(asset.exportFilename, attachment.filename);
  assert.equal(built.attachments.find(({ filename }) => filename === 'plain.png').renamed, false);
});

test('identity: each build is a new delivery, and a repeat download of one plan is the same bytes', async () => {
  const fixture = await exportFixture();
  const config = { ...GEMINI, label: 'Torkopp PS' };
  const first = await fixture.plan(config), second = await fixture.plan(config);
  const uuids = (value) => new Set(value.occurrences.flatMap((row) => [row.guid, row.featureId, row.geometryId]));
  assert.equal([...uuids(first)].filter((id) => uuids(second).has(id)).length, 0);
  const bytes = async () => new Uint8Array(await (await buildPhotoExportPackage(first)).arrayBuffer());
  const [one, two] = [await bytes(), await bytes()];
  assert.deepEqual(one, two);
  assert(unzipSync(one)[first.naming.gmlFilename], 'the GML in the package has the previewed name');
});

// Label

test('label: empty by default, kept as typed per layer, and cleared with its layer', () => {
  assert.equal(DEFAULT_PHOTO_EXPORT_CONFIG.label, '');
  const one = updatePhotoExportConfig(new Map(), 'a', { label: '  Grøft / nord  ' });
  const two = updatePhotoExportConfig(one, 'a', { profile: 'legacy2019' });
  assert.equal(photoExportConfigFor(two, 'a').label, '  Grøft / nord  ', 'other settings leave it alone, and only the plan sanitises it');
  assert.equal(photoExportConfigFor(two, 'b').label, '', 'one layer never affects another');
  const three = updatePhotoExportConfig(two, 'b', { label: 'Annet' });
  assert.equal(photoExportConfigFor(three, 'a').label, '  Grøft / nord  ');
  const remaining = reconcilePhotoExportConfig(three, ['b']);
  assert.equal(photoExportConfigFor(remaining, 'a').label, '', 'layer deletion');
  assert.equal(photoExportConfigFor(remaining, 'b').label, 'Annet');
});

test('label: what the config holds reaches the name through the plan', async () => {
  const fixture = await exportFixture();
  const config = photoExportConfigFor(updatePhotoExportConfig(new Map(), 'a', { ...GEMINI, label: '  Grøft / nord  ' }), 'a');
  const { naming } = await fixture.plan(config);
  assert.equal(naming.label, '  Grøft / nord  ');
  assert.match(naming.zipFilename, /^\d{8}-\d{4}-Grøft - nord\.zip$/);
});

// Wording and boundaries

const source = (path) => readFile(new URL(`../src/lib/photos/${path}`, import.meta.url), 'utf8');
const WIZARD_COMPONENTS = ['PhotoExportWizard.js', 'PhotoExportDeliveryStep.js'];
const components = () => Promise.all(WIZARD_COMPONENTS.map((name) => readFile(new URL(`../src/components/photos/${name}`, import.meta.url), 'utf8')));

test('format cards: every profile has one, and the first is the only recommendation', () => {
  const cards = Object.values(PHOTO_EXPORT_PROFILE_METADATA);
  for (const card of cards) for (const key of ['title', 'destination']) assert.equal(typeof card[key], 'string');
  assert(cards.every((card) => !('compatibility' in card)), 'Batch 1B.4B: no import-test status on format cards');
  assert.deepEqual(cards.map((card) => card.badge), ['Anbefalt', null, null]);
  assert.deepEqual(cards.map((card) => card.title), ['Gemini-kompatibel Skråfoto 2019', 'Skråfoto 2019 (standard)', 'Norsk Vann AsBuilt 5.2']);
});

// Batch 1B.4B (deliberate update): the evidence table stays as internal record only; no card shows import-test status.
test('format cards: the internal import evidence table is unchanged and not shown on the cards', () => {
  for (const card of Object.values(PHOTO_EXPORT_PROFILE_METADATA)) assert.doesNotMatch(JSON.stringify(card), /testet|Importert/);
  assert.equal(PHOTO_EXPORT_IMPORT_EVIDENCE['gemini-legacy2019'].missingCaptureTime, 'imported', 'A6: real Gemini VA import 2026-11-19; update only from a real import');
  assert.equal(PHOTO_EXPORT_IMPORT_EVIDENCE['gemini-legacy2019'].missingDirection, 'untested');
  assert.equal(PHOTO_EXPORT_IMPORT_EVIDENCE['gemini-legacy2019'].renamedGml, 'untested');
});

test('format cards: a card says Krever only where the requirement is real', () => {
  for (const [profile, card] of Object.entries(PHOTO_EXPORT_PROFILE_METADATA)) {
    const { captureTime, direction, context } = PHOTO_EXPORT_REQUIREMENTS[profile];
    const demands = card.destination.match(/Krever (.*)\./)?.[1] ?? '';
    assert.equal(demands.includes('opptakstid'), captureTime === 'required', profile);
    assert.equal(demands.includes('retning'), direction === 'required' && profile !== 'gemini-legacy2019', profile);
    assert.equal(demands.includes('leveranseopplysninger'), context, profile);
  }
});

test('wording: no wizard text claims more than a rule check or drops back to test-package language', async () => {
  const claims = /\b(validert|godkjent|sertifisert|garantert|eksperimentell|testpakke)/i;
  assert.doesNotMatch(await source('photoExportWizard.mjs'), claims);
  for (const text of await components()) assert.doesNotMatch(text, claims);
  const shared = await readFile(new URL('../src/components/delivery/DeliveryWizard.js', import.meta.url), 'utf8');
  assert.match(shared, /Dette er eksportkontroll, ikke en ny Validator-kj\u00f8ring eller full XSD-sertifisering/);
  assert.doesNotMatch(shared, /\b(?:eksperimentell|testpakke)\b/i);
  for (const card of Object.values(PHOTO_EXPORT_PROFILE_METADATA)) assert.doesNotMatch(JSON.stringify(card), claims);
  for (const [layer, config] of STATES) assert.doesNotMatch(JSON.stringify(model(LAYERS[layer], config)), claims);
});

test('boundaries: the wizard writes no metadata, composes no filename and stores nothing in the browser', async () => {
  const wizard = await source('photoExportWizard.mjs');
  for (const name of ['adoptSourceEvidence', 'setCaptureMetadata', 'fillMissingPhotoValues', 'photoSession', 'photoExportNames', '.zip', '.gml']) assert(!wizard.includes(name), name);
  for (const text of [wizard, await source('photoExportConfig.mjs')]) assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB/);
});

test('boundaries: the wizard components write no metadata, compose no final name and keep the plan out of the browser store', async () => {
  const [shell, ...steps] = await components();
  for (const text of [shell, ...steps]) {
    for (const name of ['adoptSourceEvidence', 'setCaptureMetadata', 'fillMissingPhotoValues', 'photoExportNames', 'localStorage', 'sessionStorage', 'indexedDB']) assert(!text.includes(name), name);
  }
  // M10 keeps this FOTO entry point as an adapter. The shared wizard delegates
  // capture/build/download to M9, instead of maintaining a second exporter.
  assert.doesNotMatch(shell, /photoSession\.(?!mjs)/, 'no session method is called here');
  assert(shell.includes('DeliveryWizard'));
  for (const text of steps) assert(!text.includes('photoSession'));
  const shared = await readFile(new URL('../src/components/delivery/DeliveryWizard.js', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/lib/delivery/deliveryWizard.mjs', import.meta.url), 'utf8');
  assert(shared.includes('captureDeliverySnapshot(') && shared.includes('buildDeliveryPlan(snapshot, { ...config, label, filenameTimestamp, filenameRevision: revisionChecked, revision })'));
  assert(shared.includes('hasGmi ? parseSourceFilename(gmi.descriptor?.filename) : null'), 'suggestions use the live source');
  assert(shared.includes('config.labelEdited ? config.label : suggestedLabel'), 'manual input takes precedence');
  assert(shared.includes("revisionChecked && sourceParts ? `rev${sourceParts.nextRevision}` : ''"), 'the revision follows the live source and is never stored');
  assert(shared.includes('link.download = filename') && service.includes('save(blob, plan.filename)'), 'the browser gets the name the M9 plan fixed');
  for (const name of ['adoptSourceEvidence', 'setCaptureMetadata', 'fillMissingPhotoValues', 'localStorage', 'sessionStorage', 'indexedDB']) assert(!shared.includes(name), name);
});

// M6e: what the hub says during a read, counts, and the failed commit
test('the hub waits for a read as the wizard does: nothing blocked, on any format, and for a photo with no position too', () => {
  for (const config of PROFILES) {
    const readiness = photoExportDeliveryReadiness(LAYERS.reading, config, NOW);
    assert.equal(readiness.status, 'blocked', 'readiness on its own reports a blocker here');
    assert.deepEqual(photoCompletionStatus(readiness, photosBeingRead(LAYERS.reading)), { status: 'reading', text: 'Leser bildedata …' }, config.profile);
  }
  const loose = [photo('a'), photo('b', { placed: false, exifRead: 'pending' })];
  const readiness = photoExportDeliveryReadiness(loose, GEMINI, NOW);
  assert.equal(photoExportAwaitingSource(readiness), false, 'readiness counts placed photos only');
  assert.equal(photosBeingRead(loose), 1);
  assert.equal(photoCompletionStatus(readiness, photosBeingRead(loose)).status, 'reading');
  assert.equal(photoCompletionStatus(readiness, photosBeingRead(loose)).text, model(loose).heading, 'hub and wizard say the same');
  assert.equal(photoCompletionStatus(readiness, 0).status, 'ready', 'and it settles when the read ends');
  assert.equal(photosBeingRead([photo('a', { assetId: 'x', exifRead: 'pending' }), photo('b', { assetId: 'x', exifRead: 'pending' })]), 1, 'one original, however often it is placed');
  assert.equal(photoReadingNote(1), '1 bilde er ikke ferdig lest. Kontrollen oppdateres av seg selv.');
  assert.equal(photoReadingNote(3), '3 bilder er ikke ferdig lest. Kontrollen oppdateres av seg selv.');
});

test('a category with many photos is not counted as one: the heading gives no total, and the list gives the real count', () => {
  const photos = [1, 2, 3, 4].map((index) => photo(`p${index}`, { captureTime: '1999-05-12T14:33:02' }));
  const result = model(photos);
  assert.equal(result.state, 'recommendations');
  assert.doesNotMatch(result.heading, /\d/);
  assert.deepEqual(result.checks.map((item) => item.text), ['4 bilder har en usannsynlig dato.']);
});

test('one placed photo reads in the singular on the delivery screen', () => {
  assert.deepEqual(model([photo('a')]).notes.map((item) => item.text), ['1 punkt får Z=0 som plassholder, ikke målt høyde.']);
  assert.deepEqual(model([photo('a'), photo('b')]).notes.map((item) => item.text), ['2 punkter får Z=0 som plassholder, ikke målt høyde.']);
});

test('a blocked delivery gives its count once, in the heading', () => {
  const readiness = photoExportDeliveryReadiness(LAYERS.noTime, LEGACY, NOW);
  assert.equal(model(LAYERS.noTime, LEGACY).heading, '1 må rettes før eksport');
  assert.equal(photoExportLevels(readiness).find((level) => level.key === 'generation').text, 'Kan ikke lages ennå');
});

test('wording: the plan no longer contradicts the import status, and blockers use the hub\'s name for delivery details', async () => {
  const plan = await readFile(new URL('../src/lib/photos/export/photoExportPlan.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(plan, /Gemini-kompatibilitet er ikke verifisert/);
  const readiness = photoExportDeliveryReadiness([photo('a')], { ...ASBUILT, context: {} }, NOW);
  assert.deepEqual([...new Set(readiness.blocking.map((item) => item.label))], ['Leveranseopplysninger mangler']);
});

test('both failed commits go through the one function that releases the session and ends the journey', async () => {
  const page = await readFile(new URL('../src/app/page.js', import.meta.url), 'utf8');
  assert.equal(page.match(/abandonPhotoEdits\(ticket\)/g).length, 2, 'savePhotoEdits and the retry after a conflict');
  const body = page.slice(page.indexOf('const abandonPhotoEdits'), page.indexOf('const savePhotoEdits'));
  for (const step of ['photoEditTicketRef.current = ticket', 'endPhotoEditSession()', 'setPhotoBoundary(null)', 'endPhotoExportTrip()', 'notifyPhoto(']) assert(body.includes(step), step);
});
