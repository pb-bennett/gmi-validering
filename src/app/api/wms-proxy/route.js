import { NextResponse } from 'next/server';
import {
  getAllowedContentType,
  getSafeResponseHeaders,
  getSanitizedError,
  isAllowedUpstreamStatus,
  readBoundedBody,
  validateWmsAuthHeader,
  validateWmsTarget,
  WMS_PROXY_TIMEOUT_MS,
  WmsProxyResponseError,
} from '../../../lib/wmsProxyPolicy.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message, status) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: getSafeResponseHeaders(
        'application/json; charset=utf-8',
      ),
    },
  );
}

export async function GET(request) {
  const abortController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, WMS_PROXY_TIMEOUT_MS);

  try {
    const { searchParams } = new URL(request.url);
    const targetUrls = searchParams.getAll('url');
    if (targetUrls.length !== 1) {
      return jsonError('Invalid WMS request', 400);
    }

    const authHeader = validateWmsAuthHeader(
      request.headers.get('x-wms-auth'),
    );
    const { operation, url: targetUrl } = await validateWmsTarget(
      targetUrls[0],
      {
        signal: abortController.signal,
      },
    );
    const headers = {};
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const response = await fetch(targetUrl, {
      cache: 'no-store',
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: abortController.signal,
    });

    if (!isAllowedUpstreamStatus(response.status)) {
      throw new WmsProxyResponseError();
    }

    const contentType = getAllowedContentType(
      response.headers.get('content-type'),
      operation,
    );
    if (!contentType) {
      throw new WmsProxyResponseError();
    }

    const body = await readBoundedBody(response);
    return new NextResponse(body, {
      status: 200,
      headers: getSafeResponseHeaders(contentType),
    });
  } catch (error) {
    const clientError = getSanitizedError(error, timedOut);
    return jsonError(clientError.message, clientError.status);
  } finally {
    clearTimeout(timeout);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...getSafeResponseHeaders('text/plain; charset=utf-8'),
      Allow: 'GET, OPTIONS',
    },
  });
}
