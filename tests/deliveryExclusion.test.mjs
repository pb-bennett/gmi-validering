import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { deliveryFixture, DATE } from './helpers/deliveryFixtures.mjs';
import { syntheticContext } from './helpers/photoExportFixtures.mjs';
import { buildDeliveryPlan, buildDeliveryPackage, getDeliveryGmiBytes, getDeliveryGml } from '../src/lib/delivery/index.mjs';
import { deliveryDiagnostics, deliveryReport, deliverySummary, deliveryExclusionNote } from '../src/lib/delivery/deliveryWizard.mjs';
import { deliveryInventory, deliveryAttachmentDestinations } from '../src/lib/delivery/deliveryInventory.mjs';

const ready = (plan) => assert.equal(plan.status, 'ready', JSON.stringify(plan.errors));
const zip = async (plan) => unzipSync(new Uint8Array(await (await buildDeliveryPackage(plan)).arrayBuffer()));
const exclude = (f, photos = f.photos().filter((row) => row.occurrence)) => {
  assert(f.session.setDeliveryIntent(f.layerId, photos.map((row) => row.id), 'exclude').ok);
};
const link = (name) => `h:1(link:"Attachments\\${name}") `;

test('single exclusion clears only the cell, omits photo/GML, composes with field edits, restores exact original delivery', async () => {
  const cell = link('shared.png');
  const f = await deliveryFixture({ names: ['shared.png'], points: [{ number: 101, hyperlink: cell }] });
  try {
    const photo = f.photos()[0], file = f.session.getAssetFile(photo.assetId), bytes = await file.arrayBuffer();
    const initial = await f.plan(); ready(initial); assert.deepEqual(getDeliveryGmiBytes(initial), f.bytes);
    exclude(f);
    await assert.rejects(buildDeliveryPackage(initial), { code: 'stale-plan' });
    const p = await f.plan(); ready(p);
    assert.equal(strFromU8(getDeliveryGmiBytes(p)), strFromU8(f.bytes).replace(cell, ''));
    assert.equal(getDeliveryGml(p), null);
    assert.equal(p.attachments.length, 0);
    assert.equal(p.counts.excludedReferences, 1); assert.equal(p.counts.excludedEntirelyAssets, 1);
    assert.equal(p.counts.gmiPlacements, 0); assert.equal(p.counts.gmlPlacements, 0);
    assert.equal(p.counts.includedAssets, 0); assert.equal(p.counts.retainedReferences, 0);
    const diagnostics = deliveryDiagnostics(p);
    // Batch 1B.4B (deliberate update): no import-test status note is shown; the removal itself is unchanged.
    assert(![...diagnostics.info, ...diagnostics.warnings].some((item) => /^gemini-/.test(item.code)));
    assert.deepEqual(Object.keys(await zip(p)), [p.naming.gmiFilename]);
    const report = deliveryReport({ plan: p });
    assert.doesNotMatch(report, /testet oppsett|akseptansetest|importtest|Gemini-akseptanse/);
    assert.match(report, /Ikke med i leveransen:/); assert.match(report, /Punkt 101/);
    assert.match(report, /bildelenke fjernet \(1\).*bildefilen er ikke med/);
    assert(!report.includes('Punkt 1 (GUID'), 'report uses actual object number');
    assert.deepEqual(await (await buildDeliveryPackage(p)).arrayBuffer(), await (await buildDeliveryPackage(await f.plan())).arrayBuffer());
    f.stage();
    const corrected = await f.plan(); ready(corrected);
    assert.equal(strFromU8(getDeliveryGmiBytes(corrected)), strFromU8(f.bytes).replace(cell, '').replace('Punkt 1', 'Corrected synthetic note'));
    assert.equal(corrected.gmiSummary.fieldEditCount, 1);
    assert.deepEqual(new Uint8Array(await f.file.arrayBuffer()), f.bytes);
    assert.deepEqual(await file.arrayBuffer(), bytes);
  } finally { f.session.clear(); }
  const restored = await deliveryFixture({ names: ['shared.png'], points: [{ hyperlink: cell }] });
  try {
    const before = await restored.plan(), beforeBytes = await (await buildDeliveryPackage(before)).arrayBuffer(); exclude(restored);
    const removed = await restored.plan(); ready(removed);
    restored.session.setDeliveryIntent(restored.layerId, [restored.photos()[0].id], 'keep-link');
    await assert.rejects(buildDeliveryPackage(removed), { code: 'stale-plan' });
    const after = await restored.plan(); ready(after);
    assert.deepEqual(getDeliveryGmiBytes(after), restored.bytes);
    assert.deepEqual(await (await buildDeliveryPackage(after)).arrayBuffer(), beforeBytes);
  } finally { restored.session.clear(); }
});

test('multiple wrappers, shared asset, mixed transfer/exclusion and retained line reference agree with ZIP, inventory and report', async () => {
  const cell = 'h:1(link:"Attachments\\shared.png") h:2(link:"Attachments\\only.png") ';
  const f = await deliveryFixture({ points: [{ number: 101, hyperlink: cell }, { number: 7, hyperlink: link('shared.png') }, { number: 267, hyperlink: link('shared.png') }],
    lines: [{ number: 38, hyperlink: link('shared.png') }] });
  try {
    const linked = f.photos().filter((row) => row.occurrence), [a, b, c] = linked.filter((row) => row.originalFilename === 'shared.png');
    exclude(f, [a]); assert(f.session.setDeliveryIntent(f.layerId, [b.id], 'transfer').ok);
    let p = await f.plan(); ready(p);
    assert.equal(strFromU8(getDeliveryGmiBytes(p)), strFromU8(f.bytes).replace(cell, link('only.png')).replace(`SYNT-R2;${link('shared.png')}`, 'SYNT-R2;'));
    assert.equal(p.counts.excludedReferences, 1); assert.equal(p.counts.transferredReferences, 1);
    assert.equal(p.counts.retainedReferences, 3); assert.equal(p.counts.gmiPlacements, 3);
    assert.equal(p.counts.gmlPlacements, 1); assert.equal(p.counts.includedAssets, 2);
    assert.equal(p.counts.attachments, 2); assert.equal(p.counts.partialAssets, 1);
    assert.equal((getDeliveryGml(p).match(/<app:Skråfoto/g) || []).length, 1);
    const entries = await zip(p), paths = Object.keys(entries);
    assert.deepEqual(paths, [p.naming.gmiFilename, p.naming.gmlFilename, ...p.attachments.map((row) => row.path)]);
    const destinations = deliveryAttachmentDestinations(p);
    assert.equal(destinations.get('Attachments/shared.png'), 'GMI + GML');
    assert.equal(destinations.get('Attachments/only.png'), 'GMI');
    assert.equal(deliveryInventory(p).root.count, paths.length);
    for (const attachment of p.attachments) assert.deepEqual(entries[attachment.path], new Uint8Array(await f.session.getAssetFile(attachment.assetId).arrayBuffer()));
    const report = deliveryReport({ plan: p });
    assert.match(report, /Overført til GML:/); assert.match(report, /bildelenke fjernet for overføring til GML \(1\)/);
    assert.match(report, /Punkt 101.*bildelenke fjernet \(1\).*fortsatt med via.*Ledning 38.*Punkt 7/);
    assert.match(Object.fromEntries(deliverySummary({ plan: p })).Bilder, /^2 bilder/);
    exclude(f, [b, c]); p = await f.plan(); ready(p);
    assert.equal(p.counts.excludedReferences, 3); assert.equal(p.counts.partialAssets, 1);
    assert.equal(p.counts.retainedReferences, 2); assert.equal(p.attachments.length, 2, 'line reference still needs shared asset');
    assert.equal(getDeliveryGml(p), null);
    assert.match(deliveryReport({ plan: p }), /fortsatt med via Ledning 38/);
  } finally { f.session.clear(); }
});

test('all shared occurrences excluded: one file omitted, unlinked defaults counted separately; standalone modes retain scope and explain choices', async () => {
  const f = await deliveryFixture();
  try {
    exclude(f);
    for (const mode of ['combined', 'split']) {
      const p = await f.plan(mode); ready(p);
      assert.equal(p.counts.excludedEntirelyAssets, 1); assert.equal(p.counts.partialAssets, 0);
      assert.equal(p.counts.notNeededAssets, 1); assert.equal(p.counts.excludedOccurrences, 2);
      assert.equal(p.attachments.length, 0); assert.equal(p.counts.features, 0);
      assert.equal(strFromU8(getDeliveryGmiBytes(p)), strFromU8(f.bytes).replaceAll(link('shared.png'), ''));
      assert.equal(Object.keys(await zip(p)).length, 1);
    }
    for (const mode of ['gmi-only', 'photos-only']) {
      const p = await f.plan(mode); ready(p);
      assert.equal(p.photoDelivery.ignoredExclusions, 2); assert.equal(p.counts.excludedReferences, 0);
      assert(deliveryReport({ plan: p }).includes(deliveryExclusionNote(mode, 2)));
      if (mode === 'gmi-only') {
        assert.deepEqual(getDeliveryGmiBytes(p), f.bytes); assert.equal(p.attachments.length, 0);
      } else {
        assert.equal(p.counts.features, f.photos().length); assert.equal(p.attachments.length, 2);
      }
    }
  } finally { f.session.clear(); }
});

test('shared asset transferred and excluded with no retained reference has one GML placement and one original file; failed validation blocks everything', async () => {
  const f = await deliveryFixture({ names: ['shared.png'] });
  try {
    const [a, b] = f.photos(); exclude(f, [a]);
    assert(f.session.setDeliveryIntent(f.layerId, [b.id], 'transfer').ok);
    for (const mode of ['combined', 'split']) {
      const p = await f.plan(mode); ready(p);
      assert.equal(p.counts.retainedReferences, 0); assert.equal(p.counts.gmiPlacements, 0);
      assert.equal(p.counts.excludedReferences, 1); assert.equal(p.counts.transferredReferences, 1);
      assert.equal(p.counts.gmlPlacements, 1); assert.equal(p.counts.includedAssets, 1);
      assert.equal(p.counts.partialAssets, 1); assert.equal(p.attachments.length, 1);
      assert.deepEqual([...deliveryAttachmentDestinations(p).values()], ['GML']);
      assert.equal(strFromU8(getDeliveryGmiBytes(p)), strFromU8(f.bytes).replaceAll(link('shared.png'), ''));
      assert.equal(Object.keys(await zip(p)).length, 3);
      assert.match(deliveryReport({ plan: p }), /fortsatt med via.*Punkt 2.*GML/);
    }
    const p = await buildDeliveryPlan(f.capture(), { profile: 'gemini-legacy2019', crs: 'EPSG:25832', context: syntheticContext },
      { now: () => DATE, validateGml: () => false });
    assert.equal(p.status, 'blocked'); assert(p.errors.some((item) => item.code === 'invalid-gml'));
    assert.equal(p.counts.excludedReferences, 0); assert.equal(p.counts.transferredReferences, 0);
    assert.throws(() => getDeliveryGmiBytes(p), { code: 'blocked-plan' });
    await assert.rejects(buildDeliveryPackage(p), { code: 'blocked-plan' });
    assert.deepEqual(new Uint8Array(await f.file.arrayBuffer()), f.bytes);
  } finally { f.session.clear(); }
});

test('unsupported removal grammar fails closed with occurrence diagnostics; no downloadable partial artifact', async () => {
  for (const [cell, code] of [
    ['h:1(link:"Attachments\\shared.png" link:"Attachments\\only.png") ', 'multi-link-wrapper'],
    ['h:1(link:"Attachments\\shared.png"),h:2(link:"Attachments\\only.png") ', 'unsupported-wrapper-separator'],
  ]) {
    const f = await deliveryFixture({ points: [{ number: 43, hyperlink: cell }] });
    try {
      exclude(f, [f.photos().find((row) => row.occurrence)]);
      const p = await f.plan();
      assert.equal(p.status, 'blocked');
      const diagnostic = p.errors.find((item) => item.code === code); assert(diagnostic, JSON.stringify(p.errors));
      assert.match(diagnostic.objectLabel, /Punkt 43/); assert.equal(diagnostic.filename, 'shared.png');
      assert.throws(() => getDeliveryGmiBytes(p), { code: 'blocked-plan' });
      await assert.rejects(buildDeliveryPackage(p), { code: 'blocked-plan' });
      assert.match(deliveryReport({ plan: p }), /bildelenke ikke fjernet; leveransen er blokkert/);
      assert.deepEqual(new Uint8Array(await f.file.arrayBuffer()), f.bytes);
    } finally { f.session.clear(); }
  }
});

test('repeated references in one cell are one placement and all approved references are removed atomically', async () => {
  const cell = 'h:1(link:"Attachments\\shared.png") h:2(link:"Attachments\\only.png") h:3(link:"Attachments\\shared.png") ';
  const f = await deliveryFixture({ points: [{ hyperlink: cell }] });
  try {
    const photo = f.photos().find((row) => row.originalFilename === 'shared.png'); exclude(f, [photo]);
    const snapshot = f.session.getPhotoDeliverySnapshot(f.layerId);
    assert.equal(snapshot.exclusions.length, 1); assert.equal(snapshot.removalSelections[0].referenceIds.length, 2);
    const p = await f.plan(); ready(p);
    assert.equal(p.counts.excludedOccurrences, 1); assert.equal(p.counts.excludedReferences, 2);
    assert.equal(p.counts.gmiPlacements, 1); assert.equal(p.counts.retainedReferences, 1);
    assert.equal(strFromU8(getDeliveryGmiBytes(p)), strFromU8(f.bytes).replace(cell, link('only.png')));
    assert.deepEqual(p.attachments.map((row) => row.path), ['Attachments/only.png']);
  } finally { f.session.clear(); }
});

test('stale source and lost associations never turn exclusions into inclusion or permit a package', async () => {
  for (const [change, captureError] of [
    [(f) => f.session.reconcileLoadedGmiBindings(() => false)],
    [(f) => { delete f.layers.survey; }, 'session-disposed'],
    [(f) => { f.file.arrayBuffer = async () => new Uint8Array([0]).buffer; }],
  ]) {
    const f = await deliveryFixture();
    try {
      exclude(f); const p = await f.plan(); ready(p); change(f);
      await assert.rejects(buildDeliveryPackage(p));
      if (captureError) { await assert.rejects(async () => f.plan(), { code: captureError }); continue; }
      const rebuilt = await f.plan(); assert.equal(rebuilt.status, 'blocked');
      await assert.rejects(buildDeliveryPackage(rebuilt), { code: 'blocked-plan' });
      assert.throws(() => getDeliveryGmiBytes(rebuilt), { code: 'blocked-plan' });
    } finally { f.session.clear(); }
  }
});
