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
import { PHOTO_COMPLETION_TARGETS, selectionScope, canAdoptPhotographer, canSetOnMap, completionCounts, completionSummary, photoCaptureTimeSchemaWarning, photoExportLevels, completionRecommendations, initialCompletionTask, isHeldBack, liveSelection, manualFillRows,
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

test('outstanding counts: per asset for time, a default direction is no work left, and omitted photographer never is', async () => {
  const { session, layerId } = await sharedOriginalLayer(jpeg('shared.jpg'));
  const { model } = completionView(session, layerId);
  assert.equal(task(model, 'captureTime').outstanding, 1);
  assert.equal(task(model, 'direction').outstanding, 0);
  assert.equal(task(model, 'direction').done, true);
  assert.equal(model.direction.groups[0].state, 'defaulted');
  assert.equal(model.direction.groups[0].rows.length, 2, 'direction still has one row per placement');
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

test('capture time: EXIF and GML that agree stay as separate values, and GML is the one used', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg', exifTime({ subsecond: '012' }))], { gml: [{ name: 'a.jpg', time: '2026-05-12T14:33:02' }] });
  const { captureTime } = completionView(session, layerId).model;
  const item = captureTime.done[0];
  assert.equal(item.state, 'accepted'); assert.equal(item.origin, 'source'); assert.equal(item.note, null);
  assert.deepEqual(item.sources.map(({ text }) => text), ['EXIF: 12.05.2026 14:33:02,012 · tidssone ukjent', 'GML · kilde.gml: 12.05.2026 14:33:02 · tidssone ukjent']);
  assert.equal(item.acceptedText, '12.05.2026 14:33:02 · tidssone ukjent · GML · kilde.gml');
  assert.equal(session.getPhoto(item.photoId).captureMetadata.captureTime.provenance.kind, 'gml');
});

test('capture time: sources that really differ use GML, say so calmly, and the per-photo route keeps the chosen source', async () => {
  const { session, layerId, ids: [id] } = await completionLayer([jpeg('a.jpg', exifTime())], { gml: [{ name: 'a.jpg', time: '2026-05-12T14:40:00' }] });
  const { model, readiness } = completionView(session, layerId);
  const item = model.captureTime.done[0];
  assert.equal(item.accepted.provenance.kind, 'gml');
  assert.equal(item.note, 'Kildene oppgir ulike tider. Den prioriterte kilden er brukt.');
  assert.equal(item.sources.length, 2);
  assert.deepEqual(completionRecommendations(readiness, 'captureTime').map(({ code }) => code), ['capture-time-sources-differ']);
  const evidenceId = session.getPhoto(id).metadataEvidence.find((source) => source.kind === 'exif').id;
  assert(session.setCaptureMetadata(layerId, [id], 'captureTime', null, { evidenceId }).ok);
  assert.equal(session.getPhoto(id).captureMetadata.captureTime.provenance.kind, 'exif');
  assert.equal(completionView(session, layerId).model.captureTime.done[0].sourcesDiffer, false, 'a person has settled it');
});

test('capture time: every remaining state has a row, and accepted values can only be replaced one photo at a time', async () => {
  const { session, layerId, ids: [, , , , acceptedMinute] } = await completionLayer(['full', 'minute', 'garbled', 'blank', 'accepted-minute'].map((name) => jpeg(`${name}.jpg`)), {
    gml: [{ name: 'full.jpg', time: '2026-05-12T14:33:02' }, { name: 'minute.jpg', time: '2026-05-12T14:33' }, { name: 'garbled.jpg', time: 'not a time' }] });
  session.setCaptureMetadata(layerId, [acceptedMinute], 'captureTime', '2026-05-12T14:33');
  const { captureTime } = completionView(session, layerId).model;
  assert.deepEqual(captureTime.groups.map(({ state, rows }) => [state, rows.length]), [['none', 1], ['partial', 2], ['unusable', 1]]);
  assert.deepEqual(captureTime.done.map(({ filename }) => filename), ['full.jpg']);
  assert.equal(row(captureTime.rows, 'minute.jpg').note, 'Har tid uten sekunder');
  assert.equal(row(captureTime.rows, 'accepted-minute.jpg').note, 'Har tid uten sekunder · Erstatter godtatt verdi');
  assert.match(row(captureTime.rows, 'accepted-minute.jpg').acceptedText, /14:33 · uten sekunder/);
  assert.match(row(captureTime.rows, 'garbled.jpg').sources[0].text, /not a time \(kan ikke tolkes sikkert\)/);
  assert.equal(row(captureTime.rows, 'blank.jpg').note, 'Ingen kildeverdi');
  assert.equal(row(captureTime.rows, 'accepted-minute.jpg').selectable, false);
  assert.equal(row(captureTime.rows, 'full.jpg').selectable, false);
  assert.equal(row(captureTime.rows, 'blank.jpg').selectable, true);
});

test('automatic acceptance never overwrites a manual value', async () => {
  const { session, layerId, ids: [first, second] } = await completionLayer([jpeg('a.jpg', exifTime()), jpeg('b.jpg', exifTime())]);
  session.setCaptureMetadata(layerId, [first], 'captureTime', '2020-01-01T10:00:00');
  const result = session.adoptSourceEvidence(layerId, 'captureTime', 'exif');
  assert.deepEqual([result.counts.adopted, result.counts.alreadyAccepted], [0, 2]);
  assert.equal(session.getPhoto(first).captureMetadata.captureTime.value.iso, '2020-01-01T10:00:00');
  assert.equal(session.getPhoto(second).captureMetadata.captureTime.provenance.kind, 'exif');
});

test('selection narrows an action and never widens it; nothing selected means all eligible', async () => {
  const { session, layerId } = await completionLayer(['a', 'b', 'c'].map((name) => jpeg(`${name}.jpg`)));
  const { rows } = completionView(session, layerId).model.direction;
  const [a, b] = rows;
  assert(rows.every((item) => item.state === 'defaulted' && item.selectable), 'a default can be selected for correction');
  assert.equal(scopedRows(rows, [], canSetOnMap).length, 3);
  assert.deepEqual(scopedRows(rows, [a.key], canSetOnMap).map(({ key }) => key), [a.key]);
  assert.equal(session.fillMissingPhotoValues(layerId, 'direction', 90, ids(scopedRows(rows, [a.key, b.key], canSetOnMap))).counts.adopted, 2);
  const after = completionView(session, layerId).model.direction;
  assert.deepEqual(after.done.map(({ filename }) => filename), ['a.jpg', 'b.jpg']);
  assert.deepEqual(liveSelection(after.rows, [a.key, b.key, 'removed']), [], 'accepted and removed rows drop out of the selection');
  assert.deepEqual(scopedRows(after.rows, [a.key], canSetOnMap), [], 'a selection with nothing eligible does not fall back to everything');
  assert.deepEqual(scopedRows(after.rows, selectionScope(after.rows, [a.key, b.key]), canSetOnMap), [], 'a used selection keeps narrowing, so a second click cannot widen it');
  assert.equal(scopedRows(after.rows, selectionScope(after.rows, []), canSetOnMap).length, 1, 'clearing it is what widens the action again');
  session.fillMissingPhotoValues(layerId, 'direction', 90, ids(after.rows.filter(canSetOnMap)));
  const finished = completionView(session, layerId).model.direction;
  assert.deepEqual(selectionScope(finished.rows, [a.key]), [], 'with nothing left to act on, the used selection is dropped');
});

test('manual fill reaches only an explicit selection', async () => {
  const { session, layerId } = await completionLayer(['a', 'b'].map((name) => jpeg(`${name}.jpg`)));
  const { rows } = completionView(session, layerId).model.captureTime;
  assert.deepEqual(manualFillRows(rows, []), [], 'one typed value can never reach every photo by default');
  assert.equal(session.fillMissingPhotoValues(layerId, 'captureTime', '2026-05-12T14:33:00', ids(manualFillRows(rows, [rows[0].key]))).counts.adopted, 1);
  assert.equal(completionView(session, layerId).model.captureTime.done[0].acceptedText, '12.05.2026 14:33:00 · tidssone ukjent · Manuell (samme verdi for flere)');
});

test('summary strip says where values came from, and leaves out what does not apply', async () => {
  const { session, layerId, ids: [, , manual] } = await completionLayer([jpeg('a.jpg', exifTime()), jpeg('b.jpg', exifTime()), jpeg('c.jpg', exifTime()), jpeg('d.jpg')]);
  session.setCaptureMetadata(layerId, [manual], 'captureTime', '2020-01-01T10:00:00');
  const { captureTime, direction } = completionView(session, layerId).model;
  const counts = (model, selected = []) => Object.fromEntries(completionSummary(model, selected).map(({ key, count }) => [key, count]));
  assert.deepEqual(counts(captureTime, ['x']), { source: 2, manual: 1, missing: 1, selected: 1 });
  assert.deepEqual(counts(direction), { default: 4 });
  assert.equal(completionCounts({ rows: [], done: [] }, [], canAdoptPhotographer).length, 5, 'Fotograf keeps its own strip');
});

test('EXIF direction is used automatically; a magnetic reference is listed, never used, and gives a default', async () => {
  const { session, layerId } = await completionLayer([jpeg('true.jpg', { direction: 90, directionRef: 'T' }), jpeg('magnetic.jpg', { direction: 90, directionRef: 'M' })]);
  const { direction } = completionView(session, layerId).model;
  assert.equal(row(direction.rows, 'true.jpg').state, 'accepted');
  assert.equal(row(direction.rows, 'true.jpg').acceptedText, '90° Ø · EXIF bilderetning (sann nord)');
  assert.equal(row(direction.rows, 'magnetic.jpg').state, 'defaulted');
  assert.equal(row(direction.rows, 'magnetic.jpg').acceptedText, '0° N');
  assert.match(row(direction.rows, 'magnetic.jpg').sources[0].text, /Ukjent eller magnetisk referanse/);
});

test('GML 0° is an ordinary accepted direction, kept apart from a default', async () => {
  const { session, layerId } = await completionLayer(['zero', 'east', 'none'].map((name) => jpeg(`${name}.jpg`)), { gml: [{ name: 'zero.jpg', direction: '0' }, { name: 'east.jpg', direction: '90' }] });
  const { model, readiness } = completionView(session, layerId);
  const { rows } = model.direction;
  assert.deepEqual(readiness.blocking, []);
  assert.deepEqual(rows.map(({ filename, state, origin }) => [filename, state, origin]), [['zero.jpg', 'accepted', 'source'], ['east.jpg', 'accepted', 'source'], ['none.jpg', 'defaulted', 'default']]);
  assert.equal(row(rows, 'zero.jpg').accepted.basis.kind, 'gml');
  assert.equal(canSetOnMap(row(rows, 'zero.jpg')), false, 'it needs no special route');
});

test('a different EXIF heading beside GML is noted calmly, and GML stays the value used', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg', { direction: 45, directionRef: 'T' })], { gml: [{ name: 'a.jpg', direction: '0' }] });
  const { model, readiness } = completionView(session, layerId);
  const [item] = model.direction.rows;
  assert.equal(item.state, 'accepted'); assert.equal(item.accepted.degrees, 0);
  assert.equal(item.note, 'Kildene oppgir ulike verdier. GML er brukt.');
  assert.equal(item.sources.length, 2);
  assert.deepEqual(completionRecommendations(readiness, 'direction').map(({ code }) => code), ['direction-sources-differ']);
});

test('EXIF and GML headings that differ only by rounding are not reported at all', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg', { direction: 45.4, directionRef: 'T' })], { gml: [{ name: 'a.jpg', direction: '45' }] });
  const { model, readiness } = completionView(session, layerId);
  assert.equal(model.direction.rows[0].sourcesDiffer, false);
  assert.equal(model.direction.rows[0].note, null);
  assert.deepEqual(completionRecommendations(readiness, 'direction'), []);
});

test('shared original: time is one row for the asset, direction one row per placement, and values can differ', async () => {
  const { session, layerId, ids: [first, second] } = await sharedOriginalLayer(jpeg('shared.jpg', exifTime({ direction: 45, directionRef: 'T' })));
  const { model } = completionView(session, layerId);
  assert.equal(model.captureTime.rows.length, 1);
  assert.deepEqual(model.direction.rows.map(({ occurrence }) => occurrence), ['Plassering 1 av 2', 'Plassering 2 av 2']);
  assert.equal(session.getPhoto(first).captureMetadata.captureTime.value.iso, session.getPhoto(second).captureMetadata.captureTime.value.iso);
  assert(session.applyPhotoEdits(session.beginPhotoEdits(layerId), [{ photoId: second, degrees: 200 }]).ok);
  assert.deepEqual([first, second].map((id) => session.getPhoto(id).direction.current.degrees), [45, 200]);
  assert.equal(task(completionView(session, layerId).model, 'direction').outstanding, 0);
});

test('pending EXIF: GML is used at once, no default is assigned yet, and the rest follows the read', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const session = evidenceSession({ extractGps: async (file) => { await gate; return readRealExif(file); } });
  const [time, blank] = session.importFiles([jpeg('time.jpg', exifTime({ direction: 45, directionRef: 'T' })), jpeg('blank.jpg')]).acceptedIds;
  const layerId = session.createLayer().id;
  await attachGml(session, layerId, completionGml([{ name: 'time.jpg', time: '2026-05-12T14:33:02', direction: '0' }]));
  placeAll(session, layerId, [time, blank]);

  const waiting = completionView(session, layerId);
  const { captureTime, direction } = waiting.model;
  assert.equal(row(captureTime.rows, 'time.jpg').state, 'accepted', 'GML is authoritative, so it does not wait for EXIF');
  assert.equal(row(direction.rows, 'time.jpg').accepted.degrees, 0);
  assert.equal(row(captureTime.rows, 'blank.jpg').state, 'pending');
  assert.equal(row(captureTime.rows, 'blank.jpg').selectable, false);
  assert.equal(row(direction.rows, 'blank.jpg').state, 'pending', 'a heading may still be on its way');
  assert.equal(row(direction.rows, 'blank.jpg').accepted, null);
  assert.deepEqual(completionRecommendations(waiting.readiness, 'captureTime').map(({ code }) => code), ['evidence-pending']);

  release();
  await settleExif(session, layerId);
  await tick();
  const ready = completionView(session, layerId).model;
  assert.equal(row(ready.captureTime.rows, 'blank.jpg').state, 'none');
  assert.equal(row(ready.direction.rows, 'blank.jpg').state, 'defaulted');
  assert.equal(row(ready.direction.rows, 'time.jpg').accepted.basis.kind, 'gml', 'a late EXIF heading does not displace GML');
});

test('photographer: EXIF Artist is used automatically, values are shown, and omitted targets keep the value in the app', async () => {
  const { session, layerId } = await completionLayer([jpeg('artist.jpg', { artist: 'Kari Nordmann' }), jpeg('blank.jpg')]);
  const after = completionView(session, layerId, LEGACY);
  assert.equal(row(after.model.photographer.rows, 'artist.jpg').state, 'accepted');
  assert.equal(row(after.model.photographer.rows, 'artist.jpg').sources[0].text, 'EXIF: Kari Nordmann');
  assert.equal(row(after.model.photographer.rows, 'blank.jpg').state, 'none');
  assert.deepEqual(scopedRows(after.model.photographer.rows, [], canAdoptPhotographer), []);
  assert.equal(after.model.photographer.done[0].acceptedText, 'Kari Nordmann · EXIF Artist');
  assert.equal(after.readiness.tasks.photographer.accepted, 1);
  assert.deepEqual(photographerSuggestions(after.model.photographer), ['Kari Nordmann']);
  assert.equal(completionView(session, layerId).readiness.notes.find((note) => note.code === 'photographer-omitted').count, 1);
  const blank = row(after.model.photographer.rows, 'blank.jpg');
  assert.equal(session.fillMissingPhotoValues(layerId, 'photographer', 'bad\u0001name', ids(manualFillRows(after.model.photographer.rows, [blank.key]))).ok, false, 'XML-invalid text is refused');
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
  const { session, layerId, ids: photoIds } = await completionLayer([jpeg('a.jpg')]);
  const text = () => photoCompletionStatus(completionView(session, layerId).readiness).text;
  assert.equal(text(), 'Kan eksporteres, men følger ikke Skråfoto 2019-skjemaet', 'Gemini without time is generated but is a schema gap');
  session.fillMissingPhotoValues(layerId, 'captureTime', '2026-05-12T14:33:00', photoIds);
  assert.equal(text(), 'Ingen opplysninger mangler for dette målet', 'a default direction is complete');
});

test('missing time: the warning is specific, and generation, schema and import are answered separately', async () => {
  const { session, layerId, ids: photoIds } = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg', exifTime())]);
  const { readiness } = completionView(session, layerId);
  assert.equal(readiness.levels.generation, 'possible');
  assert.equal(photoCaptureTimeSchemaWarning(readiness), '1 bilde mangler full opptakstid, så GML-filen oppfyller ikke Skråfoto 2019-skjemaet. Det er ikke verifisert at Gemini VA godtar en slik pakke.');
  assert.deepEqual(photoExportLevels(readiness).map(({ key, text }) => [key, text]), [['generation', 'Kan lages'],
    ['schema', 'Oppfylles ikke: opptakstid mangler for 1 bilde. XSD-validering er ikke kjørt.'], ['import', 'Ikke verifisert for denne pakken. Må testes manuelt.']]);
  assert.equal(photoCaptureTimeSchemaWarning(completionView(session, layerId, LEGACY).readiness), null, 'there it blocks, so it is an error and not this warning');
  session.fillMissingPhotoValues(layerId, 'captureTime', '2026-05-12T14:33:00', [photoIds[0]]);
  const filled = completionView(session, layerId).readiness;
  assert.equal(photoCaptureTimeSchemaWarning(filled), null);
  assert.deepEqual(photoExportLevels(filled).map(({ text }) => text).slice(1), ['Kravene er oppfylt etter regelsjekk. XSD-validering er ikke kjørt.', 'Profilen er importert tidligere, men denne pakken er ikke testet.']);
});

// Acceptance defect: Standard showed «valgfritt for Gemini VA», where a missing time blocks the export.
test('missing time: the group hint follows the chosen target, and only Gemini lets it through', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg', exifTime())]);
  const hint = (configuration) => completionView(session, layerId, configuration).model.captureTime.groups.find((group) => group.state === 'none').hint;
  assert.equal(hint({}), 'Ingen kilde har en brukbar tid. Eksporten kan lages uten, men GML-filen følger da ikke Skråfoto 2019-skjemaet.');
  assert.equal(hint(LEGACY), 'Ingen kilde har en brukbar tid. Opptakstid med sekunder kreves for Skråfoto 2019, og må fylles ut før eksport.');
  assert.equal(hint(ASBUILT), 'Ingen kilde har en brukbar tid. Opptakstid med sekunder kreves for AsBuilt 5.2, og må fylles ut før eksport.');
  for (const configuration of [LEGACY, ASBUILT]) {
    const { model, readiness } = completionView(session, layerId, configuration);
    assert.doesNotMatch(JSON.stringify(model.captureTime.groups.map((group) => group.hint)), /Gemini|valgfritt/, configuration.profile);
    assert.equal(readiness.blocking.some((item) => item.code === 'capture-time-required'), true, 'the rule is unchanged: Standard and AsBuilt block');
  }
  assert.equal(completionView(session, layerId).readiness.levels.generation, 'possible', 'the rule is unchanged: Gemini does not block');
});

test('counts and copy read correctly for one and for many', () => {
  assert.deepEqual([photoCount(1), photoCount(2), placementCount(1), placementCount(11), selectedPhotoCount(1), selectedPhotoCount(3), selectedPlacementCount(1), selectedPlacementCount(2)],
    ['1 bilde', '2 bilder', '1 plassering', '11 plasseringer', '1 valgt bilde', '3 valgte bilder', '1 valgt plassering', '2 valgte plasseringer']);
  assert.equal(singularCopy('1 bilder har tid i UTC.'), '1 bilde har tid i UTC.');
  assert.equal(singularCopy('11 bilder og 21 plasseringer'), '11 bilder og 21 plasseringer');
  assert.equal(singularCopy('Leser fortsatt bildedata for 1 bilder.'), 'Leser fortsatt bildedata for 1 bilde.');
  for (const [many, one] of [['1 punkter får Z=0', '1 punkt får Z=0'], ['1 XYZ-punkter i EPSG:5972', '1 XYZ-punkt i EPSG:5972'], ['1 originalbilder deles av flere plasseringer.', '1 originalbilde deles av flere plasseringer.'],
    ['1 godtatte fotografverdier er ikke med i denne leveransen.', '1 godtatt fotografverdi er ikke med i denne leveransen.'], ['1 godtatte fotografverdier utelates', '1 godtatt fotografverdi utelates'],
    ['1 features · 3 vedlegg · 1 delte originalbilder', '1 feature · 3 vedlegg · 1 delt originalbilde'], ['1 unike bilder i laget · 1 forekomster', '1 unikt bilde i laget · 1 forekomst'],
    ['1 objektkoblinger beholdes', '1 objektkobling beholdes'], ['1 uplasserte forekomster er utelatt.', '1 uplassert forekomst er utelatt.'],
    ['1 Z-plassholdere · 1 tidssoneendringer', '1 Z-plassholder · 1 tidssoneendring'], ['1 tidssone-suffikser fjernes', '1 tidssone-suffiks fjernes']]) assert.equal(singularCopy(many), one);
  assert.equal(singularCopy('21 punkter, 0 features og 101 originalbilder'), '21 punkter, 0 features og 101 originalbilder');
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
  assert.deepEqual(photoExportConfigFor(two, 'a'), { profile: 'asbuilt52', crs: 'EPSG:25832', context: { projectName: 'P' }, label: '' });
  assert.equal(photoExportConfigFor(two, 'b').profile, 'gemini-legacy2019', 'one layer never affects another');
  assert.equal(reconcilePhotoExportConfig(two, ['a', 'b']), two, 'unrelated session publishes do not re-render');
  assert.equal(reconcilePhotoExportConfig(two, ['b']).size, 0, 'layer deletion');
  assert.equal(reconcilePhotoExportConfig(two, []).size, 0, 'session reset');
});

test('nothing reaches export except accepted values: automatic source values arrive with no action at all', async () => {
  const { session, layerId } = await completionLayer(['a', 'b'].map((name) => jpeg(`${name}.jpg`, exifTime({ subsecond: '5', offsetTime: '+02:00', direction: 90, directionRef: 'T' }))));
  const plan = await buildPhotoExportPlan(capturePhotoExportSnapshot(session, layerId), { profile: 'gemini-legacy2019', crs: 'EPSG:25832' });
  assert.deepEqual(plan.errors, []);
  const xml = normalizeGeminiIdentifiers(serializePhotoExport(plan));
  assert.match(xml, /<app:retningsverdi>90<\/app:retningsverdi>/);
  assert.match(xml, /2026-05-12T14:33:02/);
});

test('reading the hub model changes nothing', async () => {
  const { session, layerId, ids: [id] } = await completionLayer([jpeg('a.jpg', exifTime())], { gml: [{ name: 'a.jpg', direction: '0' }] });
  const before = session.getPhoto(id);
  for (let turn = 0; turn < 3; turn++) completionView(session, layerId, ASBUILT);
  const after = session.getPhoto(id);
  assert.equal(after.direction, before.direction); assert.equal(after.captureMetadata, before.captureMetadata);
});

test('source boundaries: no export or Edit-mode code in the hub, no certification words, nothing suggesting 0°', async () => {
  const names = ['PhotoCompletionDialog.js', 'PhotoCompletionRows.js', 'PhotoCompletionTimePanel.js', 'PhotoCompletionDirectionPanel.js', 'PhotoCompletionDetailsPanels.js'];
  const sources = await Promise.all([...names.map((name) => readFile(new URL(`../src/components/photos/${name}`, import.meta.url), 'utf8')), readFile(new URL('../src/lib/photos/photoCompletion.mjs', import.meta.url), 'utf8')]);
  const all = sources.join('\n');
  assert.doesNotMatch(all, /buildPhotoExportPlan|serializePhotoExport|buildPhotoExportPackage|applyPhotoEdits|beginPhotoEdits|enterPhotoEditMode|localStorage|sessionStorage/);
  assert.doesNotMatch(all, /validert|godkjent|sertifisert|garantert/i);
  assert.doesNotMatch(all, /classifyCaptureTime|fullCaptureTime|evaluatePhotoExportRules/, 'classification stays in readiness and the rules');
  assert.doesNotMatch(all, /includeZero|Godta GML-retning|adoptSourceEvidence\(layerId, '(?:direction|captureTime)'/, 'source values need no adoption step');
  assert.match(all, /0° betyr nord, ikke ukjent retning\./);
});

test('private corpus: every time and direction is in place with no action, with no false conflicts', { skip: !corpusGmlPath && 'PHOTO_GML_FIXTURE is not set; the private corpus is opt-in.', timeout: 300000 }, async () => {
  const { photos, gml } = await readPhotoCorpus();
  const session = evidenceSession();
  session.importFiles(photos);
  const layerId = session.createLayer().id;
  await settleExif(session, layerId);
  await attachGml(session, layerId, gml);
  assert.equal(acceptGmlPositions(session, layerId).length, photos.length);
  const total = photos.length;

  const { model, readiness } = completionView(session, layerId);
  assert.equal(model.captureTime.done.length, total);
  assert.equal(model.captureTime.done.filter((item) => item.sourcesDiffer).length, 0);
  assert(model.captureTime.done.every((item) => item.sources.length === 2), 'both source values are available on every row');
  assert.equal(model.direction.done.length, total);
  assert(model.direction.done.every((item) => item.accepted.basis.kind === 'gml'));
  assert.deepEqual(readiness.blocking, []);
});
