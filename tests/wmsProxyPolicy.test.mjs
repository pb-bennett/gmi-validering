import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAllowedContentType,
  getSafeResponseHeaders,
  getSanitizedError,
  isAllowedGeminiPath,
  isAllowedUpstreamStatus,
  isPublicAddress,
  normalizeGeminiHostname,
  readBoundedBody,
  validateWmsAuthHeader,
  validateWmsTarget,
  WmsProxyPolicyError,
  WmsProxyResponseError,
} from '../src/lib/wmsProxyPolicy.mjs';

const GEMINI_PATH = '/portal/api/proxy/map/wms';
const publicLookup = async () => [
  { address: '93.184.216.34', family: 4 },
  { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
];

function capabilitiesUrl(
  hostname = 'faerder.geminisuite.com',
  pathname = GEMINI_PATH,
) {
  return `https://${hostname}${pathname}?SERVICE=WMS&REQUEST=GetCapabilities`;
}

function mapUrl(
  overrides = {},
  hostname = 'faerder.geminisuite.com',
  pathname = GEMINI_PATH,
) {
  const url = new URL(`https://${hostname}${pathname}`);
  const parameters = {
    BBOX: '10,20,30,40',
    FORMAT: 'image/png',
    HEIGHT: '256',
    LAYERS: 'water',
    REQUEST: 'GetMap',
    SERVICE: 'WMS',
    SRS: 'EPSG:25832',
    VERSION: '1.1.1',
    WIDTH: '256',
    ...overrides,
  };
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== null) {
      url.searchParams.set(name, value);
    }
  }
  return url.toString();
}

async function rejectsPolicy(url, options = { lookup: publicLookup }) {
  await assert.rejects(
    validateWmsTarget(url, options),
    WmsProxyPolicyError,
  );
}

test('accepts faerder and other Gemini tenant subdomains', async () => {
  const faerder = await validateWmsTarget(capabilitiesUrl(), {
    lookup: publicLookup,
  });
  assert.equal(faerder.url.hostname, 'faerder.geminisuite.com');
  assert.equal(faerder.operation, 'getcapabilities');

  const otherTenant = await validateWmsTarget(
    capabilitiesUrl('another-tenant.geminisuite.com'),
    { lookup: publicLookup },
  );
  assert.equal(
    otherTenant.url.hostname,
    'another-tenant.geminisuite.com',
  );
});

test('rejects the Gemini apex and deceptive hostname suffixes', async () => {
  for (const hostname of [
    'geminisuite.com',
    'evilgeminisuite.com',
    'geminisuite.com.attacker.example',
    'fake-geminisuite.com',
  ]) {
    await rejectsPolicy(capabilitiesUrl(hostname));
  }
});

test('normalizes mixed-case Gemini hostnames and one trailing DNS dot', async () => {
  assert.equal(
    normalizeGeminiHostname('FAERDER.GEMINISUITE.COM.'),
    'faerder.geminisuite.com',
  );

  const result = await validateWmsTarget(
    capabilitiesUrl('FAERDER.GEMINISUITE.COM.'),
    { lookup: publicLookup },
  );
  assert.equal(result.url.hostname, 'faerder.geminisuite.com');
});

test('accepts only the normalized Gemini map proxy path', async () => {
  assert.equal(isAllowedGeminiPath(GEMINI_PATH), true);
  await assert.doesNotReject(
    validateWmsTarget(capabilitiesUrl(), { lookup: publicLookup }),
  );

  for (const pathname of [
    '/',
    '/portal/api/proxy/',
    '/portal/api/proxy/maps/wms',
    '/portal/api/proxy/map',
    '/other/portal/api/proxy/map/wms',
  ]) {
    assert.equal(isAllowedGeminiPath(pathname), false, pathname);
    await rejectsPolicy(
      capabilitiesUrl('faerder.geminisuite.com', pathname),
    );
  }
});

test('rejects normalized traversal and encoded path confusion', async () => {
  const confusingPaths = [
    '/portal/api/proxy/map/../admin',
    '/portal/api/proxy/map/%2e%2e/admin',
    '/portal/api/proxy/map/%252e%252e/admin',
    '/portal/api/proxy/map/%2F..%2Fadmin',
    '/portal/api/proxy/map/%5c..%5cadmin',
    '/portal/api/proxy/map%2Fwms',
  ];

  for (const pathname of confusingPaths) {
    const url = capabilitiesUrl('faerder.geminisuite.com', pathname);
    assert.equal(
      isAllowedGeminiPath(new URL(url).pathname),
      false,
      pathname,
    );
    await rejectsPolicy(url);
  }
});

test('accepts a valid GetCapabilities request case-insensitively', async () => {
  const url =
    'https://faerder.geminisuite.com/portal/api/proxy/map/wms?service=wMs&request=gEtCaPaBiLiTiEs';
  const result = await validateWmsTarget(url, {
    lookup: publicLookup,
  });
  assert.equal(result.operation, 'getcapabilities');
});

test('GetCapabilities requires unambiguous SERVICE and REQUEST', async () => {
  for (const query of [
    'REQUEST=GetCapabilities',
    'SERVICE=WMS',
    'SERVICE=WFS&REQUEST=GetCapabilities',
    'SERVICE=WMS&REQUEST=DescribeLayer',
  ]) {
    await rejectsPolicy(
      `https://faerder.geminisuite.com${GEMINI_PATH}?${query}`,
    );
  }
});

test('accepts valid GetMap requests with either SRS or CRS', async () => {
  const srsResult = await validateWmsTarget(mapUrl(), {
    lookup: publicLookup,
  });
  assert.equal(srsResult.operation, 'getmap');

  const crsResult = await validateWmsTarget(
    mapUrl({ CRS: 'EPSG:25832', SRS: null, VERSION: '1.3.0' }),
    { lookup: publicLookup },
  );
  assert.equal(crsResult.operation, 'getmap');
});

test('rejects missing or invalid GetMap dimensions', async () => {
  for (const [name, value] of [
    ['WIDTH', null],
    ['WIDTH', '0'],
    ['WIDTH', '-1'],
    ['WIDTH', '1.5'],
    ['WIDTH', '4097'],
    ['HEIGHT', null],
    ['HEIGHT', '0'],
    ['HEIGHT', '-1'],
    ['HEIGHT', '1.5'],
    ['HEIGHT', '4097'],
  ]) {
    await rejectsPolicy(mapUrl({ [name]: value }));
  }
});

test('rejects missing or invalid GetMap BBOX', async () => {
  for (const bbox of [
    null,
    '',
    '1,2,3',
    '1,2,3,4,5',
    '1,2,NaN,4',
    '1,2,Infinity,4',
    '0x10,2,3,4',
    '1,2,,4',
  ]) {
    await rejectsPolicy(mapUrl({ BBOX: bbox }));
  }
});

test('rejects missing or unsupported GetMap FORMAT', async () => {
  for (const format of [
    null,
    '',
    'text/html',
    'application/octet-stream',
    'image/svg+xml',
  ]) {
    await rejectsPolicy(mapUrl({ FORMAT: format }));
  }
});

test('rejects missing, empty, or ambiguous GetMap CRS/SRS', async () => {
  await rejectsPolicy(mapUrl({ SRS: null }));
  await rejectsPolicy(mapUrl({ SRS: '' }));
  await rejectsPolicy(mapUrl({ CRS: 'EPSG:25832' }));
});

test('rejects missing or empty GetMap LAYERS and VERSION', async () => {
  for (const overrides of [
    { LAYERS: null },
    { LAYERS: '' },
    { LAYERS: '   ' },
    { LAYERS: 'water,' },
    { VERSION: null },
    { VERSION: '' },
  ]) {
    await rejectsPolicy(mapUrl(overrides));
  }
});

test('rejects duplicate security-relevant query parameters', async () => {
  for (const [name, value] of [
    ['service', 'WMS'],
    ['request', 'GetCapabilities'],
    ['layers', 'other'],
    ['bbox', '1,2,3,4'],
    ['width', '512'],
    ['height', '512'],
    ['format', 'image/jpeg'],
    ['version', '1.3.0'],
    ['srs', 'EPSG:4326'],
  ]) {
    const url = new URL(mapUrl());
    url.searchParams.append(name, value);
    await rejectsPolicy(url.toString());
  }
});

test('rejects invalid URLs, embedded credentials, HTTP, and non-default ports', async () => {
  for (const url of [
    '/portal/api/proxy/map/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    'not a URL',
    'ftp://faerder.geminisuite.com/portal/api/proxy/map/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    'http://faerder.geminisuite.com/portal/api/proxy/map/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    'https://user:secret@faerder.geminisuite.com/portal/api/proxy/map/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    'https://faerder.geminisuite.com:8443/portal/api/proxy/map/wms?SERVICE=WMS&REQUEST=GetCapabilities',
  ]) {
    await rejectsPolicy(url);
  }
});

test('rejects unsafe IPv4 and IPv6 addresses', () => {
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd00:ec2::254',
    'fe80::1',
    'fec0::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '64:ff9b::a00:1',
    '2002:7f00:1::',
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test('rejects DNS results when any resolved address is unsafe', async () => {
  const mixedLookup = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '10.0.0.8', family: 4 },
  ];
  await rejectsPolicy(capabilitiesUrl(), { lookup: mixedLookup });
});

test('accepts all-public DNS and fails closed on resolution failure', async () => {
  await assert.doesNotReject(
    validateWmsTarget(capabilitiesUrl(), { lookup: publicLookup }),
  );
  await rejectsPolicy(capabilitiesUrl(), {
    lookup: async () => {
      throw new Error('DNS unavailable');
    },
  });
  await rejectsPolicy(capabilitiesUrl(), { lookup: async () => [] });
});

test('accepts Basic authentication only', () => {
  assert.equal(
    validateWmsAuthHeader('Basic dXNlcjpwYXNz'),
    'Basic dXNlcjpwYXNz',
  );
  assert.equal(validateWmsAuthHeader(null), null);
  assert.throws(
    () => validateWmsAuthHeader('Bearer secret-token'),
    WmsProxyPolicyError,
  );
});

test('binds allowed response types to the WMS operation', () => {
  assert.equal(
    getAllowedContentType('application/xml', 'getcapabilities'),
    'application/xml',
  );
  assert.equal(
    getAllowedContentType('text/xml; charset=UTF-8', 'getcapabilities'),
    'text/xml; charset=utf-8',
  );
  assert.equal(
    getAllowedContentType('image/png', 'getcapabilities'),
    null,
  );

  assert.equal(
    getAllowedContentType('image/png', 'getmap'),
    'image/png',
  );
  assert.equal(
    getAllowedContentType('image/jpeg; charset=binary', 'getmap'),
    'image/jpeg',
  );
  assert.equal(
    getAllowedContentType('application/vnd.ogc.se_xml', 'getmap'),
    'application/vnd.ogc.se_xml',
  );

  for (const contentType of [
    null,
    'text/html',
    'application/javascript',
    'application/xml; charset=utf-7',
    'image/svg+xml',
    'application/octet-stream',
  ]) {
    assert.equal(
      getAllowedContentType(contentType, 'getmap'),
      null,
    );
  }
});

test('accepts only upstream status 200', () => {
  assert.equal(isAllowedUpstreamStatus(199), false);
  assert.equal(isAllowedUpstreamStatus(200), true);
  assert.equal(isAllowedUpstreamStatus(201), false);
  assert.equal(isAllowedUpstreamStatus(204), false);
  assert.equal(isAllowedUpstreamStatus(301), false);
  assert.equal(isAllowedUpstreamStatus(307), false);
  assert.equal(isAllowedUpstreamStatus(401), false);
  assert.equal(isAllowedUpstreamStatus(500), false);
});

test('enforces declared and streamed response-size limits', async () => {
  const accepted = new Response(new Uint8Array([1, 2, 3]), {
    headers: { 'content-length': '3' },
  });
  assert.deepEqual(
    await readBoundedBody(accepted, 3),
    new Uint8Array([1, 2, 3]),
  );

  const declaredTooLarge = new Response(new Uint8Array([1]), {
    headers: { 'content-length': '4' },
  });
  await assert.rejects(
    readBoundedBody(declaredTooLarge, 3),
    WmsProxyResponseError,
  );

  const streamedTooLarge = new Response(new Uint8Array([1, 2, 3, 4]));
  await assert.rejects(
    readBoundedBody(streamedTooLarge, 3),
    WmsProxyResponseError,
  );
});

test('sets private cache and content-sniffing response protections', () => {
  assert.deepEqual(getSafeResponseHeaders('image/png'), {
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Type': 'image/png',
    'X-Content-Type-Options': 'nosniff',
  });
});

test('returns sanitised errors without sensitive details', () => {
  const secret = 'https://user:password@internal.example/wms';
  const clientError = getSanitizedError(new Error(secret));
  assert.deepEqual(clientError, {
    message: 'WMS upstream request failed',
    status: 502,
  });
  assert.equal(JSON.stringify(clientError).includes(secret), false);

  assert.deepEqual(getSanitizedError(new WmsProxyPolicyError()), {
    message: 'Invalid WMS request',
    status: 400,
  });
  assert.deepEqual(
    getSanitizedError(new Error('secret timeout detail'), true),
    {
      message: 'WMS upstream request timed out',
      status: 504,
    },
  );
});
