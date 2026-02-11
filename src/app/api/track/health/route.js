import { NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  getClient,
} from '@/lib/tracking/supabase';
import { incrementAggregateInSupabase } from '@/lib/tracking/supabase';

export async function GET(request) {
  try {
    const query = new URL(request.url, 'http://localhost')
      .searchParams;
    const write = query.get('write') === 'true';

    const configured = isSupabaseConfigured();
    if (!configured) {
      return NextResponse.json({
        ok: false,
        configured: false,
        message:
          'Supabase not configured (SUPABASE_URL/SERVICE_ROLE missing)',
      });
    }

    // Try a simple read against the aggregates table
    try {
      const client = getClient();
      const { data, error } = await client
        .from('aggregates')
        .select('date')
        .limit(1);
      if (error) {
        // Table might not exist yet — surface the error
        const msg =
          error.message || 'Unknown error querying aggregates';
        return NextResponse.json({
          ok: false,
          configured: true,
          canQuery: false,
          error: msg,
        });
      }

      let wrote = false;
      if (write) {
        // perform a harmless write test (creates or increments a 'health-check' row)
        const now = new Date();
        const dateKey = now.toISOString().slice(0, 10);
        const hourKey = now.getUTCHours();
        wrote = Boolean(
          await incrementAggregateInSupabase({
            dateKey,
            hourKey,
            datasetAreaType: 'health-test',
            datasetAreaId: 'health-test',
            datasetAreaName: 'Health Test',
            datasetCountry: 'TEST',
            datasetRegion: 'TEST',
            uploaderAreaType: 'health-test',
            uploaderAreaId: 'health-test',
            uploaderAreaName: 'Health Test',
            uploaderCountry: 'TEST',
            uploaderRegion: 'TEST',
            eventType: 'health_check',
          }),
        );
      }

      return NextResponse.json({
        ok: true,
        configured: true,
        canQuery: true,
        sample: data?.[0] || null,
        wrote,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        configured: true,
        canQuery: false,
        error: String(err?.message || err),
      });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || error) },
      { status: 500 },
    );
  }
}
