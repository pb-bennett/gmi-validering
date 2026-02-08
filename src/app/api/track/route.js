import { NextResponse } from 'next/server';
import { getRoughLocationFromRequest } from '@/lib/tracking/location';
import { incrementAggregate } from '@/lib/tracking/aggregates';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventType = String(body?.eventType || 'upload_success');
    const location = getRoughLocationFromRequest(request);

    const stored = await incrementAggregate({
      eventType,
      location,
    });

    return NextResponse.json({
      ok: true,
      stored,
      location: {
        country: location.country,
        region: location.region,
        areaType: location.areaType,
        areaId: location.areaId,
        areaName: location.areaName,
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
