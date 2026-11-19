import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { buildPhotoMapItems } from '../src/lib/photos/photoMapFeatures.mjs';
register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// B1.2: main-map Profilanalyse is suspended in FOTO, Validator and Rettinger and returns with the main map.
test('B1.2: page and map suspend the main-map analysis presentation in every workspace without closing it', async () => {
  const [page, mapInner, mapView] = await Promise.all([
    read('../src/app/page.js'), read('../src/components/MapInner.js'), read('../src/components/MapView.js'),
  ]);
  assert.match(page, /const mainMapAnalysisSuspended = Boolean\(workspaceLayer\) \|\| gmiEditActive \|\| validatorActive;/);
  assert.match(page, /const analysisOpen = analysisStateOpen && !mainMapAnalysisSuspended;/);
  assert.match(page, /\{!mainMapAnalysisSuspended && <InclineAnalysisModal \/>\}/);
  assert.match(page, /analysisSuspended=\{mainMapAnalysisSuspended\}/);
  assert.doesNotMatch(page, /toggleAnalysisModal\(false\)/, 'suspension never closes the analysis');
  assert.match(mapInner, /const analysisIsOpen = analysisStateOpen && !analysisSuspended;/);
  assert.match(mapInner, /\{!analysisSuspended && <AnalysisPointsLayer \/>\}/);
  assert.match(mapInner, /storedHighlightedFeatureId === suspendedAnalysisFeatureId/);
  assert.match(mapInner, /<MapClickHandler preservedFeatureId=\{suspendedAnalysisFeatureId\} \/>/);
  assert.match(mapView, /!props\.analysisSuspended && outlierPromptOpen/);
  assert.match(mapView, /!props\.analysisSuspended && zValidationPromptOpen/);
});

test('B1.2: Validator and Rettinger object navigation never changes the suspended profile selection', () => {
  const initial = useStore.getState();
  try {
    useStore.setState({ analysis: { ...initial.analysis, isOpen: true, selectedPipeIndex: 2, layerId: 'a' } });
    useStore.setState((state) => ({ ui: { ...state.ui, fieldValidationOpen: true } }));
    useStore.getState().viewObjectInMap('ledninger-a-5', [59.9, 10.7], 20, { objectType: 'pipe', lineIndex: 5, layerId: 'a' });
    assert.equal(useStore.getState().analysis.selectedPipeIndex, 2, 'Validator');
    assert.equal(useStore.getState().analysis.isOpen, true, 'the analysis stays open for the return');
    useStore.setState((state) => ({ ui: { ...state.ui, fieldValidationOpen: false }, gmiEditWorkspace: { layerId: 'a' } }));
    useStore.getState().viewObjectInMap('ledninger-a-6', [59.9, 10.7], 20, { objectType: 'pipe', lineIndex: 6, layerId: 'a' });
    assert.equal(useStore.getState().analysis.selectedPipeIndex, 2, 'Rettinger');
    useStore.setState({ gmiEditWorkspace: null });
    useStore.getState().viewObjectInMap('ledninger-a-7', [59.9, 10.7], 20, { objectType: 'pipe', lineIndex: 7, layerId: 'a' });
    assert.equal(useStore.getState().analysis.selectedPipeIndex, 7, 'the main map still selects the pipe in the open analysis');
  } finally {
    useStore.setState({ analysis: initial.analysis, ui: initial.ui, gmiEditWorkspace: initial.gmiEditWorkspace });
  }
});

test('A8.1: FOTO draws the layer it opened even when the Layer Manager hides it, without changing the flag', () => {
  const layers = Object.freeze([Object.freeze({ id: 'hidden', visible: false }), Object.freeze({ id: 'other', visible: false })]);
  const photo = (id) => ({ id, spatial: { current: { position: { crs: 'EPSG:4326', latitude: 59.9, longitude: 10.7 } } } });
  const get = (layerId) => [photo(`${layerId}-1`)];
  assert.deepEqual(buildPhotoMapItems(layers, get), []);
  const items = buildPhotoMapItems(layers, get, { include: { layerId: 'hidden', ids: new Set(['hidden-1']), visible: true } });
  assert.deepEqual(items.map((item) => item.layerId), ['hidden']);
  assert.equal(layers[0].visible, false);
});
