import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryInventory, deliveryAttachmentDestinations } from '../src/lib/delivery/deliveryInventory.mjs';
import { DELIVERY_CHOICES, deliveryContents } from '../src/lib/delivery/deliveryWizard.mjs';
import { photoMarkerOptions, photoMarkerIconKey, PHOTO_POSITION_SOURCES, PHOTO_DELIVERY_LABELS, PHOTO_DELIVERY_COLOURS, photoDeliveryColourState, photoStackDeliveryState, photoStackMarkerDelivery } from '../src/lib/photos/photoMarkerPresentation.mjs';
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
test('colour modes preserve provenance data, never add delivery overlays or batch checks, and key their icons', () => {
  for (const source of PHOTO_POSITION_SOURCES) for (const status of Object.keys(PHOTO_DELIVERY_LABELS)) for (const mode of ['markers', 'thumbnails']) {
    const options = { sourceKind: source.kind, deliveryStatus: status };
    const ordinary = photoMarkerOptions(mode, options);
    assert(ordinary.html.includes(source.color));
    assert(!ordinary.html.includes('photo-marker-delivery') && !ordinary.html.includes('photo-marker-batch'));
    const delivery = photoMarkerOptions(mode, { ...options, colourMode: 'delivery' });
    const state = photoDeliveryColourState(status);
    assert(delivery.html.includes(PHOTO_DELIVERY_COLOURS[state].color));
    assert(delivery.html.includes(`data-position-source="${source.kind}"`), 'provenance identity stays on the marker');
    assert(delivery.className.split(' ').includes(`photo-delivery-${state}`));
    assert(!delivery.html.includes('photo-marker-delivery') && !delivery.html.includes('photo-marker-batch'), 'no rejected badge overlays');
    assert.notEqual(photoMarkerIconKey(mode, options), photoMarkerIconKey(mode, { ...options, colourMode: 'delivery' }));
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


test('stack colours compare occurrence destinations, including included/unlinked and unresolved states', () => {
  const members = [{ id: 'a' }, { id: 'b' }];
  assert.equal(photoStackDeliveryState(members, { a: { status: 'transfer' }, b: { status: 'include' } }), 'gml');
  assert.equal(photoStackDeliveryState(members, { a: { status: 'transfer' }, b: { status: 'keep-link' } }), 'mixed');
  assert.equal(photoStackDeliveryState(members, { a: { status: 'not-selected' }, b: { status: 'not-selected' } }), 'excluded');
  assert.equal(photoStackDeliveryState(members, {}), 'review');
  const html = photoMarkerOptions('markers', { colourMode: 'delivery', deliveryColourState: 'mixed' }).html;
  assert(html.includes('stroke-dasharray'));
});

test('destination badges follow actual M9 retained paths and GML paths across modes and shared occurrences', async () => {
  const f = await deliveryFixture();
  try {
    const retained = await f.plan('combined');
    assert.deepEqual([...deliveryAttachmentDestinations(retained).values()], ['GMI']);
    f.transfer();
    for (const mode of ['split', 'combined']) {
      const shared = await f.plan(mode);
      assert.equal(shared.attachments.length, 1);
      assert.deepEqual([...deliveryAttachmentDestinations(shared).values()], ['GMI + GML']);
    }
    const gml = await f.plan('photos-only');
    assert([...deliveryAttachmentDestinations(gml).values()].every((value) => value === 'GML'));
    f.transfer(1);
    const transferred = await f.plan('combined');
    assert.deepEqual([...deliveryAttachmentDestinations(transferred).values()], ['GML']);
    // One physical asset may also have another retained alias. Only the exact GML path is shared.
    const alias = { ...transferred.attachments[0], retained: true, path: 'Other/nested/photo.jpg' };
    const presentation = { ...transferred, attachments: [...transferred.attachments, alias] };
    assert.equal(deliveryAttachmentDestinations(presentation).get(alias.path), 'GMI');
  } finally { f.session.clear(); }
});


test('stack presentation separates selected delivery fill from the mixed cue and cache identity', () => {
  const members = [{ id: 'selected' }, { id: 'other' }];
  const entries = { selected: { status: 'keep-link' }, other: { status: 'keep-link' } };
  for (const [status, colour] of [['keep-link', 'gmi'], ['transfer', 'gml'], ['exclude', 'excluded'], ['keep-link', 'gmi']]) {
    entries.selected.status = status;
    const mixed = colour !== 'gmi';
    const decision = photoStackMarkerDelivery(members, entries, true);
    assert.deepEqual(decision, { deliveryColourState: null, stackMixed: mixed });
    const overview = photoStackMarkerDelivery(members, entries);
    assert.deepEqual(overview, { deliveryColourState: mixed ? 'mixed' : 'gmi', stackMixed: mixed });
    for (const mode of ['markers', 'thumbnails']) {
      const options = { colourMode: 'delivery', deliveryStatus: status, selected: true, stackCount: 2, ...decision };
      for (const editing of [false, true]) {
        const icon = photoMarkerOptions(mode, { ...options, editing });
        assert(icon.html.includes(PHOTO_DELIVERY_COLOURS[colour].color));
        assert.match(icon.html, /photo-marker-stack" aria-hidden="true">2/);
        assert.equal(mode === 'markers' ? icon.html.includes('stroke-dasharray="2 2"') : icon.className.includes('photo-delivery-mixed'), mixed);
      }
      const unselected = photoMarkerOptions(mode, { ...options, ...overview, selected: false });
      assert(unselected.html.includes(PHOTO_DELIVERY_COLOURS[mixed ? 'mixed' : 'gmi'].color));
      assert.notEqual(photoMarkerIconKey(mode, { ...options, stackMixed: true }), photoMarkerIconKey(mode, { ...options, stackMixed: false }));
      const provenance = { ...options, colourMode: 'provenance', sourceKind: 'gmi' };
      assert.deepEqual(photoMarkerOptions(mode, provenance), photoMarkerOptions(mode, { ...provenance, stackMixed: false }));
      const uniformEntries = { selected: { status }, other: { status } };
      assert.deepEqual(photoStackMarkerDelivery(members, uniformEntries), { deliveryColourState: colour, stackMixed: false });
      assert.deepEqual(photoMarkerOptions(mode, { ...options, ...photoStackMarkerDelivery(members, uniformEntries), selected: false }),
        photoMarkerOptions(mode, { ...options, deliveryColourState: colour, stackMixed: false, selected: false }));
      const isolated = photoMarkerOptions(mode, { ...options, stackCount: 1, ...photoStackMarkerDelivery([members[0]], entries, true) });
      assert(isolated.html.includes(PHOTO_DELIVERY_COLOURS[colour].color));
      assert(!isolated.html.includes('photo-marker-stack'));
      assert(!isolated.html.includes('stroke-dasharray="2 2"'));
      assert(!isolated.className.includes('photo-delivery-mixed'));
    }
  }
});
