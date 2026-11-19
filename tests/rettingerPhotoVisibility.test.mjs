import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createWorkspacePhotoOverride,
  forgetPhotoVisibilityWithoutPhotos,
  reconcileWorkspacePhotoOverride,
  workspacePhotosSuppressed,
  workspacePhotoToggleAvailable,
  toggleWorkspacePhotoOverride,
} from '../src/lib/workspace/rettingerPhotoVisibility.mjs';
import { buildPhotoMapItems } from '../src/lib/photos/photoMapFeatures.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('A5: entering Rettinger hides photos; Vis/Skjul toggles; exit restores; re-entry hides again', () => {
  let state = reconcileWorkspacePhotoOverride(null, null);
  assert.deepEqual(state, { visitKey: null, shown: false, hidden: false });
  assert.equal(workspacePhotosSuppressed(state), false, 'the main map shows photos by default');

  state = reconcileWorkspacePhotoOverride(state, 'rettinger:layer-a');
  assert.deepEqual(state, { visitKey: 'rettinger:layer-a', shown: false, hidden: false });
  assert.equal(workspacePhotosSuppressed(state), true, 'entry hides photos');

  state = toggleWorkspacePhotoOverride(state);
  assert.equal(state.shown, true);
  assert.equal(workspacePhotosSuppressed(state), false, '«Vis bilder» shows them');
  assert.equal(reconcileWorkspacePhotoOverride(state, 'rettinger:layer-a'), state, 'same visit keeps the choice (identity-stable)');

  state = toggleWorkspacePhotoOverride(state);
  assert.equal(workspacePhotosSuppressed(state), true, '«Skjul bilder» hides them again');

  state = toggleWorkspacePhotoOverride(state);
  state = reconcileWorkspacePhotoOverride(state, null);
  assert.deepEqual(state, { visitKey: null, shown: false, hidden: false }, 'exit clears the override');
  assert.equal(workspacePhotosSuppressed(state), false, 'exit restores the map');

  state = reconcileWorkspacePhotoOverride(state, 'rettinger:layer-a');
  assert.equal(workspacePhotosSuppressed(state), true, 're-entry hides again even after «Vis bilder»');
});

test('A5: switching the Rettinger layer resets the override; outside a visit the global choice applies', () => {
  const shownOnA = toggleWorkspacePhotoOverride(createWorkspacePhotoOverride('rettinger:layer-a'));
  const onB = reconcileWorkspacePhotoOverride(shownOnA, 'rettinger:layer-b');
  assert.deepEqual(onB, { visitKey: 'rettinger:layer-b', shown: false, hidden: false });
  const foto = reconcileWorkspacePhotoOverride(onB, null);
  assert.equal(workspacePhotosSuppressed(foto), false);
  const hidden = toggleWorkspacePhotoOverride(foto);
  assert.equal(hidden.hidden, true, 'A8.1: outside Validator and Rettinger the control sets the global choice');
  assert.equal(workspacePhotosSuppressed(hidden), true);
});

test('A8.1: the global choice survives workspace transitions; Validator and Rettinger visits stay temporary', () => {
  let state = toggleWorkspacePhotoOverride(reconcileWorkspacePhotoOverride(null, null));
  assert.equal(workspacePhotosSuppressed(state), true, 'hidden in the main map');
  assert.equal(reconcileWorkspacePhotoOverride(state, null), state, 'main map and FOTO share the choice (identity-stable)');
  state = reconcileWorkspacePhotoOverride(state, 'validator');
  assert.equal(workspacePhotosSuppressed(state), true, 'Validator entry hides as before');
  state = toggleWorkspacePhotoOverride(state);
  assert.equal(workspacePhotosSuppressed(state), false, 'a visit can show photos for itself');
  assert.equal(state.hidden, true, 'without changing the global choice');
  state = reconcileWorkspacePhotoOverride(state, null);
  assert.equal(workspacePhotosSuppressed(state), true, 'leaving the visit restores the global choice');
  state = toggleWorkspacePhotoOverride(state);
  assert.equal(workspacePhotosSuppressed(reconcileWorkspacePhotoOverride(state, 'rettinger:layer-a')), true, 'Rettinger still starts hidden');
  assert.equal(workspacePhotosSuppressed(reconcileWorkspacePhotoOverride(state, null)), false);
});

test('A8.1: the global choice is forgotten when no photo layer is left', () => {
  const hidden = toggleWorkspacePhotoOverride(createWorkspacePhotoOverride(null));
  assert.equal(forgetPhotoVisibilityWithoutPhotos(hidden, [{ id: 'p1' }]), hidden, 'kept while photo layers exist');
  assert.equal(forgetPhotoVisibilityWithoutPhotos(hidden, []).hidden, false);
  const shown = createWorkspacePhotoOverride(null);
  assert.equal(forgetPhotoVisibilityWithoutPhotos(shown, []), shown, 'identity-stable when nothing changes');
});

test('Validator keeps its override within a visit and resets it on direct transitions and re-entry', () => {
  let state = reconcileWorkspacePhotoOverride(null, 'validator');
  assert.equal(workspacePhotosSuppressed(state), true);
  state = toggleWorkspacePhotoOverride(state);
  assert.equal(reconcileWorkspacePhotoOverride(state, 'validator'), state, 'Validator uses the same key across survey layers');
  state = reconcileWorkspacePhotoOverride(state, 'rettinger:layer-a');
  assert.equal(workspacePhotosSuppressed(state), true, 'Validator to Rettinger starts hidden');
  state = reconcileWorkspacePhotoOverride(toggleWorkspacePhotoOverride(state), 'validator');
  assert.equal(workspacePhotosSuppressed(state), true, 'Rettinger to Validator starts hidden');
  state = reconcileWorkspacePhotoOverride(toggleWorkspacePhotoOverride(state), null);
  assert.equal(workspacePhotosSuppressed(state), false);
  assert.equal(workspacePhotosSuppressed(reconcileWorkspacePhotoOverride(state, 'validator')), true);
});

test('A8.1: control is offered in every map whenever a visible photo layer has placed photos', () => {
  const layers = [{ id: 'p1', visible: false, placedCount: 4 }, { id: 'p2', visible: true, placedCount: 0 }];
  const visibleLayers = [...layers, { id: 'p3', visible: true, placedCount: 1 }];
  assert.equal(workspacePhotoToggleAvailable(layers), false, 'hidden or empty layers offer nothing');
  assert.equal(workspacePhotoToggleAvailable(visibleLayers), true);
  assert.equal(workspacePhotoToggleAvailable(null), false, 'no photos loaded');
  assert.equal(workspacePhotoToggleAvailable([]), false);
  assert.equal(workspacePhotoToggleAvailable(layers, 'p1'), true, 'FOTO always shows the layer it opened');
});

test('A5: the override never mutates layer visibility, and initially hidden layers stay hidden when shown', () => {
  const layers = Object.freeze([
    Object.freeze({ id: 'visible', visible: true, placedCount: 1 }),
    Object.freeze({ id: 'hidden', visible: false, placedCount: 1 }),
  ]);
  const photo = (id) => ({ id, spatial: { current: { position: { crs: 'EPSG:4326', latitude: 59.9, longitude: 10.7 } } } });
  const items = buildPhotoMapItems(layers, (layerId) => [photo(`${layerId}-1`)]);
  assert.deepEqual(items.map((item) => item.layerId), ['visible'], '«Vis bilder» uses the persistent flags unchanged');
  assert.deepEqual(layers.map((layer) => layer.visible), [true, false]);
});

test('A5 wiring: render-time override only; no photoSession visibility writes; legend follows effective visibility', async () => {
  const [page, mapInner, legend, toolbar, helper] = await Promise.all([
    read('../src/app/page.js'),
    read('../src/components/MapInner.js'),
    read('../src/components/MapLegend.js'),
    read('../src/components/MapPaneToolbar.js'),
    read('../src/lib/workspace/rettingerPhotoVisibility.mjs'),
  ]);
  assert.doesNotMatch(helper, /setLayerVisibility\(|^import |localStorage/m);
  assert.match(page, /const validatorActive = !workspaceLayer && !gmiEditActive && fieldValidationOpen;/);
  assert.match(page, /const photoVisitKey = gmiEditActive \? `rettinger:\$\{gmiEditLayerId\}` : validatorActive \? 'validator' : null;/);
  assert.match(page, /reconcileWorkspacePhotoOverride\(workspacePhotoState, photoVisitKey\)/);
  assert.match(page, /workspacePhotosSuppressed\(workspacePhotosOverride\)/);
  assert.match(page, /suppressed: workspacePhotosHidden/);
  assert.match(page, /photoToggle=\{workspacePhotoToggle\}/);
  assert.doesNotMatch(page.split('workspacePhotoToggle = ')[1].split('} : null;')[0], /setLayerVisibility/);
  assert.match(mapInner, /photosSuppressed = Boolean\(photoDisplay\?\.suppressed\) && !photoWorkspace\?\.editing/);
  assert.match(mapInner, /photosSuppressed \? \[\] : buildPhotoMapItems/);
  assert.match(legend, /!photoDisplay\.suppressed/);
  assert.match(toolbar, /<PhotoIconButton icon=\{ImagesIcon\} label="Vis bilder" pressed=\{editing \|\| photoToggle\.shown\}/);
  assert.match(toolbar, /photoToggle\.shown \? 'Skjul bilder' : 'Vis bilder'/);
  // A8.1: FOTO renders the same control; its header has no second visibility control.
  assert.match(page, /<MapPhotoToggleBar photoToggle=\{workspacePhotoToggle\} editing=\{photoEditing\} \/>/);
  assert.match(page, /hidden: workspacePhotosHidden && !photoEditing/);
  const collection = await read('../src/components/photos/PhotoWorkspaceCollection.js');
  assert.doesNotMatch(collection, /photo-workspace-visibility|setLayerVisibility/);
});
