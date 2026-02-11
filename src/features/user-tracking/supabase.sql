CREATE TABLE IF NOT EXISTS public.aggregates (
  date date NOT NULL,
  hour smallint NOT NULL,
  dataset_area_type text NOT NULL,
  dataset_area_id text NOT NULL,
  dataset_area_name text,
  dataset_country text,
  dataset_region text,
  uploader_area_type text NOT NULL,
  uploader_area_id text NOT NULL,
  uploader_area_name text,
  uploader_country text,
  uploader_region text,
  event_type text NOT NULL,
  count bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (
    date,
    hour,
    dataset_area_type,
    dataset_area_id,
    uploader_area_type,
    uploader_area_id,
    event_type
  )
);

CREATE OR REPLACE FUNCTION public.increment_aggregate(
  p_date date,
  p_hour smallint,
  p_dataset_area_type text,
  p_dataset_area_id text,
  p_dataset_area_name text,
  p_dataset_country text,
  p_dataset_region text,
  p_uploader_area_type text,
  p_uploader_area_id text,
  p_uploader_area_name text,
  p_uploader_country text,
  p_uploader_region text,
  p_event_type text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.aggregates (
    date,
    hour,
    dataset_area_type,
    dataset_area_id,
    dataset_area_name,
    dataset_country,
    dataset_region,
    uploader_area_type,
    uploader_area_id,
    uploader_area_name,
    uploader_country,
    uploader_region,
    event_type,
    count,
    created_at,
    updated_at
  ) VALUES (
    p_date,
    p_hour,
    p_dataset_area_type,
    p_dataset_area_id,
    p_dataset_area_name,
    p_dataset_country,
    p_dataset_region,
    p_uploader_area_type,
    p_uploader_area_id,
    p_uploader_area_name,
    p_uploader_country,
    p_uploader_region,
    p_event_type,
    1,
    now(),
    now()
  )
  ON CONFLICT (
    date,
    hour,
    dataset_area_type,
    dataset_area_id,
    uploader_area_type,
    uploader_area_id,
    event_type
  )
  DO UPDATE SET
    count = public.aggregates.count + 1,
    updated_at = now();
END;
$$;
