import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Gemini GML adapter with actual Chromium DOMParser and proj4 (synthetic only)', {
  skip: !chromePath, timeout: 90000,
}, async (t) => {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'");
      if (pathname === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<script src="/node_modules/proj4/dist/proj4.js"></script><script type="importmap">{"imports":{"proj4":"/proj4-shim.mjs"}}</script><p>Synthetic Gemini parser checks</p>');
      } else if (pathname === '/proj4-shim.mjs') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end('export default globalThis.proj4;');
      } else {
        const resolved = path.resolve(root, `.${pathname}`);
        const relative = path.relative(root, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative) || ![
          '/src/lib/', '/tests/browser/geminiGmlChecks.mjs', '/tests/fixtures/gemini-wfs/',
          '/node_modules/proj4/dist/proj4.js',
        ].some((prefix) => pathname.startsWith(prefix))) throw new Error('Unsupported harness resource');
        response.setHeader('Content-Type', 'text/javascript');
        response.end(await readFile(resolved));
      }
    } catch { response.statusCode = 404; response.end('Not found'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await openTestChrome();
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
    await browser.waitFor('Boolean(globalThis.proj4)');
    const names = await browser.evaluate("import('/tests/browser/geminiGmlChecks.mjs').then(module => { globalThis.geminiChecks = module.checks; return module.checks.map(([name]) => name); })");
    assert(names.length >= 30);
    for (const [index, name] of names.entries()) {
      await t.test(name, async () => {
        const result = await browser.evaluate(`Promise.resolve().then(() => geminiChecks[${index}][1]()).then(() => ({ passed: true }), error => ({ passed: false, message: error.message }))`);
        assert.equal(result.passed, true, result.message);
      });
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
