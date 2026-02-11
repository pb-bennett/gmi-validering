import { NextResponse } from 'next/server';
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

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventType = String(body?.eventType || 'upload_success');
    const datasetCoord = buildDatasetCoord(body?.datasetCoord);

    let datasetLocation = null;
    if (datasetCoord) {
      datasetLocation = await lookupKommuneFromCoord(datasetCoord);
    }

    const stored = await incrementAggregate({
      eventType,
      location: datasetLocation,
    });

    return NextResponse.json({
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
