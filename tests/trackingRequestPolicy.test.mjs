import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRACKING_MAX_BODY_BYTES,
  parseTrackingRequest,
  validateTrackingRequest,
} from '../src/lib/tracking/trackingRequestPolicy.mjs';
import { createTrackingPostHandler } from '../src/lib/tracking/trackingHandler.mjs';

const REQUEST_ORIGIN = 'https://app.example.test';

const validCoordinate = {
  x: 10.7522,
  y: 59.9139,
  epsg: 4326,
  sampleCount: 1,
};

const validPayload = {
  eventType: 'upload_success',
  datasetCoord: validCoordinate,
};

const makeRequest = (body, headers = {}) =>
  new Request(`${REQUEST_ORIGIN}/api/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  });

const makeStreamRequest = (chunks, headers = {}) => {
  let nextChunk = 0;
  let pullCount = 0;
  let cancelCount = 0;
  let getReaderCount = 0;
  let readCount = 0;
  const body = new ReadableStream({
    pull(controller) {
      pullCount += 1;
      if (nextChunk < chunks.length) {
        controller.enqueue(chunks[nextChunk]);
        nextChunk += 1;
      } else {
        controller.close();
      }
    },
    cancel() {
      cancelCount += 1;
    },
  });
  const getReader = body.getReader.bind(body);
  body.getReader = (...args) => {
    getReaderCount += 1;
    const reader = getReader(...args);
    const read = reader.read.bind(reader);
    reader.read = (...readArgs) => {
      readCount += 1;
      return read(...readArgs);
    };
    return reader;
  };

  return {
    request: {
      url: `${REQUEST_ORIGIN}/api/track`,
      headers: new Headers({
        'Content-Type': 'application/json',
        ...headers,
      }),
      body,
    },
    stats: {
      get nextChunk() {
        return nextChunk;
      },
      get pullCount() {
        return pullCount;
      },
      get cancelCount() {
        return cancelCount;
      },
      get getReaderCount() {
        return getReaderCount;
      },
      get readCount() {
        return readCount;
      },
    },
  };
};

const encodedChunks = (chunks) =>
  chunks.map((chunk) => new TextEncoder().encode(chunk));

const makeHandler = ({ lookup = async () => null, increment = async () => true } = {}) =>
  createTrackingPostHandler({ lookup, increment });

test('accepts the current application upload payload and calls each dependency once', async () => {
  const lookups = [];
  const increments = [];
  const handler = makeHandler({
    lookup: async (coordinate) => {
      lookups.push(coordinate);
      return {
        country: 'NO',
        region: '03',
        areaType: 'kommune',
        areaId: 'oslo',
        areaName: 'Oslo',
        kommuneNumber: '0301',
      };
    },
    increment: async (payload) => {
      increments.push(payload);
      return true;
    },
  });

  const result = await handler(makeRequest(JSON.stringify(validPayload), {
    Origin: REQUEST_ORIGIN,
    'Sec-Fetch-Site': 'same-origin',
  }));

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.deepEqual(lookups, [{
    x: validCoordinate.x,
    y: validCoordinate.y,
    epsg: validCoordinate.epsg,
  }]);
  assert.deepEqual(increments, [{
    eventType: 'upload_success',
    location: {
      country: 'NO',
      region: '03',
      areaType: 'kommune',
      areaId: 'oslo',
      areaName: 'Oslo',
      kommuneNumber: '0301',
    },
  }]);
});

test('preserves legitimate tracking when coordinates are null or omitted', async () => {
  for (const body of [
    { eventType: 'upload_success', datasetCoord: null },
    { eventType: 'upload_success' },
  ]) {
    let lookupCount = 0;
    let incrementCount = 0;
    const handler = makeHandler({
      lookup: async () => {
        lookupCount += 1;
        return null;
      },
      increment: async () => {
        incrementCount += 1;
        return true;
      },
    });

    const result = await handler(makeRequest(JSON.stringify(body)));
    assert.equal(result.status, 200);
    assert.equal(lookupCount, 0);
    assert.equal(incrementCount, 1);
  }
});

test('rejects unknown, missing, extra, and conflicting request fields', () => {
  for (const body of [
    {},
    { eventType: 'upload' },
    { eventType: 'upload_success', extra: 'not documented' },
    {
      eventType: 'upload_success',
      datasetCoord: { ...validCoordinate, unknown: true },
    },
    { eventType: 'upload_success', x: 10, datasetCoord: null },
    { eventType: 123 },
    null,
    [],
    'upload_success',
  ]) {
    assert.throws(
      () => validateTrackingRequest(body),
      { name: 'TrackingRequestPolicyError', status: 400 },
    );
  }
});

test('rejects malformed JSON and the wrong content type with stable statuses', async () => {
  const handler = makeHandler();

  const malformed = await handler(makeRequest('{"eventType":', {}));
  assert.deepEqual(malformed, {
    status: 400,
    body: { ok: false, error: 'Invalid tracking request' },
  });

  const wrongType = await handler(
    makeRequest(JSON.stringify(validPayload), {
      'Content-Type': 'text/plain',
    }),
  );
  assert.deepEqual(wrongType, {
    status: 415,
    body: {
      ok: false,
      error: 'Tracking request must use application/json',
    },
  });
});

test('rejects a missing content type before reading the body', async () => {
  const streamed = makeStreamRequest(encodedChunks([JSON.stringify(validPayload)]), {
    'Content-Type': '',
  });
  const result = await makeHandler()(streamed.request);

  assert.deepEqual(result, {
    status: 415,
    body: {
      ok: false,
      error: 'Tracking request must use application/json',
    },
  });
  assert.equal(streamed.stats.getReaderCount, 0);
});

test('handles missing and empty bodies as sanitised invalid requests', async () => {
  let lookupCount = 0;
  let incrementCount = 0;
  const handler = makeHandler({
    lookup: async () => {
      lookupCount += 1;
      return null;
    },
    increment: async () => {
      incrementCount += 1;
      return true;
    },
  });
  const missingBody = {
    url: `${REQUEST_ORIGIN}/api/track`,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: null,
  };
  const emptyStream = makeStreamRequest([]);

  for (const request of [missingBody, emptyStream.request]) {
    const result = await handler(request);
    assert.deepEqual(result, {
      status: 400,
      body: { ok: false, error: 'Invalid tracking request' },
    });
  }

  assert.equal(lookupCount, 0);
  assert.equal(incrementCount, 0);
});

test('rejects oversize JSON before dependencies are called', async () => {
  let lookupCount = 0;
  let incrementCount = 0;
  const handler = makeHandler({
    lookup: async () => {
      lookupCount += 1;
      return null;
    },
    increment: async () => {
      incrementCount += 1;
      return true;
    },
  });

  const result = await handler(
    makeRequest('x'.repeat(TRACKING_MAX_BODY_BYTES + 1)),
  );

  assert.deepEqual(result, {
    status: 413,
    body: { ok: false, error: 'Tracking request body is too large' },
  });
  assert.equal(lookupCount, 0);
  assert.equal(incrementCount, 0);
});

test('bounds streamed bodies, cancels on overflow, and does not consume later chunks', async () => {
  let lookupCount = 0;
  let incrementCount = 0;
  const handler = makeHandler({
    lookup: async () => {
      lookupCount += 1;
      return null;
    },
    increment: async () => {
      incrementCount += 1;
      return true;
    },
  });
  const streamed = makeStreamRequest(
    encodedChunks([
      'a'.repeat(600),
      'b'.repeat(500),
      'c'.repeat(10),
    ]),
  );

  const result = await handler(streamed.request);

  assert.equal(result.status, 413);
  assert.equal(streamed.stats.cancelCount, 1);
  assert.equal(streamed.stats.nextChunk, 2);
  assert.equal(streamed.stats.pullCount, 2);
  assert.equal(streamed.stats.getReaderCount, 1);
  assert.equal(streamed.stats.readCount, 2);
  assert.equal(lookupCount, 0);
  assert.equal(incrementCount, 0);
});

test('rejects a declared oversized body before reading its stream', async () => {
  for (const contentLength of [
    String(TRACKING_MAX_BODY_BYTES + 1),
    '999999999999999999999999',
  ]) {
    const streamed = makeStreamRequest(
      encodedChunks(['not read']),
      { 'Content-Length': contentLength },
    );
    const result = await makeHandler()(streamed.request);

    assert.deepEqual(result, {
      status: 413,
      body: { ok: false, error: 'Tracking request body is too large' },
    });
    assert.equal(streamed.stats.getReaderCount, 0);
    assert.equal(streamed.stats.cancelCount, 0);
  }
});

test('rejects an actually oversized stream even when Content-Length is small', async () => {
  const streamed = makeStreamRequest(
    encodedChunks(['a'.repeat(700), 'b'.repeat(400), 'not read']),
    { 'Content-Length': '1' },
  );
  const result = await makeHandler()(streamed.request);

  assert.equal(result.status, 413);
  assert.equal(streamed.stats.cancelCount, 1);
  assert.equal(streamed.stats.nextChunk, 2);
  assert.equal(streamed.stats.pullCount, 2);
  assert.equal(streamed.stats.getReaderCount, 1);
  assert.equal(streamed.stats.readCount, 2);
});

test('counts UTF-8 bytes and rejects malformed UTF-8 without dependencies', async () => {
  const multiByte = makeStreamRequest([
    new TextEncoder().encode('€'.repeat(400)),
    new TextEncoder().encode('not read'),
  ]);
  const multiByteResult = await makeHandler()(multiByte.request);
  assert.equal(multiByteResult.status, 413);
  assert.equal(multiByte.stats.cancelCount, 1);
  assert.equal(multiByte.stats.nextChunk, 1);

  const malformed = makeStreamRequest([
    new Uint8Array([0xc3, 0x28]),
  ]);
  const malformedResult = await makeHandler()(malformed.request);
  assert.deepEqual(malformedResult, {
    status: 400,
    body: { ok: false, error: 'Invalid tracking request' },
  });
});

test('all validation failures call neither lookup nor persistence', async () => {
  let lookupCount = 0;
  let incrementCount = 0;
  const handler = makeHandler({
    lookup: async () => {
      lookupCount += 1;
      return null;
    },
    increment: async () => {
      incrementCount += 1;
      return true;
    },
  });

  const cases = [
    { body: '{', expectedStatus: 400 },
    { body: JSON.stringify({ eventType: 'other' }), expectedStatus: 400 },
    {
      body: JSON.stringify({
        eventType: 'upload_success',
        datasetCoord: { ...validCoordinate, x: '10.7522' },
      }),
      expectedStatus: 400,
    },
    {
      body: JSON.stringify(validPayload),
      headers: { 'Content-Type': 'text/plain' },
      expectedStatus: 415,
    },
    {
      body: JSON.stringify(validPayload),
      headers: { 'Sec-Fetch-Site': 'cross-site' },
      expectedStatus: 403,
    },
  ];

  for (const currentCase of cases) {
    const result = await handler(
      makeRequest(currentCase.body, currentCase.headers),
    );
    assert.equal(result.status, currentCase.expectedStatus);
  }

  assert.equal(lookupCount, 0);
  assert.equal(incrementCount, 0);
});

test('rejects non-finite values and numeric strings', () => {
  for (const coordinate of [
    { ...validCoordinate, x: Number.NaN },
    { ...validCoordinate, y: Number.POSITIVE_INFINITY },
    { ...validCoordinate, x: '10.7522' },
    { ...validCoordinate, y: '59.9139' },
    { ...validCoordinate, epsg: '4326' },
  ]) {
    assert.throws(
      () => validateTrackingRequest({ eventType: 'upload_success', datasetCoord: coordinate }),
      { name: 'TrackingRequestPolicyError', status: 400 },
    );
  }
});

test('validates sampleCount boundaries without passing sampleCount to lookup', () => {
  for (const sampleCount of [1, 200]) {
    assert.deepEqual(
      validateTrackingRequest({
        eventType: 'upload_success',
        datasetCoord: { ...validCoordinate, sampleCount },
      }).datasetCoord,
      { ...validCoordinate, sampleCount },
    );
  }

  for (const sampleCount of [0, 201, 1.5]) {
    assert.throws(
      () => validateTrackingRequest({
        eventType: 'upload_success',
        datasetCoord: { ...validCoordinate, sampleCount },
      }),
      { name: 'TrackingRequestPolicyError', status: 400 },
    );
  }
});

test('accepts supported EPSG codes and exact coordinate boundaries', () => {
  for (const datasetCoord of [
    { x: -180, y: -90, epsg: 4326 },
    { x: 180, y: 90, epsg: 4326 },
    { x: 100_000, y: 0, epsg: 25832 },
    { x: 900_000, y: 10_000_000, epsg: 25833 },
  ]) {
    assert.deepEqual(
      validateTrackingRequest({ eventType: 'upload_success', datasetCoord }),
      { eventType: 'upload_success', datasetCoord },
    );
  }
});

test('rejects unsupported EPSG codes and out-of-range coordinates', () => {
  for (const datasetCoord of [
    { x: 10, y: 10, epsg: 3857 },
    { x: -180.0001, y: 0, epsg: 4326 },
    { x: 0, y: 90.0001, epsg: 4326 },
    { x: 99_999, y: 500_000, epsg: 25832 },
    { x: 900_001, y: 500_000, epsg: 25833 },
    { x: 500_000, y: -1, epsg: 25832 },
    { x: 500_000, y: 10_000_001, epsg: 25833 },
  ]) {
    assert.throws(
      () => validateTrackingRequest({ eventType: 'upload_success', datasetCoord }),
      { name: 'TrackingRequestPolicyError', status: 400 },
    );
  }
});

test('rejects explicit cross-site requests and mismatched origins before dependencies', async () => {
  let lookupCount = 0;
  let incrementCount = 0;
  const handler = makeHandler({
    lookup: async () => {
      lookupCount += 1;
      return null;
    },
    increment: async () => {
      incrementCount += 1;
      return true;
    },
  });

  for (const headers of [
    { 'Sec-Fetch-Site': 'cross-site' },
    { Origin: 'https://other.example.test' },
    { Origin: 'not-an-origin' },
    { Origin: `${REQUEST_ORIGIN}/unexpected-path` },
  ]) {
    const result = await handler(makeRequest(JSON.stringify(validPayload), headers));
    assert.equal(result.status, 403);
    assert.deepEqual(result.body, {
      ok: false,
      error: 'Tracking request is not allowed',
    });
  }

  assert.equal(lookupCount, 0);
  assert.equal(incrementCount, 0);
});

test('does not expose sensitive input or dependency details in errors', async () => {
  const sensitiveCoordinate = '999999999-secret-coordinate';
  const invalid = await makeHandler()(makeRequest(
    `{"eventType":"upload_success","datasetCoord":"${sensitiveCoordinate}"}`,
  ));
  assert.equal(invalid.status, 400);
  assert.equal(JSON.stringify(invalid.body).includes(sensitiveCoordinate), false);

  const dependencyError = await makeHandler({
    lookup: async () => {
      throw new Error(`upstream secret ${sensitiveCoordinate}`);
    },
  })(makeRequest(JSON.stringify(validPayload)));
  assert.deepEqual(dependencyError, {
    status: 500,
    body: { ok: false, error: 'Tracking temporarily unavailable' },
  });
  assert.equal(JSON.stringify(dependencyError.body).includes(sensitiveCoordinate), false);
});
