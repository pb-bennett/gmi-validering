import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryInventory } from '../src/lib/delivery/deliveryInventory.mjs';
import { DELIVERY_CHOICES, deliveryContents } from '../src/lib/delivery/deliveryWizard.mjs';
import { photoMarkerOptions, photoMarkerIconKey, PHOTO_POSITION_SOURCES, PHOTO_DELIVERY_BADGES } from '../src/lib/photos/photoMarkerPresentation.mjs';
import { deliveryFixture } from './helpers/deliveryFixtures.mjs';
import { readDeliveryAttachment } from '../src/lib/delivery/deliveryPlan.mjs';

const leaves = (node) => node.children ? node.children.flatMap(leaves) : [node.path];
test('inventory is the actual M9 inventory in all modes, with shared files included once', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer();
    for (const mode of ['gmi-only', 'photos-only', 'split', 'combined']) {
      const plan = await f.plan(mode);
      assert.equal(plan.status, 'ready');
      const { root } = deliveryInventory(plan);
      assert.deepEqual(leaves(root), deliveryContents(plan));
      assert.equal(root.name, plan.filename);
      assert.equal(root.count, deliveryContents(plan).length);
      assert(!leaves(root).some((path) => /manifest|rapport/.test(path)));
    }
  } finally { f.session.clear(); }
});
test('nested and outside-attachment paths, complete filenames and large folders retain identity', () => {
  const attachments = Array.from({ length: 500 }, (_, index) => ({ path: `Attachments/long-${index}.jpg`, assetId: `asset-${index}` }));
  attachments.push({ path: 'Other/deeper/æ ø.jpg', assetId: 'outside' }, { path: 'bare.jpg', assetId: 'bare' });
  const plan = { mode: 'combined', filename: 'delivery.zip', naming: { gmiFilename: 'delivery.gmi', gmlFilename: 'delivery.gml' }, photoPlan: {}, attachments };
  const { root, folders } = deliveryInventory(plan);
  assert.deepEqual(folders, ['Attachments', 'Other', 'Other/deeper']);
  assert.equal(root.children.find((entry) => entry.path === 'Attachments').count, 500);
  assert.deepEqual(leaves(root), deliveryContents(plan));
  assert.equal(root.children.find((entry) => entry.path === 'Other').children[0].children[0].attachment.assetId, 'outside');
});
test('delivery badges and batch checks never replace provenance or change one another', () => {
  for (const source of PHOTO_POSITION_SOURCES) for (const status of Object.keys(PHOTO_DELIVERY_BADGES)) for (const mode of ['markers', 'thumbnails']) {
    const options = { sourceKind: source.kind, deliveryStatus: status };
    const ordinary = photoMarkerOptions(mode, options), selected = photoMarkerOptions(mode, { ...options, batchSelected: true });
    assert(ordinary.html.includes(source.color)); assert(selected.html.includes(source.color));
    assert(ordinary.html.includes(`data-delivery-status="${status}"`));
    assert(!ordinary.html.includes('photo-marker-batch')); assert(selected.html.includes('photo-marker-batch'));
    assert.notEqual(photoMarkerIconKey(mode, options), photoMarkerIconKey(mode, { ...options, batchSelected: true }));
  }
});
test('mode labels describe GMI/GML files and preserve mode identifiers', () => {
  assert.deepEqual(DELIVERY_CHOICES.map(({ mode, title }) => [mode, title]), [['gmi-only', 'Kun GMI'], ['photos-only', 'Kun GML med bilder'], ['split', 'Delt levering (GMI + GML)'], ['combined', 'Samlet levering (GMI + GML)']]);
  assert(DELIVERY_CHOICES.every(({ text }) => !text.includes('FOTO')));
});
test('preview attachment access shares M9 stale-plan and membership checks', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer(); const plan = await f.plan();
    const bytes = await readDeliveryAttachment(plan, plan.attachments[0].assetId);
    assert(bytes.length > 0);
    await assert.rejects(readDeliveryAttachment(plan, 'excluded-asset'));
    f.session.clear();
    await assert.rejects(readDeliveryAttachment(plan, plan.attachments[0].assetId), { code: 'stale-plan' });
  } finally { f.session.clear(); }
});
