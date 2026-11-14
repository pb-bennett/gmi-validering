import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createRettingerPhotoOverride,
  reconcileRettingerPhotoOverride,
  rettingerPhotosSuppressed,
  rettingerPhotoToggleAvailable,
  toggleRettingerPhotoOverride,
} from '../src/lib/workspace/rettingerPhotoVisibility.mjs';
import { buildPhotoMapItems } from '../src/lib/photos/photoMapFeatures.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('A5: entering Rettinger hides photos; Vis/Skjul toggles; exit restores; re-entry hides again', () => {
  let state = reconcileRettingerPhotoOverride(null, null);
  assert.deepEqual(state, { layerId: null, shown: false });
  assert.equal(rettingerPhotosSuppressed(state, false), false, 'Validator/normal map never suppresses');

  state = reconcileRettingerPhotoOverride(state, 'layer-a');
  assert.deepEqual(state, { layerId: 'layer-a', shown: false });
  assert.equal(rettingerPhotosSuppressed(state, true), true, 'entry hides photos');

  state = toggleRettingerPhotoOverride(state);
  assert.equal(state.shown, true);
  assert.equal(rettingerPhotosSuppressed(state, true), false, '«Vis bilder» shows them');
  assert.equal(reconcileRettingerPhotoOverride(state, 'layer-a'), state, 'same visit keeps the choice (identity-stable)');

  state = toggleRettingerPhotoOverride(state);
  assert.equal(rettingerPhotosSuppressed(state, true), true, '«Skjul bilder» hides them again');

  state = toggleRettingerPhotoOverride(state);
  state = reconcileRettingerPhotoOverride(state, null);
  assert.deepEqual(state, { layerId: null, shown: false }, 'exit clears the override');
  assert.equal(rettingerPhotosSuppressed(state, false), false, 'exit restores the map');

  state = reconcileRettingerPhotoOverride(state, 'layer-a');
  assert.equal(rettingerPhotosSuppressed(state, true), true, 're-entry hides again even after «Vis bilder»');
});

test('A5: switching the Rettinger layer resets the override; FOTO workspace never suppresses', () => {
  const shownOnA = toggleRettingerPhotoOverride(createRettingerPhotoOverride('layer-a'));
  const onB = reconcileRettingerPhotoOverride(shownOnA, 'layer-b');
  assert.deepEqual(onB, { layerId: 'layer-b', shown: false });
  // gmiEditActive is false while the FOTO workspace owns the page, even if a Rettinger layer is still recorded.
  assert.equal(rettingerPhotosSuppressed(onB, false), false);
  assert.equal(toggleRettingerPhotoOverride(createRettingerPhotoOverride(null)).shown, false, 'no toggle outside Rettinger');
});

test('A5: control is offered only for visible FOTO layers with placed photos, and only in Rettinger', () => {
  const layers = [{ id: 'p1', visible: false, placedCount: 4 }, { id: 'p2', visible: true, placedCount: 0 }];
  assert.equal(rettingerPhotoToggleAvailable(layers, true), false, 'hidden or empty layers offer nothing');
  assert.equal(rettingerPhotoToggleAvailable([...layers, { id: 'p3', visible: true, placedCount: 1 }], true), true);
  assert.equal(rettingerPhotoToggleAvailable([{ id: 'p3', visible: true, placedCount: 1 }], false), false);
  assert.equal(rettingerPhotoToggleAvailable(null, true), false);
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
  // A visit ends whenever Rettinger stops owning the workspace (exit, or a trip to FOTO), not only when the layer id clears.
  assert.match(page, /const rettingerVisitLayerId = gmiEditActive \? gmiEditLayerId : null;/);
  assert.match(page, /reconcileRettingerPhotoOverride\(rettingerPhotoState, rettingerVisitLayerId\)/);
  assert.match(page, /rettingerPhotosSuppressed\(rettingerPhotos, gmiEditActive\)/);
  assert.match(page, /suppressed: rettingerPhotosHidden/);
  assert.match(page, /photoToggle=\{rettingerPhotoToggle\}/);
  assert.doesNotMatch(page.split('rettingerPhotoToggle = ')[1].split('} : null;')[0], /setLayerVisibility/);
  assert.match(mapInner, /photosSuppressed = Boolean\(photoDisplay\?\.suppressed\) && !workspaceLayerId/);
  assert.match(mapInner, /photosSuppressed \? \[\] : buildPhotoMapItems/);
  assert.match(legend, /!photoDisplay\.suppressed/);
  assert.match(toolbar, /<PhotoIconButton icon=\{ImagesIcon\} label="Vis bilder" pressed=\{photoToggle\.shown\}/);
  assert.match(toolbar, /tooltip=\{photoToggle\.shown \? 'Skjul bilder' : 'Vis bilder'\}/);
});
