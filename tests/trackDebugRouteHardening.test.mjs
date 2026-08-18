import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../src/app/api/track/debug/route.js';

test('track debug endpoint is an empty fixed 404 in production and Preview', async () => {
  const request = new Request('https://example.test/api/track/debug', {
    headers: {
      'x-forwarded-for': '203.0.113.42',
      'x-vercel-ip-city': 'Sensitive City',
      'x-vercel-ip-latitude': '60.0000',
      'x-vercel-ip-longitude': '10.0000',
      'x-debug-error': 'synthetic dependency failure',
    },
  });

  for (const deployment of ['production', 'preview']) {
    const previousEnvironment = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = deployment;
    try {
      const response = await GET(request);
      assert.equal(response.status, 404);
      assert.equal(await response.text(), '');
      assert.equal(response.headers.get('content-type'), null);
    } finally {
      if (previousEnvironment === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousEnvironment;
      }
    }
  }
});

test('track debug endpoint has no request-derived diagnostics or arbitrary error surface', async () => {
  const response = await GET(new Request('https://example.test/api/track/debug', {
    headers: {
      'x-forwarded-for': '198.51.100.7',
      'x-vercel-ip-country': 'NO',
      'x-vercel-ip-city': 'Private City',
    },
  }));

  assert.equal(response.status, 404);
  const body = await response.text();
  for (const value of ['198.51.100.7', 'NO', 'Private City', 'error', 'geo', 'headers']) {
    assert.equal(body.includes(value), false);
  }
});
