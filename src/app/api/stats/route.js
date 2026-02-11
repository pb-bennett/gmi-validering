import { NextResponse } from 'next/server';
import {
  getClient,
  isSupabaseConfigured,
} from '@/lib/tracking/supabase';
import fs from 'node:fs/promises';
import path from 'node:path';

/* ── Kommune coordinate cache (in-memory, survives within lambda lifetime) ── */
const KOMMUNE_COORD_CACHE = new Map();

async function fetchKommuneCoords(kommuneNumber) {
  if (!kommuneNumber) return null;
  if (KOMMUNE_COORD_CACHE.has(kommuneNumber))
    return KOMMUNE_COORD_CACHE.get(kommuneNumber);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://ws.geonorge.no/kommuneinfo/v1/kommuner/${kommuneNumber}`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.punktIOmrade?.coordinates; // [lng, lat]
    if (coords) {
      const result = { lat: coords[1], lng: coords[0] };
      KOMMUNE_COORD_CACHE.set(kommuneNumber, result);
      return result;
    }
  } catch {
    /* timeout or network error – ignore */
  }
  return null;
}

/* ── Data sources ─────────────────────────────────────────────────────────── */

async function getRecordsFromSupabase() {
  const client = getClient();
  const { data, error } = await client
    .from('aggregates')
    .select(
      'date, hour, area_type, area_id, area_name, kommune_number, country, region, event_type, count',
    )
    .eq('event_type', 'upload_success')
    .order('date', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getRecordsFromFile() {
  const filePath =
    process.env.TRACKING_STORAGE_PATH ||
    path.join(process.cwd(), 'data', 'usage', 'aggregates.json');

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Object.values(parsed.records || {}).filter(
      (r) => r.eventType === 'upload_success',
    );
  } catch {
    return [];
  }
}

/* ── Normalise field names ────────────────────────────────────────────────── */

const normaliseRow = (r, isFile) =>
  isFile
    ? {
        date: r.date,
        hour: r.hour ?? 0,
        areaType: r.areaType,
        areaId: r.areaId,
        areaName: r.areaName,
        kommuneNumber: r.kommuneNumber,
        country: r.country,
        region: r.region,
        count: r.count || 1,
      }
    : {
        date: r.date,
        hour: r.hour ?? 0,
        areaType: r.area_type,
        areaId: r.area_id,
        areaName: r.area_name,
        kommuneNumber: r.kommune_number,
        country: r.country,
        region: r.region,
        count: r.count || 1,
      };

/* ── Process / aggregate ──────────────────────────────────────────────────── */

function processRecords(records, isFile = false) {
  const rows = records.map((r) => normaliseRow(r, isFile));

  /* Summary */
  const totalUploads = rows.reduce((s, r) => s + r.count, 0);
  const kommuneSet = new Set(
    rows.filter((r) => r.kommuneNumber).map((r) => r.kommuneNumber),
  );
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  const firstDate = dates[0] || null;
  const lastDate = dates[dates.length - 1] || null;
  const activeDays = new Set(dates).size;

  /* Daily totals */
  const dailyMap = {};
  for (const r of rows) {
    if (!r.date) continue;
    dailyMap[r.date] = (dailyMap[r.date] || 0) + r.count;
  }
  const daily = Object.entries(dailyMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  /* Hourly profile (across all days) */
  const hourlyMap = {};
  for (const r of rows) {
    const h = r.hour ?? 0;
    hourlyMap[h] = (hourlyMap[h] || 0) + r.count;
  }
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${String(i).padStart(2, '0')}:00`,
    count: hourlyMap[i] || 0,
  }));

  /* By kommune */
  const kommuneMap = {};
  for (const r of rows) {
    const key = r.kommuneNumber || r.areaId || 'unknown';
    if (!kommuneMap[key]) {
      kommuneMap[key] = {
        areaId: r.areaId,
        areaName: r.areaName || r.areaId,
        kommuneNumber: r.kommuneNumber,
        count: 0,
      };
    }
    kommuneMap[key].count += r.count;
  }
  const byKommune = Object.values(kommuneMap).sort(
    (a, b) => b.count - a.count,
  );

  /* Heatmap: dayOfWeek × hour */
  const heatmapMap = {};
  for (const r of rows) {
    if (!r.date) continue;
    const dow = new Date(r.date + 'T12:00:00').getDay(); // 0 = Sun
    const h = r.hour ?? 0;
    const key = `${dow}_${h}`;
    heatmapMap[key] = (heatmapMap[key] || 0) + r.count;
  }
  const heatmap = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let h = 0; h < 24; h++) {
      const count = heatmapMap[`${dow}_${h}`] || 0;
      if (count > 0) heatmap.push({ dayOfWeek: dow, hour: h, count });
    }
  }

  /* Timeline: date × kommune (for animated map) */
  const timelineMap = {};
  for (const r of rows) {
    if (!r.date) continue;
    const key = `${r.date}|${r.kommuneNumber || r.areaId}`;
    if (!timelineMap[key]) {
      timelineMap[key] = {
        date: r.date,
        kommuneNumber: r.kommuneNumber,
        areaName: r.areaName,
        count: 0,
      };
    }
    timelineMap[key].count += r.count;
  }
  const timeline = Object.values(timelineMap).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  return {
    summary: {
      totalUploads,
      uniqueKommuner: kommuneSet.size,
      activeDays,
      firstDate,
      lastDate,
    },
    daily,
    hourly,
    byKommune,
    heatmap,
    timeline,
  };
}

/* ── GET handler ──────────────────────────────────────────────────────────── */

export async function GET() {
  try {
    let records;
    let source;

    if (isSupabaseConfigured()) {
      try {
        records = await getRecordsFromSupabase();
        source = 'supabase';
      } catch (e) {
        console.warn(
          'Supabase stats read failed, falling back to file:',
          e.message,
        );
        records = await getRecordsFromFile();
        source = 'file';
      }
    } else {
      records = await getRecordsFromFile();
      source = 'file';
    }

    const isFile = source === 'file';
    const stats = processRecords(records, isFile);

    /* Fetch kommune coordinates for map visualisation */
    const uniqueKommuneNumbers = [
      ...new Set(
        stats.byKommune
          .filter((k) => k.kommuneNumber)
          .map((k) => k.kommuneNumber),
      ),
    ];

    const coordResults = await Promise.allSettled(
      uniqueKommuneNumbers.map(async (kn) => ({
        kn,
        coords: await fetchKommuneCoords(kn),
      })),
    );

    const coords = {};
    for (const r of coordResults) {
      if (r.status === 'fulfilled' && r.value.coords) {
        coords[r.value.kn] = r.value.coords;
      }
    }

    /* Attach coordinates */
    for (const k of stats.byKommune) {
      if (k.kommuneNumber && coords[k.kommuneNumber]) {
        k.lat = coords[k.kommuneNumber].lat;
        k.lng = coords[k.kommuneNumber].lng;
      }
    }
    for (const t of stats.timeline) {
      if (t.kommuneNumber && coords[t.kommuneNumber]) {
        t.lat = coords[t.kommuneNumber].lat;
        t.lng = coords[t.kommuneNumber].lng;
      }
    }

    return NextResponse.json({ ok: true, source, ...stats });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
}
