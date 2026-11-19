import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCaptureTime } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { photoEstimatedDateModel } from '../src/lib/photos/photoEstimatedDates.mjs';
import { captureCompletionSignature, planCaptureCompletion, selectedCaptureCompletionRows, technicalCaptureCompletion } from '../src/lib/photos/photoCaptureCompletion.mjs';
import { formatPhotoCaptureTime, photoMetadataSourceLabel } from '../src/lib/photos/photoPresentation.mjs';
import { completionGml, completionLayer, completionView, jpeg } from './helpers/photoCompletionFixtures.mjs';

// M5 (Batch C): batch capture-date completion. Synthetic files and synthetic photo objects only.
const TODAY = '2026-11-19';
const byName = (session, layerId) => Object.fromEntries(session.getLayerPhotos(layerId).map((photo) => [photo.originalFilename, photo]));
const timeOf = (photo) => photo.captureMetadata.captureTime;
const names = (rows) => rows.map((row) => row.filename);

// ---- C-1: the median estimate, its thresholds and exclusions (pure) ----
let serial = 0;
const synthetic = (date, extra = {}) => {
  const id = `p${++serial}`;
  return { id, assetId: extra.assetId || id, originalFilename: extra.filename || `${id}.jpg`, spatial: { exifRead: { state: extra.pending ? 'pending' : 'viable' } },
    metadataEvidence: extra.evidence || [],
    captureMetadata: { captureTime: date ? { value: normalizeCaptureTime(date), provenance: extra.provenance || { kind: 'manual' } } : null, ...(extra.cleared ? { captureTimeCleared: true } : {}) } };
};
const days = (count, start = 1) => Array.from({ length: count }, (_, index) => `2026-10-${String(start + index).padStart(2, '0')}`);
const empty = (count) => Array.from({ length: count }, () => synthetic(null));

test('DC2 sufficiency: at least 3 known dates covering at least 25 % of the unique photos', () => {
  const at = (known, missing) => photoEstimatedDateModel([...days(known).map((date) => synthetic(date)), ...empty(missing)], { today: TODAY });
  assert.deepEqual([at(2, 0).proposal, at(2, 0).reason], [null, 'insufficient'], 'fewer than 3');
  assert.deepEqual([at(3, 9).proposal, at(3, 9).basis, at(3, 9).unique, at(3, 9).missing], ['prefill', 3, 12, 9], '3 of 12 is exactly 25 %');
  assert.deepEqual([at(3, 10).proposal, at(3, 10).reason], [null, 'insufficient'], '3 of 13 is under 25 %');
});

test('DC2/C1.3 spread: ≤ 7 days prefilled; any longer spread, even years, is offered on request', () => {
  const spread = (last) => photoEstimatedDateModel(['2026-10-01', '2026-10-02', last].map((date) => synthetic(date)).concat(empty(1)), { today: TODAY });
  assert.deepEqual([spread('2026-10-08').spreadDays, spread('2026-10-08').proposal, spread('2026-10-08').suggestedDate], [7, 'prefill', '2026-10-02']);
  assert.deepEqual([spread('2026-10-09').spreadDays, spread('2026-10-09').proposal], [8, 'confirm']);
  assert.deepEqual([spread('2026-11-01').spreadDays, spread('2026-11-01').proposal], [31, 'confirm']);
  // C1.3 (approved contract change): no maximum project duration; the median is still offered and must be chosen.
  assert.deepEqual([spread('2026-11-02').spreadDays, spread('2026-11-02').proposal, spread('2026-11-02').reason, spread('2026-11-02').suggestedDate], [32, 'confirm', null, '2026-10-02']);
  const years = photoEstimatedDateModel(['2023-03-01', '2024-06-15', '2025-09-30', '2026-10-01'].map((date) => synthetic(date)).concat(empty(2)), { today: TODAY });
  assert.deepEqual([years.spreadDays > 1000, years.proposal, years.suggestedDate, years.first, years.last, years.basis, years.missing],
    [true, 'confirm', '2024-06-15', '2023-03-01', '2026-10-01', 4, 2], 'lower-middle median over several years');
});

test('median: odd and even counts, unique originals, and any precision of accepted date', () => {
  const shared = synthetic('2026-10-09T10:00', { assetId: 'shared' });
  const model = photoEstimatedDateModel([synthetic('2026-10-06'), synthetic('2026-10-07T08:00:00'), synthetic('2026-10-08T09:30'), shared,
    { ...shared, id: 'shared-2' }, ...empty(2)], { today: TODAY });
  assert.deepEqual([model.basis, model.unique, model.median, model.first, model.last], [4, 6, '2026-10-07', '2026-10-06', '2026-10-09'], 'the repeated original counts once; even count takes the lower middle');
  assert.equal(photoEstimatedDateModel(['2026-10-06', '2026-10-09', '2026-10-07'].map((date) => synthetic(date)), { today: TODAY }).median, '2026-10-07');
});

test('targets and basis: usable unaccepted source dates, filename dates, removals, estimates and pending EXIF are excluded', () => {
  const gmlEvidence = [{ field: 'captureTime', kind: 'gml', id: 'gml-1', value: normalizeCaptureTime('2026-10-20T10:00:00') }];
  const photos = [...days(4).map((date) => synthetic(date)),
    synthetic(null, { evidence: gmlEvidence }), synthetic(null, { filename: 'IMG_20261007_094633.jpg' }), synthetic(null, { cleared: true }),
    synthetic('2026-12-24', { provenance: { kind: 'manual', estimated: true } }), synthetic(null, { pending: true }), synthetic(null)];
  const model = photoEstimatedDateModel(photos, { today: TODAY });
  assert.equal(model.basis, 4, 'neither the estimate nor unaccepted evidence joins the basis');
  assert.deepEqual(model.targetIds, [photos.at(-1).id], 'only the photo with no date evidence at all is a target');
});

// ---- C-1/C-2: source, filename and technical steps on a real session ----
test('source dates: complete, minute and date-only are offered apart; conflicts never; the most precise agreeing value wins', async () => {
  const { session, layerId } = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg'), jpeg('d.jpg'), jpeg('e.jpg'), jpeg('known.jpg', { captureTime: '2026:05:12 08:00:00' })],
    { place: false, gml: [{ name: 'a.jpg', time: '2026-05-12T10:00:00' }, { name: 'b.jpg', time: '2026-05-12T10:30' }, { name: 'c.jpg', time: '2026-05-12' },
      { name: 'd.jpg', time: '2026-05-12' }, { name: 'e.jpg', time: '2026-05-12T11:00:00' }] });
  try {
    // A second GML: d.jpg gains an agreeing minute value; e.jpg a different time (a conflict).
    assert(await session.stageLayerSource(layerId, completionGml([{ name: 'd.jpg', time: '2026-05-12T09:15' }, { name: 'e.jpg', time: '2026-05-12T12:00:00' }], 'andre.gml')));
    assert(session.applyLayerSource(layerId));
    const plan = planCaptureCompletion(session.getLayerPhotos(layerId), { today: TODAY });
    assert.deepEqual([names(plan.source.complete), names(plan.source.minute), names(plan.source.date)], [['a.jpg'], ['b.jpg', 'd.jpg'], ['c.jpg']]);
    assert.equal(plan.source.minute.find((row) => row.filename === 'd.jpg').value.iso, '2026-05-12T09:15', 'DC3: the more precise agreeing value');
    const before = byName(session, layerId);
    let published = 0; const unsubscribe = session.subscribe(() => published++);
    const rows = selectedCaptureCompletionRows(plan, { step: 'source', groups: ['complete', 'date'] });
    const result = session.completeCaptureTimes(layerId, { step: 'source', groups: ['complete', 'date'], expected: captureCompletionSignature(rows) });
    unsubscribe();
    assert.deepEqual([result.ok, result.count, published], [true, 2, 1]);
    const after = byName(session, layerId);
    assert.equal(timeOf(after['a.jpg']).value.iso, '2026-05-12T10:00:00');
    assert.deepEqual([timeOf(after['a.jpg']).provenance.kind, timeOf(after['a.jpg']).provenance.via], ['gml', 'completion']);
    assert.equal(timeOf(after['c.jpg']).value.iso, '2026-05-12');
    for (const name of ['b.jpg', 'd.jpg', 'e.jpg', 'known.jpg']) assert.strictEqual(timeOf(after[name]), timeOf(before[name]), `${name} unchanged`);
    assert.deepEqual(session.undoCaptureTimeFill(result.undoToken), { ok: true, restored: 2, skipped: 0 });
    assert.equal(timeOf(byName(session, layerId)['a.jpg']), null);
  } finally { session.clear(); }
});

test('filename dates for layer photos: only without usable EXIF or GML time, complete and date-only apart, provenance filename', async () => {
  const { session, layerId } = await completionLayer([jpeg('IMG_20261007_094633.jpg'), jpeg('2026-10-08.jpg'), jpeg('foto_2026-10-07_0946.jpg'),
    jpeg('IMG_20261009_101010.jpg', { captureTime: '2026:10:09 10:10:10' }), jpeg('20261010.jpg')], { place: false, gml: [{ name: '20261010.jpg', time: '2026-10-10T08:00:00' }] });
  try {
    const plan = planCaptureCompletion(session.getLayerPhotos(layerId), { today: TODAY });
    assert.deepEqual([names(plan.filename.complete), names(plan.filename.minute), names(plan.filename.date)],
      [['IMG_20261007_094633.jpg'], ['foto_2026-10-07_0946.jpg'], ['2026-10-08.jpg']], 'EXIF and GML photos are not offered a filename date');
    assert.deepEqual(names(plan.source.complete), ['20261010.jpg'], 'the GML time is offered by the source step instead');
    const result = session.completeCaptureTimes(layerId, { step: 'filename', groups: ['complete', 'minute', 'date'] });
    assert.equal(result.count, 3);
    const after = byName(session, layerId);
    assert.deepEqual([timeOf(after['2026-10-08.jpg']).provenance.kind, timeOf(after['2026-10-08.jpg']).provenance.via, timeOf(after['2026-10-08.jpg']).value.precision], ['filename', 'completion', 'date']);
  } finally { session.clear(); }
});

test('technical completion: noon for a date, 00 seconds for a minute; known components, offset and provenance kept; labelled; undo exact', async () => {
  const { session, layerId, ids } = await completionLayer([jpeg('date.jpg'), jpeg('minute.jpg'), jpeg('second.jpg'), jpeg('estimated.jpg'), jpeg('cleared.jpg')]);
  try {
    session.setCaptureMetadata(layerId, [ids[0]], 'captureTime', '2026-10-07');
    session.setCaptureMetadata(layerId, [ids[1]], 'captureTime', '2026-10-07T09:46+02:00');
    session.setCaptureMetadata(layerId, [ids[2]], 'captureTime', '2026-10-07T09:46:33');
    session.setCaptureMetadata(layerId, [ids[3]], 'captureTime', '2026-10-07', { estimated: true });
    session.setCaptureMetadata(layerId, [ids[4]], 'captureTime', null);
    const before = byName(session, layerId);
    const plan = planCaptureCompletion(session.getLayerPhotos(layerId), { today: TODAY });
    assert.deepEqual([names(plan.technical.noon), names(plan.technical.seconds)], [['date.jpg'], ['minute.jpg']], 'DC1: estimated dates are not offered; seconds are never altered');
    const result = session.completeCaptureTimes(layerId, { step: 'technical', groups: ['noon', 'seconds'] });
    assert.deepEqual([result.ok, result.count], [true, 2]);
    const after = byName(session, layerId);
    const date = timeOf(after['date.jpg']), minute = timeOf(after['minute.jpg']);
    assert.equal(date.value.iso, '2026-10-07T12:00:00');
    assert.equal(minute.value.iso, '2026-10-07T09:46:00+02:00');
    assert.equal(date.provenance.kind, 'manual', 'the original provenance is kept');
    assert.deepEqual(date.provenance.technical, { kind: 'noon', from: timeOf(before['date.jpg']).value });
    assert.deepEqual(formatPhotoCaptureTime(date.value, date.provenance), { text: '07.10.2026 12:00:00', notes: ['Klokkeslett teknisk utfylt', 'tidssone ukjent'] });
    assert.deepEqual(formatPhotoCaptureTime(minute.value, minute.provenance).notes, ['Sekunder teknisk utfylt']);
    assert.equal(photoMetadataSourceLabel('captureTime', date.provenance), 'Manuell · teknisk utfylt');
    assert.equal(technicalCaptureCompletion(date), null, 'never completed twice');
    // Readiness states it once, and Gemini export now carries the full value.
    const readiness = completionView(session, layerId).readiness;
    assert.match(readiness.notes.concat(readiness.recommendations).find((item) => item.code === 'capture-time-technical').message, /^2 bilder har teknisk utfylt klokkeslett eller sekunder\. De utfylte delene er ikke målt, og merkingen er ikke med i GML-filen\.$/);
    // C1.5: a user decision is information, never something to check, and never sets the overall status by itself.
    assert.equal(readiness.recommendations.some((item) => item.code === 'capture-time-technical'), false);
    for (const name of ['second.jpg', 'estimated.jpg', 'cleared.jpg']) assert.strictEqual(timeOf(after[name]), timeOf(before[name]));
    // Undo restores the original value exactly, unless it was changed since.
    session.setCaptureMetadata(layerId, [ids[1]], 'captureTime', '2026-10-07T09:47:00');
    assert.deepEqual(session.undoCaptureTimeFill(result.undoToken), { ok: true, restored: 1, skipped: 1 });
    assert.strictEqual(timeOf(byName(session, layerId)['date.jpg']).value, timeOf(before['date.jpg']).value);
  } finally { session.clear(); }
});

test('protection: accepted and removed values are never written; a stale review writes nothing', async () => {
  const { session, layerId, ids } = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('IMG_20261007_094633.jpg')], { place: false,
    gml: [{ name: 'a.jpg', time: '2026-05-12T10:00:00' }, { name: 'b.jpg', time: '2026-05-12T11:00:00' }] });
  try {
    session.setCaptureMetadata(layerId, [ids[1]], 'captureTime', null);
    session.setCaptureMetadata(layerId, [ids[2]], 'captureTime', null);
    const plan = planCaptureCompletion(session.getLayerPhotos(layerId), { today: TODAY });
    assert.deepEqual(names(plan.source.complete), ['a.jpg'], 'the removal is kept');
    assert.deepEqual(names([...plan.filename.complete, ...plan.filename.date]), [], 'the removal is kept');
    const expected = captureCompletionSignature(selectedCaptureCompletionRows(plan, { step: 'source', groups: ['complete'] }));
    session.setCaptureMetadata(layerId, [ids[0]], 'captureTime', '2026-05-12T09:00:00');
    const before = byName(session, layerId);
    assert.deepEqual(session.completeCaptureTimes(layerId, { step: 'source', groups: ['complete'], expected }), { ok: false, error: 'nothing-selected' });
    assert.strictEqual(timeOf(byName(session, layerId)['a.jpg']), timeOf(before['a.jpg']));
    assert.deepEqual(session.completeCaptureTimes(layerId, { step: 'estimate' }), { ok: false, error: 'invalid-field' });
  } finally { session.clear(); }
});

test('a changed plan between review and button refuses with review-changed and writes nothing', async () => {
  const { session, layerId, ids } = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg')], { place: false,
    gml: [{ name: 'a.jpg', time: '2026-05-12T10:00:00' }, { name: 'b.jpg', time: '2026-05-12T11:00:00' }] });
  try {
    const plan = planCaptureCompletion(session.getLayerPhotos(layerId), { today: TODAY });
    const expected = captureCompletionSignature(selectedCaptureCompletionRows(plan, { step: 'source', groups: ['complete'] }));
    session.setCaptureMetadata(layerId, [ids[1]], 'captureTime', '2026-05-12T09:00:00');
    const before = byName(session, layerId);
    assert.deepEqual(session.completeCaptureTimes(layerId, { step: 'source', groups: ['complete'], expected }), { ok: false, error: 'review-changed' });
    assert.strictEqual(timeOf(byName(session, layerId)['a.jpg']), timeOf(before['a.jpg']));
  } finally { session.clear(); }
});

// ---- Evening acceptance corrections (C1.1–C1.5) ----
test('C1.4: a known date is sufficient for Gemini; strict targets keep incomplete times as work left; schema stays accurate', async () => {
  const { session, layerId, ids } = await completionLayer([jpeg('date.jpg'), jpeg('minute.jpg'), jpeg('full.jpg'), jpeg('blank.jpg')]);
  try {
    session.setCaptureMetadata(layerId, [ids[0]], 'captureTime', '2026-10-07');
    session.setCaptureMetadata(layerId, [ids[1]], 'captureTime', '2026-10-07T09:46');
    session.setCaptureMetadata(layerId, [ids[2]], 'captureTime', '2026-10-07T09:46:33');
    const gemini = completionView(session, layerId);
    assert.equal(gemini.model.captureTime.outstanding, 1, 'only blank.jpg lacks a usable accepted date');
    assert.deepEqual(gemini.model.captureTime.groups.map((group) => group.state), ['none'], 'no incomplete-time problem list');
    assert.deepEqual(gemini.model.captureTime.done.map((row) => [row.filename, row.precisionState ?? null]).sort(),
      [['date.jpg', 'partial'], ['full.jpg', null], ['minute.jpg', 'partial']]);
    assert.equal(gemini.readiness.levels.schema.met, false, 'the formal Skråfoto 2019 assessment is unchanged');
    assert.deepEqual(gemini.readiness.levels.schema.gaps.find((gap) => gap.field === 'captureTime'), { field: 'captureTime', count: 3, missing: 1, insufficientPrecision: 2 });
    for (const profile of ['legacy2019', 'asbuilt52']) {
      const strict = completionView(session, layerId, { profile, context: {} });
      assert.equal(strict.model.captureTime.outstanding, 3, `${profile}: the strict contract still needs complete times`);
      assert.equal(strict.readiness.blocking.some((item) => item.code === 'capture-time-precision'), true, `${profile} still blocks`);
      assert.match(strict.model.captureTime.groups.find((group) => group.state === 'partial').hint, /krever klokkeslett med sekunder/);
    }
  } finally { session.clear(); }
});

test('C1.5: interpreted, estimated and technically completed dates are information and never set the status on their own', async () => {
  const { session, layerId, ids } = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')]);
  try {
    session.setCaptureMetadata(layerId, [ids[0]], 'captureTime', '2026-10-07T09:46:33');
    session.setCaptureMetadata(layerId, [ids[1]], 'captureTime', '2026-10-07', { estimated: true });
    session.setCaptureMetadata(layerId, [ids[2]], 'captureTime', '2026-10-07T09:46');
    assert(session.completeCaptureTimes(layerId, { step: 'technical', groups: ['seconds'] }).ok);
    const { readiness } = completionView(session, layerId);
    const codes = (items) => items.map((item) => item.code);
    assert.deepEqual(codes(readiness.recommendations).filter((code) => code.startsWith('capture-time')), []);
    assert(codes(readiness.notes).includes('capture-time-estimated') && codes(readiness.notes).includes('capture-time-technical'));
    assert.equal(readiness.status, 'ready', 'no «Kan eksporteres, men noe bør kontrolleres» from user decisions');
  } finally { session.clear(); }
});

test('C1.1/C1.2: explanations and results come from the actual rows, provenance and write counts', async () => {
  const { technicalCompletionExplanation, captureStepResultText } = await import('../src/lib/photos/photoCompletion.mjs');
  const rows = [{ kind: 'seconds', provenance: { kind: 'filename' } }, { kind: 'seconds', provenance: { kind: 'filename' } }, { kind: 'noon', provenance: { kind: 'exif' } }];
  const gemini = technicalCompletionExplanation(rows, 'recommended', 'Skråfoto 2019');
  assert.match(gemini, /^1 bilde har bare dato, og 2 bilder har dato og klokkeslett uten sekunder \(2 tolket fra filnavn, 1 fra EXIF\)\./);
  assert.match(gemini, /Datoen er nok for leveransen\. Skråfoto 2019-skjemaet krever likevel klokkeslett med sekunder/);
  assert.match(gemini, /de utfylte delene er ikke målt/);
  assert.match(technicalCompletionExplanation(rows.slice(2), 'required', 'Skråfoto 2019'), /^1 bilde har bare dato \(1 fra EXIF\)\. Skråfoto 2019 krever klokkeslett med sekunder, så disse bildene må fullføres før eksport\./);
  assert.equal(captureStepResultText('technical', { count: 66, counts: { noon: 0, seconds: 66 } }),
    'Teknisk utfylt for 66 bilder: 66 fikk 00 sekunder. Dato og kjente klokkeslett er beholdt, og de utfylte delene er ikke målt.');
  assert.equal(captureStepResultText('filename', { count: 2, counts: { complete: 1, date: 1 } }),
    'Tolket fra filnavn og godtatt for 2 bilder: 1 med dato og klokkeslett, 1 med kun dato. Verdiene er tolket, ikke målt. Godtatte og fjernede verdier er beholdt.');
  assert.equal(captureStepResultText('source', { count: 3, counts: { complete: 3 }, kinds: { exif: 2, gml: 1 } }),
    'Godtatt for 3 bilder: 3 med dato og klokkeslett (2 fra EXIF, målt av kameraet, 1 fra GML). Godtatte og fjernede verdier er beholdt.');
  const { session, layerId, ids } = await completionLayer([jpeg('a.jpg'), jpeg('b.jpg')]);
  try {
    session.setCaptureMetadata(layerId, ids, 'captureTime', '2026-10-07T09:46');
    const result = session.completeCaptureTimes(layerId, { step: 'technical', groups: ['seconds'] });
    assert.deepEqual([result.count, result.counts.seconds, result.kinds], [2, 2, { manual: 2 }], 'actual written count and original source');
  } finally { session.clear(); }
});

test('C1.5: the delivery report lists capture-time decisions under Informasjon and does not count them as notes', async () => {
  const { deliveryDiagnostics, deliveryReviewStatus } = await import('../src/lib/delivery/deliveryWizard.mjs');
  const plan = { errors: [], warnings: ['capture-time-filename', 'capture-time-estimated', 'capture-time-technical'].map((code) => ({ code, message: `${code} text` })) };
  const groups = deliveryDiagnostics(plan);
  assert.deepEqual([groups.warnings.length, groups.info.map((item) => item.code)], [0, ['capture-time-filename', 'capture-time-estimated', 'capture-time-technical']]);
  assert.equal(deliveryReviewStatus(plan), 'Kontroll fullført · ingen merknader');
});
