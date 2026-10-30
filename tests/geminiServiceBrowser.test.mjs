import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { createWfsProxyHandler } from '../src/lib/gemini-wfs/wfsProxyHandler.mjs';
import { collection, partialZLine, independentPoint } from './fixtures/gemini-wfs/syntheticProfile.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Same native-browser/module server pattern as M2. No change to the shared CDP harness.
test('Gemini M3 service with native Chromium decoding/XML/projection (synthetic only)', {
  skip: !chromePath, timeout: 90000,
}, async (t) => {
  let gateRejected = 0, upstreamCalls = 0;
  const proxy = createWfsProxyHandler({ fetchUpstream: async (url, init) => {
    upstreamCalls += 1;
    const target = new URL(url);
    assert.equal(target.origin, 'https://faerder.geminisuite.com');
    assert.equal(target.pathname, '/portal/api/proxy/map/va-basis.wfs');
    // Explicit upstream headers exclude every incoming browser cookie/header.
    assert.deepEqual(Object.keys(init.headers).sort(), ['Accept', 'Authorization']);
    const record = target.searchParams.get('TYPENAMES') === 'gemini:VA_LINE' ? partialZLine : independentPoint;
    return new Response(collection([record]), { headers: { 'Content-Type': 'application/gml+xml' } });
  } });
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'");
      if (pathname === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Set-Cookie', 'synthetic_preview_session=allowed; HttpOnly; SameSite=Lax; Path=/');
        response.end('<script src="/node_modules/proj4/dist/proj4.js"></script><script type="importmap">{"imports":{"proj4":"/proj4-shim.mjs"}}</script><p>Synthetic Gemini service checks</p>');
      } else if (pathname === '/api/gemini-wfs') {
        // Simulate protection before M1. No real Vercel cookies or service calls.
        if (!request.headers.cookie?.includes('synthetic_preview_session=allowed')) {
          gateRejected += 1;
          response.writeHead(401, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ message: 'Protected by synthetic deployment authentication' }));
          return;
        }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const result = await proxy(new Request(`http://${request.headers.host}${pathname}`, {
          method: request.method, headers: request.headers, body: Buffer.concat(chunks),
        }));
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
      } else if (pathname === '/proj4-shim.mjs') {
        response.setHeader('Content-Type', 'text/javascript'); response.end('export default globalThis.proj4;');
      } else {
        const resolved = path.resolve(root, `.${pathname}`), relative = path.relative(root, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative) || ![
          '/src/lib/', '/tests/browser/geminiServiceChecks.mjs', '/tests/fixtures/gemini-wfs/',
          '/node_modules/proj4/dist/proj4.js',
        ].some((prefix) => pathname.startsWith(prefix))) throw new Error('Unsupported harness resource');
        response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(resolved));
      }
    } catch { response.statusCode = 404; response.end('Not found'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await openTestChrome();
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
    await browser.waitFor('Boolean(globalThis.proj4)');
    const names = await browser.evaluate("import('/tests/browser/geminiServiceChecks.mjs').then(module => { globalThis.geminiServiceChecks = module.checks; return module.checks.map(([name]) => name); })");
    assert(names.length >= 7);
    for (const [index, name] of names.entries()) {
      await t.test(name, async () => {
        const result = await browser.evaluate(`Promise.resolve().then(() => geminiServiceChecks[${index}][1]()).then(() => ({ passed: true }), error => ({ passed: false, message: error.message }))`);
        assert.equal(result.passed, true, result.message);
      });
    }
    assert.equal(gateRejected, 1);
    assert.equal(upstreamCalls, 2);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
