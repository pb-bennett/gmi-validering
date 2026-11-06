import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { completionGml, completionLayer, completionView, jpeg, sharedOriginalLayer } from './helpers/photoCompletionFixtures.mjs';
import { corpusGmlPath, readPhotoCorpus } from './helpers/photoCorpusFixtures.mjs';
import { acceptGmlPositions, attachGml, evidenceSession, placeAll, readRealExif, settleExif, tick } from './helpers/photoEvidenceFixtures.mjs';
import { syntheticContext } from './helpers/photoExportFixtures.mjs';
import { normalizeGeminiIdentifiers } from './helpers/photoExportGolden.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '../src/lib/photos/export/photoExportPlan.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { captureTimeFields, captureTimeHelp, composeCaptureTime, hasPlaceholderSeconds } from '../src/lib/photos/photoCaptureTimeInput.mjs';
import { PHOTO_COMPLETION_TARGETS, selectionScope, canAcceptGmlZero, canAdopt, canAdoptPhotographer, completionCounts, completionRecommendations, initialCompletionTask, isHeldBack, liveSelection, manualFillRows,
  photoCompletionStatus, photoCount, photographerSuggestions, placementCount, scopedRows, selectedPhotoCount, selectedPlacementCount, singularCopy } from '../src/lib/photos/photoCompletion.mjs';
import { DEFAULT_PHOTO_EXPORT_CONFIG, photoExportConfigFor, reconcilePhotoExportConfig, updatePhotoExportConfig } from '../src/lib/photos/photoExportConfig.mjs';

const exifTime = (options = {}) => ({ captureTime: '2026:05:12 14:33:02', ...options });
const LEGACY = { profile: 'legacy2019' }, ASBUILT = { profile: 'asbuilt52', context: {} };
const task = (model, key) => model.tasks.find((item) => item.key === key);
const row = (rows, filename) => rows.find((item) => item.filename === filename);
const ids = (rows) => rows.map((item) => item.photoId);

test('targets: Gemini first, the two others advanced, and all three profiles kept', () => {
  assert.deepEqual(PHOTO_COMPLETION_TARGETS.map(({ value, tier }) => [value, tier]), [['gemini-legacy2019', 'primary'], ['legacy2019', 'advanced'], ['asbuilt52', 'advanced']]);
  assert.equal(PHOTO_COMPLETION_TARGETS[0].label, 'Gemini VA');
});

test('tasks follow the profile: required, recommended, optional and omitted stay distinct', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg')]);
  const labels = (configuration) => completionView(session, layerId, configuration).model.tasks.map(({ key, requirementLabel, group }) => [key, requirementLabel, group]);
  assert.deepEqual(labels({}), [['captureTime', 'Anbefalt', 'main'], ['direction', 'Påkrevd', 'main'], ['placement', null, 'main'], ['photographer', 'Tas ikke med i denne leveransen', 'other']]);
  assert.deepEqual(labels(LEGACY), [['captureTime', 'Påkrevd', 'main'], ['direction', 'Påkrevd', 'main'], ['placement', null, 'main'], ['photographer', 'Valgfritt', 'main']]);
  assert.deepEqual(labels(ASBUILT), [['captureTime', 'Påkrevd', 'main'], ['direction', 'Valgfritt', 'main'], ['placement', null, 'main'], ['context', 'Påkrevd', 'main'], ['photographer', 'Tas ikke med i denne leveransen', 'other']]);
});

test('outstanding counts: per asset for time, per occurrence for direction; omitted photographer is never work left', async () => {
  const { session, layerId } = await sharedOriginalLayer(jpeg('shared.jpg', exifTime()));
  const { model } = completionView(session, layerId);
  assert.equal(task(model, 'captureTime').outstanding, 1);
  assert.equal(task(model, 'direction').outstanding, 2);
  assert.equal(task(model, 'photographer').outstanding, 0);
  assert.equal(task(completionView(session, layerId, LEGACY).model, 'photographer').outstanding, 1);
  assert.equal(task(completionView(session, layerId, ASBUILT).model, 'context').outstanding, 7);
});

test('initial task: what blocks first, then anything outstanding; with nothing placed, Plassering', async () => {
  const entry = (key, requirement, done) => ({ key, requirement, done, empty: false, group: 'main' });
  assert.equal(initialCompletionTask([entry('captureTime', 'recommended', false), entry('direction', 'required', false)]), 'direction');
  assert.equal(initialCompletionTask([entry('captureTime', 'recommended', false), entry('direction', 'required', true)]), 'captureTime');
  assert.equal(initialCompletionTask([entry('captureTime', 'recommended', true)]), 'captureTime');
  const { session, layerId } = await completionLayer([jpeg('a.jpg', exifTime())], { place: false });
  const { model } = completionView(session, layerId);
  assert.equal(initialCompletionTask(model.tasks), 'placement');
  assert.equal(task(model, 'captureTime').done, false, 'no rows is not the same as finished');
  assert.equal(task(model, 'direction').done, false);
});

test('capture time: EXIF and GML that agree stay as separate values with their sources', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg', exifTime({ subsecond: '012' }))], { gml: [{ name: 'a.jpg', time: '2026-05-12T14:33:02' }] });
  const { model } = completionView(session, layerId);
  const item = model.captureTime.rows[0];
  assert.equal(item.state, 'adoptable');
  assert.equal(item.note, 'EXIF og GML stemmer overens');
  assert.deepEqual(item.sources.map(({ text }) => text), ['EXIF: 12.05.2026 14:33:02,012 · tidssone ukjent', 'GML · kilde.gml: 12.05.2026 14:33:02 · tidssone ukjent']);
  assert.deepEqual(item.adoptableKinds, ['exif', 'gml']);

  const before = session.getPhoto(item.photoId).metadataEvidence;
  assert.equal(session.adoptSourceEvidence(layerId, 'captureTime', 'gml', ids(scopedRows(model.captureTime.rows, [], canAdopt('gml')))).counts.adopted, 1);
  const after = completionView(session, layerId).model.captureTime;
  assert.equal(after.done.length, 1);
  assert.equal(after.done[0].acceptedText, '12.05.2026 14:33:02 · tidssone ukjent · GML · kilde.gml');
  assert.equal(after.done[0].sources.length, 2, 'source values stay reviewable after adoption');
  assert.equal(session.getPhoto(item.photoId).metadataEvidence, before, 'source evidence is untouched');
  assert.equal(session.getPhoto(item.photoId).captureMetadata.captureTime.provenance.kind, 'gml');
});

test('capture time: conflicts offer no bulk action, and the per-photo route keeps the chosen source', async () => {
  const { session, layerId, ids: [id] } = await completionLayer([jpeg('a.jpg', exifTime())], { gml: [{ name: 'a.jpg', time: '2026-05-12T14:40:00' }] });
  const { model, readiness } = completionView(session, layerId);
  const item = model.captureTime.rows[0];
  assert.equal(item.state, 'conflict');
  assert.equal(item.sources.length, 2);
  assert.deepEqual(scopedRows(model.captureTime.rows, [], canAdopt('exif')), []);
  assert.deepEqual(scopedRows(model.captureTime.rows, [], canAdopt('gml')), []);
  assert.equal(readiness.tasks.captureTime.counts.conflict, 1);
  const evidenceId = session.getPhoto(id).metadataEvidence.find((source) => source.kind === 'gml').id;
  assert(session.setCaptureMetadata(layerId, [id], 'captureTime', null, { evidenceId }).ok);
  assert.equal(session.getPhoto(id).captureMetadata.captureTime.provenance.kind, 'gml');
  assert.equal(completionView(session, layerId).readiness.tasks.captureTime.counts.accepted, 1, 'readiness follows the mutation');
});

test('capture time: every remaining state has a row, and accepted values can only be replaced one photo at a time', async () => {
  const { session, layerId, ids: [, , , , acceptedMinute] } = await completionLayer(['full', 'minute', 'garbled', 'blank', 'accepted-minute'].map((name) => jpeg(`${name}.jpg`)), {
    gml: [{ name: 'full.jpg', time: '2026-05-12T14:33:02' }, { name: 'minute.jpg', time: '2026-05-12T14:33' }, { name: 'garbled.jpg', time: 'not a time' }] });
  session.setCaptureMetadata(layerId, [acceptedMinute], 'captureTime', '2026-05-12T14:33');
  const { captureTime } = completionView(session, layerId).model;
  assert.deepEqual(captureTime.groups.map(({ state, rows }) => [state, rows.length]), [['adoptable', 1], ['partial', 2], ['unusable', 1], ['none', 1]]);
  assert.equal(row(captureTime.rows, 'minute.jpg').note, 'Har tid uten sekunder');
  assert.equal(row(captureTime.rows, 'accepted-minute.jpg').note, 'Har tid uten sekunder · Erstatter godtatt verdi');
  assert.match(row(captureTime.rows, 'accepted-minute.jpg').acceptedText, /14:33 · uten sekunder/);
  assert.match(row(captureTime.rows, 'garbled.jpg').sources[0].text, /not a time \(kan ikke tolkes sikkert\)/);
  assert.equal(row(captureTime.rows, 'blank.jpg').note, 'Ingen kildeverdi');
  assert.equal(row(captureTime.rows, 'accepted-minute.jpg').selectable, false);
  assert.equal(row(captureTime.rows, 'full.jpg').selectable, true);
});

test('bulk adoption never overwrites an accepted value', async () => {
  const { session, layerId, ids: [first] } = await completionLayer([jpeg('a.jpg', exifTime()), jpeg('b.jpg', exifTime())]);
  session.setCaptureMetadata(layerId, [first], 'captureTime', '2020-01-01T10:00:00');
  const { model } = completionView(session, layerId);
  assert.deepEqual(scopedRows(model.captureTime.rows, [], canAdopt('exif')).map(({ filename }) => filename), ['b.jpg']);
  const result = session.adoptSourceEvidence(layerId, 'captureTime', 'exif', ids(model.captureTime.rows));
  assert.deepEqual([result.counts.adopted, result.counts.alreadyAccepted], [1, 1]);
  assert.equal(session.getPhoto(first).captureMetadata.captureTime.value.iso, '2020-01-01T10:00:00');
});

test('selection narrows an action and never widens it; nothing selected means all eligible', async () => {
  const { session, layerId } = await completionLayer(['a', 'b', 'c'].map((name) => jpeg(`${name}.jpg`, exifTime())));
  const { rows } = completionView(session, layerId).model.captureTime;
  const [a, b] = rows;
  assert.equal(scopedRows(rows, [], canAdopt('exif')).length, 3);
  assert.deepEqual(scopedRows(rows, [a.key], canAdopt('exif')).map(({ key }) => key), [a.key]);
  assert.equal(session.adoptSourceEvidence(layerId, 'captureTime', 'exif', ids(scopedRows(rows, [a.key, b.key], canAdopt('exif')))).counts.adopted, 2);
  const after = completionView(session, layerId).model.captureTime;
  assert.deepEqual(after.done.map(({ filename }) => filename), ['a.jpg', 'b.jpg']);
  assert.deepEqual(liveSelection(after.rows, [a.key, b.key, 'removed']), [], 'accepted and removed rows drop out of the selection');
  assert.deepEqual(scopedRows(after.rows, [a.key], canAdopt('exif')), [], 'a selection with nothing eligible does not fall back to everything');
  assert.deepEqual(scopedRows(after.rows, selectionScope(after.rows, [a.key, b.key]), canAdopt('exif')), [], 'a used selection keeps narrowing, so a second click cannot reach c.jpg');
  assert.equal(scopedRows(after.rows, selectionScope(after.rows, []), canAdopt('exif')).length, 1, 'clearing it is what widens the action again');
  session.adoptSourceEvidence(layerId, 'captureTime', 'exif', ids(after.rows.filter(canAdopt('exif'))));
  const finished = completionView(session, layerId).model.captureTime;
  assert.deepEqual(selectionScope(finished.rows, [a.key]), [], 'with nothing left to act on, the used selection is dropped');
});

test('manual fill reaches only an explicit selection', async () => {
  const { session, layerId } = await completionLayer(['a', 'b'].map((name) => jpeg(`${name}.jpg`)));
  const { rows } = completionView(session, layerId).model.captureTime;
  assert.deepEqual(manualFillRows(rows, []), [], 'one typed value can never reach every photo by default');
  assert.equal(session.fillMissingPhotoValues(layerId, 'captureTime', '2026-05-12T14:33:00', ids(manualFillRows(rows, [rows[0].key]))).counts.adopted, 1);
  assert.equal(completionView(session, layerId).model.captureTime.done[0].acceptedText, '12.05.2026 14:33:00 · tidssone ukjent · Manuell (samme verdi for flere)');
});

test('counts strip separates eligible, selected, accepted, conflicting and individual review', async () => {
  const { session, layerId, ids: [, , accepted] } = await completionLayer([jpeg('a.jpg', exifTime()), jpeg('b.jpg', exifTime()), jpeg('c.jpg', exifTime()), jpeg('d.jpg')], {
    gml: [{ name: 'b.jpg', time: '2026-05-12T15:00:00' }] });
  session.setCaptureMetadata(layerId, [accepted], 'captureTime', '2020-01-01T10:00:00');
  const { captureTime } = completionView(session, layerId).model;
  const counts = Object.fromEntries(completionCounts(captureTime, ['x'], canAdopt('exif')).map(({ key, count }) => [key, count]));
  assert.deepEqual(counts, { eligible: 1, selected: 1, accepted: 1, conflict: 1, review: 1 });
});

test('EXIF direction: adoption is explicit, and a magnetic reference is listed and never adopted', async () => {
  const { session, layerId } = await completionLayer([jpeg('true.jpg', { direction: 90, directionRef: 'T' }), jpeg('magnetic.jpg', { direction: 90, directionRef: 'M' })]);
  const { direction } = completionView(session, layerId).model;
  assert.equal(row(direction.rows, 'true.jpg').state, 'adoptable');
  assert.equal(row(direction.rows, 'magnetic.jpg').state, 'unsupported');
  assert.match(row(direction.rows, 'magnetic.jpg').sources[0].text, /Ukjent eller magnetisk referanse/);
  assert.equal(session.adoptSourceEvidence(layerId, 'direction', 'exif', ids(scopedRows(direction.rows, [], canAdopt('exif')))).counts.adopted, 1);
  const after = completionView(session, layerId).model.direction;
  assert.equal(after.done[0].acceptedText, '90° Ø · EXIF bilderetning (sann nord)');
  assert.equal(row(after.rows, 'magnetic.jpg').accepted, null);
});

test('GML 0° stays out of ordinary adoption, and only the explicit route accepts it', async () => {
  const { session, layerId } = await completionLayer(['zero', 'east'].map((name) => jpeg(`${name}.jpg`)), { gml: [{ name: 'zero.jpg', direction: '0' }, { name: 'east.jpg', direction: '90.5' }] });
  const { model, readiness } = completionView(session, layerId);
  const { rows } = model.direction;
  assert.deepEqual(scopedRows(rows, [], canAdopt('gml')).map(({ filename }) => filename), ['east.jpg']);
  assert.deepEqual(scopedRows(rows, [], canAcceptGmlZero).map(({ filename }) => filename), ['zero.jpg']);
  assert.equal(readiness.blocking.filter((item) => item.code === 'direction-required').length, 2, 'unaccepted evidence blocks as before');

  // The ordinary action, even when pointed straight at the zero, adopts nothing.
  const zero = row(rows, 'zero.jpg');
  assert.equal(session.adoptSourceEvidence(layerId, 'direction', 'gml', [zero.photoId]).counts.adopted, 0);
  assert.equal(session.getPhoto(zero.photoId).direction.current, null);

  assert.equal(session.adoptSourceEvidence(layerId, 'direction', 'gml', ids(scopedRows(rows, [], canAcceptGmlZero)), { includeZero: true }).counts.adopted, 1);
  const after = completionView(session, layerId).model.direction;
  assert.equal(row(after.rows, 'zero.jpg').accepted.degrees, 0);
  assert.equal(row(after.rows, 'zero.jpg').accepted.basis.kind, 'gml');
  assert.equal(row(after.rows, 'east.jpg').accepted, null, 'the zero action reached only the zero');
});

test('a real EXIF heading beside GML 0° stays adoptable, and the zero is not offered against it', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg', { direction: 45, directionRef: 'T' })], { gml: [{ name: 'a.jpg', direction: '0' }] });
  const { rows } = completionView(session, layerId).model.direction;
  assert.equal(rows[0].state, 'adoptable');
  assert.equal(rows[0].zeroAcceptable, false);
  assert.equal(rows[0].note, 'GML oppgir 0°, som ikke regnes mot den andre kilden.');
  assert.deepEqual(scopedRows(rows, [], canAcceptGmlZero), []);
  assert.equal(scopedRows(rows, [], canAdopt('exif')).length, 1);
});

test('EXIF and GML headings that disagree are a conflict that no bulk source action can settle', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg', { direction: 45, directionRef: 'T' })], { gml: [{ name: 'a.jpg', direction: '90' }] });
  const { rows } = completionView(session, layerId).model.direction;
  assert.equal(rows[0].state, 'conflict');
  assert.equal(rows[0].sources.length, 2);
  for (const kind of ['exif', 'gml']) assert.deepEqual(scopedRows(rows, [], canAdopt(kind)), []);
  assert.equal(session.fillMissingPhotoValues(layerId, 'direction', 70, ids(manualFillRows(rows, [rows[0].key]))).counts.adopted, 1);
  assert.equal(completionView(session, layerId).model.direction.done[0].acceptedText, '70° Ø · Manuell (samme verdi for flere)');
});

test('shared original: time is one row for the asset, direction one row per placement, and values can differ', async () => {
  const { session, layerId, ids: [first, second] } = await sharedOriginalLayer(jpeg('shared.jpg', exifTime({ direction: 45, directionRef: 'T' })));
  const { model } = completionView(session, layerId);
  assert.equal(model.captureTime.rows.length, 1);
  assert.deepEqual(model.direction.rows.map(({ occurrence }) => occurrence), ['Plassering 1 av 2', 'Plassering 2 av 2']);

  assert.equal(session.adoptSourceEvidence(layerId, 'captureTime', 'exif', ids(model.captureTime.rows)).counts.adopted, 1);
  assert.equal(session.getPhoto(first).captureMetadata.captureTime.value.iso, session.getPhoto(second).captureMetadata.captureTime.value.iso);

  assert.equal(session.adoptSourceEvidence(layerId, 'direction', 'exif', ids(scopedRows(model.direction.rows, [first], canAdopt('exif')))).counts.adopted, 1);
  assert.equal(session.fillMissingPhotoValues(layerId, 'direction', 200, [second]).counts.adopted, 1);
  assert.deepEqual([first, second].map((id) => session.getPhoto(id).direction.current.degrees), [45, 200]);
  assert.equal(task(completionView(session, layerId).model, 'direction').outstanding, 0);
});

test('pending EXIF: rows wait, nothing is adopted around them, and the state follows the read', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const session = evidenceSession({ extractGps: async (file) => { await gate; return readRealExif(file); } });
  const [time, blank] = session.importFiles([jpeg('time.jpg', exifTime({ direction: 45, directionRef: 'T' })), jpeg('blank.jpg')]).acceptedIds;
  const layerId = session.createLayer().id;
  await attachGml(session, layerId, completionGml([{ name: 'time.jpg', time: '2026-05-12T14:33:02', direction: '0' }]));
  placeAll(session, layerId, [time, blank]);

  const waiting = completionView(session, layerId);
  const { captureTime, direction } = waiting.model;
  assert.equal(row(captureTime.rows, 'time.jpg').sourcePending, true);
  assert.equal(row(captureTime.rows, 'time.jpg').selectable, false);
  assert.deepEqual(scopedRows(captureTime.rows, [], canAdopt('gml')), [], 'GML is not adopted while EXIF might still disagree');
  assert.equal(row(captureTime.rows, 'blank.jpg').state, 'pending');
  assert.equal(captureTime.rows.filter(isHeldBack).length, 1);
  assert.deepEqual(scopedRows(direction.rows, [], canAcceptGmlZero), [], 'GML 0° waits for a possible real EXIF heading');
  assert.deepEqual(completionRecommendations(waiting.readiness, 'captureTime').map(({ code }) => code), ['evidence-pending']);

  release();
  await settleExif(session, layerId);
  await tick();
  const ready = completionView(session, layerId).model;
  assert.equal(row(ready.captureTime.rows, 'time.jpg').state, 'adoptable');
  assert.equal(row(ready.captureTime.rows, 'blank.jpg').state, 'none');
  assert.equal(row(ready.direction.rows, 'time.jpg').state, 'adoptable', 'the real heading arrived, so the zero is no longer the question');
  assert.deepEqual(scopedRows(ready.direction.rows, [], canAcceptGmlZero), []);
});

test('photographer: EXIF Artist is explicit, accepted values are shown, and omitted targets keep the value in the app', async () => {
  const { session, layerId } = await completionLayer([jpeg('artist.jpg', { artist: 'Kari Nordmann' }), jpeg('blank.jpg')]);
  const view = completionView(session, layerId, LEGACY).model.photographer;
  assert.equal(row(view.rows, 'artist.jpg').state, 'adoptable');
  assert.equal(row(view.rows, 'artist.jpg').sources[0].text, 'EXIF: Kari Nordmann');
  assert.equal(row(view.rows, 'blank.jpg').state, 'none');
  assert.equal(session.adoptSourceEvidence(layerId, 'photographer', 'exif', ids(scopedRows(view.rows, [], canAdoptPhotographer))).counts.adopted, 1);
  const after = completionView(session, layerId, LEGACY);
  assert.equal(after.model.photographer.done[0].acceptedText, 'Kari Nordmann · EXIF Artist');
  assert.equal(after.readiness.tasks.photographer.accepted, 1);
  assert.deepEqual(photographerSuggestions(after.model.photographer), ['Kari Nordmann']);
  assert.equal(completionView(session, layerId).readiness.notes.find((note) => note.code === 'photographer-omitted').count, 1);
  const blank = row(after.model.photographer.rows, 'blank.jpg');
  assert.equal(session.fillMissingPhotoValues(layerId, 'photographer', 'bad\u0001name', ids(manualFillRows(after.model.photographer.rows, [blank.key]))).ok, false, 'XML-invalid names are refused');
});

test('placement: unplaced occurrences are named, counted and excluded from the photo tasks', async () => {
  const { session, layerId, ids: [placed] } = await completionLayer(['a', 'b'].map((name) => jpeg(`${name}.jpg`, exifTime())), { place: false });
  placeAll(session, layerId, [placed]);
  const { model } = completionView(session, layerId);
  assert.equal(task(model, 'placement').outstanding, 1);
  assert.equal(task(model, 'placement').requirementLabel, 'Blir ikke med');
  assert.deepEqual(model.placement.rows.map(({ filename }) => filename), ['b.jpg']);
  assert.equal(model.excluded, 1);
  assert.deepEqual(model.captureTime.rows.map(({ filename }) => filename), ['a.jpg'], 'task scope matches the plan');
});

test('AsBuilt context: readiness tracks the seven fields and photo times never fill Datafangstdato', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg', exifTime())]);
  session.adoptSourceEvidence(layerId, 'captureTime', 'exif');
  const empty = completionView(session, layerId, ASBUILT);
  assert.equal(empty.model.context.missingFields.length, 7);
  assert(empty.model.context.missingFields.includes('surveyDate'), 'an accepted capture time does not supply Datafangstdato');
  const filled = completionView(session, layerId, { ...ASBUILT, context: syntheticContext });
  assert.equal(task(filled.model, 'context').outstanding, 0);
  assert.equal(task(filled.model, 'context').done, true);
});

test('status line: never a plain "klar", and never claims more than the rules say', async () => {
  const { session, layerId, ids: photoIds } = await completionLayer([jpeg('a.jpg', exifTime())]);
  const text = () => photoCompletionStatus(completionView(session, layerId).readiness).text;
  assert.equal(text(), '1 må rettes før eksport');
  session.fillMissingPhotoValues(layerId, 'direction', 90, photoIds);
  assert.equal(text(), 'Kan eksporteres, men følger ikke Skråfoto 2019-skjemaet', 'Gemini without time is generated but is a schema gap');
  session.adoptSourceEvidence(layerId, 'captureTime', 'exif');
  assert.equal(text(), 'Ingen opplysninger mangler for dette målet');
});

test('counts and copy read correctly for one and for many', () => {
  assert.deepEqual([photoCount(1), photoCount(2), placementCount(1), placementCount(11), selectedPhotoCount(1), selectedPhotoCount(3), selectedPlacementCount(1), selectedPlacementCount(2)],
    ['1 bilde', '2 bilder', '1 plassering', '11 plasseringer', '1 valgt bilde', '3 valgte bilder', '1 valgt plassering', '2 valgte plasseringer']);
  assert.equal(singularCopy('1 bilder har tid i UTC.'), '1 bilde har tid i UTC.');
  assert.equal(singularCopy('11 bilder og 21 plasseringer'), '11 bilder og 21 plasseringer');
  assert.equal(singularCopy('Leser fortsatt bildedata for 1 bilder.'), 'Leser fortsatt bildedata for 1 bilde.');
});

test('capture-time input: bulk needs a clock with seconds, and help follows the target', () => {
  assert.equal(composeCaptureTime({ date: '2026-05-12' }, { requireSeconds: true }).error, 'missing-time');
  assert.equal(composeCaptureTime({ date: '2026-05-12' }).value.precision, 'date', 'the per-photo field still accepts a date');
  assert.equal(composeCaptureTime({ date: '2026-05-12', time: '14:33:00' }, { requireSeconds: true }).value.iso, '2026-05-12T14:33:00');
  assert.equal(composeCaptureTime({ date: '2026-05-12', time: '14:33:00', zone: '+02:00' }, { requireSeconds: true }).value.offset, '+02:00');
  assert.equal(composeCaptureTime({ date: '2026-05-12', time: '14:33:00' }).value.timezoneKnown, false, 'an unknown timezone stays unknown');
  assert.match(captureTimeHelp('gemini-legacy2019'), /Bare dato eksporteres ikke til Gemini VA/);
  assert.match(captureTimeHelp('asbuilt52'), /krever sekunder/);
  assert.match(captureTimeHelp(), /Legacy og AsBuilt krever sekunder/);
  const value = { iso: '2026-05-12T14:33', precision: 'minute' };
  assert.equal(hasPlaceholderSeconds(value, captureTimeFields(value.iso)), true);
});

test('export config: transient, per layer, unchanged identity without a removal, cleared with its layer', () => {
  const empty = new Map();
  assert.equal(photoExportConfigFor(empty, 'a'), DEFAULT_PHOTO_EXPORT_CONFIG);
  assert.equal(DEFAULT_PHOTO_EXPORT_CONFIG.profile, 'gemini-legacy2019');
  const one = updatePhotoExportConfig(empty, 'a', { profile: 'asbuilt52' });
  const two = updatePhotoExportConfig(one, 'a', { context: { projectName: 'P' } });
  assert.equal(empty.size, 0, 'updates never mutate the previous state');
  assert.deepEqual(photoExportConfigFor(two, 'a'), { profile: 'asbuilt52', crs: 'EPSG:25832', context: { projectName: 'P' } });
  assert.equal(photoExportConfigFor(two, 'b').profile, 'gemini-legacy2019', 'one layer never affects another');
  assert.equal(reconcilePhotoExportConfig(two, ['a', 'b']), two, 'unrelated session publishes do not re-render');
  assert.equal(reconcilePhotoExportConfig(two, ['b']).size, 0, 'layer deletion');
  assert.equal(reconcilePhotoExportConfig(two, []).size, 0, 'session reset');
});

test('nothing reaches export except accepted values: scoped hub actions give the same bytes as the plain domain calls', async () => {
  const build = async (act) => {
    const { session, layerId } = await completionLayer(['a', 'b'].map((name) => jpeg(`${name}.jpg`, exifTime({ subsecond: '5', offsetTime: '+02:00', direction: 90, directionRef: 'T' }))));
    act(session, layerId);
    const plan = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), { profile: 'gemini-legacy2019', crs: 'EPSG:25832' });
    assert.deepEqual(plan.errors, []);
    return normalizeGeminiIdentifiers(serializePhotoExport(plan));
  };
  const hub = await build((session, layerId) => {
    const { captureTime, direction } = completionView(session, layerId).model;
    session.adoptSourceEvidence(layerId, 'captureTime', 'exif', ids(scopedRows(captureTime.rows, [], canAdopt('exif'))));
    session.adoptSourceEvidence(layerId, 'direction', 'exif', ids(scopedRows(direction.rows, [], canAdopt('exif'))));
  });
  const plain = await build((session, layerId) => { session.adoptSourceEvidence(layerId, 'captureTime', 'exif'); session.adoptSourceEvidence(layerId, 'direction', 'exif'); });
  assert.equal(hub, plain);
});

test('reading the hub model changes nothing', async () => {
  const { session, layerId, ids: [id] } = await completionLayer([jpeg('a.jpg', exifTime())], { gml: [{ name: 'a.jpg', direction: '0' }] });
  const before = session.getPhoto(id);
  for (let turn = 0; turn < 3; turn++) completionView(session, layerId, ASBUILT);
  const after = session.getPhoto(id);
  assert.equal(after.direction, before.direction); assert.equal(after.captureMetadata, before.captureMetadata);
  assert.equal(after.captureMetadata.captureTime, null); assert.equal(after.direction.current, null);
});

test('source boundaries: no export or Edit-mode code in the hub, no certification words, nothing suggesting 0°', async () => {
  const names = ['PhotoCompletionDialog.js', 'PhotoCompletionRows.js', 'PhotoCompletionTimePanel.js', 'PhotoCompletionDirectionPanel.js', 'PhotoCompletionDetailsPanels.js'];
  const sources = await Promise.all([...names.map((name) => readFile(new URL(`../src/components/photos/${name}`, import.meta.url), 'utf8')), readFile(new URL('../src/lib/photos/photoCompletion.mjs', import.meta.url), 'utf8')]);
  const all = sources.join('\n');
  assert.doesNotMatch(all, /buildPhotoExportPlan|serializePhotoExport|buildPhotoExportPackage|applyPhotoEdits|beginPhotoEdits|enterPhotoEditMode|localStorage|sessionStorage/);
  assert.doesNotMatch(all, /validert|godkjent|sertifisert|garantert/i);
  assert.doesNotMatch(all, /classifyCaptureTime|fullCaptureTime|evaluatePhotoExportRules/, 'classification stays in readiness and the rules');
  assert.equal((all.match(/includeZero: true/g) || []).length, 2, 'the explicit action and its eligibility check, nowhere else');
  assert.match(all, /Godta GML-retning 0° for/);
  assert.match(all, /0° kan bety at retningen mangler i kildesystemet\. Godta bare hvis bildene er tatt mot nord\./);
  assert.match(all, /0° betyr nord, ikke ukjent retning\./);
});

test('private corpus: the hub offers every EXIF time with matching GML and no false conflicts, and keeps 0° apart', { skip: !corpusGmlPath && 'PHOTO_GML_FIXTURE is not set; the private corpus is opt-in.', timeout: 300000 }, async () => {
  const { photos, gml } = await readPhotoCorpus();
  const session = evidenceSession();
  session.importFiles(photos);
  const layerId = session.createLayer().id;
  await settleExif(session, layerId);
  await attachGml(session, layerId, gml);
  assert.equal(acceptGmlPositions(session, layerId).length, photos.length);
  const total = photos.length;

  const before = completionView(session, layerId).model;
  assert.equal(scopedRows(before.captureTime.rows, [], canAdopt('exif')).length, total);
  assert.equal(before.captureTime.rows.filter((item) => item.sourcesAgree).length, total);
  assert.equal(before.captureTime.rows.filter((item) => item.state === 'conflict').length, 0);
  assert(before.captureTime.rows.every((item) => item.sources.length === 2), 'both source values are available on every row');
  assert.deepEqual(scopedRows(before.direction.rows, [], canAdopt('gml')), [], 'GML 0° is in no ordinary adoption');
  assert.equal(scopedRows(before.direction.rows, [], canAcceptGmlZero).length, total);

  assert.equal(session.adoptSourceEvidence(layerId, 'captureTime', 'exif', ids(scopedRows(before.captureTime.rows, [], canAdopt('exif')))).counts.adopted, total);
  const after = completionView(session, layerId);
  assert.equal(after.model.captureTime.done.length, total);
  assert.equal(after.readiness.tasks.direction.counts['zero-review'], total, 'direction is still open');
});
