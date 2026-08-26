import {
  CONTACT_MAX_BODY_BYTES,
  ContactRequestPolicyError,
  getContactErrorResponse,
  parseContactRequest,
  validateContactHeaders,
} from './contactRequestPolicy.mjs';

const BASE_RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});

const withResponseHeaders = (result, extraHeaders = {}) => ({
  ...result,
  headers: { ...BASE_RESPONSE_HEADERS, ...extraHeaders },
});

const getRequestOrigin = (request) => {
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
};

const getDeclaredBodySize = (request) => {
  const value = request.headers.get('content-length');
  if (value === null) return null;
  if (!/^\d+$/u.test(value)) {
    throw new ContactRequestPolicyError(400, 'invalid_request');
  }

  const size = Number(value);
  if (!Number.isSafeInteger(size) || size > CONTACT_MAX_BODY_BYTES) {
    throw new ContactRequestPolicyError(413, 'request_too_large');
  }
  return size;
};

export const readBoundedContactRequestBody = async (request) => {
  getDeclaredBodySize(request);
  if (!request.body) return '';

  let reader;
  try {
    reader = request.body.getReader();
    const chunks = [];
    let byteLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new ContactRequestPolicyError(400, 'invalid_request');
      }

      byteLength += value.byteLength;
      if (byteLength > CONTACT_MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the sanitised 413 response if cancellation fails.
        }
        throw new ContactRequestPolicyError(413, 'request_too_large');
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new ContactRequestPolicyError(400, 'invalid_request');
    }
  } catch (error) {
    if (error instanceof ContactRequestPolicyError) throw error;
    throw new ContactRequestPolicyError(400, 'invalid_request');
  } finally {
    reader?.releaseLock();
  }
};

const getRequesterIdentity = (request) => {
  if (typeof request.ip === 'string' && request.ip !== '') return request.ip;

  const forwardedFor = request.headers.get('x-vercel-forwarded-for');
  return forwardedFor?.split(',', 1)[0]?.trim() || 'unknown';
};

const deliveryResponse = (deliveryResult) => {
  if (deliveryResult?.outcome === 'sent') {
    return withResponseHeaders({ status: 200, body: { ok: true } });
  }
  if (deliveryResult?.outcome === 'unavailable') {
    return withResponseHeaders({
      status: 503,
      body: { ok: false, code: 'contact_unavailable' },
    });
  }
  return withResponseHeaders({
    status: 502,
    body: { ok: false, code: 'send_failed' },
  });
};

export const createContactPostHandler = ({ rateLimiter, deliver }) =>
  async (request) => {
    try {
      validateContactHeaders({
        contentType: request.headers.get('content-type'),
        origin: request.headers.get('origin'),
        requestOrigin: getRequestOrigin(request),
        secFetchSite: request.headers.get('sec-fetch-site'),
      });

      const rate = rateLimiter.check(getRequesterIdentity(request));
      if (!rate.allowed) {
        return withResponseHeaders(
          { status: 429, body: { ok: false, code: 'rate_limited' } },
          { 'Retry-After': String(rate.retryAfterSeconds) },
        );
      }

      const body = parseContactRequest({
        rawBody: await readBoundedContactRequestBody(request),
        contentType: request.headers.get('content-type'),
      });

      if (body.honeypot) {
        return withResponseHeaders({ status: 200, body: { ok: true } });
      }

      let deliveryResult;
      try {
        deliveryResult = await deliver({
          category: body.category,
          categoryLabel: body.categoryLabel,
          message: body.message,
          email: body.email,
        });
      } catch {
        return withResponseHeaders({
          status: 502,
          body: { ok: false, code: 'send_failed' },
        });
      }

      return deliveryResponse(deliveryResult);
    } catch (error) {
      const result = getContactErrorResponse(error);
      return withResponseHeaders(result);
    }
  };
