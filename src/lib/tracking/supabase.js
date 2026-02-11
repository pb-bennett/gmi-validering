import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = () =>
  Boolean(supabaseUrl && supabaseServiceKey);

let client;

export const getClient = () => {
  if (!client) {
    client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }

  return client;
};

export const incrementAggregateInSupabase = async (payload) => {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const {
    dateKey,
    hourKey,
    areaType,
    areaId,
    areaName,
    kommuneNumber,
    country,
    region,
    eventType,
  } = payload;

  const { error } = await getClient().rpc('increment_aggregate', {
    p_date: dateKey,
    p_hour: hourKey,
    p_area_type: areaType,
    p_area_id: areaId,
    p_area_name: areaName,
    p_kommune_number: kommuneNumber,
    p_country: country,
    p_region: region,
    p_event_type: eventType,
  });

  if (error) {
    console.error('Supabase tracking error:', error);
    return false;
  }

  return true;
};
