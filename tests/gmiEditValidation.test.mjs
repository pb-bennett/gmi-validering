import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  createGmiSourceDocument, createGmiEditSession, createGmiObjectCorrection, stageGmiChangeSet,
  getGmiDocumentDataset, getGmiEditCell, listGmiObjectCells, getGmiProposedState, getGmiSourceBytes,
} from '../src/lib/gmi-edit/index.mjs';
import { gmiEditObjectDiagnostics, gmiEditObjectReviewErrors, overlayGmiObjectValues } from '../src/lib/gmiEditValidation.mjs';
import { createGmiObjectValidator, runGmiValidationV2 } from '../src/lib/validation-v2/validationRunner.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { gmiEditValidationFixture } from './helpers/gmiEditValidationFixture.mjs';

const bytes = gmiEditValidationFixture();
const document = await createGmiSourceDocument(bytes);
const dataset = getGmiDocumentDataset(document);
const input = { layerId: 'm5a', dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-11-09' };
const exclusive = 'innmaling.line.sdr-ring-stiffness.exclusive';
const outcome = (result, id) => result.outcomes.find((entry) => entry.ruleId === id);

function inspect(session, sourceIndex = 0, drafts = {}) {
  const rows = listGmiObjectCells(document, 'line', sourceIndex).filter((cell) => cell.field).map((cell) => {
    const value = getGmiEditCell(session, { scope: 'line', sourceIndex, field: cell.field });
    return { field: cell.field, original: value.original, proposed: value.proposed, editable: true };
  });
  return gmiEditObjectDiagnostics({ view: { document, session, handle: { layerId: 'm5a' } }, scope: 'line', sourceIndex, rows, drafts });
}

test('G5 review confirmation uses new Validator FEIL against the working copy, not pre-existing or resolved findings', () => {
  const session = createGmiEditSession(document, { layerId: 'm5a' });
  const errors = (current, values) => {
    const rows = listGmiObjectCells(document, 'line', 0).filter((cell) => cell.field).map((cell) => ({
      field: cell.field, editable: true, proposed: getGmiEditCell(current, { scope: 'line', sourceIndex: 0, field: cell.field }).proposed,
    }));
    return gmiEditObjectReviewErrors({ view: { document, session: current, handle: { layerId: 'm5a' } }, scope: 'line', sourceIndex: 0, rows, values });
  };
  assert.deepEqual(errors(session, { Merknad: 'G5 tekst' }), [], 'existing dimension FEIL does not require a new-FEIL confirmation');
  assert.deepEqual(errors(session, { Dimensjon: '200' }), [], 'resolving a FEIL does not require confirmation');
  assert.deepEqual(errors(session, { SDR: '11' }).map((finding) => finding.ruleId), [exclusive]);
  const correction = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { SDR: '11' } });
  assert.equal(correction.ok, true);
  const staged = stageGmiChangeSet(session, correction.changeSet).session;
  assert.deepEqual(errors(staged, { Merknad: 'Neste retting' }), [], 'a FEIL already in the working copy is not new again');
  assert.deepEqual(getGmiSourceBytes(document), bytes);
});

test('object evaluation matches full Validator outcomes for all local rules, scopes and lexemes', () => {
  const full = runGmiValidationV2(input);
  const validator = createGmiObjectValidator(input);
  for (const [geometryScope, objects] of [['line', dataset.lines], ['point', dataset.points]]) {
    objects.forEach((object, sourceIndex) => {
      const local = validator.evaluate({ geometryScope, sourceIndex });
      for (const actual of local.outcomes) {
        if (actual.reasonCode === 'DATASET_CONTEXT_REQUIRED') continue;
        const expected = full.outcomes.find((entry) => entry.ruleId === actual.ruleId && entry.objectRef.geometryScope === geometryScope && entry.objectRef.sourceIndex === sourceIndex);
        assert.deepEqual(actual, expected);
      }
      const overlay = validator.evaluate({ geometryScope, sourceIndex,
        object: overlayGmiObjectValues(object, Object.fromEntries(Object.entries(object.attributes).map(([key, value]) => [key, value == null ? '' : String(value)]))) });
      assert.deepEqual(overlay.outcomes.map((entry) => [entry.ruleId, entry.state, entry.reasonCode]), local.outcomes.map((entry) => [entry.ruleId, entry.state, entry.reasonCode]));
    });
  }
});

test('SDR/Ringstivhet exclusivity is shared, independent of material or valid hydraulic context', () => {
  const validator = createGmiObjectValidator(input);
  for (const [SDR, Ringstivhet, expected] of [['', 'SN8', 'PASS'], ['11.0', '', 'PASS'], ['', '', 'PASS'], [' ', 'SN8', 'PASS'], ['11', 'SN8', 'FAIL'], ['BAD', 'BAD', 'FAIL']]) {
    const object = overlayGmiObjectValues(dataset.lines[0], { SDR, Ringstivhet, Tema: 'BAD', Material: 'BAD' });
    const local = validator.evaluate({ geometryScope: 'line', sourceIndex: 0, object });
    assert.equal(outcome(local, exclusive).state, expected);
    const fullDataset = { ...dataset, lines: [object] };
    const full = runGmiValidationV2({ ...input, dataset: fullDataset });
    assert.equal(outcome(full, exclusive).state, expected);
  }
});

test('existing FEIL/SJEKK, field association and tooltip wording; introduced and resolved draft diagnostics', () => {
  const session = createGmiEditSession(document, { layerId: 'm5a' });
  const original = inspect(session).findings;
  assert(original.some((finding) => finding.state === 'FAIL' && finding.fields.includes('Dimensjon') && finding.transition === 'original'));
  assert(original.some((finding) => finding.state === 'CHECK' && finding.fields.includes('Målemetode')));
  assert(!original.some((finding) => finding.ruleId === exclusive));
  const draft = inspect(session, 0, { SDR: '11.0', Dimensjon: '200' }).findings;
  const conflict = draft.find((finding) => finding.ruleId === exclusive);
  assert.deepEqual(conflict.fields, ['SDR', 'Ringstivhet']);
  assert.equal(conflict.transition, 'introduced');
  assert.match(conflict.tooltip, /FEIL · Nytt i forslaget[\s\S]*Både SDR og Ringstivhet/);
  assert.equal(conflict.ruleId, exclusive, 'technical identity is retained internally');
  assert.doesNotMatch(conflict.tooltip, /innmaling\./);
  assert(draft.some((finding) => finding.fields.includes('Dimensjon') && finding.transition === 'resolved'));
  assert(!inspect(session, 0, { SDR: '11.0', Ringstivhet: '' }).findings.some((finding) => finding.ruleId === exclusive));
  assert.equal(inspect(session, 1, { Ringstivhet: '' }).findings.find((finding) => finding.ruleId === exclusive).transition, 'resolved');
  assert.match(inspect(session, 1, { Ringstivhet: '' }).findings.find((finding) => finding.ruleId === exclusive).tooltip, /^OK · Løst i forslaget\nOpprinnelig funn:/);
});

test('previously staged Material is used; feedback matches M1 verified proposed reparse and source stays untouched', () => {
  const session = createGmiEditSession(document, { layerId: 'm5a' });
  const before = inspect(session, 2);
  assert(before.findings.some((finding) => finding.ruleId === 'innmaling.line.sdr.valid' && finding.state === 'CHECK'));
  const correction = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 2, values: { Material: 'PE' }, mode: 'overwrite' });
  assert.equal(correction.ok, true);
  const staged = stageGmiChangeSet(session, correction.changeSet).session;
  assert.equal(inspect(staged, 2).findings.find((finding) => finding.ruleId === 'innmaling.line.sdr.valid').transition, 'resolved');
  const proposed = getGmiProposedState(staged);
  assert.equal(proposed.ok, true);
  const validator = createGmiObjectValidator(input);
  const overlay = overlayGmiObjectValues(dataset.lines[2], { Material: 'PE' });
  const actual = validator.evaluate({ geometryScope: 'line', sourceIndex: 2, object: overlay });
  const expected = runGmiValidationV2({ ...input, dataset: proposed.dataset });
  for (const entry of actual.outcomes) {
    assert.deepEqual([entry.state, entry.reasonCode], expected.outcomes.filter((row) => row.objectRef.geometryScope === 'line' && row.objectRef.sourceIndex === 2 && row.ruleId === entry.ruleId).map((row) => [row.state, row.reasonCode])[0]);
  }
  assert.deepEqual(getGmiSourceBytes(document), bytes);
  const { warningSummary, ...reparsed } = new GMIParser(decodeGmiBytes(bytes)).toObject();
  assert.equal(warningSummary.total, 0);
  assert.deepEqual(dataset, reparsed);
  assert.equal(session.changeSets.length, 0);
  assert.equal(staged.changeSets.length, 1);
});

test('targeted evaluator never reads other objects per draft; dataset-only check is explicitly deferred', () => {
  const validator = createGmiObjectValidator(input);
  const guarded = { ...dataset, lines: new Proxy(dataset.lines, { get(target, key) { if (key === '0' || key === '2') throw new Error('unrelated object read'); return Reflect.get(target, key); } }) };
  const scoped = createGmiObjectValidator({ ...input, dataset: guarded });
  for (let index = 0; index < 30; index++) {
    const local = scoped.evaluate({ geometryScope: 'line', sourceIndex: 1, object: overlayGmiObjectValues(dataset.lines[1], { Merknad: String(index) }) });
    assert.equal(outcome(local, 'innmaling.common.positioning-cause.valid').reasonCode, 'DATASET_CONTEXT_REQUIRED');
    assert.equal(local.deferred.length, 1);
  }
  assert.equal(outcome(validator.evaluate({ geometryScope: 'line', sourceIndex: 0 }), 'innmaling.common.positioning-cause.valid').state, 'PASS');
  const full = runGmiValidationV2(input);
  assert(full.outcomes.some((entry) => entry.reasonCode === 'POSITIONING_CAUSE_SHARED_NYTT_YEAR'));
});

test('editor debounce never calls full revalidation or proposed-file generation', async () => {
  const hook = await readFile(new URL('../src/components/gmi-edit/useGmiObjectValidation.js', import.meta.url), 'utf8');
  const helper = await readFile(new URL('../src/lib/gmiEditValidation.mjs', import.meta.url), 'utf8');
  assert.match(hook, /setTimeout\([\s\S]*180\)/);
  assert.match(hook, /clearTimeout\(timer\)/);
  assert.doesNotMatch(hook + helper, /runGmiValidationV2|revalidateGmiEditSession|getGmiProposedState|\.revalidate\(/);
});
