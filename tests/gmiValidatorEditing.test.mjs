import assert from 'node:assert/strict';
import test from 'node:test';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { createGmiSourceDocument, createGmiEditSession, createGmiObjectCorrection, stageGmiChangeSet, undoGmiEdit, redoGmiEdit,
  discardAllGmiEdits, discardGmiChangeSet, revalidateGmiEditSession, getGmiProposedState, getGmiDocumentDataset, getGmiSourceBytes,
  evaluateGmiBatchEligibility, createGmiBatchCorrection, createGmiProposedCache, compileGmiEffectiveEdits } from '../src/lib/gmi-edit/index.mjs';
import { CORRECTABLE_RULES, prepareValidatorCorrection, compareGmiValidationRuns, buildGmiValidationComparison,
  isCurrentGmiComparison, validatorInspectionLayer } from '../src/lib/gmiValidatorEditing.mjs';
const date = '2026-11-09';
const fresh = (options) => createGmiEditSession(createGmiSourceDocument(gmiEditBatchFixture(options)), { layerId: 'layer-one' });
const stage = (session, index, values) => {
  const correction = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: index, values, mode: 'overwrite', conflictPolicy: 'replace' });
  assert.equal(correction.ok, true);
  return stageGmiChangeSet(session, correction.changeSet).session;
};

test('full comparison uses verified parsed proposed output, stable original/cache, identical explicit date and unchanged bytes', () => {
  const original = fresh(), bytes = getGmiSourceBytes(original.document);
  const before = revalidateGmiEditSession(original, { referenceDate: date });
  const edited = stage(original, 6, { SDR: '11.0' });
  const validation = revalidateGmiEditSession(edited, { referenceDate: date });
  assert.equal(validation.proposed, getGmiProposedState(edited));
  assert.equal(validation.proposed.dataset.lines[6].attributes.SDR, 11);
  assert.equal(getGmiDocumentDataset(original.document).lines[6].attributes.SDR, null);
  assert.equal(validation.original, before.original);
  assert.equal(validation.original.runContext.referenceDate, validation.revised.runContext.referenceDate);
  assert.equal(validation.original.runContext.referenceDate, date);
  assert.deepEqual(getGmiSourceBytes(original.document), bytes);
  const comparison = buildGmiValidationComparison(edited, validation, date);
  assert(comparison.introduced.some((f) => f.ruleId === 'innmaling.line.sdr-ring-stiffness.exclusive' && f.state === 'FAIL'));
  assert(comparison.resolved.some((f) => f.ruleId === 'innmaling.line.sdr.valid'));
  assert.equal(revalidateGmiEditSession(edited, { referenceDate: date }).revised, validation.revised);
});

test('full check detects introduced SJEKK, not only errors', () => {
  const original = fresh(), edited = stage(original, 1, { Material: 'BET' });
  const comparison = buildGmiValidationComparison(edited, revalidateGmiEditSession(edited, { referenceDate: date }), date);
  assert(comparison.newCounts.check > 0);
});

test('all history transitions and dates invalidate comparison, even undo/redo to identical effective edits', () => {
  const session = stage(fresh(), 0, { SDR: '11' });
  const comparison = buildGmiValidationComparison(session, revalidateGmiEditSession(session, { referenceDate: date }), date);
  assert(isCurrentGmiComparison(comparison, session, date));
  const undone = undoGmiEdit(session).session;
  for (const next of [undone, redoGmiEdit(undone).session, discardAllGmiEdits(session).session,
    discardGmiChangeSet(session, session.changeSets[0].id).session, stage(session, 7, { SDR: '17' }), fresh()]) assert(!isCurrentGmiComparison(comparison, next, date));
  assert(!isCurrentGmiComparison(comparison, session, '2026-11-10'));
});

const sampleRun = (findings, schemaFindings = []) => ({ layerId: 'x', runContext: { referenceDate: date }, ruleResults: [{ findings }], schemaFindings });
const finding = (state, index = 0, reasonCode = 'MISSING') => ({ ruleId: 'test-rule', state, reasonCode, geometryScope: 'line', objectRef: { geometryScope: 'line', sourceIndex: index } });
test('severity change and shifted unique object identity never count as resolved', () => {
  const a = { lines: [{ guid: 'A' }, { guid: 'B' }], points: [] }, b = { lines: [{ guid: 'B' }, { guid: 'A' }], points: [] };
  const diff = compareGmiValidationRuns(sampleRun([finding('FAIL')]), sampleRun([finding('CHECK', 1)]), a, b);
  assert.equal(diff.severityChanged.length, 1); assert.equal(diff.resolved.length, 0); assert.equal(diff.introduced.length, 0);
  const unchanged = compareGmiValidationRuns(sampleRun([finding('FAIL')]), sampleRun([finding('FAIL', 1)]), a, b);
  assert.equal(unchanged.unchanged.length, 1);
});

test('full comparison includes dataset/schema findings and refuses mismatched date/layer or proposed failure', () => {
  const dataset = { lines: [], points: [] }, schema = { canonicalFieldId: 'tema', geometryScope: 'line', reasonCode: 'SCHEMA', state: 'CHECK' };
  assert.equal(compareGmiValidationRuns(sampleRun([]), sampleRun([], [schema]), dataset, dataset).newCounts.check, 1);
  assert.throws(() => compareGmiValidationRuns(sampleRun([]), { ...sampleRun([]), layerId: 'other' }, dataset, dataset));
  assert.throws(() => compareGmiValidationRuns(sampleRun([]), { ...sampleRun([]), runContext: { referenceDate: '2025-01-01' } }, dataset, dataset));
  assert.equal(buildGmiValidationComparison(fresh(), { ok: false }, date).ok, false);
});

test('allow-list maps exactly the three existing applicability contracts; handoff is exact and chooses/applies no value', () => {
  const session = fresh(), run = revalidateGmiEditSession(session, { referenceDate: date }).original;
  assert.deepEqual(Object.values(CORRECTABLE_RULES).sort(), ['pressureClass', 'ringStiffness', 'sdr']);
  for (const ruleId of Object.keys(CORRECTABLE_RULES)) assert.equal(prepareValidatorCorrection(session, run, [ruleId]).ok, true, ruleId);
  const request = prepareValidatorCorrection(session, run, ['innmaling.line.sdr.valid']);
  assert.equal(request.ok, true); assert.equal(request.layerId, session.layerId); assert.equal(request.session, session);
  assert.deepEqual(request.targets, [0, 6, 7].map((sourceIndex) => ({ scope: 'line', sourceIndex })));
  assert.equal('lexeme' in request, false); assert.equal(session.changeSets.length, 0);
  assert.equal(prepareValidatorCorrection(session, run, ['innmaling.line.sdr-ring-stiffness.exclusive']).ok, false);
  assert.equal(prepareValidatorCorrection(session, { ...run, layerId: 'other' }, ['innmaling.line.sdr.valid']).ok, false);
  // Resolve an old Original finding against CURRENT eligibility; never silently include a staged fill.
  assert.deepEqual(prepareValidatorCorrection(stage(session, 0, { SDR: '11' }), run, ['innmaling.line.sdr.valid']).targets.map((t) => t.sourceIndex), [6, 7]);
});

test('finding scope stays narrow through M5B preview eligibility and one reversible ChangeSet', () => {
  const session = fresh(), run = revalidateGmiEditSession(session, { referenceDate: date }).original;
  const filtered = { ...run, ruleResults: run.ruleResults.map((rule) => ({ ...rule, findings: rule.findings.filter((f) => f.objectRef.sourceIndex === 6) })) };
  const request = prepareValidatorCorrection(session, filtered, ['innmaling.line.sdr.valid']);
  const eligibility = evaluateGmiBatchEligibility(session, { canonicalFieldId: request.canonicalFieldId, targets: request.targets });
  assert.equal(eligibility.eligible.length, 1);
  const correction = createGmiBatchCorrection(session, { eligibility, lexeme: '11' });
  assert.equal(correction.ok, true); assert.equal(correction.changeSet.cells.length, 1);
  assert.equal(correction.changeSet.cells[0].sourceIndex, 6);
});

test('missing columns, irregular source objects and populated values cannot seed an editable shortcut', () => {
  for (const options of [{ fields: ['Tema', 'Material'], rows: [['VL', 'PE']] }, { rows: [['VL', 'PE', '11', '', '']] }]) {
    const session = fresh(options), run = revalidateGmiEditSession(session, { referenceDate: date }).original;
    assert.equal(prepareValidatorCorrection(session, run, ['innmaling.line.sdr.valid']).ok, false);
  }
  const original = fresh(), cleared = stage(original, 1, { SDR: '' });
  const run = revalidateGmiEditSession(cleared, { referenceDate: date }).revised;
  assert(!prepareValidatorCorrection(cleared, run, ['innmaling.line.sdr.valid']).targets.some((t) => t.sourceIndex === 1));
});

test('proposed object inspection resolves only the exact live layer/session and fails closed', () => {
  const session = fresh(), proposed = getGmiProposedState(session), run = revalidateGmiEditSession(session, { referenceDate: date }).revised;
  const registry = { getHandle: () => ({}), resolve: () => ({ ok: true, session }), proposed: () => proposed };
  const layer = { id: session.layerId, data: { original: true } }, basis = { layerId: session.layerId, session, datasetRevision: run.datasetRevision };
  assert.equal(validatorInspectionLayer(registry, layer, basis).data, proposed.dataset);
  assert.equal(validatorInspectionLayer(registry, { ...layer, id: 'foreign' }, basis), null);
  assert.equal(validatorInspectionLayer(registry, layer, { ...basis, session: fresh() }), null);
  assert.equal(validatorInspectionLayer({ ...registry, proposed: () => ({ ok: false }) }, layer, basis), null);
  assert.equal(validatorInspectionLayer(registry, layer), layer);
});


test('full dataset NYTT year rule includes changes on other objects, beyond lightweight local diagnostics', () => {
  const session = fresh({ fields: ['Tema', 'Stedfestingsårsak', 'Anleggsår'], rows: [['SP', 'NYTT', '2026'], ['SP', 'UENDR', '2025']] });
  const edited = stage(session, 0, { Anleggsår: '2025' });
  const comparison = buildGmiValidationComparison(edited, revalidateGmiEditSession(edited, { referenceDate: date }), date);
  assert(comparison.introduced.some((finding) => finding.reasonCode === 'POSITIONING_CAUSE_SHARED_NYTT_YEAR' && finding.objectRef.sourceIndex === 1));
});


test('actual M2 proposed verification failure has no original/revised results and cannot publish success', () => {
  const session = stage(fresh(), 0, { SDR: '11.0' });
  const cache = createGmiProposedCache();
  cache.set(session.document, compileGmiEffectiveEdits(session).effectiveKey, { ok: false, stage: 'verify', rejections: [{ code: 'verification-failed' }] });
  const validation = revalidateGmiEditSession(session, { referenceDate: date, cache });
  assert.equal(validation.ok, false); assert.equal(validation.revised, undefined); assert.equal(validation.original, undefined);
  assert.equal(buildGmiValidationComparison(session, validation, date).ok, false);
});

test('read-only sources remain inspectable with verified identical proposed state but no editable correction targets', () => {
  const bytes = Buffer.from(gmiEditBatchFixture());
  const mixed = Buffer.from(bytes.toString('latin1').replace('\r\n', '\n'), 'latin1');
  const session = createGmiEditSession(createGmiSourceDocument(mixed), { layerId: 'read-only' });
  assert.equal(session.document.editable, false);
  const validation = revalidateGmiEditSession(session, { referenceDate: date });
  assert.equal(validation.ok, true); assert.equal(validation.proposed.identical, true);
  assert.equal(prepareValidatorCorrection(session, validation.original, ['innmaling.line.sdr.valid']).code, 'document-not-editable');
});
