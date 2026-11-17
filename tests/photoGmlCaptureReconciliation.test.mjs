import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCaptureTime } from '../src/lib/photos/photoCaptureMetadata.mjs';
import { estimatedCaptureTime } from '../src/lib/photos/photoEstimatedDates.mjs';
import { captureTimeProtectionClass, planGmlCaptureTimeReconciliation } from '../src/lib/photos/photoGmlCaptureReconciliation.mjs';
import { matchPhotoReferences } from '../src/lib/photos/photoReferenceMatching.mjs';

// Synthetic values only. Accepted shapes mirror what the session writes for each provenance.
const v = (iso) => { const value = normalizeCaptureTime(iso); assert(value, iso); return value; };
const accepted = {
  none: () => null,
  'exif-auto': (iso) => ({ value: v(iso), provenance: { kind: 'exif', evidenceId: 'exif:captureTime', tag: 'DateTimeOriginal' }, acceptance: 'auto', acceptedAt: 1 }),
  'exif-chosen': (iso) => ({ value: v(iso), provenance: { kind: 'exif', evidenceId: 'exif:captureTime', tag: 'DateTimeOriginal' }, acceptedAt: 1 }),
  filename: (iso) => ({ value: v(iso), provenance: { kind: 'filename', raw: 'x.jpg', token: 't', pattern: 'p', via: 'import-suggestion' }, acceptedAt: 1 }),
  gml: (iso) => ({ value: v(iso), provenance: { kind: 'gml', evidenceId: 'src-old:e1:captureTime', sourceId: 'src-old' }, acceptedAt: 1 }),
  manual: (iso) => ({ value: v(iso), provenance: { kind: 'manual' }, acceptedAt: 1 }),
  estimated: (date) => ({ value: estimatedCaptureTime(date), provenance: { kind: 'manual', estimated: true }, acceptedAt: 1 }),
};
const asset = (id, captureTime, extra = {}) => ({ id, originalFilename: `${id}.jpg`, captureMetadata: { captureTime, photographer: null, ...extra } });
const entry = (id, fotolink, photographedAtText) => ({ id, status: 'viable', raw: { fotolink, ...(photographedAtText === undefined ? {} : { photographedAtText }) } });
const gml = (entries, id = 'src-new') => ({ id, kind: 'gml', filename: `${id}.gml`, entries });
const single = (current, incoming, extra) => planGmlCaptureTimeReconciliation([asset('a', current, extra)], gml([entry('e1', 'a.jpg', incoming)]));
const CATEGORIES = ['fill', 'fillPartial', 'completions', 'reviewRows', 'conflicts', 'unchanged', 'ambiguous', 'pending'];
const outcome = (plan) => {
  const hits = CATEGORIES.filter((key) => plan[key].length);
  assert.ok(hits.length <= 1, `one category per asset, got ${hits}`);
  return hits[0] || null;
};

const AGREE_COMPLETE = '2026-10-14T14:33:02', DIFF_COMPLETE = '2026-10-15T15:33:02';
const AGREE_DATE = '2026-10-14', DIFF_DATE = '2026-10-15', AGREE_MINUTE = '2026-10-14T14:33', DIFF_MINUTE = '2026-10-14T15:33';

// §6.2, one row per current value. Columns: complete agrees, complete differs, partial (date) agrees, partial differs,
// and, where the plan distinguishes it, partial (minute) agrees.
const MATRIX = [
  ['none', null, ['fill', null, 'fillPartial', null, 'fillPartial']],
  ['exif-auto', AGREE_COMPLETE, ['unchanged', 'conflicts', 'unchanged', 'conflicts', 'unchanged']],
  ['exif-chosen', AGREE_COMPLETE, ['unchanged', 'conflicts', 'unchanged', 'conflicts', 'unchanged']],
  ['filename', AGREE_COMPLETE, ['unchanged', 'conflicts', 'unchanged', 'conflicts', 'unchanged']],
  ['filename', AGREE_MINUTE, ['completions', 'conflicts', 'unchanged', 'conflicts', 'unchanged']],
  ['filename', AGREE_DATE, ['completions', 'conflicts', 'unchanged', 'conflicts', 'completions']],
  ['gml', AGREE_COMPLETE, ['unchanged', 'conflicts', 'unchanged', 'conflicts', 'unchanged']],
  ['gml', AGREE_MINUTE, ['reviewRows', 'conflicts', 'unchanged', 'conflicts', 'unchanged']],
  ['manual', AGREE_COMPLETE, ['unchanged', 'conflicts', 'unchanged', 'conflicts', 'unchanged']],
  ['manual', AGREE_MINUTE, ['reviewRows', 'conflicts', 'unchanged', 'conflicts', 'unchanged']],
  ['manual', AGREE_DATE, ['reviewRows', 'conflicts', 'unchanged', 'conflicts', 'reviewRows']],
  ['estimated', AGREE_DATE, ['reviewRows', 'conflicts', 'unchanged', 'conflicts', 'unchanged']],
];
const COLUMNS = [AGREE_COMPLETE, DIFF_COMPLETE, AGREE_DATE, DIFF_DATE, AGREE_MINUTE];

for (const [cls, iso, expected] of MATRIX) {
  test(`§6.2 matrix: current ${cls}${iso ? ` (${v(iso).precision})` : ''}`, () => {
    COLUMNS.forEach((incoming, index) => {
      if (expected[index] === null) return;
      const current = accepted[cls](iso);
      const plan = single(current, incoming);
      assert.equal(outcome(plan), expected[index], `${cls} ${iso} vs GML ${incoming}`);
      const [row] = plan[expected[index]];
      assert.equal(row.current.class, cls);
      assert.equal(row.incoming.raw, incoming);
      if (current) assert.equal(row.current.value, current.value, 'the existing value is shown unchanged');
      if (['conflicts', 'reviewRows'].includes(expected[index])) assert.equal(row.defaultDecision, 'keep');
    });
  });
}

test('§6.2 matrix: a removed value is never offered, whatever GML says', () => {
  for (const incoming of [...COLUMNS, DIFF_MINUTE]) {
    const plan = single(null, incoming, { captureTimeCleared: true });
    assert.equal(outcome(plan), 'unchanged');
    assert.equal(plan.unchanged[0].reason, 'capture-time-cleared');
    assert.equal(plan.counts.optionComplete + plan.counts.optionPartial, 0);
  }
});

test('conflict rows carry both values, the source and the default «Behold gjeldende»', () => {
  const current = accepted['exif-auto'](AGREE_COMPLETE);
  const plan = single(current, DIFF_COMPLETE);
  const [row] = plan.conflicts;
  assert.deepEqual({ assetId: row.assetId, filename: row.filename, entryId: row.entryId, sourceId: row.sourceId, sourceFilename: row.sourceFilename,
    rule: row.rule, reason: row.reason, defaultDecision: row.defaultDecision },
  { assetId: 'a', filename: 'a.jpg', entryId: 'e1', sourceId: 'src-new', sourceFilename: 'src-new.gml', rule: 'R4', reason: 'capture-time-differs', defaultDecision: 'keep' });
  assert.equal(row.current.value.iso, AGREE_COMPLETE);
  assert.equal(row.current.provenance.kind, 'exif');
  assert.equal(row.current.acceptance, 'auto');
  assert.equal(row.proposedValue.iso, DIFF_COMPLETE);
  assert.equal(row.evidence.id, 'src-new:e1:captureTime');
  assert.equal(row.option, undefined, 'a conflict is never part of an ordinary option');
});

test('fills and completions belong to options; partial values never gain invented components', () => {
  const plan = planGmlCaptureTimeReconciliation([
    asset('a', null), asset('b', null), asset('c', null), asset('d', accepted.filename(AGREE_DATE)), asset('e', accepted.filename(AGREE_DATE)),
  ], gml([entry('e1', 'a.jpg', AGREE_COMPLETE), entry('e2', 'b.jpg', AGREE_DATE), entry('e3', 'c.jpg', AGREE_MINUTE),
    entry('e4', 'd.jpg', `${AGREE_COMPLETE}.25`), entry('e5', 'e.jpg', AGREE_MINUTE)]));
  assert.deepEqual(plan.fill.map((row) => [row.assetId, row.option, row.proposedValue.iso]), [['a', 'complete', AGREE_COMPLETE]]);
  assert.deepEqual(plan.fillPartial.map((row) => [row.assetId, row.proposedValue.iso, row.proposedValue.precision]),
    [['b', AGREE_DATE, 'date'], ['c', AGREE_MINUTE, 'minute']]);
  assert.deepEqual(plan.completions.map((row) => [row.assetId, row.option, row.proposedValue.iso]),
    [['d', 'complete', `${AGREE_COMPLETE}.25`], ['e', 'partial', AGREE_MINUTE]]);
  assert.deepEqual(plan.options, { complete: 2, partial: 3, partialHasMinute: true });
  assert.equal(plan.counts.optionComplete, 2);
  assert.equal(plan.counts.optionPartial, 3);
  assert.equal(single(null, AGREE_DATE).options.partialHasMinute, false);
});

test('manual protection: no manual, chosen or earlier-GML value appears in an ordinary option', () => {
  for (const cls of ['exif-chosen', 'gml', 'manual', 'estimated']) {
    for (const incoming of [...COLUMNS, DIFF_MINUTE]) {
      const current = accepted[cls](AGREE_DATE);
      const plan = single(current, incoming);
      assert.equal(plan.fill.length + plan.fillPartial.length + plan.completions.length, 0, `${cls} vs ${incoming}`);
      assert.equal(plan.options.complete + plan.options.partial, 0);
    }
  }
  const manualTime = single(accepted.manual('2026-10-14T09:00:00'), AGREE_COMPLETE);
  assert.equal(outcome(manualTime), 'conflicts', 'a GML time conflicting with a typed time is a conflict');
  assert.equal(manualTime.conflicts[0].defaultDecision, 'keep');
});

test('estimates are compared as dates; the technical noon is never treated as an observed time', () => {
  const noon = single(accepted.estimated(AGREE_DATE), '2026-10-14T12:00:00');
  assert.equal(outcome(noon), 'reviewRows', 'a GML noon is more precise than an estimated date, not equal to it');
  assert.equal(noon.reviewRows[0].reason, 'can-replace-estimate');
  assert.equal(noon.reviewRows[0].current.comparedAs, 'date');
  assert.equal(noon.reviewRows[0].current.value.iso, '2026-10-14T12:00:00', 'the stored estimate is shown as recorded');
  assert.equal(outcome(single(accepted.estimated(AGREE_DATE), '2026-10-14T23:59:59')), 'reviewRows', 'any clock on the same date agrees');
  assert.equal(outcome(single(accepted.estimated(AGREE_DATE), '2026-10-15T12:00:00')), 'conflicts');
  assert.equal(outcome(single(accepted.estimated(AGREE_DATE), AGREE_MINUTE)), 'unchanged',
    'a minute value would make the export-complete estimate incomplete');
  assert.equal(captureTimeProtectionClass({ captureTime: accepted.estimated(AGREE_DATE) }), 'estimated');
});

test('a second GML source never displaces an explicitly accepted earlier GML value', () => {
  const earlier = accepted.gml(AGREE_COMPLETE);
  assert.equal(outcome(single(earlier, DIFF_COMPLETE)), 'conflicts');
  assert.equal(outcome(single(earlier, `${AGREE_COMPLETE}.5`)), 'unchanged', 'a fraction is not a precision gain');
  assert.equal(outcome(single({ ...earlier, acceptance: 'auto' }, DIFF_COMPLETE)), 'conflicts', 'today\'s automatic GML value is protected too');
  // Re-planning the very source a value came from is a no-op.
  const same = { ...earlier, provenance: { kind: 'gml', evidenceId: 'src-new:e1:captureTime', sourceId: 'src-new' } };
  assert.equal(single(same, AGREE_COMPLETE).unchanged[0].reason, 'already-accepted');
});

test('a date-only value agrees with any clock on its date, so a different time on that date completes rather than conflicts', () => {
  assert.equal(outcome(single(accepted.filename(AGREE_DATE), '2026-10-14T15:33:02')), 'completions');
  assert.equal(outcome(single(accepted.manual(AGREE_DATE), '2026-10-14T15:33:02')), 'reviewRows');
  assert.equal(outcome(single(accepted.filename(AGREE_MINUTE), '2026-10-14T14:34:00')), 'conflicts');
});

test('timezones: unknown offsets agree with known ones, known offsets must match, and nothing is converted or borrowed', () => {
  const unknown = accepted['exif-auto'](AGREE_COMPLETE);
  const withOffset = single(unknown, `${AGREE_COMPLETE}+02:00`);
  assert.equal(outcome(withOffset), 'unchanged', 'a known offset is not a precision gain');
  assert.equal(withOffset.unchanged[0].current.value.offset, null);
  assert.equal(outcome(single(accepted['exif-auto'](`${AGREE_COMPLETE}+01:00`), `${AGREE_COMPLETE}+02:00`)), 'conflicts');
  assert.equal(outcome(single(accepted['exif-auto'](`${AGREE_COMPLETE}Z`), '2026-10-14T16:33:02+02:00')), 'conflicts',
    'the same instant with different wall clocks is not agreement');
  assert.equal(outcome(single(accepted['exif-auto'](`${AGREE_COMPLETE}Z`), `${AGREE_COMPLETE}+00:00`)), 'unchanged');
  const fill = single(null, AGREE_COMPLETE).fill[0];
  assert.equal(fill.proposedValue.offset, null);
  assert.equal(fill.proposedValue.timezoneKnown, false);
  const completion = single(accepted.filename(AGREE_MINUTE), `${AGREE_COMPLETE}+02:00`).completions[0];
  assert.equal(completion.proposedValue.iso, `${AGREE_COMPLETE}+02:00`, 'the GML value is proposed exactly as recorded');
});

test('missing, empty and invalid GML times propose nothing', () => {
  for (const [incoming, reason] of [[undefined, 'no-gml-capture-time'], ['', 'no-gml-capture-time'], ['14.10.2026', 'invalid-gml-capture-time'], ['2026-02-30', 'invalid-gml-capture-time']]) {
    const plan = single(null, incoming);
    assert.equal(outcome(plan), 'unchanged');
    assert.equal(plan.unchanged[0].reason, reason);
  }
});

test('one decision per physical asset, however many map occurrences reference it', () => {
  const occurrences = [
    { ...asset('kum-1', null), id: 'kum-1:occ-b', assetId: 'asset-x', originalFilename: 'x.jpg' },
    { ...asset('kum-2', null), id: 'kum-1:occ-a', assetId: 'asset-x', originalFilename: 'x.jpg' },
  ];
  const plan = planGmlCaptureTimeReconciliation(occurrences, gml([entry('e1', 'x.jpg', AGREE_COMPLETE)]));
  assert.equal(plan.fill.length, 1);
  assert.equal(plan.counts.assets, 1);
  assert.deepEqual(plan.fill[0].photoIds, ['kum-1:occ-a', 'kum-1:occ-b']);
  assert.equal(plan.fill[0].occurrenceCount, 2);
  assert.equal(plan.fill[0].assetId, 'asset-x');
});

test('duplicate GML references to one photo give no accepted proposal', () => {
  const plan = planGmlCaptureTimeReconciliation([asset('a', null), asset('b', null)],
    gml([entry('e1', 'a.jpg', AGREE_COMPLETE), entry('e2', 'a.jpg', AGREE_COMPLETE), entry('e3', 'b.jpg', AGREE_COMPLETE)]));
  assert.deepEqual(plan.ambiguous.map((row) => [row.assetId, row.reason, row.entryIds]), [['a', 'duplicate-gml-reference', ['e1', 'e2']]]);
  assert.deepEqual(plan.fill.map((row) => row.assetId), ['b']);
  // Even with differing values, an ambiguous reference never becomes a conflict row either.
  const differing = planGmlCaptureTimeReconciliation([asset('a', accepted['exif-auto'](AGREE_COMPLETE))],
    gml([entry('e1', 'a.jpg', DIFF_COMPLETE), entry('e2', 'Attachments/a.jpg', DIFF_COMPLETE)]));
  assert.equal(outcome(differing), 'ambiguous');
  // Two assets with the same basename: the reference is ambiguous for both.
  const twins = planGmlCaptureTimeReconciliation([
    { ...asset('p', null), originalFilename: 'same.jpg' }, { ...asset('q', null), originalFilename: 'same.jpg' },
  ], gml([entry('e1', 'same.jpg', AGREE_COMPLETE)]));
  assert.deepEqual(twins.ambiguous.map((row) => [row.assetId, row.reason]), [['p', 'duplicate-photo-reference'], ['q', 'duplicate-photo-reference']]);
  assert.equal(twins.counts.fill, 0);
});

test('a supplied ledger is honoured; inconsistent or stale edges fail closed', () => {
  const assets = [asset('a', null), asset('b', null)];
  const source = gml([entry('e1', 'a.jpg', AGREE_COMPLETE), entry('e2', 'b.jpg', AGREE_COMPLETE)]);
  const ledger = matchPhotoReferences(source.entries, assets);
  assert.deepEqual(planGmlCaptureTimeReconciliation(assets, source, ledger), planGmlCaptureTimeReconciliation(assets, source));
  const doubled = { matches: [{ entryId: 'e1', status: 'matched', photoId: 'a', photoIds: ['a'] }, { entryId: 'e2', status: 'matched', photoId: 'a', photoIds: ['a'] },
    { entryId: 'e9', status: 'matched', photoId: 'a', photoIds: ['a'] }, { entryId: 'e1', status: 'matched', photoId: 'gone', photoIds: ['gone'] }] };
  const plan = planGmlCaptureTimeReconciliation(assets, source, doubled);
  assert.equal(outcome(plan), 'ambiguous');
  assert.equal(plan.counts.stale, 2, 'unknown entries and assets are counted, never applied');
});

test('photos still being read for EXIF are held back instead of filled', () => {
  const plan = planGmlCaptureTimeReconciliation([{ ...asset('a', null), spatial: { exifRead: { state: 'pending' } } }], gml([entry('e1', 'a.jpg', AGREE_COMPLETE)]));
  assert.equal(outcome(plan), 'pending');
  assert.equal(plan.counts.optionComplete, 0);
});

test('unmatched photos and entries produce no rows; a source without entries gives an empty plan', () => {
  const plan = planGmlCaptureTimeReconciliation([asset('a', null), asset('b', null)], gml([entry('e1', 'a.jpg', AGREE_COMPLETE), entry('e2', 'zz.jpg', AGREE_COMPLETE)]));
  assert.deepEqual(plan.fill.map((row) => row.assetId), ['a']);
  assert.equal(plan.counts.assets, 2);
  const empty = planGmlCaptureTimeReconciliation([asset('a', null)], { id: 'gmi', kind: 'gmi', references: [] });
  assert.equal(CATEGORIES.reduce((sum, key) => sum + empty[key].length, 0), 0);
});

test('deterministic regardless of asset order, pure, and stable when planned repeatedly', () => {
  const assets = [asset('c', accepted['exif-auto'](AGREE_COMPLETE)), asset('a', null), asset('b', accepted.filename(AGREE_DATE)),
    asset('d', accepted.manual(AGREE_DATE)), asset('e', null, { captureTimeCleared: true })];
  const source = gml(['a', 'b', 'c', 'd', 'e'].map((id, index) => entry(`e${index}`, `${id}.jpg`, id === 'c' ? DIFF_COMPLETE : AGREE_COMPLETE)));
  const snapshot = JSON.stringify(assets);
  const forward = planGmlCaptureTimeReconciliation(assets, source);
  const reversed = planGmlCaptureTimeReconciliation([...assets].reverse(), { ...source, entries: [...source.entries].reverse() });
  assert.deepEqual(reversed, forward);
  assert.deepEqual(planGmlCaptureTimeReconciliation(assets, source), forward);
  assert.equal(JSON.stringify(assets), snapshot, 'inputs are never modified');
  assert.ok(Object.isFrozen(forward) && Object.isFrozen(forward.fill) && Object.isFrozen(forward.fill[0]));
  assert.deepEqual(forward.counts, { assets: 5, fill: 1, fillPartial: 0, completions: 1, reviewRows: 1, conflicts: 1, unchanged: 1,
    ambiguous: 0, pending: 0, stale: 0, optionComplete: 2, optionPartial: 0 });
});

test('applying every option proposal and re-planning leaves nothing to do', () => {
  const assets = [asset('a', null), asset('b', accepted.filename(AGREE_DATE)), asset('c', null)];
  const source = gml([entry('e1', 'a.jpg', AGREE_COMPLETE), entry('e2', 'b.jpg', AGREE_COMPLETE), entry('e3', 'c.jpg', AGREE_DATE)]);
  const first = planGmlCaptureTimeReconciliation(assets, source);
  const writes = new Map([...first.fill, ...first.fillPartial, ...first.completions].map((row) => [row.assetId,
    { value: row.proposedValue, provenance: { kind: 'gml', evidenceId: row.evidence.id, sourceId: row.sourceId, via: 'positioning-wizard' }, acceptedAt: 2 }]));
  const applied = assets.map((item) => (writes.has(item.id) ? { ...item, captureMetadata: { ...item.captureMetadata, captureTime: writes.get(item.id) } } : item));
  const second = planGmlCaptureTimeReconciliation(applied, source);
  assert.equal(second.counts.optionComplete + second.counts.optionPartial + second.counts.conflicts + second.counts.reviewRows, 0);
  assert.deepEqual(second.unchanged.map((row) => row.reason), ['already-accepted', 'already-accepted', 'already-accepted']);
});

test('protection classes', () => {
  assert.equal(captureTimeProtectionClass({}), 'none');
  assert.equal(captureTimeProtectionClass({ captureTime: null, captureTimeCleared: true }), 'removed');
  for (const cls of ['exif-auto', 'exif-chosen', 'filename', 'gml', 'manual']) assert.equal(captureTimeProtectionClass({ captureTime: accepted[cls](AGREE_COMPLETE) }), cls);
  assert.equal(captureTimeProtectionClass({ captureTime: { value: v(AGREE_COMPLETE), provenance: { kind: 'future-kind' } } }), 'manual', 'unknown kinds are protected');
  assert.equal(captureTimeProtectionClass({ captureTime: { ...accepted.manual(AGREE_COMPLETE), provenance: { kind: 'manual', mode: 'bulk' } } }), 'manual');
});
