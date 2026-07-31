import { NextResponse } from 'next/server';
import { lookupKommuneFromCoord } from '@/lib/tracking/kommuneLookup';
import { incrementAggregate } from '@/lib/tracking/aggregates';
import { createTrackingPostHandler } from '@/lib/tracking/trackingHandler.mjs';

const handleTrackingPost = createTrackingPostHandler({
  lookup: lookupKommuneFromCoord,
  increment: incrementAggregate,
});

export async function POST(request) {
  const result = await handleTrackingPost(request);
  return NextResponse.json(result.body, { status: result.status });
}
