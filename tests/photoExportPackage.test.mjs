import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { exportFixture } from './helpers/photoExportFixtures.mjs';
import { buildPhotoExportPackage } from '../src/lib/photos/export/photoExportPackage.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { digestHex } from '../src/lib/photos/export/attachmentNames.mjs';

for (const profile of ['legacy2019', 'asbuilt52']) test(`${profile} ZIP: two occurrences share exactly one original, deterministic bytes and members`, async () => {
  const f = await exportFixture({ repeated: true });
  try {
    const plan = await f.plan({ profile });
    const original = new Uint8Array(await plan.assets[0].file.arrayBuffer());
    const zip = new Uint8Array(await (await buildPhotoExportPackage(plan)).arrayBuffer());
    const entries = unzipSync(zip);
    assert.deepEqual(Object.keys(entries), ['photos.gml', plan.attachments[0].path]);
    assert.equal(strFromU8(entries['photos.gml']), serializePhotoExport(plan));
    assert.deepEqual(entries[plan.attachments[0].path], original);
    assert.equal(await digestHex(entries[plan.attachments[0].path]), plan.assets[0].checksum);
    assert.deepEqual(new Uint8Array(await plan.assets[0].file.arrayBuffer()), original);
    assert.deepEqual(new Uint8Array(await (await buildPhotoExportPackage(await f.plan({ profile }))).arrayBuffer()), zip);
  } finally { f.session.clear(); }
});
test('colliding filenames produce two preserved original members and exactly matching XML paths', async () => {
  const f = await exportFixture({ names: ['same.png', 'SAME.PNG'] });
  try {
    const p = await f.plan(); const zip = unzipSync(new Uint8Array(await (await buildPhotoExportPackage(p)).arrayBuffer()));
    assert.equal(Object.keys(zip).length, 3);
    assert.deepEqual(Object.keys(zip), ['photos.gml', ...p.attachments.map((row) => row.path)]);
    for (const a of p.attachments) { assert(!a.path.includes('..')); assert(!a.path.startsWith('/')); assert(serializePhotoExport(p).includes(a.path)); }
  } finally { f.session.clear(); }
});
test('invalid/stale plans cannot create packages', async () => {
  const f = await exportFixture({ direction: null });
  try {
    await assert.rejects(buildPhotoExportPackage(await f.plan()), /blokkerende/);
    const p = await f.plan({ profile: 'asbuilt52' }); f.session.clear();
    await assert.rejects(buildPhotoExportPackage(p), /utdatert/);
  } finally { f.session.clear(); }
});
test('reset during asynchronous original read rejects final package; no late mismatched delivery', async () => {
  const f = await exportFixture();
  try {
    const p = await f.plan(); const file = p.assets[0].file;
    const read = file.arrayBuffer.bind(file); let release;
    file.arrayBuffer = () => new Promise((resolve) => { release = async () => resolve(await read()); });
    const promise = buildPhotoExportPackage(p); assert(release);
    f.session.clear(); await release();
    await assert.rejects(promise, /utdatert/);
  } finally { f.session.clear(); }
});
test('changed original bytes after preview fail checksum verification', async () => {
  const f = await exportFixture();
  try {
    const p = await f.plan(); p.assets[0].file.arrayBuffer = async () => new Uint8Array([1, 2, 3]).buffer;
    await assert.rejects(buildPhotoExportPackage(p), /Originalfilen er endret/);
  } finally { f.session.clear(); }
});
