import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { createGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { createGmiObjectCorrection } from '../src/lib/gmi-edit/index.mjs';
import { gmiProposedViewForStatus } from '../src/lib/gmiEditView.mjs';
import { deriveLayerTableRows } from '../src/lib/layerTableRows.mjs';
register('./esmJsLoader.mjs', import.meta.url);
const { default: useStore } = await import('../src/lib/store.js');
const { gmiEditSessions } = await import('../src/lib/gmiEditSessions.mjs');

test('R6A both hosts mount the one shared implementation; display-only context cannot change membership', async () => {
  const read = (file) => readFile(new URL(`../src/components/${file}`, import.meta.url), 'utf8');
  const [ordinary, editing, shared, workspace] = await Promise.all([
    read('LayerPanel.js'), read('gmi-edit/GmiLayerFilters.js'), read('LayerFilterSections.js'), read('gmi-edit/GmiEditWorkspace.js'),
  ]);
  for (const host of [ordinary, editing]) {
    assert.match(host, /import \{ LayerTemaSection, LayerFeltSection \} from/);
    assert.match(host, /<LayerTemaSection layerId=|<LayerTemaSection\s+layerId=/);
    assert.match(host, /<LayerFeltSection layerId=|<LayerFeltSection\s+layerId=/);
    assert.doesNotMatch(host, /const temaStats|const fieldAnalysis|toggleLayerHiddenCode\(/);
  }
  assert.match(shared, /toggleLayerHiddenCode\(layerId, code\)/);
  assert.match(shared, /toggleLayerHiddenType/);
  assert.match(shared, /toggleLayerFeltHiddenValue/);
  assert.match(editing, /state\.ui\.layerDataTable\?\.activeTabByLayer/);
  assert.match(editing, /state\.gmiEditTableView\[layerId\]/);
  assert.match(editing, /gmiProposedViewForStatus\(gmiEditSessions, status\)/);
  assert.match(editing, /geometryTab=\{geometry\}/);
  assert.doesNotMatch(shared + editing, /changeGmiEditSelection|gmiEditSelection:|gmiBatchTableReview:|openGmiEditWorkspace|createGmiBatchCorrection/);
  assert.match(workspace, /<GmiLayerFilters/);
  assert.doesNotMatch(workspace, /ObjectList|data-object-key/);
  assert.match(workspace, /<GmiChangeList/);
});

test('R6A layer filters persist across hosts, never change geometry/selection, and read the same proposed basis as the table', async (t) => {
  useStore.getState().resetAll({ discardGmiEdits: true });
  t.after(() => useStore.getState().resetAll({ discardGmiEdits: true }));
  const bytes = gmiEditBatchFixture({ fields: ['S_FCODE', 'Material', 'SDR', 'Trykklasse', 'Ringstivhet'], rows: [['VL', 'PE', '', '', ''], ['SP', 'PVC', '', '', ''], ['VL', 'PE', '', '', '']] });
  const parser = new GMIParser(decodeGmiBytes(bytes)), { warningSummary, ...data } = parser.toObject();
  void warningSummary;
  const layerId = useStore.getState().addLayer({ file: { name: 'R6A.gmi', format: 'GMI' }, data,
    sourceInput: { file: new File([bytes], 'R6A.gmi'), evidence: createGmiPhotoSource(parser) } });
  const { handle } = await gmiEditSessions.open(layerId);
  useStore.getState().openGmiEditWorkspace(layerId);
  const binding = { layerId, sessionId: handle.sessionId, fingerprint: handle.fingerprint };
  useStore.getState().changeGmiEditSelection(layerId, { type: 'add', scope: 'line', keys: ['line:0', 'line:2'] }, binding);
  useStore.getState().setLayerDataTableTab(layerId, 'ledninger');
  const selected = useStore.getState().gmiEditSelection;
  const rows = (dataset = data) => deriveLayerTableRows({ dataset, tab: 'ledninger', filters: useStore.getState().layers[layerId] }).items.map((o) => o.__index);
  const untouched = () => {
    assert.equal(useStore.getState().gmiEditSelection, selected);
    assert.equal(useStore.getState().ui.layerDataTable.activeTabByLayer[layerId], 'ledninger');
  };
  useStore.getState().toggleLayerHiddenCode(layerId, 'SP');
  assert.deepEqual(rows(), [0, 2]); untouched();
  useStore.getState().toggleLayerFeltHiddenValue(layerId, 'Material', 'PE', 'lines');
  assert.deepEqual(rows(), []); untouched();
  useStore.getState().closeGmiEditWorkspace();
  const filters = useStore.getState().layers[layerId];
  assert.deepEqual(filters.hiddenCodes, ['SP']);
  assert.deepEqual(filters.feltHiddenValues, [{ fieldName: 'Material', value: 'PE', objectType: 'lines' }]);
  useStore.getState().openGmiEditWorkspace(layerId);
  assert.equal(useStore.getState().layers[layerId], filters);
  useStore.getState().resetLayerFilters(layerId);
  const session = gmiEditSessions.getSession(handle).session;
  const change = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 0, values: { Material: 'PE100' }, mode: 'overwrite' });
  assert.equal(gmiEditSessions.stage(handle, change.changeSet).ok, true);
  const proposed = gmiProposedViewForStatus(gmiEditSessions, useStore.getState().gmiEditStatus[layerId]);
  assert.equal(proposed.ok, true);
  useStore.getState().toggleLayerFeltHiddenValue(layerId, 'Material', 'PE100', 'lines');
  assert.deepEqual(rows(data), [0, 1, 2]);
  assert.deepEqual(rows(proposed.dataset), [1, 2]);
  const changed = deriveLayerTableRows({ dataset: proposed.dataset, tab: 'ledninger', view: 'changed',
    changedByObject: proposed.changed.byObject, filters: useStore.getState().layers[layerId] });
  assert.deepEqual(changed.items, []);
  assert.equal(data.lines[0].attributes.Material, 'PE');
});


test('U6 disclosures are layer/geometry specific, transient and cleaned on removal/reset', async () => {
  useStore.getState().resetAll({ discardGmiEdits: true });
  const a = useStore.getState().addLayer({ file: { name: 'Synthetic.gmi', format: 'GMI' }, data: { points: [], lines: [] } });
  const b = useStore.getState().addLayer({ file: { name: 'Other.gmi', format: 'GMI' }, data: { points: [], lines: [] } });
  const layer = useStore.getState().layers[a];
  for (const [key, value] of [['section', 'felt'], ['group:points:Type', true], ['group:lines:Material', true]]) {
    useStore.getState().setLayerFilterDisclosure(a, key, value);
  }
  useStore.getState().setLayerFilterDisclosure(b, 'section', 'tema');
  assert.deepEqual(useStore.getState().layerFilterDisclosure[a], { section: 'felt', 'group:points:Type': true, 'group:lines:Material': true });
  assert.equal(useStore.getState().layers[a], layer, 'disclosure does not alter filter values');
  const storeSource = await readFile(new URL('../src/lib/store.js', import.meta.url), 'utf8');
  assert.doesNotMatch(storeSource.slice(storeSource.indexOf('partialize:')), /layerFilterDisclosure/);
  useStore.getState().removeLayer(a);
  assert.equal(useStore.getState().layerFilterDisclosure[a], undefined);
  assert.equal(useStore.getState().layerFilterDisclosure[b].section, 'tema');
  useStore.getState().resetAll({ discardGmiEdits: true });
  assert.deepEqual(useStore.getState().layerFilterDisclosure, {});
});
