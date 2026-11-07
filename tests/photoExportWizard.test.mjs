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
import { photoCaptureTimeSchemaWarning, photoCompletionStatus } from '../src/lib/photos/photoCompletion.mjs';
import { DEFAULT_PHOTO_EXPORT_CONFIG, photoExportConfigFor, reconcilePhotoExportConfig, updatePhotoExportConfig } from '../src/lib/photos/photoExportConfig.mjs';
import { PHOTO_EXPORT_WIZARD_START, photoExportDeliveryModel, photoExportDeliveryReadiness, photoExportPackageContents, photoExportPackageState,
  photoExportWizardReducer as reduce } from '../src/lib/photos/photoExportWizard.mjs';

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
const CONTINUE = 'Fortsett uten opptakstid', FIX = 'Rett det som mangler for å gå videre.';
const STATES = [
  // layer, profile, state, heading, label, enabled, reason
  ['reading', GEMINI, 'reading', 'Leser bildedata …', 'Neste', false, '1 bilde er ikke ferdig lest. Kontrollen oppdateres av seg selv.'],
  ['reading', LEGACY, 'reading', 'Leser bildedata …', 'Neste', false, '1 bilde er ikke ferdig lest. Kontrollen oppdateres av seg selv.'],
  ['reading', ASBUILT, 'reading', 'Leser bildedata …', 'Neste', false, '1 bilde er ikke ferdig lest. Kontrollen oppdateres av seg selv.'],
  ['noPlaced', GEMINI, 'blocked', '1 må rettes før eksport', 'Neste', false, FIX],
  ['noPlaced', LEGACY, 'blocked', '1 må rettes før eksport', 'Neste', false, FIX],
  ['noPlaced', ASBUILT, 'blocked', '1 må rettes før eksport', 'Neste', false, FIX],
  ['noTime', GEMINI, 'schema-gap', 'Kan eksporteres, men følger ikke Skråfoto 2019-skjemaet', CONTINUE, true, null],
  ['noTime', LEGACY, 'blocked', '1 må rettes før eksport', 'Neste', false, FIX],
  ['noTime', ASBUILT, 'blocked', '1 må rettes før eksport', 'Neste', false, FIX],
  ['check', GEMINI, 'recommendations', 'Kan eksporteres, men 1 kan forbedres', 'Neste', true, null],
  ['check', LEGACY, 'recommendations', 'Kan eksporteres, men 1 kan forbedres', 'Neste', true, null],
  ['check', ASBUILT, 'recommendations', 'Kan eksporteres, men 1 kan forbedres', 'Neste', true, null],
  ['complete', GEMINI, 'ready', 'Ingen opplysninger mangler for dette målet', 'Neste', true, null],
  ['complete', LEGACY, 'ready', 'Ingen opplysninger mangler for dette målet', 'Neste', true, null],
  ['complete', ASBUILT, 'ready', 'Ingen opplysninger mangler for dette målet', 'Neste', true, null],
];

for (const [layer, config, state, heading, label, enabled, reason] of STATES) {
  test(`delivery model: ${layer} under ${config.profile} is ${state}`, () => {
    const result = model(LAYERS[layer], config);
    assert.equal(result.state, state);
    assert.equal(result.heading, heading);
    assert.deepEqual(result.advance, { enabled, label, reason });
    assert.equal(result.completionPrimary, state === 'blocked', 'the hub is the primary action only when blocked');
  });
}

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
  assert.equal(result.completionPrimary, false);
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
  assert.deepEqual(settled.advance, { enabled: true, label: CONTINUE, reason: null });
});

test('the button names capture time only for a capture-time gap', () => {
  const labels = STATES.filter((row) => row[4] === CONTINUE).map((row) => [row[0], row[1].profile, row[2]]);
  assert.deepEqual(labels, [['noTime', 'gemini-legacy2019', 'schema-gap']]);
  const readiness = photoExportDeliveryReadiness(LAYERS.noTime, GEMINI, NOW);
  const otherGap = { ...readiness, levels: { ...readiness.levels, schema: { ...readiness.levels.schema, gaps: [{ field: 'direction', count: 1 }] } } };
  assert.equal(photoExportDeliveryModel({ photos: LAYERS.noTime, readiness: otherGap }).advance.label, 'Neste');
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

// Wizard steps

const plan = (overrides = {}) => ({ errors: [], isLive: () => true, ...overrides });
const started = (state = PHOTO_EXPORT_WIZARD_START) => reduce(state, { type: 'build-start', run: state.run + 1 });
const built = (value = plan(), state = started()) => reduce(state, { type: 'build-done', run: state.run, plan: value });
const packaging = (state = built()) => reduce(state, { type: 'download-start', run: state.run });

test('reducer: the normal path, from Leveranse to a finished download', () => {
  assert.deepEqual(PHOTO_EXPORT_WIZARD_START, { step: 'delivery', run: 0, preview: { status: 'idle', plan: null, error: null }, download: { status: 'idle', error: null } });
  assert.equal(photoExportPackageState(PHOTO_EXPORT_WIZARD_START), null);
  const first = started();
  assert.deepEqual([first.step, first.run, first.preview.status], ['package', 1, 'building']);
  assert.equal(photoExportPackageState(first), 'building');
  const value = plan(), ready = built(value, first);
  assert.equal(ready.preview.plan, value);
  assert.equal(photoExportPackageState(ready), 'ready');
  const running = packaging(ready);
  assert.equal(photoExportPackageState(running), 'packaging');
  const done = reduce(running, { type: 'download-done', run: running.run });
  assert.equal(photoExportPackageState(done), 'done');
  assert.equal(done.preview.plan, value, 'the plan stays, so a repeat download is the same delivery');
  assert.equal(photoExportPackageState(packaging(done)), 'packaging', 'Last ned på nytt');
});

test('reducer: an older build result is dropped, whether it succeeded or failed', () => {
  const late = plan();
  const backed = reduce(started(), { type: 'back' });
  assert.deepEqual([backed.step, backed.run, backed.preview.status], ['delivery', 2, 'idle']);
  assert.equal(reduce(backed, { type: 'build-done', run: 1, plan: late }), backed);
  assert.equal(reduce(backed, { type: 'build-failed', run: 1, error: 'x' }), backed);

  const again = started(backed);
  assert.equal(again.run, 3);
  assert.equal(reduce(again, { type: 'build-done', run: 1, plan: late }), again, 'Neste, Tilbake, Neste, then the first result arrives');
  assert.equal(reduce(again, { type: 'build-failed', run: 1, error: 'x' }), again);

  const rebuilt = started(built());
  assert.equal(reduce(rebuilt, { type: 'build-done', run: 1, plan: late }), rebuilt, 'Oppdater forhåndsvisning, then the older result arrives');
});

test('reducer: a repeated start or result changes nothing', () => {
  const first = started();
  assert.equal(reduce(first, { type: 'build-start', run: first.run }), first, 'a second click from the same render');
  assert.equal(reduce(first, { type: 'build-start' }), first, 'a start without a run');
  const value = plan(), ready = built(value, first);
  assert.equal(reduce(ready, { type: 'build-done', run: ready.run, plan: plan() }), ready, 'the first result of a run wins');
  assert.equal(reduce(ready, { type: 'build-failed', run: ready.run, error: 'x' }), ready);
  assert.equal(reduce(PHOTO_EXPORT_WIZARD_START, { type: 'back' }), PHOTO_EXPORT_WIZARD_START);
  assert.equal(reduce(ready, { type: 'unknown' }), ready);
});

test('reducer: back discards the plan and everything about its download', () => {
  const done = reduce(packaging(), { type: 'download-done', run: 1 });
  const backed = reduce(done, { type: 'back' });
  assert.deepEqual(backed, { ...PHOTO_EXPORT_WIZARD_START, run: 2 });
});

test('reducer: a failed build leaves Tilbake available and the wizard usable', () => {
  const failed = reduce(started(), { type: 'build-failed', run: 1, error: 'Fotolaget finnes ikke lenger.' });
  assert.deepEqual([failed.step, failed.preview.status, failed.preview.plan, failed.preview.error], ['package', 'failed', null, 'Fotolaget finnes ikke lenger.']);
  assert.equal(photoExportPackageState(failed), 'build-failed');
  assert.equal(reduce(failed, { type: 'download-start', run: failed.run }), failed, 'nothing to download');
  const backed = reduce(failed, { type: 'back' });
  assert.equal(backed.step, 'delivery');
  assert.equal(backed.preview.error, null);
  assert.equal(started(backed).preview.status, 'building');
});

test('reducer: while a ZIP is being made, nothing can replace the plan under it', () => {
  const running = packaging();
  assert.equal(reduce(running, { type: 'back' }), running);
  assert.equal(reduce(running, { type: 'build-start', run: running.run + 1 }), running);
  assert.equal(reduce(running, { type: 'download-start', run: running.run }), running);
});

test('reducer: a download needs a current plan without errors', () => {
  const blocked = built(plan({ errors: [{ code: 'missing-file' }] }));
  assert.equal(photoExportPackageState(blocked), 'plan-errors');
  assert.equal(reduce(blocked, { type: 'download-start', run: blocked.run }), blocked);
  const building = started();
  assert.equal(reduce(building, { type: 'download-start', run: 1 }), building, 'nothing is built yet');
  const ready = built();
  assert.equal(reduce(ready, { type: 'download-start', run: 0 }), ready, 'a click from an older run');
});

test('reducer: a download result only counts for its own run', () => {
  const running = packaging();
  assert.equal(reduce(running, { type: 'download-done', run: 0 }), running);
  assert.equal(reduce(running, { type: 'download-failed', run: 0, error: 'x' }), running);
  const ready = built();
  assert.equal(reduce(ready, { type: 'download-done', run: ready.run }), ready, 'no download is running');
  const failed = reduce(running, { type: 'download-failed', run: running.run, error: 'Ikke nok minne.' });
  assert.equal(photoExportPackageState(failed), 'packaging-failed');
  assert.equal(failed.download.error, 'Ikke nok minne.');
  assert.equal(photoExportPackageState(packaging(failed)), 'packaging', 'Prøv igjen');
});

test('package state: staleness is read live and is never stored', () => {
  let live = true;
  const ready = built(plan({ isLive: () => live }));
  assert.equal(photoExportPackageState(ready), 'ready');
  live = false;
  assert.equal(photoExportPackageState(ready), 'stale');
  live = true;
  assert.equal(photoExportPackageState(ready), 'ready');
});

test('package state: a stale plan outranks a finished or failed download, but not a running one or plan errors', () => {
  const stale = () => plan({ isLive: () => false });
  const running = packaging(built(stale()));
  assert.equal(photoExportPackageState(running), 'packaging');
  assert.equal(photoExportPackageState(reduce(running, { type: 'download-done', run: 1 })), 'stale', 'Last ned på nytt would be refused');
  assert.equal(photoExportPackageState(reduce(running, { type: 'download-failed', run: 1, error: 'x' })), 'stale', 'Prøv igjen would be refused');
  assert.equal(photoExportPackageState(built(plan({ errors: [{ code: 'stale-plan' }], isLive: () => false }))), 'plan-errors');
  const refreshed = built(plan(), started(built(stale())));
  assert.equal(photoExportPackageState(refreshed), 'ready', 'Oppdater forhåndsvisning');
});

test('the reducer never mutates the state it is given', () => {
  const steps = [{ type: 'build-start', run: 1 }, { type: 'build-done', run: 1, plan: plan() }, { type: 'download-start', run: 1 }, { type: 'download-done', run: 1 }, { type: 'back' }];
  const deepFreeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
  steps.reduce((state, action) => deepFreeze(reduce(state, action)), deepFreeze({ ...PHOTO_EXPORT_WIZARD_START }));
});

// Against real plans

test('counts: a repeated photo is one image and two placements, and time is counted per image', async () => {
  const { session, layerId } = await sharedOriginalLayer(jpeg('shared.jpg'));
  const photos = session.getLayerPhotos(layerId), readiness = photoExportDeliveryReadiness(photos, GEMINI, NOW);
  const built = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), GEMINI);
  const contents = photoExportPackageContents(built);
  assert.deepEqual([contents.images, contents.placements, contents.sharedAttachments], [1, 2, 1]);
  assert.equal(contents.images, readiness.counts.assets, 'the plan and readiness agree on the number of images');
  assert.equal(contents.totalBytes, session.getAssetFile(photos[0].assetId).size, 'a shared original is counted once');
  assert.match(photoCaptureTimeSchemaWarning(readiness), /^1 bilde mangler full opptakstid/);
  assert.equal(built.counts.missingTimestampCount, 2, 'the plan counts features, which is why it is not the number shown');
});

test('counts: a photo left out is in neither the images nor the size', async () => {
  const { session, layerId, ids } = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg')], { place: false });
  placeAll(session, layerId, [ids[0]]);
  const built = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), GEMINI);
  const contents = photoExportPackageContents(built);
  assert.equal(built.counts.uniqueImages, 2, 'the plan counts every image in the layer');
  assert.deepEqual([contents.images, contents.placements, contents.excluded], [1, 1, 1]);
  assert.equal(contents.totalBytes, session.getAssetFile(session.getPhoto(ids[0]).assetId).size);
});

test('contents: renamed attachments are listed, and names that stay are not', async () => {
  const fixture = await exportFixture({ names: ['grøft#1.png', 'plain.png'] });
  const built = await fixture.plan();
  const { renamed } = photoExportPackageContents(built);
  assert.equal(renamed.length, 1);
  assert.deepEqual(renamed.map(({ from }) => from), built.attachments.filter((item) => item.renamed).map((item) => built.assets.find((asset) => asset.assetId === item.assetId).originalFilename));
  assert(!renamed.some(({ from }) => from === 'plain.png'));
  for (const { assetId, to } of renamed) assert.equal(built.assets.find((asset) => asset.assetId === assetId).exportFilename, to);
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
  assert.match(naming.zipFilename, /^\d{8}-\d{6}-Groeft-nord\.zip$/);
});

// Wording and boundaries

const source = (path) => readFile(new URL(`../src/lib/photos/${path}`, import.meta.url), 'utf8');

test('format cards: every profile has one, and the first is the only recommendation', () => {
  const cards = Object.values(PHOTO_EXPORT_PROFILE_METADATA);
  for (const card of cards) for (const key of ['title', 'destination', 'compatibility']) assert.equal(typeof card[key], 'string');
  assert.deepEqual(cards.map((card) => card.badge), ['Anbefalt', null, null]);
  assert.deepEqual(cards.map((card) => card.title), ['Gemini-kompatibel Skråfoto 2019', 'Skråfoto 2019 (standard)', 'Norsk Vann AsBuilt 5.2']);
});

test('format cards: the import claim follows the evidence table and promises nothing about the next package', () => {
  for (const [profile, card] of Object.entries(PHOTO_EXPORT_PROFILE_METADATA)) {
    if (PHOTO_EXPORT_IMPORT_EVIDENCE[profile].profile === 'imported') {
      assert.match(card.compatibility, /^Importert .* i testet oppsett\. Kontroller resultatet etter import\.$/);
    } else assert.equal(card.compatibility, 'Ikke testet med import i Gemini VA.');
  }
  assert.equal(PHOTO_EXPORT_IMPORT_EVIDENCE['gemini-legacy2019'].missingCaptureTime, 'unconfirmed', 'V1 has not happened: update this only from a real import');
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
  for (const card of Object.values(PHOTO_EXPORT_PROFILE_METADATA)) assert.doesNotMatch(JSON.stringify(card), claims);
  for (const [layer, config] of STATES) assert.doesNotMatch(JSON.stringify(model(LAYERS[layer], config)), claims);
});

test('boundaries: the wizard writes no metadata, composes no filename and stores nothing in the browser', async () => {
  const wizard = await source('photoExportWizard.mjs');
  for (const name of ['adoptSourceEvidence', 'setCaptureMetadata', 'fillMissingPhotoValues', 'photoSession', 'photoExportNames', '.zip', '.gml']) assert(!wizard.includes(name), name);
  for (const text of [wizard, await source('photoExportConfig.mjs')]) assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB/);
});
