import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryFixture } from './helpers/deliveryFixtures.mjs';
import { planPhotoExclusion } from '../src/lib/photos/photoDeliveryChoice.mjs';
import { emptyPhotoWorkspace, photoWorkspaceReducer, DEFAULT_PHOTO_FILTER } from '../src/lib/photos/photoWorkspaceState.mjs';
import { photoWorkspaceView } from '../src/lib/photos/photoWorkspaceView.mjs';
import { buildDeliveryPackage } from '../src/lib/delivery/index.mjs';

test('whole asset: all GMI occurrences, hidden confirmation, one publish, exact restoration and byte preservation', async () => {
  const f = await deliveryFixture();
  try {
    const linked = f.photos().filter((photo) => photo.occurrence), [a, b] = linked;
    const records = JSON.stringify(f.photos()), file = f.session.getAssetFile(a.assetId), bytes = await file.arrayBuffer();
    let publishes = 0; f.session.subscribe(() => publishes++);
    let plan = planPhotoExclusion(f.session.getLayerDelivery(f.layerId), f.session.getLayer(f.layerId), [a.id]);
    assert(plan.ok && plan.needsConfirmation); assert.equal(plan.assetCount, 1); assert.equal(plan.occurrenceCount, 2);
    assert.deepEqual(plan.additional.map((row) => row.photoId), [b.id]);
    const result = f.session.setPhotoDeliveryExclusion(f.layerId, [a.id], { expectedStateKey: plan.stateKey });
    assert(result.ok); assert.deepEqual(result.changedIds, linked.map((photo) => photo.id)); assert.equal(publishes, 1);
    assert.equal(f.session.getLayerDelivery(f.layerId).assets[a.assetId].status, 'excluded');
    assert.deepEqual(f.session.getPhotoDeliverySnapshot(f.layerId).removalSelections, []);
    for (const mode of ['combined', 'split']) {
      const delivery = await f.plan(mode); assert.equal(delivery.status, 'blocked');
      assert(delivery.errors.some((error) => error.code === 'exclusions-not-supported-yet'));
      await assert.rejects(buildDeliveryPackage(delivery), { code: 'blocked-plan' });
    }
    assert(f.session.setPhotoDeliveryExclusion(f.layerId, [a.id], { include: true }).ok);
    assert.equal(publishes, 2);
    for (const photo of linked) assert.equal(f.session.getLayerDelivery(f.layerId).byPhotoId[photo.id].status, 'keep-link');
    assert.equal(JSON.stringify(f.photos()), records);
    assert.deepEqual(await file.arrayBuffer(), bytes); assert.deepEqual(new Uint8Array(await f.file.arrayBuffer()), f.bytes);
    plan = planPhotoExclusion(f.session.getLayerDelivery(f.layerId), f.session.getLayer(f.layerId), linked.map((photo) => photo.id));
    assert.equal(plan.needsConfirmation, false, 'all affected placements selected and shown');
  } finally { f.session.clear(); }
});

test('selected occurrences stay exact; mixed linked/unlinked session changes publish together and restore safe defaults', async () => {
  const f = await deliveryFixture();
  try {
    const [a, b] = f.photos().filter((photo) => photo.occurrence), u = f.photos().find((photo) => !photo.occurrence);
    f.session.setCombinedDeliveryInclusion(f.layerId, [u.id], true);
    let publishes = 0; f.session.subscribe(() => publishes++);
    let result = f.session.setPhotoDeliveryExclusion(f.layerId, [a.id, u.id], { scope: 'occurrences' });
    assert(result.ok); assert.equal(publishes, 1); assert.equal(result.needsConfirmation, false);
    let d = f.session.getLayerDelivery(f.layerId);
    assert.equal(d.byPhotoId[a.id].status, 'exclude'); assert.equal(d.byPhotoId[b.id].status, 'keep-link');
    assert.equal(d.byPhotoId[u.id].status, 'not-selected'); assert.equal(d.assets[a.assetId].status, 'partial');
    const view = (key) => photoWorkspaceView(f.photos(), { filter: { ...DEFAULT_PHOTO_FILTER, delivery: key } }, { delivery: f.session.getLayerDelivery(f.layerId) });
    assert.deepEqual(new Set(view('not-delivered').rows.map((photo) => photo.id)), new Set([a.id, u.id]));
    assert.equal(view('partial').rows.length, 2);
    result = f.session.setPhotoDeliveryExclusion(f.layerId, [a.id, u.id], { scope: 'occurrences', include: true });
    assert(result.ok); assert.equal(publishes, 2); d = f.session.getLayerDelivery(f.layerId);
    assert.equal(d.byPhotoId[a.id].status, 'keep-link'); assert.equal(d.byPhotoId[u.id].status, 'include');
    f.session.setDeliveryIntent(f.layerId, [b.id], 'transfer');
    f.session.setPhotoDeliveryExclusion(f.layerId, [a.id]);
    assert.equal(f.session.getLayerDelivery(f.layerId).byPhotoId[b.id].status, 'exclude');
  } finally { f.session.clear(); }
});

test('pure command expands mixed linked/unlinked occurrences of one asset and refuses unsafe members atomically', () => {
  const linked = { photoId: 'a', assetId: 'asset', linked: true, status: 'keep-link', canTransfer: true, association: { state: 'confident', occurrenceKey: 'key', objectLabel: 'Kum A' } };
  const unlinked = { photoId: 'b', assetId: 'asset', linked: false, status: 'include', canInclude: true, association: { objectLabel: null } };
  const d = { byPhotoId: { a: linked, b: unlinked }, linksWithoutOccurrence: [], stateKey: 'state' }, layer = { photoIds: ['a', 'b'] };
  const options = { visibleIds: ['a'] };
  const plan = planPhotoExclusion(d, layer, ['a'], options);
  assert.deepEqual(plan.writes, [{ photoId: 'a', decision: { kind: 'gmi', occurrenceKey: 'key', intent: 'exclude' } }, { photoId: 'b', decision: null }]);
  assert(plan.needsConfirmation);
  for (const reason of ['source-missing', 'source-not-live', 'association-lost', 'association-changed', 'fingerprint-mismatch', 'occurrence-changed']) {
    const unsafe = { ...d, byPhotoId: { ...d.byPhotoId, b: { ...unlinked, status: 'review', reason } } };
    const refused = planPhotoExclusion(unsafe, layer, ['a'], options);
    assert.equal(refused.ok, false); assert.deepEqual(refused.writes, []); assert.equal(refused.blocked[0].reason, reason);
  }
  assert.equal(planPhotoExclusion(d, layer, ['a'], { scope: 'occurrences' }).needsConfirmation, false);
  assert.equal(planPhotoExclusion(d, layer, ['a'], { scope: 'occurrences', visibleIds: [] }).needsConfirmation, true);
});

test('unsafe and stale session selections refuse all writes; reviewed confirmations cannot outlive decisions', async () => {
  const f = await deliveryFixture();
  try {
    const a = f.photos().find((photo) => photo.occurrence), u = f.photos().find((photo) => !photo.occurrence);
    let d = f.session.getLayerDelivery(f.layerId);
    f.session.setCombinedDeliveryInclusion(f.layerId, [u.id], true);
    let publishes = 0; f.session.subscribe(() => publishes++);
    assert.equal(f.session.setPhotoDeliveryExclusion(f.layerId, [a.id], { expectedStateKey: d.stateKey }).error, 'stale-plan');
    assert.equal(f.session.setPhotoDeliveryExclusion(f.layerId, [a.id, 'gone']).ok, false);
    assert.equal(publishes, 0);
    f.session.reconcileLoadedGmiBindings(() => false);
    d = f.session.getLayerDelivery(f.layerId); publishes = 0;
    const result = f.session.setPhotoDeliveryExclusion(f.layerId, [a.id, u.id]);
    assert.equal(result.ok, false); assert(result.blocked.some((item) => item.reason === 'source-not-live'));
    assert.equal(publishes, 0); assert.deepEqual(f.session.getLayerDelivery(f.layerId), d);
  } finally { f.session.clear(); }
});

test('line links and removed FOTO placements block whole-photo exclusion without skipping the retained link', async () => {
  for (const line of [false, true]) {
    const f = await deliveryFixture(line ? { lines: [{ hyperlink: 'h:1(link:"Attachments\\shared.png") ' }] } : {});
    try {
      const [a, b] = f.photos().filter((photo) => photo.occurrence);
      if (!line) f.session.removeLayerPhotos(f.layerId, [b.id], { confirmed: true });
      const before = f.session.getPhotoDeliverySnapshot(f.layerId);
      const result = f.session.setPhotoDeliveryExclusion(f.layerId, [a.id]);
      assert.equal(result.ok, false); assert(result.blocked.some((item) => item.reason === 'links-without-occurrence'));
      assert.equal(f.session.getPhotoDeliverySnapshot(f.layerId).stateKey, before.stateKey);
      assert(f.session.setPhotoDeliveryExclusion(f.layerId, [a.id], { scope: 'occurrences' }).ok);
      assert.equal(f.session.getLayerDelivery(f.layerId).assets[a.assetId].status, 'partial');
    } finally { f.session.clear(); }
  }
});

test('exclusion selection is mode-scoped, reconciled, filter-independent and separate from removal/planning', () => {
  let s = photoWorkspaceReducer(emptyPhotoWorkspace, { type: 'enter', layerId: 'layer', photoIds: ['a', 'b'] });
  s = photoWorkspaceReducer(s, { type: 'mode', mode: 'exclude' });
  s = photoWorkspaceReducer(s, { type: 'select-exclusion', photoIds: ['a', 'a', 'b', 'gone'] }); assert.deepEqual(s.excludeIds, ['a', 'b']);
  s = photoWorkspaceReducer(s, { type: 'filter', filter: { delivery: 'not-delivered' } }); assert.deepEqual(s.excludeIds, ['a', 'b']);
  s = photoWorkspaceReducer(s, { type: 'reconcile', layer: { id: 'layer', photoIds: ['b'] } }); assert.deepEqual(s.excludeIds, ['b']);
  s = photoWorkspaceReducer(s, { type: 'mode', mode: 'remove' }); assert.deepEqual(s.excludeIds, []);
  s = photoWorkspaceReducer(s, { type: 'toggle-removal', photoId: 'b' }); assert.deepEqual(s.removalIds, ['b']);
  s = photoWorkspaceReducer(s, { type: 'mode', mode: 'delivery' }); assert.deepEqual(s.removalIds, []);
  assert.strictEqual(photoWorkspaceReducer(s, { type: 'toggle-exclusion', photoId: 'b' }), s);
  s = photoWorkspaceReducer(s, { type: 'enter', layerId: 'other', photoIds: ['c'] }); assert.deepEqual(s.excludeIds, []);
});

test('50 physical photographs can be excluded and restored in one publish each, including a repeated asset', async () => {
  const names = ['shared.png', ...Array.from({ length: 49 }, (_, index) => `synthetic-${index}.png`)];
  const f = await deliveryFixture({ names });
  try {
    const photos = f.photos(), ids = photos.map((photo) => photo.id);
    f.session.setCombinedDeliveryInclusion(f.layerId, photos.filter((photo) => !photo.occurrence).map((photo) => photo.id), true);
    let publishes = 0; f.session.subscribe(() => publishes++);
    const removed = f.session.setPhotoDeliveryExclusion(f.layerId, ids);
    assert(removed.ok); assert.equal(removed.assetCount, 50); assert.equal(removed.occurrenceCount, 51); assert.equal(publishes, 1);
    assert(Object.values(f.session.getLayerDelivery(f.layerId).assets).every((asset) => asset.status === 'excluded'));
    const restored = f.session.setPhotoDeliveryExclusion(f.layerId, ids, { include: true });
    assert(restored.ok); assert.equal(restored.changedIds.length, 51); assert.equal(publishes, 2);
    assert(Object.values(f.session.getLayerDelivery(f.layerId).assets).every((asset) => asset.status === 'included'));
  } finally { f.session.clear(); }
});
