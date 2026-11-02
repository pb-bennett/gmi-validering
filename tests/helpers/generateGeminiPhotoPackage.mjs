import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { openTestChrome } from './chromeHarness.mjs';
import { exportFixture } from './photoExportFixtures.mjs';
import { buildPhotoExportPackage } from '../../src/lib/photos/export/photoExportPackage.mjs';
import { serializePhotoExport } from '../../src/lib/photos/export/photoExportXml.mjs';
// Synthetic manual positions; provenance does not select serializer branches.
const root = path.join(tmpdir(), 'gemini-va-photo-compatibility');
await mkdir(root, { recursive: true });
const browser = await openTestChrome();
let jpeg;
try {
  // Fabricated color pattern: no reference photograph or customer bytes.
  const data = await browser.evaluate(`(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const c = canvas.getContext('2d'); c.fillStyle = '#1686ac'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#ffcc44'; c.fillRect(8, 8, 24, 24); return canvas.toDataURL('image/jpeg').split(',')[1]; })()`);
  jpeg = Buffer.from(data, 'base64');
} finally { await browser.close(); }
const names = ['Grøft_æ_image.jpg', 'ordinary.jpg'];
const f = await exportFixture({ names, files: names.map((name) => new File([jpeg], name, { type: 'image/jpeg' })), repeated: true, time: null, direction: null });
try {
  f.session.fillMissingPhotoValues(f.layerId, 'direction', 0, [f.ids[0]]);
  f.session.fillMissingPhotoValues(f.layerId, 'direction', 359.875);
  f.session.setCaptureMetadata(f.layerId, [f.ids[0]], 'captureTime', '2026-05-12T14:33:02.123+02:00');
  const plan = await f.plan({ profile: 'gemini-legacy2019' });
  const bytes = new Uint8Array(await (await buildPhotoExportPackage(plan)).arrayBuffer());
  await writeFile(path.join(root, 'gemini-compatibility-synthetic.zip'), bytes);
  for (const [name, data] of Object.entries(unzipSync(bytes))) {
    const target = path.join(root, 'extracted', name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, data);
  }
  await writeFile(path.join(root, 'gemini-missing.gml'), serializePhotoExport(plan));
  f.session.fillMissingPhotoValues(f.layerId, 'captureTime', '2026-05-12T14:33:02');
  await writeFile(path.join(root, 'gemini-present.gml'), serializePhotoExport(await f.plan({ profile: 'gemini-legacy2019' })));
  console.log(root, JSON.stringify(plan.counts));
} finally { f.session.clear(); }
