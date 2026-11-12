import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadGmiSourceDocument, createGmiEditSession, stageGmiChangeSet, undoGmiEdit, getGmiProposedState, getGmiSourceBytes } from '../src/lib/gmi-edit/index.mjs';
import { prepareGmiFieldBatch, buildGmiFieldBatch, dryRunGmiFieldBatch, getGmiFieldBatchApproval } from '../src/lib/gmiFieldBatchPlan.mjs';
import { gmiCurrentFindingSplit, gmiBatchRiskReasons, gmiInspectorMixedFields } from '../src/lib/gmiBatchInspectorView.mjs';
import { buildGmiSelectionProfile, gmiSelectionProfileSources, gmiProfileMixedColumns, gmiProfileDistributionText, gmiSelectionNarrowing } from '../src/lib/gmiSelectionProfile.mjs';
import { reduceGmiEditSelection } from '../src/lib/gmiEditSelection.mjs';
import { encodeSingleByte } from './helpers/gmiEditFixtures.mjs';

// Synthetic: Tema;Material;Dimensjon;Stedfestingsårsak;SDR
const ROWS = [
  ['VL', 'PE', '110', 'NYTT', ''], ['VL', 'PE', '110', 'UENDR', ''], ['VL', 'PVC', '160', 'NYTT', ''],
  ['SP', 'PE', '160', 'NYTT', ''], ['VL', 'PE', '110', 'NYTT', '11'], ['VL', 'PE', '110', 'NYTT', '99'], ['VL', 'PE', '110', 'NYTT', ''],
];
function fixture(rows = ROWS) {
  const out = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', 'COSYS_EPSG 25832',
    '[L_]', '_FIELDNAMES Tema;Material;Dimensjon;Stedfestingsårsak;SDR;', '[+L_]'];
  rows.forEach((values, index) => out.push(`:L ${index + 1}`, `_FIELDVALUES ${values.join(';')};`, '/XYZ',
    `581940 ${6566000 + index} 101`, `581945 ${6566001 + index} 101`));
  out.push('[END]', '');
  return encodeSingleByte(out.join('\r\n'));
}
async function setup() {
  const bytes = fixture(), document = await loadGmiSourceDocument(bytes);
  const session = createGmiEditSession(document, { layerId: 'b2' });
  const binding = { layerId: 'b2', sessionId: 'b2-session', fingerprint: document.fingerprint };
  return { bytes, binding, view: { document, session, handle: { ...binding } } };
}
const keys = (indices) => indices.map((index) => `line:${index}`);

test('B2 split: one category per object with FEIL > SJEKK > none, only for rules of the edited field', () => {
  const finding = (ruleId, state) => ({ key: `${ruleId}|${state}`, ruleId, state, fields: ['SDR', 'Tema', 'Material'] });
  const preview = { sourceKey: 'SDR', column: { canonicalFieldId: 'sdr' }, rows: [
    { key: 'line:0', currentFindings: [finding('innmaling.line.sdr.valid', 'CHECK'), finding('innmaling.line.sdr-ring-stiffness.exclusive', 'FAIL')] },
    { key: 'line:1', currentFindings: [finding('innmaling.line.sdr.valid', 'CHECK'), finding('innmaling.line.material.required', 'FAIL')] },
    { key: 'line:2', currentFindings: [finding('innmaling.line.material.required', 'FAIL')] },
    { key: 'line:3', currentFindings: [] },
    { key: 'line:4' },
    { key: 'line:5', currentFindings: [finding('innmaling.line.sdr.valid', 'FAIL')] },
  ] };
  const split = gmiCurrentFindingSplit(preview, { keys: keys([0, 1, 2, 3, 4]) });
  assert.deepEqual(split.groups, { FEIL: ['line:0'], SJEKK: ['line:1'], none: ['line:2', 'line:3'], unknown: ['line:4'] });
  assert.deepEqual(split.counts, { FEIL: 1, SJEKK: 1, none: 2, unknown: 1 });
  assert.equal(split.total, 5, 'unselected objects are not counted');
  assert.equal(gmiCurrentFindingSplit({ ...preview, column: { canonicalFieldId: null } }, { keys: keys([0]) }), null, 'no split for a field without Validator rules');
  assert.equal(gmiCurrentFindingSplit(null, { keys: keys([0]) }), null);
});

test('B2 split reuses the real preview findings: missing on NYTT is FEIL, on UENDR SJEKK; FEIL narrowing only removes', async () => {
  const { view, binding } = await setup();
  const selection = { binding, scope: 'line', keys: keys([0, 1, 2, 3, 4, 5]) };
  const prepared = await prepareGmiFieldBatch(view, { scope: 'line', sourceKey: 'SDR', operation: 'set', value: '11', selection });
  assert.equal(prepared.ok, true);
  const split = gmiCurrentFindingSplit(prepared.preview, selection);
  assert.deepEqual(split.groups, { FEIL: keys([0, 2, 5]), SJEKK: keys([1]), none: keys([3, 4]), unknown: [] });
  const action = gmiSelectionNarrowing(selection, split.groups.FEIL);
  const narrowed = reduceGmiEditSelection(selection, { type: action.type, scope: action.scope, keys: [...action.keys] },
    { binding, counts: { line: 7, point: 0 } });
  assert.deepEqual(narrowed.keys, keys([0, 2, 5]));
  // Counts follow the narrowed selection without recalculating the preview.
  assert.deepEqual(gmiCurrentFindingSplit(prepared.preview, narrowed).counts, { FEIL: 3, SJEKK: 0, none: 0, unknown: 0 });
});

test('B2 split follows staged corrections and undo through a new preview', async () => {
  const { view, binding, bytes } = await setup();
  const selection = { binding, scope: 'line', keys: keys([0, 2]) };
  const first = await prepareGmiFieldBatch(view, { scope: 'line', sourceKey: 'SDR', operation: 'set', value: '11', selection });
  const batch = buildGmiFieldBatch(view.session, first.preview, { included: new Set(keys([0])) });
  assert.equal(batch.ok, true, batch.code);
  const staged = stageGmiChangeSet(view.session, batch.changeSet).session;
  const after = await prepareGmiFieldBatch({ ...view, session: staged }, { scope: 'line', sourceKey: 'SDR', operation: 'set', value: '17', selection });
  assert.deepEqual(gmiCurrentFindingSplit(after.preview, selection).groups.FEIL, keys([2]));
  assert.deepEqual(gmiCurrentFindingSplit(after.preview, selection).groups.none, keys([0]));
  const undone = undoGmiEdit(staged).session;
  const again = await prepareGmiFieldBatch({ ...view, session: undone }, { scope: 'line', sourceKey: 'SDR', operation: 'set', value: '17', selection });
  assert.deepEqual(gmiCurrentFindingSplit(again.preview, selection).groups.FEIL, keys([0, 2]));
  assert.deepEqual(getGmiSourceBytes(view.document), bytes);
});

test('B2 mixed profile columns name the values and counts; uniform and unavailable columns are never mixed', async () => {
  const { view } = await setup();
  const sources = gmiSelectionProfileSources(view, 'line');
  const dataset = getGmiProposedState(view.session).dataset;
  const mixed = gmiProfileMixedColumns(buildGmiSelectionProfile({ dataset, scope: 'line', keys: keys([0, 1, 2]), sources }));
  assert.deepEqual(mixed.map((column) => [column.label, gmiProfileDistributionText(column)]), [
    ['Material', 'PE (2) · PVC (1)'], ['Dimensjon', '110 (2) · 160 (1)'], ['Stedfestingsårsak', 'NYTT (2) · UENDR (1)']]);
  assert.deepEqual(gmiProfileMixedColumns(buildGmiSelectionProfile({ dataset, scope: 'line', keys: keys([0, 4]), sources })), []);
  const withMissing = gmiProfileMixedColumns({ fields: [{ id: 'x', label: 'X', state: 'bound', groups: [{ label: 'A', count: 1, missing: false }, { label: '(tom)', count: 1, missing: true }] },
    { id: 'y', label: 'Y', state: 'absent', groups: [] }], context: [] });
  assert.deepEqual(withMissing.map((column) => gmiProfileDistributionText(column)), ['A (1) · (tom) (1)']);
});

test('B2 risk predicate: uniform with no new FEIL stages directly; every other reason requires approval', () => {
  assert.deepEqual(gmiBatchRiskReasons({}), []);
  assert.deepEqual(gmiBatchRiskReasons({ changeSetCounts: { populatedOverwrites: 0, overwritten: 0 }, newFail: 0, mixedProfile: [], mixedFields: [] }), []);
  assert.deepEqual(gmiBatchRiskReasons({ newFail: 1 }), ['new-fail']);
  assert.deepEqual(gmiBatchRiskReasons({ mixedProfile: [{ id: 'material' }] }), ['mixed']);
  assert.deepEqual(gmiBatchRiskReasons({ mixedFields: ['Tema'] }), ['mixed']);
  assert.deepEqual(gmiBatchRiskReasons({ manualRows: [{}], changeSetCounts: { populatedOverwrites: 1 }, unvalidated: true }), ['manual', 'overwrite', 'unvalidated']);
  assert.deepEqual(gmiBatchRiskReasons({ changeSetCounts: { overwritten: 2 } }), ['overwrite']);
});

test('B2 real gate inputs: mixed Material/Dimensjon over changing objects; narrowing to a uniform subset removes the mix', async () => {
  const { view, binding } = await setup();
  const sources = gmiSelectionProfileSources(view, 'line');
  const gate = async (indices) => {
    const selection = { binding, scope: 'line', keys: keys(indices) };
    const prepared = await prepareGmiFieldBatch(view, { scope: 'line', sourceKey: 'SDR', operation: 'fill-missing', value: '11', selection });
    const candidate = buildGmiFieldBatch(view.session, prepared.preview, { included: new Set(prepared.preview.rows.filter((row) => row.defaultIncluded).map((row) => row.key)) });
    const checked = getGmiFieldBatchApproval(view.session, await dryRunGmiFieldBatch(view.session, candidate), {});
    assert.equal(checked.ok, true, checked.code);
    const changing = [...new Set(checked.changeSet.cells.map((cell) => `${cell.scope}:${cell.sourceIndex}`))];
    const mixedProfile = changing.length > 1 ? gmiProfileMixedColumns(buildGmiSelectionProfile({ dataset: checked.dryRun.current.dataset,
      scope: 'line', keys: changing, sources, ruleRows: prepared.preview.rows })) : [];
    return { changing, mixedProfile: mixedProfile.map((column) => column.label),
      reasons: gmiBatchRiskReasons({ changeSetCounts: checked.changeSet.counts, newFail: checked.dryRun.diff.newCounts.fail, mixedProfile,
        mixedFields: gmiInspectorMixedFields(prepared.preview, checked.dryRun.current.dataset, checked.changeSet) }) };
  };
  const mixed = await gate([0, 1, 2, 3]);
  // SP is not applicable for SDR and is skipped, so its Tema does not count; the changing VL lines differ in Material/Dimensjon/cause.
  assert.deepEqual(mixed.changing, keys([0, 1, 2]));
  assert.deepEqual(mixed.mixedProfile, ['Material', 'Dimensjon', 'Stedfestingsårsak']);
  assert(mixed.reasons.includes('mixed'));
  // Narrowed to two identical VL/PE/110/NYTT lines (plus a populated, skipped one): uniform, no new FEIL → direct staging.
  const uniform = await gate([0, 4, 6]);
  assert.deepEqual(uniform.changing, keys([0, 6]));
  assert.deepEqual(uniform.reasons, []);
  assert.deepEqual((await gate([0])).mixedProfile, [], 'a single changing object is never mixed');
});

test('B2 inspector wiring keeps the exact approval token and adds only profile mix to the existing gate', async () => {
  const component = await readFile(new URL('../src/components/gmi-edit/GmiBatchInspector.js', import.meta.url), 'utf8');
  assert.match(component, /approval\.plan !== plan \|\| approval\.selection !== selection/);
  assert.match(component, /gmiBatchRiskReasons\(\{ manualRows, changeSetCounts: changeSet\.counts, newFail: checked\.dryRun\.diff\.newCounts\.fail/);
  assert.match(component, /if \(!approval && reasons\.length\)/);
  assert.match(component, /review && !stale \? gmiCurrentFindingSplit\(review\.preview, selection\) : null/);
  assert.match(component, /keys: changing, sources: profileSources/);
});

test('B2 gate uses only the rule\'s own explanation context, not the whole policy context', async () => {
  const { gmiFieldBatchFixture } = await import('./helpers/gmiFieldBatchFixture.mjs');
  const document = await loadGmiSourceDocument(gmiFieldBatchFixture());
  const handle = { layerId: 'b2-ctx', sessionId: 's', fingerprint: document.fingerprint };
  const view = { document, session: createGmiEditSession(document, { layerId: 'b2-ctx' }), handle };
  const selection = { binding: handle, scope: 'line', keys: keys([0, 1]) };
  const prepared = await prepareGmiFieldBatch(view, { scope: 'line', sourceKey: 'Merknad', operation: 'set', value: 'X', selection });
  // The Merknad rule's facts carry pipeShape (S vs R) in its policy context, but do not explain with it.
  assert(prepared.preview.rows.some((row) => row.governingOutcome?.diagnosticFacts?.context?.some((entry) => entry.fieldId === 'pipeShape')));
  const profile = buildGmiSelectionProfile({ dataset: getGmiProposedState(view.session).dataset, scope: 'line', keys: selection.keys,
    sources: gmiSelectionProfileSources(view, 'line'), ruleRows: prepared.preview.rows });
  assert.equal(profile.context.some((entry) => entry.id === 'rule:pipeShape'), false);
  assert.deepEqual(gmiProfileMixedColumns(profile).map((column) => column.label), ['Material', 'Dimensjon']);
});
