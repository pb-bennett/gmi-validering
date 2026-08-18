import { NextResponse } from 'next/server';
import {
  getClient,
  isSupabaseConfigured,
} from '@/lib/tracking/supabase';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getRecordsFromSupabase } from '@/lib/stats/legacyStats.mjs';
import { buildStatsResponse } from '@/lib/stats/statsRoute.mjs';

/* ── Kommune coordinate cache (in-memory, survives within lambda lifetime) ── */
const KOMMUNE_COORD_CACHE = new Map();

async function fetchKommuneCoords(kommuneNumber) {
  if (!kommuneNumber) return null;
  if (KOMMUNE_COORD_CACHE.has(kommuneNumber)) {
    return KOMMUNE_COORD_CACHE.get(kommuneNumber);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(
      `https://ws.geonorge.no/kommuneinfo/v1/kommuner/${kommuneNumber}`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    if (!response.ok) return null;

    const data = await response.json();
    const coordinates = data?.punktIOmrade?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

    const result = { lat: coordinates[1], lng: coordinates[0] };
    KOMMUNE_COORD_CACHE.set(kommuneNumber, result);
    return result;
  } catch {
    return null;
  }
}

async function getRecordsFromFile() {
  const filePath =
    process.env.TRACKING_STORAGE_PATH ||
    path.join(process.cwd(), 'data', 'usage', 'aggregates.json');

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Object.values(parsed.records || {}).filter(
      (row) => row.eventType === 'upload_success',
    );
  } catch {
    return [];
  }
}

export async function GET(request) {
  const result = await buildStatsResponse({
    url: request.url,
    configured: isSupabaseConfigured(),
    readSupabase: () => getRecordsFromSupabase(getClient()),
    readLocal: getRecordsFromFile,
    fetchKommuneCoords,
  });
  return NextResponse.json(result.body, { status: result.status });
}
