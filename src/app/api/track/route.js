import { NextResponse } from 'next/server';
import { getRoughLocationFromRequest } from '@/lib/tracking/location';
import { lookupKommuneFromCoord } from '@/lib/tracking/kommuneLookup';
import { incrementAggregate } from '@/lib/tracking/aggregates';

const buildDatasetCoord = (value) => {
  if (!value) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const epsg = Number(value.epsg);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(epsg)
  ) {
    return null;
  }
  return { x, y, epsg };
};

const DEBUG_HEADERS = [
  'x-vercel-ip-country',
  'x-vercel-ip-country-region',
  'x-vercel-ip-city',
  'x-vercel-ip-latitude',
  'x-vercel-ip-longitude',
  'x-forwarded-for',
];

const collectDebugHeaders = (headers) =>
  DEBUG_HEADERS.reduce((acc, key) => {
    try {
      const value = headers.get(key);
      if (value) {
        acc[key] = value;
      }
    } catch {}
    return acc;
  }, {});

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventType = String(body?.eventType || 'upload_success');
    const datasetCoord = buildDatasetCoord(body?.datasetCoord);
    const debug = Boolean(body?.debug);

    // Prefer uploader coordinates from the client (privacy + accuracy).
    // If none provided, fall back to request geo (IP-based) as a secondary option.
    let uploaderLocation = null;
    if (body?.uploaderCoord) {
      const uc = buildDatasetCoord(body.uploaderCoord);
      if (uc) {
        uploaderLocation = await lookupKommuneFromCoord(uc);
      }
    }

    let datasetLocation = null;
    if (datasetCoord) {
      datasetLocation = await lookupKommuneFromCoord(datasetCoord);
    }

    // If uploaderLocation still null, derive from request.geo as fallback
    if (!uploaderLocation) {
      uploaderLocation = getRoughLocationFromRequest(request);
    }

    const stored = await incrementAggregate({
      eventType,
      uploaderLocation,
      datasetLocation,
    });

    return NextResponse.json({
      ok: true,
      stored,
      uploaderLocation: {
        country: uploaderLocation?.country || null,
        region: uploaderLocation?.region || null,
        areaType: uploaderLocation?.areaType || null,
        areaId: uploaderLocation?.areaId || null,
        areaName: uploaderLocation?.areaName || null,
      },
      datasetLocation: {
        country: datasetLocation?.country || null,
        region: datasetLocation?.region || null,
        areaType: datasetLocation?.areaType || null,
        areaId: datasetLocation?.areaId || null,
        areaName: datasetLocation?.areaName || null,
      },
      debug: debug
        ? {
            geo: request.geo || null,
            headers: collectDebugHeaders(request.headers),
          }
        : undefined,
    });
  } catch (error) {
    console.error('Tracking error:', error);
    return NextResponse.json(
      { ok: false, error: 'Tracking failed' },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
