import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { compileGmiEffectiveEdits, createGmiBatchCorrection, createGmiEditSession, createGmiEditSessions,
  createGmiObjectCorrection, createGmiProposedCache, dryRunGmiChangeSet, getGmiProposedBytes, getGmiProposedState,
  getGmiSourceBytes, isCurrentGmiDryRun, loadGmiSourceDocument, resolveGmiCell, stageGmiChangeSet, undoGmiEdit } from '../src/lib/gmi-edit/index.mjs';
import { internalGmiSourceState } from '../src/lib/gmi-edit/sourceDocument.mjs';
import { buildGmiFieldBatch, dryRunGmiFieldBatch, getGmiFieldBatchApproval, isCurrentGmiFieldBatchValidation,
  prepareGmiFieldBatch } from '../src/lib/gmiFieldBatchPlan.mjs';
import { compareGmiValidationRuns, diffGmiValidationFindings } from '../src/lib/validation-v2/findingDiff.js';
import { describeGmiEditColumns } from '../src/lib/gmiEditFields.mjs';
import { createLoadedGmiSources, isLoadedGmiSurveyLayer } from '../src/lib/photos/loadedGmiSource.mjs';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { discoverGmiFiles, loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';

const date = '2026-11-11';
const immediate = { referenceDate: date, yieldWork: async () => {} };
async function setup(bytes = gmiFieldBatchFixture()) {
  const document = await loadGmiSourceDocument(bytes);
  const session = createGmiEditSession(document, { layerId: 'g3' });
  return { bytes, document, session, handle: { layerId: 'g3', sessionId: 'g3-session', fingerprint: document.fingerprint } };
}
function change(view, values, scope = 'point', sourceIndex = 0) {
  const result = createGmiObjectCorrection(view.session, { scope, sourceIndex, values, mode: 'overwrite', conflictPolicy: 'replace' });
  assert.equal(result.ok, true);
  return result.changeSet;
}
async function prepare(view, sourceKey = 'Merknad', value = 'Kontrollert', indices = [0, 1], scope = 'point', selection) {
  const result = await prepareGmiFieldBatch(view, { scope, sourceKey, value, operation: 'set', selection,
    targets: selection ? undefined : indices.map((sourceIndex) => ({ scope, sourceIndex })) }, immediate);
  assert.equal(result.ok, true, result.code);
  return result.preview;
}
function verifyBytes(view, run) {
  assert.equal(run.ok, true, run.code);
  const staged = stageGmiChangeSet(view.session, run.changeSet);
  assert.equal(staged.ok, true);
  const compiled = compileGmiEffectiveEdits(staged.session);
  const edits = compiled.edits.map(({ target, lexeme }) => ({ ...target, lexeme }));
  assert.deepEqual(verifyCellChanges(loadGmiDocument(view.bytes), getGmiProposedBytes(run.proposed), edits).failures, []);
  assert.deepEqual(getGmiSourceBytes(view.document), view.bytes);
}

async function registryHarness() {
  const bytes = gmiFieldBatchFixture();
  const parser = new GMIParser(decodeGmiBytes(bytes));
  const { warningSummary, ...data } = parser.toObject();
  void warningSummary;
  const layer = { id: 'g3', name: 'Synthetic G3', file: { name: 'Synthetic G3.gmi', format: 'GMI' }, data };
  const getLayer = (id) => id === layer.id ? layer : null;
  const sources = createLoadedGmiSources({ getLayer });
  sources.register(layer.id, data, new File([bytes], layer.file.name), createGmiPhotoSource(parser));
  const publications = [];
  const cache = createGmiProposedCache();
  const registry = createGmiEditSessions({ sources, getLayer, isGmiLayer: isLoadedGmiSurveyLayer, cache,
    onChange: (...args) => publications.push(args) });
  const opened = await registry.open(layer.id);
  assert.equal(opened.ok, true);
  const view = registry.resolve(opened.handle);
  assert.equal(view.ok, true);
  return { registry, publications, cache, view: { ...view, bytes, handle: opened.handle } };
}

test('pure dry run leaves registry session, status revision, notifications, redo and original bytes untouched; real stage reuses cache', async () => {
  const { registry, publications, cache, view: openedView } = await registryHarness();
  const earlier = change(openedView, { Merknad: 'Earlier draft' });
  assert.equal(registry.stage(openedView.handle, earlier).ok, true);
  assert.equal(registry.undo(openedView.handle).ok, true);
  const view = { ...openedView, session: registry.getSession(openedView.handle).session };
  const status = registry.describe('g3'), count = publications.length, session = registry.getSession(view.handle).session;
  const candidate = change(view, { Merknad: 'Kontrollert' });
  const run = await dryRunGmiChangeSet(session, candidate, { ...immediate, cache });
  assert.equal(run.ok, true, run.code);
  assert.strictEqual(registry.getSession(view.handle).session, session);
  assert.deepEqual(registry.describe('g3'), status);
  assert.equal(publications.length, count);
  assert.equal(session.changeSets.length, 0);
  assert.equal(session.redo.length, 1);
  assert.strictEqual(session.redo[0], earlier);
  assert.equal(run.verification.ok, true);
  assert.equal(run.before.runContext.referenceDate, date);
  assert.equal(run.after.runContext.referenceDate, date);
  assert.notEqual(run.before.datasetRevision, run.after.datasetRevision);
  assert.equal(run.introduced.length, 0, 'reparse revisions alone cannot introduce findings');
  assert.equal(run.resolved.length, 0);
  verifyBytes(view, run);
  const computed = cache.stats().computations, hits = cache.stats().hits;
  const staged = registry.stage(view.handle, candidate);
  assert.equal(staged.ok, true);
  assert.strictEqual(registry.proposed(view.handle), run.proposed);
  assert.equal(cache.stats().computations, computed);
  assert(cache.stats().hits > hits);
  assert.equal(isCurrentGmiDryRun(run, staged.session, candidate, { referenceDate: date }), false);
});

test('cross-object NYTT-year consequence is introduced only by full dry run; reversal resolves it against the current proposed state', async () => {
  let view = await setup(gmiFieldBatchFixture({ lineFields: ['Tema', 'Stedfestingsårsak', 'Anleggsår'],
    lines: [['SP', 'NYTT', '2026'], ['SP', 'UENDR', '2025']] }));
  const preview = await prepare(view, 'Anleggsår', '2025', [0], 'line');
  assert(preview.rows.every((row) => !row.findings.some((finding) => finding.key.includes('POSITIONING_CAUSE_SHARED_NYTT_YEAR'))));
  const batch = buildGmiFieldBatch(view.session, preview);
  const checked = await dryRunGmiFieldBatch(view.session, batch, immediate);
  assert.equal(checked.ok, true, checked.code);
  const finding = checked.crossObject.introduced.find((entry) => entry.reasonCode === 'POSITIONING_CAUSE_SHARED_NYTT_YEAR');
  assert.equal(finding.objectRef.sourceIndex, 1);
  assert.equal(finding.objectRef.geometryScope, 'line');
  assert(checked.dryRun.byObject['line:1'].introduced.includes(finding));
  assert.equal(getGmiFieldBatchApproval(view.session, checked, { referenceDate: date }).ok, true);
  verifyBytes(view, checked.dryRun);
  view = { ...view, session: stageGmiChangeSet(view.session, batch.changeSet).session };
  const reverse = await dryRunGmiChangeSet(view.session, change(view, { Anleggsår: '2026' }, 'line'), immediate);
  assert(reverse.resolved.some((entry) => entry.reasonCode === 'POSITIONING_CAUSE_SHARED_NYTT_YEAR' && entry.objectRef.sourceIndex === 1));
  assert.equal(reverse.before.datasetRevision, checked.dryRun.after.datasetRevision);
  assert.equal(reverse.proposed.identical, true);
  assert.equal(reverse.verification.ok, true);
  verifyBytes(view, reverse);
});

test('shared finding diff distinguishes state/reason changes while ignoring reparse revisions and duplicate GUIDs', () => {
  const dataset = { points: [{ guid: 'duplicate' }, { guid: 'duplicate' }], lines: [{ guid: 'unique' }] };
  const finding = (scope, index, state, reasonCode, revision) => ({ ruleId: 'rule', canonicalFieldId: 'field', state, reasonCode,
    objectRef: { geometryScope: scope, sourceIndex: index, datasetRevision: revision } });
  const beforeFindings = [finding('point', 0, 'CHECK', 'old', 'before'), finding('point', 1, 'FAIL', 'same', 'before'), finding('line', 0, 'CHECK', 'one', 'before')];
  const afterFindings = [finding('point', 0, 'FAIL', 'new', 'after'), finding('point', 1, 'FAIL', 'same', 'after'), finding('line', 0, 'CHECK', 'two', 'after')];
  const run = (findings) => ({ layerId: 'g3', runContext: { referenceDate: date }, ruleResults: [{ findings }], schemaFindings: [] });
  const before = run(beforeFindings), after = run(afterFindings);
  assert.equal(compareGmiValidationRuns(before, after, dataset, dataset).severityChanged.length, 1, 'existing comparison semantics retained');
  const diff = diffGmiValidationFindings(before, after, dataset, dataset);
  assert.deepEqual(diff.newCounts, { fail: 1, check: 1 });
  assert.deepEqual(diff.resolvedCounts, { fail: 0, check: 2 });
  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.byObject['point:0'].introduced[0].state, 'FAIL');
  assert.equal(diff.byObject['point:1'], undefined);
  assert.equal(diff.byObject['line:0'].resolved[0].reasonCode, 'one');
  assert(Object.isFrozen(diff.byObject['point:0'].introduced));
});

test('Kontrolldato changes full findings, preserves date lexemes, and invalidates old results', async () => {
  const view = await setup(gmiFieldBatchFixture({ pointFields: ['Tema', 'Datafangstdato'], points: [['LOK', '2020-01-01']] }));
  for (const value of ['10.11.2026', '2026-11-10', '20261110']) {
    const candidate = change(view, { Datafangstdato: value });
    const early = await dryRunGmiChangeSet(view.session, candidate, { ...immediate, referenceDate: '2026-11-09' });
    assert.equal(early.ok, true);
    assert(early.introduced.some((finding) => finding.state === 'FAIL' && finding.reasonCode === 'DATE_FUTURE'));
    assert.equal(isCurrentGmiDryRun(early, view.session, candidate, { referenceDate: date }), false);
    const later = await dryRunGmiChangeSet(view.session, candidate, immediate);
    assert.equal(later.ok, true);
    assert(!later.introduced.some((finding) => finding.reasonCode === 'DATE_FUTURE'));
    assert(later.resolved.some((finding) => finding.reasonCode === 'DATE_OLDER_THAN_FIVE_YEARS'));
    assert.equal(later.proposed.edits[0].lexeme, value);
    assert.notStrictEqual(early.before, later.before);
  }
});

test('exact ChangeSet/session identity, foreign sets, no-ops and forged results cannot be approved', async () => {
  const view = await setup(), candidate = change(view, { Merknad: 'new' });
  const run = await dryRunGmiChangeSet(view.session, candidate, immediate);
  assert.equal(isCurrentGmiDryRun(run, view.session, candidate, { referenceDate: date }), true);
  assert.equal(isCurrentGmiDryRun(run, view.session, change(view, { Merknad: 'new' }), { referenceDate: date }), false);
  assert.equal(isCurrentGmiDryRun({ ...run }, view.session, candidate, { referenceDate: date }), false);
  const staged = stageGmiChangeSet(view.session, candidate).session;
  const undone = undoGmiEdit(staged).session;
  assert.equal(isCurrentGmiDryRun(run, undone, candidate, { referenceDate: date }), false);
  const foreign = createGmiEditSession(view.document, { layerId: 'g3' });
  assert.equal((await dryRunGmiChangeSet(foreign, candidate, immediate)).code, 'foreign-change-set');
  assert.equal((await dryRunGmiChangeSet(staged, candidate, immediate)).ok, false);
  assert.equal((await dryRunGmiChangeSet(view.session, change(view, { Merknad: '' }), immediate)).code, 'no-effective-cells');
  assert.equal((await dryRunGmiChangeSet(view.session, candidate, { ...immediate, referenceDate: 'invalid' })).code, 'invalid-reference-date');
  assert.equal((await dryRunGmiChangeSet(view.session, candidate, { ...immediate, layerId: 'other' })).code, 'layer-mismatch');
});

test('source corruption, actual proposed-path failure and cached-output corruption cannot produce approval evidence', async () => {
  const view = await setup();
  const preview = await prepare(view), batch = buildGmiFieldBatch(view.session, preview);
  const cache = createGmiProposedCache();
  const hypothetical = stageGmiChangeSet(view.session, batch.changeSet).session;
  cache.set(view.document, compileGmiEffectiveEdits(hypothetical).effectiveKey, { ok: false, stage: 'verify', rejections: [{ code: 'verification-failed' }] });
  const refused = await dryRunGmiFieldBatch(view.session, batch, { ...immediate, cache });
  assert.equal(refused.ok, false);
  assert.equal(refused.approvalReady, false);
  assert.equal(refused.dryRun.stage, 'verify');
  assert.equal(refused.dryRun.before, undefined);
  assert.equal(getGmiFieldBatchApproval(view.session, refused, { referenceDate: date }).ok, false);
  const good = await dryRunGmiFieldBatch(view.session, batch, immediate);
  assert.equal(good.ok, true);
  internalGmiSourceState(good.dryRun.proposed.document).bytes[0] ^= 1;
  assert.equal(isCurrentGmiFieldBatchValidation(view.session, good, { referenceDate: date }), false);
  const rebuilt = await dryRunGmiFieldBatch(view.session, batch, immediate);
  assert.equal(rebuilt.ok, true, 'derived corrupt cache is evicted and independently verified again');
  internalGmiSourceState(view.document).bytes[0] ^= 1;
  const broken = await dryRunGmiChangeSet(view.session, batch.changeSet, immediate);
  assert.equal(broken.code, 'verification-failed');
  assert.equal(broken.stage, 'integrity');
  assert.equal(getGmiFieldBatchApproval(view.session, rebuilt, { referenceDate: date }).ok, false);
});

test('cancellation at every phase and Kontrolldato changes during work publish no success', async () => {
  for (let stop = 1; stop <= 4; stop++) {
    const view = await setup();
    let count = 0, live = true;
    const run = await dryRunGmiChangeSet(view.session, change(view, { Merknad: 'new' }), {
      referenceDate: date, isLive: () => live, yieldWork: async () => { if (++count === stop) live = false; },
    });
    assert.equal(run.ok, false);
    assert.equal(run.code, 'cancelled');
    assert.equal(view.session.changeSets.length, 0);
    assert.deepEqual(getGmiSourceBytes(view.document), view.bytes);
  }
  const view = await setup();
  let currentDate = date, phase = 0;
  const changedDate = await dryRunGmiChangeSet(view.session, change(view, { Merknad: 'new' }), {
    referenceDate: date, getReferenceDate: () => currentDate,
    yieldWork: async () => { if (++phase === 2) currentDate = '2027-01-01'; },
  });
  assert.equal(changedDate.code, 'stale-reference-date');
  currentDate = date;
  const completed = await dryRunGmiChangeSet(view.session, change(view, { Merknad: 'new' }), {
    ...immediate, getReferenceDate: () => currentDate,
  });
  assert.equal(completed.ok, true);
  currentDate = '2027-01-01';
  assert.equal(isCurrentGmiDryRun(completed, view.session, completed.changeSet, { referenceDate: date }), false);
});

test('planner requires a genuine current dry run and invalidates it on rebuild, narrowing, session and date changes', async () => {
  const view = await setup();
  const selection = { binding: { ...view.handle }, scope: 'point', keys: ['point:0', 'point:1'] };
  const preview = await prepare(view, 'Merknad', 'new', undefined, 'point', selection);
  const batch = buildGmiFieldBatch(view.session, preview);
  assert.equal(batch.approvalReady, false);
  assert.equal(getGmiFieldBatchApproval(view.session, batch, { referenceDate: date }).ok, false);
  const checked = await dryRunGmiFieldBatch(view.session, batch, immediate);
  assert.equal(checked.ok, true, checked.code);
  assert.strictEqual(checked.changeSet, batch.changeSet);
  assert.equal(checked.rows[0].datasetChecked, true);
  assert.equal(getGmiFieldBatchApproval(view.session, checked, { referenceDate: date }).ok, true);
  assert.equal(getGmiFieldBatchApproval(view.session, checked, { referenceDate: '2027-01-01' }).ok, false);
  assert.equal(getGmiFieldBatchApproval(view.session, { ...checked }, { referenceDate: date }).ok, false);
  selection.keys = ['point:1'];
  assert.equal(isCurrentGmiFieldBatchValidation(view.session, checked, { referenceDate: date }), false);
  const narrowed = buildGmiFieldBatch(view.session, preview);
  assert.notStrictEqual(narrowed.changeSet, batch.changeSet);
  assert.equal(getGmiFieldBatchApproval(view.session, narrowed, { referenceDate: date }).ok, false);
  const checkedNarrow = await dryRunGmiFieldBatch(view.session, narrowed, immediate);
  assert.equal(checkedNarrow.ok, true);
  assert.deepEqual(checkedNarrow.changeSet.cells.map((cell) => cell.sourceIndex), [1]);
  const staged = stageGmiChangeSet(view.session, checkedNarrow.changeSet).session;
  assert.equal(getGmiFieldBatchApproval(staged, checkedNarrow, { referenceDate: date }).ok, false);
});

test('rebuilt candidates and newer concurrent checks cancel obsolete validation', async () => {
  const view = await setup(), preview = await prepare(view);
  const batch = buildGmiFieldBatch(view.session, preview);
  let newer, phases = 0;
  const obsolete = await dryRunGmiFieldBatch(view.session, batch, { ...immediate,
    yieldWork: async () => { if (++phases === 2) newer = buildGmiFieldBatch(view.session, preview, { included: new Set(['point:1']) }); } });
  assert.equal(obsolete.ok, false);
  assert.equal(obsolete.approvalReady, false);
  const held = [];
  const old = dryRunGmiFieldBatch(view.session, newer, { ...immediate, yieldWork: () => new Promise((resolve) => held.push(resolve)) });
  const latest = await dryRunGmiFieldBatch(view.session, newer, immediate);
  held.shift()();
  assert.equal((await old).ok, false);
  assert.equal(isCurrentGmiFieldBatchValidation(view.session, latest, { referenceDate: date }), true);
});

test('all hydraulic fields retain eligibility identity, source bytes and numeric SDR spellings after full validation', async () => {
  for (const [field, value] of [['SDR', '11'], ['Trykklasse', 'PN16'], ['Ringstivhet', 'SN8']]) {
    const view = await setup(gmiEditBatchFixture());
    const preview = await prepare(view, field, value, [0, 2, 3, 6, 7], 'line');
    const batch = buildGmiFieldBatch(view.session, preview);
    assert.equal(batch.ok, true, batch.code);
    const checked = await dryRunGmiFieldBatch(view.session, batch, immediate);
    assert.equal(checked.ok, true, checked.code);
    assert.strictEqual(checked.changeSet, batch.changeSet);
    assert.strictEqual(checked.changeSet.eligibility, batch.changeSet.eligibility);
    assert.equal(getGmiFieldBatchApproval(view.session, checked, { referenceDate: date }).ok, true);
    verifyBytes(view, checked.dryRun);
  }
});

test('dry-run modules have no registry/store dependencies or export serialization', async () => {
  const source = await readFile(new URL('../src/lib/gmi-edit/dryRun.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"][^'"]*(?:editSessions|store|exportGmi)/);
  assert.doesNotMatch(source, /JSON\.stringify|TextEncoder/);
});

test('synthetic dry-run performance at 100, 1,000 and all 1,200 selected lines in a 2,400-object document', { timeout: 180000 }, async (t) => {
  const count = 1200;
  const view = await setup(gmiFieldBatchFixture({ points: Array.from({ length: count }, () => ['LOK', '', '', '', '', '']),
    lines: Array.from({ length: count }, () => ['VL', 'PE', '', '', '', '', '160', 'S', '']) }));
  const cache = createGmiProposedCache();
  for (const size of [100, 1000, count]) {
    const candidate = createGmiBatchCorrection(view.session, { field: 'Merknad', lexeme: 'Synthetic G3 benchmark', mode: 'overwrite',
      targets: Array.from({ length: size }, (_, sourceIndex) => ({ scope: 'line', sourceIndex })) }).changeSet;
    const start = performance.now();
    const result = await dryRunGmiChangeSet(view.session, candidate, { ...immediate, cache });
    assert.equal(result.ok, true, result.code);
    const elapsed = performance.now() - start, computations = cache.stats().computations;
    const staged = stageGmiChangeSet(view.session, candidate).session;
    const cacheStart = performance.now();
    assert.strictEqual(getGmiProposedState(staged, { cache }), result.proposed);
    assert.equal(cache.stats().computations, computations);
    t.diagnostic(`${view.bytes.length} synthetic source bytes, 2400 objects, ${size} edits: dry run ${elapsed.toFixed(1)} ms; real-stage cache read ${(performance.now() - cacheStart).toFixed(1)} ms`);
  }
});

const corpusDirectories = (process.env.GMI_EDIT_CORPUS || '').split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
test('opt-in largest private corpus dry-run performance (aggregate measurements only)',
  { skip: corpusDirectories.length ? false : 'set GMI_EDIT_CORPUS to measure the largest private file', timeout: 1800000 }, async (t) => {
    const files = await discoverGmiFiles(corpusDirectories);
    let largest = null;
    for (const file of files) {
      const info = await stat(file);
      if (!largest || info.size > largest.size) largest = { file, size: info.size };
    }
    assert(largest, 'configured corpus must contain a GMI file');
    const view = await setup(new Uint8Array(await readFile(largest.file)));
    const column = describeGmiEditColumns(view, 'line').columns.find((entry) => entry.sourceKey === 'Merknad' && entry.editable);
    assert(column, 'benchmark requires an editable Merknad column on the largest file');
    let target;
    for (let sourceIndex = 0; sourceIndex < view.document.parser.linesParsed.length; sourceIndex++) {
      const resolved = resolveGmiCell(view.document, { scope: 'line', sourceIndex, field: column.sourceKey });
      if (resolved.ok) { target = resolved.cell; break; }
    }
    assert(target, 'benchmark requires a resolvable source cell');
    const candidate = createGmiBatchCorrection(view.session, { field: column.sourceKey, lexeme: 'Synthetic G3 benchmark', targets: [target], mode: 'overwrite' });
    assert.equal(candidate.ok, true);
    const start = performance.now();
    const run = await dryRunGmiChangeSet(view.session, candidate.changeSet, immediate);
    assert.equal(run.ok, true, run.code);
    assert(Buffer.from(getGmiSourceBytes(view.document)).equals(Buffer.from(view.bytes)), 'source bytes changed');
    t.diagnostic(`largest configured source ${largest.size} bytes: full dry run ${(performance.now() - start).toFixed(1)} ms`);
  });
