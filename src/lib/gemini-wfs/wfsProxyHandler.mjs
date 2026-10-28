import { Buffer } from 'node:buffer';
import {
  WFS_MAX_REQUEST_BYTES,
  WFS_MAX_RESPONSE_BYTES,
  WFS_TIMEOUT_MS,
  WfsProxyError,
  getWfsContentType,
  getWfsErrorResult,
  getWfsSafeHeaders,
  parseWfsRequest,
  validateWfsRequestBody,
  validateWfsRequestHeaders,
  validateWfsUpstreamStatus,
} from './wfsProxyPolicy.mjs';

function errorResponse(error) {
  const result = getWfsErrorResult(error);
  return new Response(JSON.stringify(result.body), result);
}

export function rejectWfsMethod() {
  return errorResponse(new WfsProxyError('method_not_allowed'));
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
    if (signal.aborted) onAbort();
  });
}

function cancelBody(body) {
  // Cleanup must not wait on an unresponsive upstream or mask a safe error.
  if (body && !body.locked) void body.cancel().catch(() => {});
}

async function readBoundedBytes(message, maximumBytes, signal, upstream = false) {
  const invalidCode = upstream ? 'invalid_upstream_response' : 'invalid_request';
  const sizeCode = upstream ? 'response_too_large' : 'request_too_large';
  const lengthHeader = message.headers.get('content-length');
  let declaredLength = null;
  if (lengthHeader !== null) {
    if (!/^\d+$/.test(lengthHeader)) throw new WfsProxyError(invalidCode);
    declaredLength = Number(lengthHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > maximumBytes) {
      throw new WfsProxyError(sizeCode);
    }
  }
  if (!message.body) throw new WfsProxyError(invalidCode);
  const encoding = message.headers.get('content-encoding')?.toLowerCase();
  if (upstream && encoding && !['identity', 'gzip', 'deflate', 'br'].includes(encoding)) {
    throw new WfsProxyError(invalidCode);
  }
  const reader = message.body.getReader();
  const chunks = [];
  let size = 0;
  let complete = false;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new WfsProxyError(invalidCode);
      size += value.byteLength;
      if (size > maximumBytes) throw new WfsProxyError(sizeCode);
      chunks.push(value);
    }
    // Node fetch exposes decompressed bytes but can retain compressed length.
    if (!size || ((!encoding || encoding === 'identity') && declaredLength !== null && size !== declaredLength)) {
      throw new WfsProxyError(invalidCode);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    complete = true;
    return bytes;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof WfsProxyError) throw error;
    throw new WfsProxyError(upstream ? 'upstream_failure' : invalidCode);
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createWfsProxyHandler({
  fetchUpstream = (...args) => globalThis.fetch(...args),
  timeoutMs = WFS_TIMEOUT_MS,
} = {}) {
  // This closure contains dependencies only; all auth/response state is local.
  return async function handleWfsRequest(request) {
    const controller = new AbortController();
    const onClientAbort = () => controller.abort(new WfsProxyError('request_aborted'));
    const timeout = setTimeout(() => controller.abort(new WfsProxyError('timeout')), timeoutMs);
    request.signal.addEventListener('abort', onClientAbort, { once: true });
    let response;
    try {
      if (request.signal.aborted) onClientAbort();
      controller.signal.throwIfAborted();
      validateWfsRequestHeaders(request);
      const bytes = await readBoundedBytes(request, WFS_MAX_REQUEST_BYTES, controller.signal);
      let raw;
      try {
        raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new WfsProxyError('invalid_request');
      }
      const body = parseWfsRequest(raw);
      const url = validateWfsRequestBody(body);
      // Do not trim/normalize credentials, accept browser auth, or log options.
      const authorization = `Basic ${Buffer.from(`${body.username}:${body.password}`, 'utf8').toString('base64')}`;
      controller.signal.throwIfAborted();
      const pendingResponse = Promise.resolve(fetchUpstream(url, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Authorization: authorization,
          Accept: 'application/gml+xml, application/xml, text/xml',
        },
      })).then((value) => {
        // An injected/late transport may resolve after abortable has returned.
        // Dispose its body too; never retain a late authenticated response.
        if (controller.signal.aborted) cancelBody(value?.body);
        return value;
      });
      response = await abortable(pendingResponse, controller.signal);
      validateWfsUpstreamStatus(response.status);
      const contentType = getWfsContentType(response.headers.get('content-type'));
      if (!contentType) throw new WfsProxyError('unsupported_upstream_mime');
      const xml = await readBoundedBytes(response, WFS_MAX_RESPONSE_BYTES, controller.signal, true);
      return new Response(xml, { status: 200, headers: getWfsSafeHeaders(contentType) });
    } catch (error) {
      return errorResponse(controller.signal.aborted ? controller.signal.reason : error);
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', onClientAbort);
      controller.abort();
      cancelBody(request.body);
      cancelBody(response?.body);
    }
  };
}
