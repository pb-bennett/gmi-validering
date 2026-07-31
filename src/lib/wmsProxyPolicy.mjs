import { lookup as defaultLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export const WMS_PROXY_TIMEOUT_MS = 15_000;
export const WMS_PROXY_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const GEMINI_HOSTNAME_SUFFIX = '.geminisuite.com';
const GEMINI_PATH_PREFIX = '/portal/api/proxy/map/';
const SECURITY_RELEVANT_PARAMETERS = new Set([
  'bbox',
  'crs',
  'format',
  'height',
  'layers',
  'request',
  'service',
  'srs',
  'version',
  'width',
]);
const ALLOWED_IMAGE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_XML_TYPES = new Set([
  'application/vnd.ogc.se_xml',
  'application/vnd.ogc.wms_xml',
  'application/xml',
  'text/xml',
]);
const ALLOWED_XML_CHARSETS = new Set([
  'iso-8859-1',
  'us-ascii',
  'utf-8',
  'utf8',
  'windows-1252',
]);
const BLOCKED_IPV4_SUBNETS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const BLOCKED_IPV6_SUBNETS = [
  ['::', 96],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

const blockedAddresses = new BlockList();
for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

export class WmsProxyPolicyError extends Error {
  constructor() {
    super('WMS proxy policy rejected the request');
    this.name = 'WmsProxyPolicyError';
  }
}

export class WmsProxyResponseError extends Error {
  constructor() {
    super('WMS upstream response rejected');
    this.name = 'WmsProxyResponseError';
  }
}

function rejectRequest() {
  throw new WmsProxyPolicyError();
}

function rejectResponse() {
  throw new WmsProxyResponseError();
}

export function isPublicIPv4(address) {
  return (
    isIP(address) === 4 &&
    !blockedAddresses.check(address, 'ipv4')
  );
}

export function isPublicIPv6(address) {
  return (
    isIP(address) === 6 &&
    !blockedAddresses.check(address, 'ipv6')
  );
}

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    return isPublicIPv4(address);
  }
  if (family === 6) {
    return isPublicIPv6(address);
  }
  return false;
}

function isBlockedHostname(hostname) {
  const canonical = hostname.toLowerCase().replace(/\.$/, '');
  return (
    !canonical.includes('.') ||
    canonical === 'localhost' ||
    canonical.endsWith('.localhost') ||
    canonical === 'localhost.localdomain' ||
    canonical.endsWith('.local') ||
    canonical.endsWith('.internal') ||
    canonical.endsWith('.home') ||
    canonical.endsWith('.lan') ||
    canonical === 'metadata' ||
    canonical.startsWith('metadata.')
  );
}

export function normalizeGeminiHostname(hostname) {
  if (typeof hostname !== 'string') {
    return null;
  }
  const canonical = hostname.toLowerCase().replace(/\.$/, '');
  const tenant = canonical.slice(0, -GEMINI_HOSTNAME_SUFFIX.length);
  const validLabel = (label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
  return canonical.length <= 253 &&
    canonical.endsWith(GEMINI_HOSTNAME_SUFFIX) &&
    tenant &&
    tenant.split('.').every(validLabel)
    ? canonical
    : null;
}

export function isAllowedGeminiPath(pathname) {
  if (
    typeof pathname !== 'string' ||
    !pathname.startsWith(GEMINI_PATH_PREFIX) ||
    /%(?:00|2e|2f|5c)/i.test(pathname)
  ) {
    return false;
  }

  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  if (
    !decodedPathname.startsWith(GEMINI_PATH_PREFIX) ||
    decodedPathname.includes('%') ||
    decodedPathname.includes('\\') ||
    decodedPathname.includes('\0')
  ) {
    return false;
  }

  return !decodedPathname
    .split('/')
    .some((segment) => segment === '.' || segment === '..');
}

function collectSecurityParameters(searchParams) {
  const parameters = new Map();
  for (const [name, value] of searchParams) {
    const normalizedName = name.toLowerCase();
    if (SECURITY_RELEVANT_PARAMETERS.has(normalizedName)) {
      const values = parameters.get(normalizedName) || [];
      values.push(value);
      parameters.set(normalizedName, values);
    }
  }

  if ([...parameters.values()].some((values) => values.length !== 1)) {
    rejectRequest();
  }
  return parameters;
}

function getParameter(parameters, name) {
  return parameters.get(name)?.[0];
}

function validatePositiveDimension(value) {
  return (
    typeof value === 'string' &&
    /^[1-9]\d*$/.test(value) &&
    Number(value) <= 4096
  );
}

function validateBoundingBox(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const coordinates = value.split(',');
  const decimalNumber =
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  return (
    coordinates.length === 4 &&
    coordinates.every(
      (coordinate) => {
        const trimmed = coordinate.trim();
        return (
          decimalNumber.test(trimmed) &&
          Number.isFinite(Number(trimmed))
        );
      },
    )
  );
}

function validateGetMap(parameters) {
  const layers = getParameter(parameters, 'layers');
  const bbox = getParameter(parameters, 'bbox');
  const width = getParameter(parameters, 'width');
  const height = getParameter(parameters, 'height');
  const format = getParameter(parameters, 'format');
  const version = getParameter(parameters, 'version');
  const crs = getParameter(parameters, 'crs');
  const srs = getParameter(parameters, 'srs');

  if (
    !layers ||
    !layers.split(',').every((layer) => layer.trim()) ||
    !validateBoundingBox(bbox) ||
    !validatePositiveDimension(width) ||
    !validatePositiveDimension(height) ||
    !format ||
    !ALLOWED_IMAGE_TYPES.has(format.toLowerCase()) ||
    !version?.trim() ||
    (crs === undefined) === (srs === undefined) ||
    !(crs ?? srs).trim()
  ) {
    rejectRequest();
  }
}

function validateWmsIntent(url) {
  const parameters = collectSecurityParameters(url.searchParams);
  const service = getParameter(parameters, 'service');
  const request = getParameter(parameters, 'request')?.toLowerCase();

  if (service?.toLowerCase() !== 'wms') {
    rejectRequest();
  }
  if (request === 'getcapabilities') {
    return request;
  }
  if (request === 'getmap') {
    validateGetMap(parameters);
    return request;
  }
  rejectRequest();
}

function parseTargetUrl(targetUrl) {
  if (typeof targetUrl !== 'string' || targetUrl.length > 8_192) {
    rejectRequest();
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    rejectRequest();
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.port ||
    !parsedUrl.hostname
  ) {
    rejectRequest();
  }

  const normalizedHostname = normalizeGeminiHostname(
    parsedUrl.hostname,
  );
  if (
    !normalizedHostname ||
    !isAllowedGeminiPath(parsedUrl.pathname)
  ) {
    rejectRequest();
  }
  parsedUrl.hostname = normalizedHostname;

  return {
    operation: validateWmsIntent(parsedUrl),
    url: parsedUrl,
  };
}

export function validateWmsAuthHeader(authHeader) {
  if (authHeader === null || authHeader === undefined || authHeader === '') {
    return null;
  }

  if (
    typeof authHeader !== 'string' ||
    authHeader.length > 8_192 ||
    !/^Basic [A-Za-z0-9+/]+={0,2}$/.test(authHeader)
  ) {
    rejectRequest();
  }

  return authHeader;
}

export async function validateWmsTarget(
  targetUrl,
  {
    lookup = defaultLookup,
    signal = undefined,
  } = {},
) {
  const { operation, url: parsedUrl } = parseTargetUrl(targetUrl);
  const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
  const addressFamily = isIP(hostname);

  if (addressFamily) {
    if (!isPublicAddress(hostname)) {
      rejectRequest();
    }
    return { operation, url: parsedUrl };
  }

  if (isBlockedHostname(hostname)) {
    rejectRequest();
  }

  let results;
  try {
    const lookupPromise = Promise.resolve().then(() =>
      lookup(hostname, { all: true, verbatim: true }),
    );
    if (!signal) {
      results = await lookupPromise;
    } else {
      results = await new Promise((resolve, reject) => {
        const handleAbort = () => {
          const abortError = new Error('WMS lookup aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        };
        if (signal.aborted) {
          handleAbort();
          return;
        }
        signal.addEventListener('abort', handleAbort, { once: true });
        lookupPromise.then(
          (value) => {
            signal.removeEventListener('abort', handleAbort);
            resolve(value);
          },
          (error) => {
            signal.removeEventListener('abort', handleAbort);
            reject(error);
          },
        );
      });
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    rejectRequest();
  }

  if (
    !Array.isArray(results) ||
    results.length === 0 ||
    results.some(
      (result) =>
        !result ||
        typeof result.address !== 'string' ||
        !isPublicAddress(result.address),
    )
  ) {
    rejectRequest();
  }

  return { operation, url: parsedUrl };
}

export function getAllowedContentType(contentType, operation) {
  if (typeof contentType !== 'string') {
    return null;
  }

  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  if (
    operation === 'getmap' &&
    ALLOWED_IMAGE_TYPES.has(mediaType)
  ) {
    return mediaType;
  }
  if (
    ['getcapabilities', 'getmap'].includes(operation) &&
    ALLOWED_XML_TYPES.has(mediaType)
  ) {
    const charsetMatch = contentType.match(
      /;\s*charset\s*=\s*"?([A-Za-z0-9._-]+)"?/i,
    );
    const charset = charsetMatch?.[1].toLowerCase();
    if (charset && !ALLOWED_XML_CHARSETS.has(charset)) {
      return null;
    }
    return charset ? `${mediaType}; charset=${charset}` : mediaType;
  }
  return null;
}

export function isAllowedUpstreamStatus(status) {
  return status === 200;
}

export function getSafeResponseHeaders(contentType) {
  return {
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
  };
}

export function getSanitizedError(error, timedOut = false) {
  if (error instanceof WmsProxyPolicyError) {
    return { message: 'Invalid WMS request', status: 400 };
  }
  if (timedOut || error?.name === 'AbortError') {
    return { message: 'WMS upstream request timed out', status: 504 };
  }
  if (error instanceof WmsProxyResponseError) {
    return { message: 'Invalid response from WMS server', status: 502 };
  }
  return { message: 'WMS upstream request failed', status: 502 };
}

export async function readBoundedBody(
  response,
  maximumBytes = WMS_PROXY_MAX_RESPONSE_BYTES,
) {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > maximumBytes)
  ) {
    rejectResponse();
  }

  if (!response.body) {
    rejectResponse();
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        rejectResponse();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
