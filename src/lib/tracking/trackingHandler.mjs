import {
  getTrackingErrorResponse,
  parseTrackingRequest,
  TrackingRequestPolicyError,
  validateTrackingHeaders,
  TRACKING_MAX_BODY_BYTES,
} from './trackingRequestPolicy.mjs';

const getRequestOrigin = (request) => {
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
};

const getDeclaredBodySize = (request) => {
  const value = request.headers.get('content-length');
  if (!/^\d+$/.test(value || '')) return null;
  const size = Number(value);
  return Number.isSafeInteger(size)
    ? size
    : TRACKING_MAX_BODY_BYTES + 1;
};

const readBoundedRequestBody = async (request) => {
  const declaredSize = getDeclaredBodySize(request);
  if (declaredSize !== null && declaredSize > TRACKING_MAX_BODY_BYTES) {
    throw new TrackingRequestPolicyError(413, 'body_too_large');
  }

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
        throw new TrackingRequestPolicyError(400, 'invalid_request');
      }

      byteLength += value.byteLength;
      if (byteLength > TRACKING_MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the sanitised 413 response if cancellation fails.
        }
        throw new TrackingRequestPolicyError(413, 'body_too_large');
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
      throw new TrackingRequestPolicyError(400, 'invalid_request');
    }
  } catch (error) {
    if (error instanceof TrackingRequestPolicyError) throw error;
    throw new TrackingRequestPolicyError(400, 'invalid_request');
  } finally {
    reader?.releaseLock();
  }
};

export const createTrackingPostHandler = ({ lookup, increment }) =>
  async (request) => {
    try {
      validateTrackingHeaders({
        contentType: request.headers.get('content-type'),
        secFetchSite: request.headers.get('sec-fetch-site'),
        origin: request.headers.get('origin'),
        requestOrigin: getRequestOrigin(request),
      });

      const body = parseTrackingRequest({
        rawBody: await readBoundedRequestBody(request),
        contentType: request.headers.get('content-type'),
      });

      const datasetLocation = body.datasetCoord
        ? await lookup({
            x: body.datasetCoord.x,
            y: body.datasetCoord.y,
            epsg: body.datasetCoord.epsg,
          })
        : null;
      const stored = await increment({
        eventType: body.eventType,
        location: datasetLocation,
      });

      return {
        status: 200,
        body: {
          ok: true,
          stored,
          location: {
            country: datasetLocation?.country || null,
            region: datasetLocation?.region || null,
            areaType: datasetLocation?.areaType || null,
            areaId: datasetLocation?.areaId || null,
            areaName: datasetLocation?.areaName || null,
            kommuneNumber: datasetLocation?.kommuneNumber || null,
          },
        },
      };
    } catch (error) {
      return getTrackingErrorResponse(error);
    }
  };
