import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGmiFieldBatch, dryRunGmiFieldBatch, getGmiFieldBatchApproval, gmiFieldBatchValues, prepareGmiFieldBatch } from '../src/lib/gmiFieldBatchPlan.mjs';
import { gmiBatchRiskReasons, gmiInspectorFields, gmiFieldInspectorRows } from '../src/lib/gmiBatchInspectorView.mjs';
import { compileGmiEffectiveEdits, createGmiEditSession, createGmiEditSessions, createGmiObjectCorrection,
  getGmiProposedBytes, getGmiProposedState, getGmiSourceBytes, loadGmiSourceDocument, redoGmiEdit, stageGmiChangeSet, undoGmiEdit } from '../src/lib/gmi-edit/index.mjs';
import { GMI_SOURCE_LEXEMES } from '../src/lib/parsing/gmiLexicalEvidence.js';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { createLoadedGmiSources, isLoadedGmiSurveyLayer } from '../src/lib/photos/loadedGmiSource.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { cellSpans, loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';

const immediate = { yieldWork: async () => {}, referenceDate: '2026-11-13' };

test('G8 every linked proposal requires explicit consent even without other risks', () => {
  assert.deepEqual(gmiBatchRiskReasons({ linkedTema: true }), ['linked-tema']);
  assert.deepEqual(gmiBatchRiskReasons({ linkedTema: true, newFail: 1, changeSetCounts: { populatedOverwrites: 1 } }), ['overwrite', 'new-fail', 'linked-tema']);
  assert.deepEqual(gmiBatchRiskReasons({}), []);
});
async function setup(scope = 'point', rows = [['KUM', 'LOK']], fields = ['Tema', 'S_FCODE']) {
  const bytes = gmiFieldBatchFixture({ [`${scope}Fields`]: fields, [scope === 'point' ? 'points' : 'lines']: rows });
  const document = await loadGmiSourceDocument(bytes);
  const session = createGmiEditSession(document, { layerId: 'g8' });
  return { bytes, document, session, handle: { layerId: 'g8', sessionId: 'g8-session', fingerprint: document.fingerprint } };
}
const selection = (view, scope, indices = [0]) => ({ scope, keys: indices.map(i => `${scope}:${i}`), binding: { ...view.handle } });
async function prepare(view, scope = 'point', options = {}) {
  const result = await prepareGmiFieldBatch(view, { scope, sourceKey: 'Tema', operation: 'set', value: scope === 'point' ? 'KUM' : 'SP',
    selection: selection(view, scope), ...options }, immediate);
  assert(result.ok, result.code);
  return result.preview;
}
function verify(view, session) {
  const proposed = getGmiProposedState(session);
  assert(proposed.ok, proposed.code);
  const compiled = compileGmiEffectiveEdits(session);
  assert(compiled.ok);
  const edits = compiled.edits.map(({ target, lexeme }) => ({ ...target, lexeme }));
  const oracle = loadGmiDocument(view.bytes), output = getGmiProposedBytes(proposed);
  assert.deepEqual(verifyCellChanges(oracle, output, edits).failures, []);
  const patches = edits.map(edit => ({ span: cellSpans(oracle.index.objects[edit.scope][edit.sourceIndex]).get(edit.field).span,
    replacement: Buffer.from(edit.lexeme, 'latin1') })).sort((a, b) => a.span[0] - b.span[0]);
  let originalOffset = 0, outputOffset = 0;
  for (const { span: [start, end], replacement } of patches) {
    const length = start - originalOffset;
    assert.deepEqual(output.slice(outputOffset, outputOffset + length), view.bytes.slice(originalOffset, start), 'bytes outside approved value spans');
    outputOffset += length;
    assert.deepEqual(output.slice(outputOffset, outputOffset + replacement.length), new Uint8Array(replacement));
    originalOffset = end;
    outputOffset += replacement.length;
  }
  assert.deepEqual(output.slice(outputOffset), view.bytes.slice(originalOffset), 'trailing bytes outside approved value spans');
  assert.deepEqual(getGmiSourceBytes(view.document), view.bytes);
  return proposed;
}

test('G8 point and line edits reconcile both columns atomically, resolve TEMA_CONFLICT and preserve source bytes/history', async () => {
  for (const scope of ['point', 'line']) {
    const value = scope === 'point' ? 'KUM' : 'SP';
    const view = await setup(scope, [[scope === 'point' ? 'LOK' : 'VL', scope === 'point' ? 'ANB' : 'OV']]);
    const fields = gmiInspectorFields(view, scope).filter(field => field.canonicalFieldId === 'tema');
    assert.equal(fields.length, 1);
    assert.equal(fields[0].disabled, false);
    for (const sourceKey of ['Tema', 'S_FCODE']) {
      const preview = await prepare(view, scope, { sourceKey });
      assert(preview.linked);
      assert(preview.rows[0].disagreement);
      assert.deepEqual(preview.rows[0].physical.map(cell => cell.field), ['Tema', 'S_FCODE']);
      const batch = buildGmiFieldBatch(view.session, preview);
      assert(batch.ok, batch.code);
      assert.equal(batch.counts.changed, 1);
      assert.equal(batch.changeSet.objectCount, 1);
      assert.deepEqual(batch.changeSet.cells.map(cell => [cell.field, cell.next]), [['Tema', value], ['S_FCODE', value]]);
      const checked = await dryRunGmiFieldBatch(view.session, batch, immediate);
      assert(checked.ok, checked.code);
      assert(checked.dryRun.resolved.some(finding => finding.reasonCode === 'TEMA_CONFLICT'));
      assert(!checked.dryRun.after.findings?.some(finding => finding.reasonCode === 'TEMA_CONFLICT'));
      assert(getGmiFieldBatchApproval(view.session, checked, immediate).ok);
      const staged = stageGmiChangeSet(view.session, checked.changeSet);
      assert(staged.staged);
      verify(view, staged.session);
      const undone = undoGmiEdit(staged.session);
      assert.deepEqual(getGmiProposedBytes(getGmiProposedState(undone.session)), view.bytes);
      const redone = redoGmiEdit(undone.session);
      assert.deepEqual(getGmiProposedBytes(verify(view, redone.session)), getGmiProposedBytes(checked.dryRun.proposed));
    }
  }
});

test('G8 no-op and exact replace/clear/fill semantics refuse disagreement, including whitespace', async () => {
  const view = await setup('point', [['KUM', 'LOK'], ['KUM', ' KUM'], ['KUM', 'KUM'], ['', ''], ['', 'KUM'], [' ', ' ']]);
  const selected = selection(view, 'point', [0, 1, 2, 3, 4, 5]);
  const values = gmiFieldBatchValues(view, selected, 'Tema');
  assert.equal(values.ambiguous, 3);
  assert.deepEqual(values.values, [{ lexeme: 'KUM', count: 1 }, { lexeme: '', count: 1 }, { lexeme: ' ', count: 1 }]);
  for (const operation of ['replace', 'clear', 'fill-missing']) {
    const preview = await prepare(view, 'point', { selection: selected, operation, value: operation === 'clear' ? '' : 'LOK', match: 'KUM' });
    for (const index of [0, 1, 4]) {
      assert.equal(preview.rows[index].reason, 'linked-tema-disagreement');
      assert.equal(preview.rows[index].canInclude, false);
      assert.equal(buildGmiFieldBatch(view.session, preview, { included: new Set([`point:${index}`]), replace: true }).code, 'target-not-allowed');
    }
    const batch = buildGmiFieldBatch(view.session, preview);
    assert(batch.ok, batch.code);
    assert.deepEqual([...new Set(batch.changeSet.cells.map(cell => cell.sourceIndex))], operation === 'fill-missing' ? [3, 5] : [2]);
    verify(view, stageGmiChangeSet(view.session, batch.changeSet).session);
    if (operation === 'clear') assert(preview.rows.slice(3).filter(row => !row.disagreement).every(row => row.reason === 'already-empty'));
    const ui = gmiFieldInspectorRows(preview, batch, selected, true, null);
    assert.match(ui['point:0'].detail, /Sett verdi/);
    assert.equal(ui['point:0'].canManual, false);
  }
  const unchanged = await prepare(view, 'point', { selection: selection(view, 'point', [2]) });
  assert.equal(unchanged.rows[0].reason, 'unchanged');
  assert.equal(buildGmiFieldBatch(view.session, unchanged).code, 'no-requests');
});

test('G8 strict geometry domains and one-column files retain their distinct paths', async () => {
  for (const scope of ['point', 'line']) {
    const view = await setup(scope, [['', '']]);
    const invalid = await prepareGmiFieldBatch(view, { scope, sourceKey: 'Tema', operation: 'set', value: scope === 'point' ? 'VL' : 'KUM', selection: selection(view, scope) }, immediate);
    assert.equal(invalid.code, 'value-out-of-domain');
    for (const field of ['Tema', 'S_FCODE']) {
      const single = await setup(scope, [['']], [field]);
      const preview = await prepare(single, scope, { sourceKey: field });
      assert.equal(preview.linked, false);
      const batch = buildGmiFieldBatch(single.session, preview);
      assert.equal(batch.changeSet.cells.length, 1);
      verify(single, stageGmiChangeSet(single.session, batch.changeSet).session);
    }
  }
});

test('G8 one already-correct physical value still changes the other cell and reports the object as changed', async () => {
  const view = await setup('point', [['KUM', 'LOK']]);
  const preview = await prepare(view);
  const batch = buildGmiFieldBatch(view.session, preview);
  assert.equal(batch.counts.changed, 1);
  assert.deepEqual(batch.changeSet.cells.map(cell => cell.field), ['S_FCODE']);
  assert.deepEqual(batch.changeSet.unchanged.map(cell => cell.field), ['Tema']);
  const ui = gmiFieldInspectorRows(preview, batch, selection(view, 'point'), false, null)['point:0'];
  assert.equal(ui.outcome, 'change');
  assert.match(ui.change.from, /S_FCODE:.*LOK/);
  verify(view, stageGmiChangeSet(view.session, batch.changeSet).session);
});

test('G8 Validator previews Type compatibility and hydraulic consequences without new applicability rules', async () => {
  const point = await setup('point', [['BAS', 'BAS', 'BBAK']], ['Tema', 'S_FCODE', 'Type']);
  const pointBatch = buildGmiFieldBatch(point.session, await prepare(point));
  const checkedPoint = await dryRunGmiFieldBatch(point.session, pointBatch, immediate);
  assert(checkedPoint.ok);
  assert(checkedPoint.dryRun.introduced.some(finding => finding.reasonCode === 'TYPE_TEMA_INCOMPATIBLE'));
  const line = await setup('line', [['VL', 'VL', 'PE', '11', '', '']], ['Tema', 'S_FCODE', 'Material', 'SDR', 'Trykklasse', 'Ringstivhet']);
  const lineBatch = buildGmiFieldBatch(line.session, await prepare(line, 'line'));
  const checkedLine = await dryRunGmiFieldBatch(line.session, lineBatch, immediate);
  assert(checkedLine.ok);
  assert([...checkedLine.dryRun.introduced, ...checkedLine.dryRun.resolved].some(finding => /sdr|ring-stiffness|pressure-class/.test(finding.ruleId)));
});

test('G8 refuses unavailable/unsafe partners and mismatched identity without a partial write', async () => {
  for (const fields of [['Tema', 'S_FCODE'], ['S_FCODE', 'Tema']]) {
    const view = await setup('point', [['LOK']], fields);
    const preview = await prepare(view, 'point', { sourceKey: fields[0] });
    assert.equal(preview.rows[0].canInclude, false);
    assert.equal(buildGmiFieldBatch(view.session, preview, { included: new Set(['point:0']) }).code, 'target-not-allowed');
    const guarded = await prepare(view, 'point', { sourceKey: fields[0], selection: undefined, targets: [{ scope: 'point', sourceIndex: 0, objectId: 'wrong' }] });
    assert.equal(guarded.rows[0].canInclude, false);
  }
  const duplicate = await setup('point', [['LOK', 'LOK', 'LOK']], ['Tema', 'S_FCODE', 'S_FCODE']);
  const result = await prepareGmiFieldBatch(duplicate, { scope: 'point', sourceKey: 'Tema', operation: 'set', value: 'KUM', selection: selection(duplicate, 'point') }, immediate);
  assert.equal(result.ok, false);
});

test('G8 earlier single-cell corrections are never partially replaced; stale session and selection invalidate approval', async () => {
  const view = await setup('point', [['LOK', 'LOK'], ['', '']]);
  const earlier = createGmiObjectCorrection(view.session, { scope: 'point', sourceIndex: 0, values: { S_FCODE: 'ANB' }, mode: 'overwrite' });
  view.session = stageGmiChangeSet(view.session, earlier.changeSet).session;
  const selected = selection(view, 'point', [0, 1]);
  const preview = await prepare(view, 'point', { selection: selected });
  assert.equal(preview.rows[0].reason, 'conflict');
  const skipped = buildGmiFieldBatch(view.session, preview, { included: new Set(selected.keys) });
  assert(skipped.ok);
  assert(skipped.changeSet.cells.every(cell => cell.sourceIndex === 1));
  const batch = buildGmiFieldBatch(view.session, preview, { included: new Set(selected.keys), replace: true });
  assert.equal(batch.changeSet.cells.length, 4);
  const checked = await dryRunGmiFieldBatch(view.session, batch, immediate);
  assert(getGmiFieldBatchApproval(view.session, checked, immediate).ok);
  verify(view, stageGmiChangeSet(view.session, batch.changeSet).session);
  selected.keys = ['point:1'];
  assert.equal(getGmiFieldBatchApproval(view.session, checked, immediate).ok, false);
  selected.keys = ['point:0', 'point:1'];
  view.session = undoGmiEdit(view.session).session;
  assert.equal(getGmiFieldBatchApproval(view.session, checked, immediate).ok, false);
});

test('G8 linked changes preview downstream Kumform failures and clearing required Tema through the Validator', async () => {
  const view = await setup('point', [['LOK', 'LOK', '']], ['Tema', 'S_FCODE', 'Kumform']);
  for (const operation of ['set', 'clear']) {
    const preview = await prepare(view, 'point', { operation, value: operation === 'clear' ? '' : 'KUM' });
    const batch = buildGmiFieldBatch(view.session, preview);
    const checked = await dryRunGmiFieldBatch(view.session, batch, immediate);
    assert(checked.ok, checked.code);
    assert(checked.dryRun.diff.newCounts.fail > 0);
    assert(checked.rows[0].datasetIntroduced.some(finding => finding.state === 'FAIL'));
    assert(preview.rows[0].findings.some(finding => finding.batchIntroduced && finding.state === 'FAIL'));
    if (operation === 'set') assert(checked.dryRun.introduced.some(finding => /manhole-shape/.test(finding.ruleId)));
  }
});

test('G8 FOTO keeps original delivered Tema after staging a linked proposed correction', async () => {
  const bytes = gmiFieldBatchFixture({ pointFields: ['Tema', 'S_FCODE', 'S_HYPERLINK'], points: [['LOK', 'LOK', 'synthetic.jpg']] });
  const parser = new GMIParser(decodeGmiBytes(bytes));
  const data = parser.toObject();
  const layer = { id: 'g8', name: 'Synthetic G8', file: { name: 'Synthetic G8.gmi', format: 'GMI' }, data };
  const getLayer = id => id === layer.id ? layer : null;
  const sources = createLoadedGmiSources({ getLayer });
  sources.register(layer.id, data, new File([bytes], layer.file.name), createGmiPhotoSource(parser));
  const registry = createGmiEditSessions({ sources, getLayer, isGmiLayer: isLoadedGmiSurveyLayer });
  const opened = await registry.open(layer.id);
  assert(opened.ok, opened.code);
  const view = { ...registry.resolve(opened.handle), handle: opened.handle };
  const original = await sources.read(sources.begin(layer.id));
  const batch = buildGmiFieldBatch(view.session, await prepare(view));
  assert(registry.stage(opened.handle, batch.changeSet).staged);
  const proposed = getGmiProposedState(registry.getSession(opened.handle).session);
  assert.deepEqual(proposed.dataset.points[0].attributes[GMI_SOURCE_LEXEMES].Tema, 'KUM');
  const photo = await sources.read(sources.begin(layer.id));
  assert.strictEqual(photo, original);
  assert.equal(Object.values(photo.objectsByKey)[0].tema, 'LOK');
  assert.deepEqual(photo.references, original.references);
  assert.deepEqual(await sources.readBytes(sources.begin(layer.id)), bytes);
});
