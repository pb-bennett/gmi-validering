import assert from 'node:assert/strict';
import test from 'node:test';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { createGmiSourceDocument, createGmiEditSession, createGmiObjectCorrection, stageGmiChangeSet, undoGmiEdit, redoGmiEdit,
  discardAllGmiEdits, discardGmiChangeSet, revalidateGmiEditSession, getGmiProposedState, getGmiDocumentDataset, getGmiSourceBytes,
  createGmiProposedCache, compileGmiEffectiveEdits, loadGmiSourceDocument } from '../src/lib/gmi-edit/index.mjs';
import { compareGmiValidationRuns, buildGmiValidationComparison, isCurrentGmiComparison, validatorInspectionLayer,
  validatorSelectionHandoff, VALIDATOR_CORRECTION_STALE } from '../src/lib/gmiValidatorEditing.mjs';
import * as validatorEditing from '../src/lib/gmiValidatorEditing.mjs';
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

// L2a: «Lag retting…» and its R5 helpers are retired. The integrated route (Vis → Åpne i Rettinger) is the only way
// from a Validator finding to Rettinger; its exact-scope and refusal contracts are in gmiValidatorSelectionHandoff.
test('L2a: the retired «Lag retting…» helpers are no longer exported; the H3 handoff and comparison helpers remain', () => {
  for (const name of ['CORRECTABLE_RULES', 'isCorrectableMissingFinding', 'prepareValidatorCorrection', 'validatorCorrectionSelection',
    'validatorCorrectionBasisCurrent', 'VALIDATOR_CORRECTION_BASIS_CHANGED']) assert.equal(name in validatorEditing, false, name);
  for (const name of ['validatorSelectionHandoff', 'VALIDATOR_CORRECTION_STALE', 'gmiValidatorReturnTarget', 'gmiValidatorDefaultDataset',
    'buildGmiValidationComparison', 'isCurrentGmiComparison', 'validatorInspectionLayer', 'compareGmiValidationRuns']) assert.equal(name in validatorEditing, true, name);
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

test('read-only sources remain inspectable with verified identical proposed state', () => {
  const bytes = Buffer.from(gmiEditBatchFixture());
  const mixed = Buffer.from(bytes.toString('latin1').replace('\r\n', '\n'), 'latin1');
  const session = createGmiEditSession(createGmiSourceDocument(mixed), { layerId: 'read-only' });
  assert.equal(session.document.editable, false);
  const validation = revalidateGmiEditSession(session, { referenceDate: date });
  assert.equal(validation.ok, true); assert.equal(validation.proposed.identical, true);
});

test('L2a: the integrated Validator handoff refuses a read-only source; the same request on the editable source is accepted', async () => {
  // Replaces the retired R5 «document-not-editable» shortcut refusal with the same refusal on the integrated route.
  // Fingerprinted documents (as the session registry loads them), so only `editable` differs between the two cases.
  const bytes = Buffer.from(gmiEditBatchFixture());
  const readOnly = await loadGmiSourceDocument(Buffer.from(bytes.toString('latin1').replace('\r\n', '\n'), 'latin1'));
  const session = createGmiEditSession(readOnly, { layerId: 'read-only' });
  assert.equal(readOnly.editable, false); assert.equal(typeof readOnly.fingerprint, 'string');
  const handoff = (current) => {
    const handle = { layerId: current.layerId, sessionId: 'live-session', fingerprint: current.document.fingerprint };
    const layer = { id: current.layerId, data: getGmiDocumentDataset(current.document) };
    const request = { kind: 'validator-selection', scope: 'line', keys: ['line:0', 'line:6'], session: current, document: current.document,
      binding: { layerId: layer.id, sessionId: handle.sessionId, fingerprint: handle.fingerprint }, sessionId: handle.sessionId,
      provenance: { canonicalFieldId: 'sdr', fieldLabel: 'SDR', ruleIds: ['innmaling.line.sdr.valid'], datasetKind: 'original' } };
    return validatorSelectionHandoff(request, { session: current, document: current.document, handle }, layer);
  };
  assert.equal(handoff(createGmiEditSession(await loadGmiSourceDocument(bytes), { layerId: 'read-only' })).ok, true, 'control: the same request on the editable source');
  assert.deepEqual(handoff(session), { ok: false, code: 'stale-session', message: VALIDATOR_CORRECTION_STALE });
  assert.equal(session.changeSets.length, 0);
});
