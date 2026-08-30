import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CONTACT_MAX_BODY_BYTES,
} from '../src/lib/contact/contactRequestPolicy.mjs';
import { createContactPostHandler } from '../src/lib/contact/contactHandler.mjs';
import { createContactRateLimiter } from '../src/lib/contact/contactRateLimit.mjs';

const REQUEST_ORIGIN = 'https://app.example.test';
const validBody = {
  category: 'bug',
  message: '  På kafé\r\nmed feil  ',
  email: 'Bruker@EXAMPLE.NO',
  website: '',
};

const makeRequest = (body, headers = {}) =>
  new Request(`${REQUEST_ORIGIN}/api/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: REQUEST_ORIGIN,
      'Sec-Fetch-Site': 'same-origin',
      ...headers,
    },
    body,
  });

const makeHandler = ({ deliver = async () => ({ outcome: 'sent' }), rateLimiter } = {}) =>
  createContactPostHandler({
    deliver,
    rateLimiter: rateLimiter || createContactRateLimiter({ now: () => 0, salt: 'handler-test' }),
  });

const assertStableHeaders = (result, retryAfter) => {
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  if (retryAfter !== undefined) assert.equal(result.headers['Retry-After'], retryAfter);
};

test('successful normalised submission reaches fake delivery exactly once with allowlisted fields', async () => {
  const deliveries = [];
  const result = await makeHandler({
    deliver: async (payload) => {
      deliveries.push(payload);
      return { outcome: 'sent' };
    },
  })(makeRequest(JSON.stringify(validBody)));

  assert.deepEqual(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.deepEqual(deliveries, [{
    category: 'bug',
    categoryLabel: 'Feil',
    message: 'På kafé\nmed feil',
    name: null,
    email: 'Bruker@example.no',
  }]);
  assertStableHeaders(result);
});

test('filled honeypot returns indistinguishable success without delivery', async () => {
  let deliveryCount = 0;
  const result = await makeHandler({
    deliver: async () => {
      deliveryCount += 1;
      return { outcome: 'sent' };
    },
  })(makeRequest(JSON.stringify({ ...validBody, website: 'bot-value' })));

  assert.deepEqual(result, {
    status: 200,
    body: { ok: true },
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
  assert.equal(deliveryCount, 0);
});

test('validation, origin, content-type, malformed JSON, and UTF-8 failures call no delivery', async () => {
  let deliveryCount = 0;
  const handler = makeHandler({
    deliver: async () => {
      deliveryCount += 1;
      return { outcome: 'sent' };
    },
  });

  for (const request of [
    makeRequest(JSON.stringify({ ...validBody, extra: 'loaded-file-state' })),
    makeRequest(JSON.stringify({ ...validBody, message: ' ' })),
    makeRequest('{"category":"bug"'),
    makeRequest(JSON.stringify(validBody), { Origin: 'https://other.example.test' }),
    makeRequest(JSON.stringify(validBody), { 'Content-Type': 'text/plain' }),
  ]) {
    const result = await handler(request);
    assert.ok([400, 403, 415].includes(result.status));
    assert.equal(JSON.stringify(result.body).includes('loaded-file-state'), false);
    assertStableHeaders(result);
  }

  const malformedUtf8 = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([0xc3, 0x28]));
      controller.close();
    },
  });
  const malformedResult = await handler({
    url: `${REQUEST_ORIGIN}/api/contact`,
    headers: new Headers({
      'Content-Type': 'application/json',
      Origin: REQUEST_ORIGIN,
    }),
    body: malformedUtf8,
  });
  assert.equal(malformedResult.status, 400);
  assert.equal(deliveryCount, 0);
});

test('rate limiting happens before body read and delivery', async () => {
  let getReaderCount = 0;
  let deliveryCount = 0;
  const result = await makeHandler({
    deliver: async () => {
      deliveryCount += 1;
      return { outcome: 'sent' };
    },
    rateLimiter: {
      check: () => ({ allowed: false, retryAfterSeconds: 37 }),
    },
  })({
    url: `${REQUEST_ORIGIN}/api/contact`,
    headers: new Headers({
      'Content-Type': 'application/json',
      Origin: REQUEST_ORIGIN,
      'Sec-Fetch-Site': 'same-origin',
    }),
    body: {
      getReader() {
        getReaderCount += 1;
        throw new Error('body must not be read');
      },
    },
  });

  assert.deepEqual(result.body, { ok: false, code: 'rate_limited' });
  assert.equal(result.status, 429);
  assertStableHeaders(result, '37');
  assert.equal(getReaderCount, 0);
  assert.equal(deliveryCount, 0);
});

test('declared and streamed body overflow return 413 and do not deliver', async () => {
  let deliveryCount = 0;
  const handler = makeHandler({
    deliver: async () => {
      deliveryCount += 1;
      return { outcome: 'sent' };
    },
  });
  const declared = await handler(makeRequest('not read', {
    'Content-Length': String(CONTACT_MAX_BODY_BYTES + 1),
  }));
  assert.deepEqual(declared.body, { ok: false, code: 'request_too_large' });
  assert.equal(declared.status, 413);

  let cancelled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(CONTACT_MAX_BODY_BYTES));
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() {
      cancelled += 1;
    },
  });
  const streamed = await handler({
    url: `${REQUEST_ORIGIN}/api/contact`,
    headers: new Headers({
      'Content-Type': 'application/json',
      Origin: REQUEST_ORIGIN,
    }),
    body: stream,
  });
  assert.equal(streamed.status, 413);
  assert.equal(cancelled, 1);
  assert.equal(deliveryCount, 0);
});

test('fake delivery outcomes map only to sanitised public responses', async () => {
  for (const [outcome, status, code] of [
    ['failed', 502, 'send_failed'],
    ['unavailable', 503, 'contact_unavailable'],
    ['unexpected', 502, 'send_failed'],
  ]) {
    const result = await makeHandler({
      deliver: async () => ({ outcome }),
    })(makeRequest(JSON.stringify(validBody)));
    assert.deepEqual(result.body, status === 200 ? { ok: true } : { ok: false, code });
    assert.equal(result.status, status);
    assert.equal(JSON.stringify(result).includes(validBody.message), false);
    assert.equal(JSON.stringify(result).includes(validBody.email), false);
    assertStableHeaders(result);
  }

  const thrown = await makeHandler({
    deliver: async () => {
      throw new Error('provider secret and submitted data');
    },
  })(makeRequest(JSON.stringify(validBody)));
  assert.deepEqual(thrown.body, { ok: false, code: 'send_failed' });
  assert.equal(thrown.status, 502);
});

test('C3 route wires the server adapter while the handler remains provider-independent', async () => {
  const [routeSource, handlerSource, adapterSource] = await Promise.all([
    readFile(new URL('../src/app/api/contact/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/contact/contactHandler.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/contact/sendContactEmail.mjs', import.meta.url), 'utf8'),
  ]);
  const source = `${routeSource}\n${handlerSource}\n${adapterSource}`;
  assert.match(routeSource, /runtime = 'nodejs'/);
  assert.match(routeSource, /dynamic = 'force-dynamic'/);
  assert.match(routeSource, /sendContactEmail/);
  assert.doesNotMatch(routeSource, /c1UnavailableDelivery|RESEND_API_KEY|process\.env|fetch\s*\(/i);
  assert.doesNotMatch(handlerSource, /resend|RESEND|process\.env|fetch\s*\(/i);
  assert.match(adapterSource, /CURRENT_APP_VERSION/);
  assert.match(adapterSource, /https:\/\/api\.resend\.com\/emails/);
  assert.match(adapterSource, /RESEND_API_KEY/);
  assert.doesNotMatch(source, /filename|coordinates|localStorage|WMS|municipality/i);
});
