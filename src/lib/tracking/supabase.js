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
    datasetAreaType,
    datasetAreaId,
    datasetAreaName,
    datasetCountry,
    datasetRegion,
    uploaderAreaType,
    uploaderAreaId,
    uploaderAreaName,
    uploaderCountry,
    uploaderRegion,
    eventType,
  } = payload;

  const { error } = await getClient().rpc('increment_aggregate', {
    p_date: dateKey,
    p_hour: hourKey,
    p_dataset_area_type: datasetAreaType,
    p_dataset_area_id: datasetAreaId,
    p_dataset_area_name: datasetAreaName,
    p_dataset_country: datasetCountry,
    p_dataset_region: datasetRegion,
    p_uploader_area_type: uploaderAreaType,
    p_uploader_area_id: uploaderAreaId,
    p_uploader_area_name: uploaderAreaName,
    p_uploader_country: uploaderCountry,
    p_uploader_region: uploaderRegion,
    p_event_type: eventType,
  });

  if (error) {
    console.error('Supabase tracking error:', error);
    return false;
  }

  return true;
};
