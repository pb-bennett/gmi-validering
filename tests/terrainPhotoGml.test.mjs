import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsJpeg, gpsPng, noGpsPng } from './helpers/photoGpsFixtures.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('actual browser XML parser, File/EXIF and session integration (optional external real corpus)', { skip: !chromePath, timeout: 90000 }, async () => {
  const fixturePath = process.env.PHOTO_GML_FIXTURE;
  const fixtureFiles = fixturePath && existsSync(fixturePath) ? (await readdir(path.join(path.dirname(fixturePath), 'Attachments'))).filter((name) => /\.jpg$/i.test(name)).sort() : null;
  const synthetic = { 'gps.jpg': gpsJpeg(), 'gps.png': gpsPng(), 'none.png': noGpsPng(), 'partial.jpg': gpsJpeg({ partial: true }), 'broken.jpg': gpsJpeg().subarray(0, 35), 'preview.webp': Buffer.from('RIFF0000WEBP') };
  const server = createServer(async (request, response) => {
    try {
      const route = new URL(request.url, 'http://localhost').pathname;
      if (route === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<script src="/node_modules/proj4/dist/proj4.js"></script><script type="importmap">{"imports":{"proj4":"/proj4-shim.mjs","exifr/dist/full.esm.mjs":"/node_modules/exifr/dist/full.esm.mjs"}}</script><p>Photo integration harness</p>');
      } else if (route === '/proj4-shim.mjs') { response.setHeader('Content-Type', 'text/javascript'); response.end('export default globalThis.proj4;'); }
      else if (route === '/fixture-index') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(fixtureFiles ? { photos: fixtureFiles, gmlName: path.basename(fixturePath) } : null)); }
      else if (route === '/fixture-gml' && fixtureFiles) response.end(await readFile(fixturePath));
      else if (route.startsWith('/fixture-photo/') && fixtureFiles) {
        const index = Number(route.split('/').at(-1));
        if (!Number.isInteger(index) || !fixtureFiles[index]) throw new Error('Unknown fixture');
        response.end(await readFile(path.join(path.dirname(fixturePath), 'Attachments', fixtureFiles[index])));
      } else if (route.startsWith('/synthetic/')) response.end(synthetic[route.split('/').at(-1)]);
      else {
        const resolved = path.resolve(root, `.${route}`);
        if (!resolved.startsWith(root) || !['/src/lib/', '/tests/browser/', '/node_modules/'].some((prefix) => route.startsWith(prefix))) throw new Error('Invalid test module path');
        response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(resolved));
      }
    } catch { response.statusCode = 404; response.end('Not found'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await openTestChrome();
  try {
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
    await browser.waitFor('Boolean(globalThis.proj4)');
    const results = await browser.evaluate("import('/tests/browser/photoSpatialChecks.mjs').then(module => module.runPhotoSpatialChecks())");
    assert(results.length >= 6 && results.every((result) => result.passed));
    console.log(JSON.stringify({ browserChecks: results }));
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
});
