import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadGmiSourceDocument, createGmiEditSession, stageGmiChangeSet, undoGmiEdit, redoGmiEdit, getGmiProposedState, getGmiDocumentDataset, getGmiSourceBytes } from '../src/lib/gmi-edit/index.mjs';
import { buildGmiSelectionProfile, gmiSelectionNarrowing, gmiSelectionProfileSources, GMI_PROFILE_MISSING_LABEL } from '../src/lib/gmiSelectionProfile.mjs';
import { reduceGmiEditSelection } from '../src/lib/gmiEditSelection.mjs';
import { gmiSelectionTargets, gmiBatchScopeState, planGmiInspectorBatch } from '../src/lib/gmiBatchInspectorView.mjs';
import { prepareGmiBatchReview } from '../src/lib/gmiEditBatchView.mjs';
import { prepareGmiFieldBatch, buildGmiFieldBatch } from '../src/lib/gmiFieldBatchPlan.mjs';
import { encodeSingleByte } from './helpers/gmiEditFixtures.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';

// Synthetic: Tema;Material;Dimensjon;Stedfestingsårsak;SDR
const ROWS = [
  ['VL', 'PE', '110', 'NYTT', ''], ['VL', 'PE', '110', 'NYTT', ''], ['VL', 'PVC', '160', 'UENDR', ''],
  ['SP', 'PE', '', 'NYTT', ''], ['SP', '', '110', '', ''], ['VL', ' ', '225', 'UENDR', ''],
];
function fixture(rows = ROWS, fields = ['Tema', 'Material', 'Dimensjon', 'Stedfestingsårsak', 'SDR']) {
  const out = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', 'COSYS_EPSG 25832',
    '[L_]', `_FIELDNAMES ${fields.join(';')};`, '[+L_]'];
  rows.forEach((values, index) => out.push(`:L ${index + 1}`, `_FIELDVALUES ${values.join(';')};`, '/XYZ',
    `581940 ${6566000 + index} 101`, `581945 ${6566001 + index} 101`));
  out.push('[END]', '');
  return encodeSingleByte(out.join('\r\n'));
}

async function setup(rows, fields) {
  const bytes = fixture(rows, fields), document = await loadGmiSourceDocument(bytes);
  const session = createGmiEditSession(document, { layerId: 'b1' });
  const binding = { layerId: 'b1', sessionId: 'b1-session', fingerprint: document.fingerprint };
  return { bytes, document, binding, view: { document, session, handle: { ...binding } } };
}
const keysOf = (indices) => indices.map((index) => `line:${index}`);
const field = (profile, id) => profile.fields.find((entry) => entry.id === id);
const summary = (dimension) => dimension.groups.map((group) => [group.label, group.count]);

test('B1 profile resolves physical fields through the schema binding and counts distinct values', async () => {
  const { view } = await setup();
  const sources = gmiSelectionProfileSources(view, 'line');
  assert.deepEqual(sources.map((source) => [source.id, source.state, source.sourceKeys]), [
    ['tema', 'bound', ['Tema']], ['material', 'bound', ['Material']], ['dimension', 'bound', ['Dimensjon']],
    ['positioningCause', 'bound', ['Stedfestingsårsak']]]);
  const profile = buildGmiSelectionProfile({ dataset: getGmiProposedState(view.session).dataset, scope: 'line', keys: keysOf([0, 1, 2, 3, 4, 5]), sources });
  assert.equal(profile.total, 6);
  assert.deepEqual(summary(field(profile, 'tema')), [['VL', 4], ['SP', 2]]);
  // Missing and whitespace-only values are one explicit group, always last.
  assert.deepEqual(summary(field(profile, 'material')), [['PE', 3], ['PVC', 1], [GMI_PROFILE_MISSING_LABEL, 2]]);
  assert.equal(field(profile, 'material').missing, 2);
  assert.equal(field(profile, 'material').distinct, 2);
  assert.deepEqual(summary(field(profile, 'dimension')), [['110', 3], ['160', 1], ['225', 1], [GMI_PROFILE_MISSING_LABEL, 1]]);
  assert.deepEqual(summary(field(profile, 'positioningCause')), [['NYTT', 3], ['UENDR', 2], [GMI_PROFILE_MISSING_LABEL, 1]]);
  assert.deepEqual(field(profile, 'material').groups.at(-1).keys, ['line:4', 'line:5']);
  assert.equal(profile.context.length, 0);
  const uniform = buildGmiSelectionProfile({ dataset: getGmiProposedState(view.session).dataset, scope: 'line', keys: keysOf([0, 1]), sources });
  assert.equal(field(uniform, 'tema').uniform, true);
  assert.equal(field(uniform, 'dimension').uniform, true);
});

test('B1 absent fields are reported, never guessed; Tema falls back to S_FCODE through the binding', async () => {
  const { view } = await setup([['', 'VA', 'PE', ''], ['VL', 'SP', 'PE', '']], ['Tema', 'S_FCODE', 'Material', 'SDR']);
  const sources = gmiSelectionProfileSources(view, 'line');
  assert.deepEqual(sources.find((source) => source.id === 'tema').sourceKeys, ['Tema', 'S_FCODE']);
  for (const id of ['dimension', 'positioningCause']) assert.equal(sources.find((source) => source.id === id)?.state ?? 'absent', 'absent');
  const profile = buildGmiSelectionProfile({ dataset: getGmiProposedState(view.session).dataset, scope: 'line', keys: keysOf([0, 1]), sources });
  assert.deepEqual(summary(field(profile, 'tema')), [['VA', 1], ['VL', 1]]);
  const absent = profile.fields.filter((entry) => entry.state === 'absent');
  assert(absent.every((entry) => entry.groups.length === 0));
});

test('B1 profile reads the proposed working copy, including staged corrections, and follows undo/redo', async () => {
  const { bytes, view, binding } = await setup();
  const selection = { binding, scope: 'line', keys: keysOf([0, 1, 2, 3]) };
  const sources = gmiSelectionProfileSources(view, 'line');
  const prepared = await prepareGmiFieldBatch(view, { scope: 'line', sourceKey: 'Material', operation: 'set', value: 'PVC', selection: { ...selection, keys: keysOf([0, 1]) } });
  assert.equal(prepared.ok, true);
  const batch = buildGmiFieldBatch(view.session, prepared.preview, { included: new Set(keysOf([0, 1])) });
  assert.equal(batch.ok, true, batch.code);
  const staged = stageGmiChangeSet(view.session, batch.changeSet).session;
  const profileFor = (session) => summary(field(buildGmiSelectionProfile({ dataset: getGmiProposedState(session).dataset, scope: 'line', keys: selection.keys, sources }), 'material'));
  assert.deepEqual(summary(field(buildGmiSelectionProfile({ dataset: getGmiDocumentDataset(view.document), scope: 'line', keys: selection.keys, sources }), 'material')), [['PE', 3], ['PVC', 1]]);
  assert.deepEqual(profileFor(staged), [['PVC', 3], ['PE', 1]]);
  const undone = undoGmiEdit(staged).session;
  assert.deepEqual(profileFor(undone), [['PE', 3], ['PVC', 1]]);
  assert.deepEqual(profileFor(redoGmiEdit(undone).session), [['PVC', 3], ['PE', 1]]);
  assert.deepEqual(getGmiSourceBytes(view.document), bytes);
});

test('B1 narrowing only removes, preserves host/origin, and keeps an existing preview valid', async () => {
  const { view, binding } = await setup();
  const origin = Object.freeze({ kind: 'validator-selection', ruleIds: ['x'] });
  const selection = { binding, host: { kind: 'rettinger' }, origin, scope: 'line', keys: keysOf([0, 1, 2, 3, 4]), anchor: 'line:4', showOnly: false };
  const sources = gmiSelectionProfileSources(view, 'line');
  const profile = buildGmiSelectionProfile({ dataset: getGmiProposedState(view.session).dataset, scope: 'line', keys: selection.keys, sources });
  const pe = field(profile, 'material').groups.find((group) => group.label === 'PE');
  const action = gmiSelectionNarrowing(selection, pe.keys);
  assert.deepEqual([...action.keys], keysOf([2, 4]));
  assert.equal(action.remaining, 3);
  // Keys outside the selection never enter; keeping everything or nothing is no action.
  assert.deepEqual([...gmiSelectionNarrowing(selection, [...pe.keys, 'line:5', 'line:99']).keys], keysOf([2, 4]));
  assert.equal(gmiSelectionNarrowing(selection, selection.keys), null);
  assert.equal(gmiSelectionNarrowing(selection, ['line:5']), null);
  assert.equal(gmiSelectionNarrowing(null, pe.keys), null);
  const counts = { line: 6, point: 0 };
  const next = reduceGmiEditSelection(selection, { type: action.type, scope: action.scope, keys: [...action.keys] }, { binding, counts });
  assert.deepEqual(next.keys, keysOf([0, 1, 3]));
  assert.equal(next.origin, origin);
  assert.equal(next.binding, binding);
  assert(next.keys.every((key) => selection.keys.includes(key)));
  // Shrink-only R5 origin also accepts the narrowing.
  const restricted = { ...selection, origin: { kind: 'validator' } };
  assert.deepEqual(reduceGmiEditSelection(restricted, { type: 'remove', scope: 'line', keys: [...action.keys] }, { binding, counts }).keys, keysOf([0, 1, 3]));
  // A hydraulic preview stays valid for the narrowed subset and rebuilds exactly that subset.
  const exact = gmiSelectionTargets(view, selection);
  const preview = await prepareGmiBatchReview(view, { canonicalFieldId: 'sdr', mode: 'fill-missing', lexeme: '11', targets: exact.targets });
  assert.equal(preview.ok, true);
  const review = { preview, binding, keys: [...selection.keys] };
  assert.equal(gmiBatchScopeState(view, next, review), null);
  const plan = planGmiInspectorBatch(view, next, review);
  assert(plan.rows.every((row) => next.keys.includes(`line:${row.sourceIndex}`)));
  assert.equal(plan.counts.selected, 3);
  // Widening again is still stale.
  assert.equal(gmiBatchScopeState(view, { ...next, keys: [...next.keys, 'line:5'] }, review), 'expanded');
});

test('B1 rule context comes from a current preview, with explicit missing context', async () => {
  const bytes = gmiEditBatchFixture(), document = await loadGmiSourceDocument(bytes);
  const session = createGmiEditSession(document, { layerId: 'b1h' });
  const binding = { layerId: 'b1h', sessionId: 's', fingerprint: document.fingerprint };
  const view = { document, session, handle: { ...binding } };
  const selection = { binding, scope: 'line', keys: keysOf([0, 2, 4, 8]) };
  const prepared = await prepareGmiFieldBatch(view, { scope: 'line', sourceKey: 'SDR', operation: 'fill-missing', value: '11', selection });
  assert.equal(prepared.ok, true);
  const sources = gmiSelectionProfileSources(view, 'line');
  const profile = buildGmiSelectionProfile({ dataset: getGmiProposedState(session).dataset, scope: 'line', keys: selection.keys, sources, ruleRows: prepared.preview.rows });
  const hydraulic = profile.context.find((entry) => entry.id === 'hydraulicClass');
  assert(hydraulic, 'hydraulic class from diagnosticFacts');
  assert.equal(hydraulic.kind, 'rule');
  assert.equal(hydraulic.groups.reduce((total, group) => total + group.count, 0), 4);
  assert(profile.context.every((entry) => !['tema', 'material', 'dimension', 'positioningCause'].includes(entry.id)));
  // Objects without a preview row are counted as missing, not guessed.
  const partial = buildGmiSelectionProfile({ dataset: getGmiProposedState(session).dataset, scope: 'line', keys: selection.keys, sources, ruleRows: prepared.preview.rows.slice(0, 1) });
  const partialHydraulic = partial.context.find((entry) => entry.id === 'hydraulicClass');
  assert.equal(partialHydraulic.missing, 3);
});

test('B1 large selections are profiled in bounded time without altering the dataset', async () => {
  const rows = Array.from({ length: 4000 }, (_, index) => [index % 3 ? 'VL' : 'SP', ['PE', 'PVC', '', 'SJK'][index % 4], String(110 + (index % 7) * 50), index % 2 ? 'NYTT' : 'UENDR', '']);
  const { view, binding } = await setup(rows);
  const keys = keysOf(rows.map((_, index) => index));
  const sources = gmiSelectionProfileSources(view, 'line');
  const dataset = getGmiProposedState(view.session).dataset;
  const started = performance.now();
  const profile = buildGmiSelectionProfile({ dataset, scope: 'line', keys, sources });
  const narrowing = gmiSelectionNarrowing({ binding, scope: 'line', keys }, field(profile, 'material').groups[0].keys);
  const elapsed = performance.now() - started;
  assert(elapsed < 1000, `profile took ${elapsed} ms`);
  assert.equal(profile.total, 4000);
  assert.equal(field(profile, 'dimension').distinct, 7);
  assert.equal(field(profile, 'material').missing, 1000);
  assert.equal(narrowing.remaining + narrowing.keys.length, 4000);
});

test('B1 inspector wiring reuses the selection reducer and never bypasses preview/approval gates', async () => {
  const component = await readFile(new URL('../src/components/gmi-edit/GmiBatchInspector.js', import.meta.url), 'utf8');
  assert.match(component, /changeGmiEditSelection\(current\.binding\.layerId, \{ type: action\.type/);
  assert.match(component, /getGmiProposedState\(view\.session\)\.dataset/);
  assert.match(component, /ruleRows: review && !stale \? review\.preview\.rows : null/);
  // Approval is never carried across a narrowing; the exact-approval token check is unchanged.
  assert.match(component, /setRisk\(null\);\s*setProfileNotice/);
  assert.match(component, /approval\.plan !== plan \|\| approval\.selection !== selection/);
  const profile = await readFile(new URL('../src/lib/gmiSelectionProfile.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(profile, /type: 'add'|stageGmiChangeSet|createGmiBatchCorrection/);
});
