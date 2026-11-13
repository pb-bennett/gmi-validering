import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { deliveryFixture, DATE } from './helpers/deliveryFixtures.mjs';
import { captureDeliverySnapshot, buildDeliveryPlan, buildDeliveryPackage, getDeliveryGmiBytes, getDeliveryGml } from '../src/lib/delivery/index.mjs';
import { buildGmiFieldExport, getGmiExportBytes, getGmiSourceBytes } from '../src/lib/gmi-edit/index.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { buildPhotoExportPackage } from '../src/lib/photos/export/photoExportPackage.mjs';
import { validateDeliveryGml } from '../src/lib/delivery/deliveryGml.mjs';
import { planAttachmentNames } from '../src/lib/photos/export/attachmentNames.mjs';
import { exportFixture } from './helpers/photoExportFixtures.mjs';

const archive = async (plan) => unzipSync(new Uint8Array(await (await buildDeliveryPackage(plan)).arrayBuffer()));
const ready = (plan) => assert.equal(plan.status, 'ready', JSON.stringify(plan.errors));
const blocked = async (plan, code) => {
  assert.equal(plan.status, 'blocked');
  if (code) assert(plan.errors.some((item) => item.code === code), JSON.stringify(plan.errors));
  assert.throws(() => getDeliveryGmiBytes(plan), { code: 'blocked-plan' });
  await assert.rejects(buildDeliveryPackage(plan), { code: 'blocked-plan' });
};

test('A: standalone revised GMI applies Rettinger, never removes references or requires FOTO', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer(); f.stage();
    const snapshot = captureDeliverySnapshot({ mode: 'gmi-only', registry: f.registry, handle: f.handle });
    const p = await buildDeliveryPlan(snapshot, {}, { now: () => DATE }); ready(p);
    const expected = await buildGmiFieldExport(f.registry, f.handle, { date: DATE });
    assert.deepEqual(getDeliveryGmiBytes(p), getGmiExportBytes(expected));
    assert.deepEqual(new Uint8Array(await (await buildDeliveryPackage(p)).arrayBuffer()), getGmiExportBytes(expected));
    assert.equal(getDeliveryGml(p), null); assert.equal(p.attachments.length, 0);
    assert.equal(strFromU8(getDeliveryGmiBytes(p)).match(/shared.png/g).length, 2);
  } finally { f.session.clear(); }
});

test('B: standalone FOTO scope ignores delivery intent and does not require GMI', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer();
    const p = await f.plan('photos-only', { profile: 'legacy2019' }); ready(p);
    assert.equal(p.counts.features, f.photos().filter((item) => item.spatial.current).length);
    assert.equal(getDeliveryGmiBytes(p), null);
    assert.equal(getDeliveryGml(p), serializePhotoExport(p.photoPlan));
    assert.deepEqual(new Uint8Array(await (await buildDeliveryPackage(p)).arrayBuffer()),
      new Uint8Array(await (await buildPhotoExportPackage(p.photoPlan)).arrayBuffer()));
    const noGmi = captureDeliverySnapshot({ mode: 'photos-only', photoSession: f.session, photoLayerId: f.layerId });
    ready(await buildDeliveryPlan(noGmi, { profile: 'gemini-legacy2019' }, { now: () => DATE }));
  } finally { f.session.clear(); }
});

test('C/D: corrections require explicit split exclusion; combined uses the same correction bytes', async () => {
  const f = await deliveryFixture();
  try {
    f.stage();
    await blocked(await f.plan('split'), 'field-exclusion-required');
    const a = await f.plan('gmi-only'), d = await f.plan(); ready(a); ready(d);
    assert.deepEqual(getDeliveryGmiBytes(a), getDeliveryGmiBytes(d));
    f.transfer();
    const c = await f.plan('split', {}, { includeFieldChanges: false }); ready(c);
    const combined = await f.plan(); ready(combined);
    assert.equal(strFromU8(getDeliveryGmiBytes(c)).includes('Corrected synthetic note'), false);
    assert.equal(strFromU8(getDeliveryGmiBytes(combined)).includes('Corrected synthetic note'), true);
    assert.equal(combined.gmiSummary.fieldEditCount, 1);
    assert.equal(combined.gmiSummary.verification.hyperlink.removedReferences, 1);
    assert.equal(strFromU8(getDeliveryGmiBytes(combined)).match(/shared.png/g).length, 1);
  } finally { f.session.clear(); }
});

test('combined ZIP: one transferred occurrence, sibling retained, one original attachment; reproducible same-plan bytes', async () => {
  const f = await deliveryFixture();
  try {
    const originalSession = f.registry.getSession(f.handle).session, originalPhotos = JSON.stringify(f.photos());
    const transferred = f.transfer(); f.stage();
    const staged = f.registry.getSession(f.handle).session;
    const p = await f.plan(); ready(p);
    const entries = await archive(p);
    assert.deepEqual(Object.keys(entries), [p.naming.gmiFilename, p.naming.gmlFilename, 'Attachments/shared.png']);
    assert.deepEqual(entries[p.naming.gmiFilename], getDeliveryGmiBytes(p));
    assert.equal(strFromU8(entries[p.naming.gmlFilename]), serializePhotoExport(p.photoPlan));
    assert.equal(p.photoPlan.occurrences[0].occurrenceId, transferred.id);
    assert.equal(p.counts.features, 1); assert.equal(p.counts.transferredOccurrences, 1);
    assert.deepEqual(entries['Attachments/shared.png'], new Uint8Array(await f.session.getAssetFile(transferred.assetId).arrayBuffer()));
    assert.deepEqual(await (await buildDeliveryPackage(p)).arrayBuffer(), await (await buildDeliveryPackage(p)).arrayBuffer());
    const copy = getDeliveryGmiBytes(p); copy.fill(0);
    assert.notDeepEqual(getDeliveryGmiBytes(p), copy);
    assert.deepEqual(new Uint8Array(await f.file.arrayBuffer()), f.bytes);
    assert.deepEqual(getGmiSourceBytes(originalSession.document), f.bytes);
    assert.equal(f.registry.getSession(f.handle).session, staged);
    assert.equal(JSON.stringify(f.photos()), originalPhotos, 'delivery intent is separate from photo records; exports do not mutate records');
    const output = strFromU8(getDeliveryGmiBytes(p));
    const original = strFromU8(f.bytes);
    assert.equal(output, original.replace('h:1(link:"Attachments\\shared.png") ', '').replace('Punkt 1', 'Corrected synthetic note'));
  } finally { f.session.clear(); }
});

test('each transfer maps to a separate GML record even for a shared photograph', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer(0); f.transfer(1);
    const p = await f.plan(); ready(p);
    assert.equal(p.counts.features, 2); assert.equal(p.attachments.length, 1);
    assert(!strFromU8(getDeliveryGmiBytes(p)).includes('shared.png'));
    assert.notEqual(p.photoPlan.occurrences[0].guid, p.photoPlan.occurrences[1].guid);
  } finally { f.session.clear(); }
});

test('explicit unlinked inclusion is exported; unrelated photos excluded; no selections omits GML', async () => {
  const f = await deliveryFixture();
  try {
    const empty = await f.plan(); ready(empty);
    assert.equal(getDeliveryGml(empty), null); assert.deepEqual(getDeliveryGmiBytes(empty), f.bytes);
    const unlinked = f.photos().find((item) => !item.occurrence);
    assert(f.session.setCombinedDeliveryInclusion(f.layerId, [unlinked.id], true).ok);
    const p = await f.plan(); ready(p);
    assert.equal(p.counts.features, 1); assert.equal(p.attachments.length, 2);
    assert.equal(p.photoPlan.occurrences[0].occurrenceId, unlinked.id);
  } finally { f.session.clear(); }
});

test('unplaced selections and missing required direction/metadata block removal', async () => {
  for (const options of [{ unplaced: true }, { direction: null }, { time: null }]) {
    const f = await deliveryFixture({ ...options, points: [{ hyperlink: '' }] });
    try {
      const photo = f.photos()[0];
      assert(f.session.setCombinedDeliveryInclusion(f.layerId, [photo.id], true).ok);
      await blocked(await f.plan('combined', { profile: 'legacy2019' }));
      assert.deepEqual(new Uint8Array(await f.file.arrayBuffer()), f.bytes);
    } finally { f.session.clear(); }
  }
});

test('unplaced transfer blocks rather than silently retaining or deleting its reference', async () => {
  const f = await deliveryFixture({ unplaced: true });
  try {
    f.transfer(); const snapshot = f.capture();
    assert.equal(snapshot.intent.transfers.length, 1);
    await blocked(await f.plan(), 'selected-photo-not-exported');
    assert.deepEqual(new Uint8Array(await f.file.arrayBuffer()), f.bytes);
  } finally { f.session.clear(); }
});

test('failed additional GML validation blocks M7 authorization and all downloadable output', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer(); const session = f.registry.getSession(f.handle).session;
    const p = await buildDeliveryPlan(f.capture(), {}, { now: () => DATE, validateGml: () => false });
    await blocked(p, 'invalid-gml');
    assert.equal(p.gmiSummary, null);
    assert.equal(f.registry.getSession(f.handle).session, session);
    assert.deepEqual(new Uint8Array(await f.file.arrayBuffer()), f.bytes);
    assert.deepEqual(getGmiSourceBytes(session.document), f.bytes);
  } finally { f.session.clear(); }
});

test('combined requires a live survey binding, not merely a directly imported FOTO GMI', async () => {
  const f = await exportFixture({ repeated: true });
  const survey = await deliveryFixture();
  try {
    const snapshot = captureDeliverySnapshot({ registry: survey.registry, handle: survey.handle,
      photoSession: f.session, photoLayerId: f.layerId });
    await blocked(await buildDeliveryPlan(snapshot, {}, { now: () => DATE }), 'loaded-gmi-binding-required');
  } finally { f.session.clear(); survey.session.clear(); }
});

test('foreign-source transfer decisions block the one-GMI delivery atomically', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer();
    const foreignFile = new File([strFromU8(f.bytes).replace('Punkt 1', 'Foreign synthetic note')], 'foreign-synthetic.gmi');
    const ticket = f.session.beginSourceWorkflow(f.layerId);
    assert(await f.session.stageLayerSource(f.layerId, foreignFile, 'gmi'));
    assert(f.session.saveSourceWorkflowSource(ticket, f.session.getSnapshot().sourceReviews[f.layerId]).ok);
    f.session.endSourceWorkflow(ticket);
    const foreign = f.photos().find((photo) => photo.occurrence && photo.occurrence.sourceFingerprint !== f.handle.fingerprint);
    assert(foreign);
    assert(f.session.setDeliveryIntent(f.layerId, [foreign.id], 'transfer').ok);
    await blocked(await f.plan(), 'foreign-transfer-source');
    assert.deepEqual(new Uint8Array(await f.file.arrayBuffer()), f.bytes);
  } finally { f.session.clear(); }
});

test('missing/unreadable attachments, retained unresolved refs and unsafe paths block the entire package', async () => {
  for (const path of ['Attachments/missing.png', '../shared.png', 'C:\\Attachments\\shared.png']) {
    const f = await deliveryFixture({ points: [{ hyperlink: `h:1(link:"${path}") ` }] });
    try { await blocked(await f.plan()); } finally { f.session.clear(); }
  }
  for (const transfer of [false, true]) {
    const f = await deliveryFixture();
    try {
      if (transfer) f.transfer();
      const photo = f.photos()[0], file = f.session.getAssetFile(photo.assetId);
      file.arrayBuffer = async () => { throw new Error('synthetic unreadable'); };
      await blocked(await f.plan());
    } finally { f.session.clear(); }
  }
});

test('a declared file with an empty/partial read cannot enter the delivery', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer();
    f.session.getAssetFile(f.photos()[0].assetId).arrayBuffer = async () => new Uint8Array([1]).buffer;
    await blocked(await f.plan(), 'attachment-size-mismatch');
  } finally { f.session.clear(); }
});

test('Norwegian attachment names survive ZIP UTF-8 entry flags and exact GML paths', async () => {
  const f = await deliveryFixture({ names: ['Grøft æ.png'], points: [{ hyperlink: 'h:1(link:"Attachments\\Grøft æ.png") ' }] });
  try {
    f.transfer(); const p = await f.plan(); ready(p);
    const bytes = new Uint8Array(await (await buildDeliveryPackage(p)).arrayBuffer());
    const entries = unzipSync(bytes);
    assert(entries['Attachments/Grøft æ.png']);
    assert(getDeliveryGml(p).includes('Attachments\\Grøft æ.png'));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let found = false;
    for (let offset = 0; offset + 46 < bytes.length; offset++) {
      if (view.getUint32(offset, true) !== 0x02014b50) continue;
      const length = view.getUint16(offset + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + length));
      if (name === 'Attachments/Grøft æ.png') { assert(view.getUint16(offset + 8, true) & 0x800); found = true; }
    }
    assert(found);
  } finally { f.session.clear(); }
});

test('collision with retained name reserves exact GMI path and deterministically renames GML-only original', async () => {
  const f = await deliveryFixture({ names: ['other?.png', 'other_.png'],
    points: [{ hyperlink: 'h:1(link:"Attachments\\other_.png") ' }] });
  try {
    // A safe original can sanitize to the reserved filename.
    const unlinked = f.photos().find((item) => !item.occurrence);
    f.session.setCombinedDeliveryInclusion(f.layerId, [unlinked.id], true);
    const p = await f.plan(); ready(p);
    assert.equal(p.attachments.find((item) => item.retained).path, 'Attachments/other_.png');
    const renamed = p.attachments.find((item) => !item.retained);
    assert.match(renamed.path, /^Attachments\/other_--[a-f0-9]{12}\.png$/);
    const entries = await archive(p);
    assert.equal(Object.keys(entries).length, 4);
    assert(getDeliveryGml(p).includes(renamed.path.replaceAll('/', '\\')));
    const again = await f.plan(); ready(again);
    assert.deepEqual(again.attachments, p.attachments);
  } finally { f.session.clear(); }
});

test('GML-only collisions: case-fold and Unicode normalization resolve deterministically in either input order', async () => {
  const assets = ['same.png', 'SAME.PNG', 'caf\u00e9.png', 'cafe\u0301.png'].map((originalFilename, index) => ({ assetId: `id-${index}`, originalFilename }));
  const forward = await planAttachmentNames(assets, { reserved: ['SAME.png'] });
  const reversed = await planAttachmentNames([...assets].reverse(), { reserved: ['same.PNG'] });
  assert.deepEqual([...reversed].reverse(), forward);
  assert.equal(new Set(forward.map((item) => item.filename.normalize('NFC').toLowerCase())).size, 4);
  assert(forward.every((item) => item.renamed));
});

test('full package resolves collisions between two GML-only files with matching case-folded names', async () => {
  const f = await deliveryFixture({ names: ['shared.png', 'same.png', 'SAME.PNG'] });
  try {
    const ids = f.photos().filter((item) => !item.occurrence).map((item) => item.id);
    assert(f.session.setCombinedDeliveryInclusion(f.layerId, ids, true).ok);
    const p = await f.plan(); ready(p);
    const entries = await archive(p);
    assert.equal(p.counts.features, 2); assert.equal(Object.keys(entries).length, 5);
    assert.equal(p.attachments.filter((item) => item.renamed).length, 2);
    for (const item of p.photoPlan.attachments) assert(getDeliveryGml(p).includes(item.path.replaceAll('/', '\\')));
  } finally { f.session.clear(); }
});

test('reserved aliases with case collisions block; safe deeper paths are preserved', async () => {
  for (const paths of [['Attachments/shared.png', 'Attachments/SHARED.PNG']]) {
    const f = await deliveryFixture({ names: [paths[0].split('/').at(-1)],
      points: paths.map((path) => ({ hyperlink: `h:1(link:"${path}") ` })) });
    try { await blocked(await f.plan(), 'reserved-path-collision'); } finally { f.session.clear(); }
  }
  const f = await deliveryFixture({ points: [{ hyperlink: 'h:1(link:"Photos\\deep\\shared.png") ' }] });
  try {
    const p = await f.plan(); ready(p);
    assert.deepEqual(Object.keys(await archive(p)), [p.naming.gmiFilename, 'Photos/deep/shared.png']);
    assert(p.warnings.some((item) => item.code === 'retained-path-outside-attachments'));
  } finally { f.session.clear(); }
});

test('GML well-formedness, IDs, records, geometry and links are independently checked', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer(); const p = await f.plan(); ready(p);
    const xml = getDeliveryGml(p);
    assert(validateDeliveryGml(xml, p.photoPlan));
    for (const changed of [xml.replace('</app:Skråfoto>', ''), xml.replace('Attachments\\shared.png', 'Attachments\\wrong.png'),
      xml.replace(p.photoPlan.occurrences[0].featureId, 'wrong-id'), xml.replace('<gml:pos srsDimension="3">', '<gml:pos srsDimension="3">0 ')]) {
      assert.equal(validateDeliveryGml(changed, p.photoPlan), false);
    }
  } finally { f.session.clear(); }
});

test('stale intent, metadata, position, Rettinger state, source unload and source bytes refuse download', async () => {
  const changes = [
    (f) => f.session.setDeliveryIntent(f.layerId, [f.photos().find((item) => item.occurrence).id], 'keep-link'),
    (f) => f.session.setCaptureMetadata(f.layerId, [f.photos()[0].id], 'captureTime', '2026-01-01T12:00:00'),
    (f) => f.session.applyPhotoEdits(f.session.beginPhotoEdits(f.layerId), [{ photoId: f.photos()[0].id, position: { crs: 'EPSG:4326', longitude: 11, latitude: 60 } }]),
    (f) => f.stage(),
    (f) => { delete f.layers.survey; },
    (f) => { f.file.arrayBuffer = async () => new Uint8Array([0]).buffer; },
    (f) => { f.session.getAssetFile(f.photos()[0].assetId).arrayBuffer = async () => new Uint8Array([0]).buffer; },
  ];
  for (const change of changes) {
    const f = await deliveryFixture();
    try { f.transfer(); const p = await f.plan(); ready(p); change(f); await assert.rejects(buildDeliveryPackage(p)); }
    finally { f.session.clear(); }
  }
});

test('reset during attachment read refuses late package; forged plans and stale snapshots fail closed', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer(); const p = await f.plan(); ready(p);
    await assert.rejects(buildDeliveryPackage({ ...p }), { code: 'blocked-plan' });
    const file = f.session.getAssetFile(f.photos()[0].assetId), read = file.arrayBuffer.bind(file);
    let release;
    file.arrayBuffer = () => new Promise((resolve) => { release = async () => resolve(await read()); });
    const promise = buildDeliveryPackage(p);
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    f.session.clear(); await release();
    await assert.rejects(promise, { code: 'stale-plan' });
  } finally { f.session.clear(); }
});
