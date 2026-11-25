// Batch 2A: layer ownership in the store (audit F-02 to F-07). Browser evidence: shellAnalysisCorrectnessUi.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js');
const { detectOutliers, getLayerOutlierFeatureIds } = await import('../src/lib/analysis/outliers.js');
const { selectAnalysisActiveResults } = await import('../src/lib/analysis/profileAnalysisHover.js');

const line = (x, z) => ({ attributes: { S_FCODE: 'SP', Dimensjon: '400' }, coordinates: [{ x, y: 0, z }, { x: x + 20, y: 0, z: z - 0.1 }] });
const point = (x, y = 0, z = 1) => ({ attributes: { S_FCODE: 'KUM' }, coordinates: [{ x, y, z }] });
const dataset = ({ lines = [], points = [], epsg = 25832 } = {}) => ({ format: 'GMI', header: { COSYS_EPSG: epsg }, lines, points });
const state = () => useStore.getState();
const load = (name, data) => {
  const layerId = state().addLayer({ file: { name, format: 'GMI' }, data });
  state().setData(data, { layerId });
  state().setParsingDone();
  return layerId;
};
const withOutlier = () => dataset({ points: [point(90000, 90000), ...Array.from({ length: 120 }, (_, i) => point(i, i % 5))] });
const reset = () => { state().resetAll({ discardGmiEdits: true }); state().updateSettings({ inclineRequirementMode: 'fixed10' }); };
const suite = (name, run) => test(name, () => { reset(); try { run(); } finally { reset(); } });

suite('opening an analysis binds results, owner and selection together', () => {
  const a = load('A', dataset({ lines: [line(0, 10), line(50, 10), line(100, 10)] }));
  const b = load('B', dataset({ lines: [line(500, 10)] }));
  assert.equal(state().openLayerAnalysis(a), true);
  assert.equal(selectAnalysisActiveResults(state()), state().layers[a].analysis.results);
  state().selectAnalysisPipe(2, a);
  state().toggleAnalysisModal(false);
  state().openLayerAnalysis(a);
  assert.equal(state().analysis.selectedPipeIndex, 2, 'the same layer keeps its selection');
  state().openLayerAnalysis(b);
  assert.equal(state().analysis.selectedPipeIndex, null, 'another layer never inherits a line index');
  assert.deepEqual(selectAnalysisActiveResults(state()).map((r) => r.lineIndex), [0]);
  state().openLayerAnalysis(a, { pipeIndex: 1 });
  assert.deepEqual([state().analysis.selectedPipeIndex, state().analysis.layerId, selectAnalysisActiveResults(state()).length], [1, a, 3]);
  assert.equal(state().openLayerAnalysis('gone'), false);
  assert.equal(state().analysis.layerId, a, 'a missing layer changes nothing');
});

suite('a retry recalculates from the owning layer', () => {
  const a = load('A', dataset({ lines: [line(0, 10)] }));
  load('B', dataset({ lines: [line(500, 10), line(600, 10)] }));
  state().setLayerAnalysisResults(a, [{ lineIndex: 99, attributes: {}, details: {} }]);
  state().openLayerAnalysis(a, { rerun: true });
  assert.deepEqual(selectAnalysisActiveResults(state()).map((r) => r.lineIndex), [0]);
});

suite('the requirement setting recalculates every layer from its own data and keeps the open one', () => {
  const a = load('A', dataset({ lines: [line(0, 10), line(50, 10)] }));
  const b = load('B', dataset({ lines: [line(500, 10)] }));
  state().openLayerAnalysis(a);
  const rule = (id) => state().layers[id].analysis.results.map((r) => r.details.minInclineRule.min);
  assert.deepEqual([rule(a), rule(b)], [[10, 10], [10]]);
  state().setInclineRequirementMode('variable');
  assert.equal(state().settings.inclineRequirementMode, 'variable');
  assert.deepEqual([rule(a), rule(b)], [[2, 2], [2]], 'no layer keeps results from the old requirement');
  assert.equal(state().analysis.layerId, a);
  assert.equal(selectAnalysisActiveResults(state()).length, 2);
  assert.equal(state().analysis.results, state().layers[a].analysis.results);
});

suite('map navigation carries its layer and never rebinds an analysis of another layer', () => {
  const a = load('A', dataset({ lines: [line(0, 10), line(50, 10)] }));
  const b = load('B', dataset({ lines: [line(500, 10), line(600, 10)] }));
  state().openLayerAnalysis(a, { pipeIndex: 0 });
  state().viewObjectInMap(`ledninger-${b}-1`, [0, 600], 19, { layerId: b, objectType: 'pipe', lineIndex: 1 });
  assert.deepEqual([state().analysis.layerId, state().analysis.selectedPipeIndex], [a, 0]);
  assert.equal(state().ui.mapCenterTarget.layerId, b);
  assert.equal(state().ui.highlightedFeatureId, `ledninger-${b}-1`);
  state().viewObjectInMap(`ledninger-${a}-1`, [0, 50], 19, { layerId: a, objectType: 'pipe', lineIndex: 1 });
  assert.deepEqual([state().analysis.layerId, state().analysis.selectedPipeIndex], [a, 1], 'the same layer still selects');
});

suite('the height control and both load prompts belong to their layer', () => {
  const a = load('A', dataset({ points: [point(0, 0, null)] }));
  const b = load('B', dataset({ points: [point(500, 0, null), point(501, 0, null)] }));
  assert.deepEqual([state().ui.zValidationPromptOpen, state().ui.zValidationPromptLayerId], [true, b]);
  state().openLayerZValidation(a);
  assert.deepEqual([state().zValidation.layerId, state().zValidation.results.missingPoints.length], [a, 1]);
  assert.equal(state().ui.zValidationPromptLayerId, b, 'opening another control does not move the prompt');
  assert.equal(state().openLayerZValidation('gone'), false);
});

suite('ignoring outliers is per layer, layer-qualified, reversible and leaves the data alone', () => {
  const plain = load('A', dataset({ points: [point(0), point(1), point(2)] }));
  const data = withOutlier(), before = JSON.stringify(data);
  const owner = load('C', data);
  assert.deepEqual([state().ui.outlierPromptOpen, state().ui.outlierPromptLayerId], [true, owner]);
  assert.deepEqual(detectOutliers(data, 6).outliers.map((o) => o.index), [0]);
  state().setLayerOutliersHidden(owner, true);
  assert.deepEqual([...getLayerOutlierFeatureIds(state().layers, [owner])], [`punkter-${owner}-0`]);
  assert.equal(state().layers[plain].outliers.hideOutliers, false);
  const other = load('C2', withOutlier());
  assert.equal(state().layers[owner].outliers.hideOutliers, true, 'another file does not reset the choice');
  assert.equal(state().layers[other].outliers.hideOutliers, false);
  state().setLayerOutliersHidden(owner, false);
  assert.equal(state().layers[owner].outliers.hideOutliers, false);
  assert.equal(state().layers[owner].data, data);
  assert.equal(JSON.stringify(data), before);
  state().setLayerOutliersHidden('gone', true);
  assert.equal(state().layers.gone, undefined, 'a removed layer gets no state back');
});

suite('removing a layer leaves no analysis, prompt, highlight or map target pointing at it', () => {
  const keep = load('A', dataset({ lines: [line(0, 10)], points: [point(0, 0, null)] }));
  const gone = load('C', { ...withOutlier(), lines: [line(500, 10)] });
  state().openLayerAnalysis(gone, { pipeIndex: 0 });
  state().openLayerZValidation(gone);
  state().setLayerOutliersHidden(gone, true);
  state().openDataInspector({ type: 'line', index: 0, layerId: gone });
  state().viewObjectInMap(`punkter-${gone}-0`, [0, 0], 20, { layerId: gone, objectType: 'point', pointIndex: 0 });
  assert.equal(state().removeLayer(gone).ok, true);
  const { analysis, zValidation, ui, layers } = state();
  assert.deepEqual([analysis.isOpen, analysis.layerId, analysis.selectedPipeIndex, analysis.results.length], [false, null, null, 0]);
  assert.deepEqual([zValidation.isOpen, zValidation.layerId, zValidation.results], [false, null, null]);
  assert.deepEqual([ui.outlierPromptOpen, ui.outlierPromptLayerId, ui.highlightedFeatureId, ui.mapCenterTarget, ui.selectedObject3D, ui.dataInspectorOpen],
    [false, null, null, null, null, false]);
  assert.deepEqual(Object.keys(layers), [keep]);
});

suite('removing another layer leaves the open analysis and prompts alone', () => {
  const gone = load('B', dataset({ lines: [line(500, 10)] }));
  const keep = load('A', dataset({ lines: [line(0, 10), line(50, 10)], points: [point(0, 0, null)] }));
  state().openLayerAnalysis(keep, { pipeIndex: 1 });
  state().removeLayer(gone);
  assert.deepEqual([state().analysis.isOpen, state().analysis.layerId, state().analysis.selectedPipeIndex], [true, keep, 1]);
  assert.deepEqual([state().ui.zValidationPromptOpen, state().ui.zValidationPromptLayerId], [true, keep]);
  assert.equal(state().ui.highlightedFeatureId, `ledninger-${keep}-1`);
});

suite('the layer-card Validator replaces stale focus, and closing Validator clears it', () => {
  const a = load('A', dataset({ points: [point(0)] })), b = load('B', dataset({ points: [point(500)] }));
  state().openGmiValidator(a, 'original', 'someRule', 'point');
  assert.equal(state().gmiValidatorFocus.layerId, a);
  state().toggleFieldValidation(false);
  assert.equal(state().gmiValidatorFocus, null);
  state().openGmiValidator(a, 'original', 'someRule', 'point');
  assert.equal(state().openLayerValidator(b), true);
  assert.deepEqual(state().gmiValidatorFocus, { layerId: b, ruleId: null, geometryScope: null });
  assert.deepEqual([state().ui.fieldValidationOpen, state().ui.expandedLayerId], [true, b]);
  assert.equal(state().openLayerValidator('gone'), false);
});

suite('a cancelled import or dismissed error restores the earlier workspace state, never an old error', () => {
  state().startParsing(); state().setParsingError('feil');
  const failed = state().parsing;
  state().restoreParsing(failed);
  assert.deepEqual([state().parsing.status, state().parsing.error], ['idle', null], 'start screen');
  load('A', dataset({ points: [point(0)] }));
  const done = state().parsing;
  state().startParsing();
  state().restoreParsing(done);
  assert.equal(state().parsing, done);
  state().startParsing(); state().setParsingError('feil');
  state().restoreParsing();
  assert.deepEqual([state().parsing.status, state().parsing.error], ['done', null]);
  assert.equal(state().layerOrder.length, 1);
});

test('contracts: hooks precede data-dependent returns, boundaries stay local, and the map matches exact identities', async () => {
  const read = (file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const [modal, tooltip, page, map, panel, height, standards, upload] = await Promise.all(['components/InclineAnalysisModal.js', 'components/3D/Tooltip3D.js',
    'app/page.js', 'components/MapInner.js', 'components/LayerPanel.js', 'components/ZValidationModal.js', 'components/StandardsInfoModal.js', 'components/FileUpload.js'].map(read));
  const plot = modal.slice(modal.indexOf('function PipeProfileVisualization'), modal.indexOf('function AnalysisResultRow'));
  const tip = tooltip.slice(tooltip.indexOf('export default function Tooltip3D'));
  const hook = /\buse(?:Memo|Effect|LayoutEffect|Callback|Ref|State|Store)\(/g;
  const lastHook = (source) => Math.max(...[...source.matchAll(hook)].map((match) => match.index));
  assert(lastHook(plot) < plot.indexOf('if (!hasProfile) {\r\n    return') || lastHook(plot) < plot.indexOf('if (!hasProfile) {\n    return'));
  assert(lastHook(tip) < tip.indexOf('if (!object) return null;'));
  assert.doesNotMatch(modal, /<PipeProfileVisualization[^>]*key=/, 'the crash is not hidden by remounting');
  assert.doesNotMatch(page, /ErrorBoundary/, 'the boundary surrounds analysis presentations, not the application');
  assert.doesNotMatch(map, /=== baseId|featureId, baseId/);
  for (const source of [panel, standards]) assert.doesNotMatch(source, /state\.data\b/);
  assert.match(height, /layerId \? state\.layers\[layerId\]\?\.data : state\.data/);
  assert.doesNotMatch(upload, /window\.confirm/);
});
